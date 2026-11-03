import { query } from "@/lib/db";
import {
  guessTitleFromRaw,
  looksLikePlaceholderName,
} from "@/lib/vision-meta";
import type {
  AuditFieldResult,
  AuditReport,
  AuditSource,
  CompletenessIssue,
} from "@/types";

const FIELD_ORDER = [
  "name",
  "birth",
  "work",
  "party",
  "education",
  "degree",
  "experience",
  "recognition",
] as const;

const FIELD_LABELS: Record<(typeof FIELD_ORDER)[number], string> = {
  name: "姓名",
  birth: "出生时间",
  work: "参加工作时间",
  party: "入党时间",
  education: "学历",
  degree: "学位",
  experience: "工作经历",
  recognition: "组织认定",
};

/** 已入库（有有序件 / 乱序件 / 审核出处）的人员，供审核选择 */
export async function listPersons() {
  const r = await query<{ person_code: string; person_name: string }>(
    `SELECT p.person_code, p.person_name
     FROM persons p
     WHERE EXISTS (
         SELECT 1 FROM ordered_archive_pieces o WHERE o.person_code = p.person_code
       )
        OR EXISTS (
         SELECT 1 FROM archive_pieces ap WHERE ap.person_code = p.person_code
       )
        OR EXISTS (
         SELECT 1 FROM audit_field_sources a WHERE a.person_code = p.person_code
       )
     ORDER BY p.person_code`
  );
  return r.rows.map((row) => ({
    personCode: row.person_code,
    personName: row.person_name,
  }));
}

export type PersonMaterial = {
  category: string;
  materialName: string;
  imageNames: string[];
  serialNo: string;
  pageCount: number;
  formalNo: string | null;
  source: "ordered" | "unordered";
};

/** 审核数据源：优先附件6 有序件；无则回退乱序件。占位名从页摘要/出处兜题名。 */
async function resolveDisplayTitles(
  personCode: string,
  refs: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!refs.length) return map;
  const pages = await query<{
    piece_ref: string;
    material_name: string | null;
    text_content: string | null;
  }>(
    `SELECT piece_ref, material_name, text_content
     FROM archive_page_texts
     WHERE person_code = $1 AND piece_ref = ANY($2::text[])
     ORDER BY piece_ref, page_no`,
    [personCode, refs]
  );
  for (const row of pages.rows) {
    if (map.has(row.piece_ref)) continue;
    const cached = (row.material_name || "").trim();
    if (cached && !looksLikePlaceholderName(cached, row.piece_ref)) {
      map.set(row.piece_ref, cached);
      continue;
    }
    const guessed = guessTitleFromRaw(row.text_content || "");
    if (guessed && !looksLikePlaceholderName(guessed, row.piece_ref)) {
      map.set(row.piece_ref, guessed);
    }
  }
  const missing = refs.filter((r) => !map.has(r));
  if (missing.length) {
    const src = await query<{ material_no: string; material_name: string }>(
      `SELECT DISTINCT ON (material_no) material_no, material_name
       FROM audit_field_sources
       WHERE person_code = $1
         AND material_no = ANY($2::text[])
         AND nullif(trim(material_name), '') IS NOT NULL
         AND material_name !~ '^档案材料'
         AND material_name !~ '^[0-9]{4,}-'
       ORDER BY material_no, id DESC`,
      [personCode, missing]
    );
    for (const row of src.rows) {
      const t = (row.material_name || "").trim();
      if (t && !looksLikePlaceholderName(t, row.material_no)) {
        map.set(row.material_no, t);
      }
    }
  }
  return map;
}

export async function getPersonMaterials(
  personCode: string
): Promise<PersonMaterial[]> {
  const ordered = await query<{
    category_code: string;
    material_name: string;
    formal_no: string;
    page_count: number;
    image_names: string[];
  }>(
    `SELECT category_code, material_name, formal_no, page_count,
            ARRAY(SELECT pg.file_name FROM ordered_archive_pages pg
                  WHERE pg.piece_id = p.id AND coalesce(pg.file_name, '') <> ''
                  ORDER BY pg.page_no) AS image_names
     FROM ordered_archive_pieces p
     WHERE person_code = $1
     ORDER BY sort_index, formal_no`,
    [personCode]
  );

  if (ordered.rows.length) {
    const titles = await resolveDisplayTitles(
      personCode,
      ordered.rows.map((r) => r.formal_no)
    );
    return ordered.rows.map((row) => {
      const raw = row.material_name || "";
      const better =
        looksLikePlaceholderName(raw, row.formal_no)
          ? titles.get(row.formal_no)
          : undefined;
      return {
        category: row.category_code,
        materialName: better || raw,
        imageNames: row.image_names,
        serialNo: row.formal_no,
        pageCount: row.page_count,
        formalNo: row.formal_no,
        source: "ordered" as const,
      };
    });
  }

  const r = await query<{
    confirmed_category: string | null;
    suggested_category: string | null;
    material_name: string | null;
    serial_no: string;
    page_count: number;
    formal_no: string | null;
    image_names: string[];
  }>(
    `SELECT confirmed_category, suggested_category, material_name, serial_no, page_count, formal_no,
            ARRAY(SELECT pg.file_name FROM archive_pages pg
                  WHERE pg.piece_id = p.id AND coalesce(pg.file_name, '') <> ''
                  ORDER BY pg.page_no) AS image_names
     FROM archive_pieces p
     WHERE person_code = $1
     ORDER BY COALESCE(formal_no, serial_no)`,
    [personCode]
  );
  const refs = r.rows.map((row) => row.formal_no || row.serial_no);
  const titles = await resolveDisplayTitles(personCode, refs);
  return r.rows.map((row) => {
    const ref = row.formal_no || row.serial_no;
    const raw = row.material_name || "";
    const better =
      looksLikePlaceholderName(raw, ref) ? titles.get(ref) : undefined;
    return {
      category: row.confirmed_category || row.suggested_category || "",
      materialName: better || raw,
      imageNames: row.image_names,
      serialNo: row.serial_no,
      pageCount: row.page_count,
      formalNo: row.formal_no,
      source: "unordered" as const,
    };
  });
}

function uniqueValues(sources: AuditSource[]) {
  return [...new Set(sources.map((s) => s.value).map((v) => v.trim()).filter(Boolean))];
}

function pad2(n: string) {
  return n.padStart(2, "0");
}

/** 日期写法归一：1992年8月 / 1992-8 / 1992.08 → 1992.08 */
function normalizeDateTokens(text: string) {
  return String(text || "")
    .replace(
      /(\d{4})\s*年\s*(\d{1,2})\s*月(?:\s*(\d{1,2})\s*日)?/g,
      (_, y, m, d) =>
        d ? `${y}.${pad2(m)}.${pad2(d)}` : `${y}.${pad2(m)}`
    )
    .replace(
      /(\d{4})[./\-](\d{1,2})(?:[./\-](\d{1,2}))?/g,
      (_, y, m, d) =>
        d ? `${y}.${pad2(m)}.${pad2(d)}` : `${y}.${pad2(m)}`
    );
}

function normCompareText(text: string) {
  return normalizeDateTokens(text)
    .replace(/[（(][^）)]*[）)]/g, "") // 去掉材料出处括号
    .replace(/[；;。，,、\s　]/g, "")
    .replace(/起在|起至|至今在|至今/g, "")
    .toLowerCase();
}

/**
 * 叙述类字段（经历/认定）：详略不同但关键年月+单位一致 → 视为一致。
 * 例：「1992年8月起在E公司工作」与「…；1992.08至今 E公司工作」
 */
function narrativesCompatible(values: string[]): boolean {
  const norms = [...new Set(values.map(normCompareText).filter(Boolean))];
  if (norms.length <= 1) return true;
  const sorted = [...norms].sort((a, b) => b.length - a.length);
  const cover = sorted[0];
  return sorted.slice(1).every((s) => {
    if (cover.includes(s) || s.includes(cover)) return true;
    // 短句中的「年月 + 机构」片段都应在长句中出现
    const dates = s.match(/\d{4}\.\d{2}(?:\.\d{2})?/g) || [];
    const orgs =
      s.match(
        /[\u4e00-\u9fa5a-z0-9]{2,20}?(?:公司|大学|学院|学校|局|委|部|厅|中心|医院|研究所|集团)/gi
      ) || [];
    if (!dates.length && !orgs.length) return false;
    const dateOk = dates.every((d) => cover.includes(d));
    const orgOk = orgs.every((o) => cover.includes(o));
    return dateOk && orgOk;
  });
}

function datesCompatible(values: string[]): boolean {
  const norms = [
    ...new Set(
      values
        .map((v) => {
          const t = normalizeDateTokens(v).replace(/[^\d.]/g, "");
          const m = t.match(/(\d{4}\.\d{2}(?:\.\d{2})?)/);
          return m?.[1] || "";
        })
        .filter(Boolean)
    ),
  ];
  if (norms.length <= 1) return true;
  // 同年月即可（有的只写到月）
  const months = [
    ...new Set(norms.map((n) => n.split(".").slice(0, 2).join("."))),
  ];
  return months.length <= 1;
}

/** 多出处取值是否实质一致（避免经历详略不同误报） */
function valuesAreConsistent(fieldKey: string, values: string[]): boolean {
  const vals = [...new Set(values.map((v) => v.trim()).filter(Boolean))];
  if (vals.length <= 1) return true;
  if (fieldKey === "experience" || fieldKey === "recognition") {
    return narrativesCompatible(vals);
  }
  if (fieldKey === "birth" || fieldKey === "work" || fieldKey === "party") {
    return datesCompatible(vals);
  }
  // 学历学位等：归一后全等
  const norms = [...new Set(vals.map(normCompareText))];
  return norms.length <= 1;
}

/** 审核预览：有序件 formal_no 或乱序件 serial_no */
export async function getAuditPageFile(
  personCode: string,
  pieceRef: string,
  pageNo: number,
  preferred?: "ordered" | "unordered"
) {
  async function fromOrdered() {
    return query<{ file_name: string | null; file_path: string | null }>(
      `SELECT pg.file_name, pg.file_path
       FROM ordered_archive_pages pg
       JOIN ordered_archive_pieces p ON p.id = pg.piece_id
       WHERE p.person_code = $1 AND p.formal_no = $2 AND pg.page_no = $3`,
      [personCode, pieceRef, pageNo]
    );
  }
  async function fromUnordered() {
    return query<{ file_name: string | null; file_path: string | null }>(
      `SELECT pg.file_name, pg.file_path
       FROM archive_pages pg
       JOIN archive_pieces p ON p.id = pg.piece_id
       WHERE p.person_code = $1
         AND (p.serial_no = $2 OR p.formal_no = $2)
         AND pg.page_no = $3`,
      [personCode, pieceRef, pageNo]
    );
  }

  if (preferred === "unordered") {
    const u = await fromUnordered();
    if (u.rows[0]) return u.rows[0];
    const o = await fromOrdered();
    return o.rows[0] || null;
  }

  const o = await fromOrdered();
  if (o.rows[0]) return o.rows[0];
  const u = await fromUnordered();
  return u.rows[0] || null;
}

export async function runAuditFromDb(
  personCode: string,
  personName: string
): Promise<AuditReport> {
  const sourcesRes = await query<{
    field_key: string;
    field_label: string;
    material_name: string;
    form_year: string | null;
    material_no: string | null;
    value: string;
    form_date: string | null;
    is_baseline: boolean;
  }>(
    `SELECT field_key, field_label, material_name, form_year, material_no, value, form_date, is_baseline
     FROM audit_field_sources
     WHERE person_code = $1
     ORDER BY field_key, form_date NULLS LAST, id`,
    [personCode]
  );

  const byField = new Map<string, typeof sourcesRes.rows>();
  const materials = await getPersonMaterials(personCode);
  const imagesByRef = new Map(materials.flatMap((m) => [
    [m.serialNo, m.imageNames] as const,
    [m.formalNo || m.serialNo, m.imageNames] as const,
  ]));
  for (const row of sourcesRes.rows) {
    if (!byField.has(row.field_key)) byField.set(row.field_key, []);
    byField.get(row.field_key)!.push(row);
  }

  const fields: AuditFieldResult[] = [];
  for (const key of FIELD_ORDER) {
    const rows = byField.get(key) || [];
    // 无出处时不能回退英文字段 key，统一用中文标签
    const label = rows[0]?.field_label || FIELD_LABELS[key] || key;
    if (!rows.length) {
      fields.push({
        field: key,
        label,
        value: "未检出",
        status: "missing",
        statusText: "未检出",
        sources: [],
        aiOpinion: "档案材料中未检索到相关记载，请补充或人工核查。",
      });
      continue;
    }

    const sources: AuditSource[] = rows.map((row) => ({
      materialName: row.material_name,
      imageNames: imagesByRef.get(row.material_no || "") || [],
      formYear: row.form_year || "",
      materialNo: row.material_no || "",
      value: row.value,
    }));

    let baseline = rows.find((r) => r.is_baseline)?.value;
    if (!baseline && key === "birth") {
      const earliest = [...rows].sort((a, b) =>
        String(a.form_date || a.form_year).localeCompare(
          String(b.form_date || b.form_year)
        )
      )[0];
      baseline = earliest?.value;
    }
    baseline = baseline || rows[0].value;

    const values = uniqueValues(sources);
    if (valuesAreConsistent(key, values)) {
      fields.push({
        field: key,
        label,
        value: baseline,
        status: "ok",
        statusText: "一致",
        sources,
      });
    } else {
      const earliest = [...rows].sort((a, b) =>
        String(a.form_date || a.form_year).localeCompare(
          String(b.form_date || b.form_year)
        )
      )[0];
      fields.push({
        field: key,
        label,
        value: baseline,
        status: "warn",
        statusText:
          key === "birth"
            ? "出生日期信息记载不一致"
            : `${label}信息记载不一致`,
        sources,
        aiOpinion:
          key === "birth"
            ? `以最早形成材料《${earliest.material_name}》（${earliest.form_year}）记载的 ${earliest.value} 为准；请核查差异材料原文。`
            : key === "experience" || key === "recognition"
              ? `各材料详略不同或关键节点不一致。建议以记载更完整的「${baseline}」为准，并核对原文年月与单位。`
              : `检测到多处记载不一致。建议以基准值「${baseline}」为准，并核查差异材料原文。`,
      });
    }
  }

  const completeness = await checkCompleteness(personCode);

  return {
    personCode,
    personName,
    fields,
    completeness,
    createdAt: new Date().toISOString(),
  };
}

/** 去掉书名号/空白，便于「干部履历表」匹配「《干部履历表》」等 */
function normMaterialText(s: string) {
  return String(s || "")
    .replace(/[《》〈〉【】\[\]（）()\s　]/g, "")
    .toLowerCase();
}

function nameHitsPattern(names: string[], pattern: string) {
  const p = normMaterialText(pattern);
  if (!p) return false;
  return names.some((n) => normMaterialText(n).includes(p));
}

/**
 * 完整性：有序件 + 乱序件题名并集，并并入比对出处中的材料名
 * （避免左侧已有「干部履历表」、出处也能引用，却因旧报告/单表漏检而误报缺失）
 */
async function checkCompleteness(
  personCode: string
): Promise<CompletenessIssue[]> {
  const [ordered, archive, sources, reqs] = await Promise.all([
    query<{ material_name: string | null; form_date: string | null }>(
      `SELECT material_name, form_date FROM ordered_archive_pieces WHERE person_code = $1`,
      [personCode]
    ),
    query<{ material_name: string | null; form_date: string | null }>(
      `SELECT material_name, form_date FROM archive_pieces WHERE person_code = $1`,
      [personCode]
    ),
    query<{ material_name: string | null }>(
      `SELECT DISTINCT material_name FROM audit_field_sources WHERE person_code = $1`,
      [personCode]
    ),
    query<{
      category_hint: string;
      material_pattern: string;
      description: string;
      required_for: string | null;
    }>(
      `SELECT category_hint, material_pattern, description, required_for
       FROM completeness_requirements
       ORDER BY sort_order`
    ),
  ]);

  // 日期连续性仍以「展示用」件表为准：有序优先，否则乱序
  const dateRows = ordered.rows.length ? ordered.rows : archive.rows;
  const nameList = [
    ...ordered.rows.map((m) => m.material_name || ""),
    ...archive.rows.map((m) => m.material_name || ""),
    ...sources.rows.map((m) => m.material_name || ""),
  ].filter(Boolean);

  const blob = nameList.map(normMaterialText).join("|");
  const isParty =
    /入党|转正申请|中共|共产党员/.test(blob) ||
    nameHitsPattern(nameList, "入党志愿书") ||
    nameHitsPattern(nameList, "入党申请书");
  const isBachelorPlus = /本科|硕士|博士|学士|学位授予|高等学校毕业生/.test(
    blob
  );
  const isTitled = /专业技术资格|职称|专业技术职务/.test(blob);

  function applies(requiredFor: string | null | undefined) {
    const r = (requiredFor || "all").trim().toLowerCase();
    if (!r || r === "all") return true;
    if (r === "party") return isParty;
    if (r === "bachelor+" || r === "bachelor") return isBachelorPlus;
    if (r === "titled") return isTitled;
    return true;
  }

  const issues: CompletenessIssue[] = [];
  for (const req of reqs.rows) {
    if (!applies(req.required_for)) continue;

    if (req.material_pattern === "年度考核") {
      const years = dateRows
        .filter((m) => nameHitsPattern([m.material_name || ""], "年度考核"))
        .map((m) => (m.form_date || "").slice(0, 4))
        .filter(Boolean)
        .map(Number)
        .sort((a, b) => a - b);
      if (years.length === 0) {
        issues.push({
          category: req.category_hint,
          message: "未检出年度考核登记表",
        });
      } else {
        const missing: number[] = [];
        for (let y = years[0]; y <= years[years.length - 1]; y++) {
          if (!years.includes(y)) missing.push(y);
        }
        if (missing.length) {
          issues.push({
            category: req.category_hint,
            message: `年度考核登记表未连续：缺失 ${missing.join("、")} 年度`,
          });
        }
      }
      continue;
    }

    if (!nameHitsPattern(nameList, req.material_pattern)) {
      issues.push({
        category: req.category_hint,
        message: req.description,
      });
    }
  }
  return issues;
}

/** 用当前库材料重算报告中的完整性（加载旧报告时防误报） */
export async function refreshReportCompleteness(
  report: AuditReport
): Promise<AuditReport> {
  const completeness = await checkCompleteness(report.personCode);
  return {
    ...report,
    completeness,
  };
}

export function summarizeAudit(report: AuditReport) {
  const issues = report.fields.filter((f) => f.status !== "ok");
  const miss = report.completeness;
  return {
    issueCount: issues.length + miss.length,
    summary: `问题项 ${issues.length} 个，材料缺失提示 ${miss.length} 条`,
  };
}
