/**
 * 审核查验视觉提取：
 * - 按「件」多图同传（同一文件夹/同一件全部页）
 * - 整件一次失败则分批；分批再失败则逐页
 * - 优先复用 archive_page_texts；字段写入 audit_field_sources
 */
import { query } from "@/lib/db";
import { auditUploadTitleCorrection } from "@/lib/audit-upload-catalog";
import {
  isCozeVisionConfigured,
  uploadCozeFile,
} from "@/lib/coze-vision";
import {
  cozeApiBase,
  cozeApiToken,
  visionBotId,
} from "@/lib/coze-env";
import {
  getPageText,
  upsertPageText,
} from "@/lib/repos/page-texts";
import { getObjectBytes } from "@/lib/storage";
import {
  guessTitleFromRaw,
  looksLikePlaceholderName,
  normalizeOneDate,
  unwrapAssistantJsonPayload,
} from "@/lib/vision-meta";

const API = cozeApiBase();
/** 整件失败后的分批大小 */
const BATCH_SIZE = Math.max(
  2,
  Math.min(
    parseInt(
      process.env.VISION_BATCH || process.env.COZE_VISION_BATCH || "6",
      10
    ) || 6,
    12
  )
);

function token() {
  return cozeApiToken();
}

export const FIELD_LABELS: Record<string, string> = {
  name: "姓名",
  birth: "出生时间",
  work: "参加工作时间",
  party: "入党时间",
  education: "学历",
  degree: "学位",
  experience: "工作经历",
  recognition: "组织认定",
};

const PRIORITY_NAME_RE =
  /履历|任免|入党|转正|党员|学历|学位|毕业|志愿书|申请书/;

type VisionExtract = {
  fields: Record<string, string>;
  pageText: string;
  materialTitle?: string;
  raw: string;
};

type ImageInput = { bytes: Buffer; fileName: string; pageNo: number };

function buildPrompt(pageCount: number, materialName: string) {
  return `你是干部人事档案审核助手。以下共 ${pageCount} 张图片，属于同一件材料（当前标记名：${materialName || "未命名"}），已按页序排列。
请通读全部页面，抽取可用于信息比对的具体记载（不要只返回文件名/件号），某页看不清则从其它页补；确实没有则省略该键。只输出一行 JSON：
{"materialTitle":"材料正文题名","name":"姓名","birth":"出生日期YYYY-MM-DD","work":"参加工作时间YYYY-MM-DD","party":"入党时间YYYY-MM-DD","education":"学历","degree":"学位","experience":"工作经历摘要","recognition":"组织认定摘要","pageText":"各页关键文字摘要合并，400字内"}
规则：
- materialTitle：优先读取第一页顶部印刷的材料题名/表名，原样提取；禁止用文件名、流水号
- 若正文出现「表彰决定」等内容，不能用正文事项替代第一页顶部实际印刷的表名
- name/birth/work/party/education/degree/experience/recognition：必须是材料内写明的具体值，用于跨材料比对
- 日期统一 YYYY-MM-DD；禁止编造`;
}

function cleanTitle(raw: string | undefined): string | undefined {
  const t = String(raw || "")
    .trim()
    .replace(/\s+/g, "");
  if (!t || looksLikePlaceholderName(t)) return undefined;
  return t;
}

function parseVisionAnswer(answer: string): VisionExtract {
  const payload = unwrapAssistantJsonPayload(answer);
  const m = payload.match(/\{[\s\S]*\}/);
  if (!m) {
    return {
      fields: {},
      pageText: "",
      materialTitle: guessTitleFromRaw(answer),
      raw: answer,
    };
  }
  try {
    const obj = JSON.parse(m[0]) as Record<string, unknown>;
    const fields: Record<string, string> = {};
    for (const k of Object.keys(FIELD_LABELS)) {
      let v = String(obj[k] || "").trim();
      if (!v) continue;
      if (k === "birth" || k === "work" || k === "party") {
        v = normalizeOneDate(v) || v;
      }
      fields[k] = v;
    }
    const pageText = String(obj.pageText || "").trim();
    const materialTitle =
      cleanTitle(
        String(
          obj.materialTitle ||
            obj.material_title ||
            obj.materialName ||
            obj.title ||
            obj.题名 ||
            ""
        )
      ) ||
      guessTitleFromRaw(pageText) ||
      guessTitleFromRaw(payload) ||
      guessTitleFromRaw(answer);
    return {
      fields,
      pageText,
      materialTitle,
      raw: answer,
    };
  } catch {
    return {
      fields: {},
      pageText: "",
      materialTitle: guessTitleFromRaw(answer),
      raw: answer,
    };
  }
}

function mergeExtracts(parts: VisionExtract[]): VisionExtract {
  const fields: Record<string, string> = {};
  const texts: string[] = [];
  const raws: string[] = [];
  let materialTitle: string | undefined;
  for (const p of parts) {
    for (const [k, v] of Object.entries(p.fields)) {
      if (v && !fields[k]) fields[k] = v;
    }
    if (p.materialTitle && !materialTitle) materialTitle = p.materialTitle;
    if (p.pageText) texts.push(p.pageText);
    if (p.raw) raws.push(p.raw);
  }
  return {
    fields,
    pageText: texts.join("\n").slice(0, 2000),
    materialTitle,
    raw: raws.join("\n").slice(0, 4000),
  };
}

/** 一次对话多图同传；失败抛错供上层分批 */
async function extractFieldsFromImages(
  images: ImageInput[],
  materialName: string
): Promise<VisionExtract> {
  const botId = visionBotId();
  if (!botId || !token()) {
    throw new Error("未配置视觉 Bot");
  }
  if (!images.length) return { fields: {}, pageText: "", raw: "" };

  const parts: Array<
    { type: "text"; text: string } | { type: "image"; file_id: string }
  > = [
    {
      type: "text",
      text: buildPrompt(images.length, materialName),
    },
  ];
  for (const img of images) {
    const fileId = await uploadCozeFile(
      img.bytes,
      img.fileName || `p${img.pageNo}.jpg`
    );
    parts.push({ type: "image", file_id: fileId });
  }

  const content = JSON.stringify(parts);
  const res = await fetch(`${API}/v3/chat`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      bot_id: botId,
      user_id: "audit-vision",
      stream: false,
      auto_save_history: true,
      additional_messages: [
        { role: "user", content, content_type: "object_string" },
      ],
    }),
  });
  const started = (await res.json()) as {
    code: number;
    msg: string;
    data?: { id: string; conversation_id: string; status: string };
  };
  if (started.code !== 0 || !started.data) {
    throw new Error(`chat 失败: ${started.msg || res.statusText || started.code}`);
  }

  let status = started.data.status;
  const convId = started.data.conversation_id;
  const chatId = started.data.id;
  for (let i = 0; i < 45; i++) {
    if (["completed", "failed", "canceled"].includes(status)) break;
    await new Promise((r) => setTimeout(r, 1200));
    const detail = await fetch(
      `${API}/v3/chat/retrieve?conversation_id=${encodeURIComponent(convId)}&chat_id=${encodeURIComponent(chatId)}`,
      { headers: { Authorization: `Bearer ${token()}` } }
    );
    const dj = (await detail.json()) as {
      data?: { status: string; last_error?: { msg?: string } };
    };
    status = dj.data?.status || status;
    if (status === "failed") {
      throw new Error(
        `chat failed: ${dj.data?.last_error?.msg || status}`
      );
    }
  }
  if (status !== "completed") {
    throw new Error(`chat 未完成: ${status}`);
  }

  const msgRes = await fetch(
    `${API}/v3/chat/message/list?conversation_id=${encodeURIComponent(convId)}&chat_id=${encodeURIComponent(chatId)}`,
    { headers: { Authorization: `Bearer ${token()}` } }
  );
  const mj = (await msgRes.json()) as {
    data?: Array<{ role: string; type: string; content: string }>;
  };
  const answer = (mj.data || [])
    .filter((m) => m.role === "assistant" && m.type === "answer")
    .map((m) => m.content)
    .join("\n");
  const parsed = parseVisionAnswer(answer);
  if (!parsed.materialTitle && Object.keys(parsed.fields).length > 0) {
    console.warn(
      "audit vision: 有字段但无 materialTitle",
      materialName,
      "answerHead=",
      answer.slice(0, 240)
    );
  } else {
    console.info(
      "audit vision ok",
      materialName,
      "→",
      parsed.materialTitle || "(无题名)",
      "fields=",
      Object.keys(parsed.fields).join(",")
    );
  }
  return parsed;
}

/**
 * 先整件一次多图；报错则按 BATCH_SIZE 分批；再报错则逐页。
 */
async function extractFieldsWithFallback(
  images: ImageInput[],
  materialName: string
): Promise<{ result: VisionExtract; mode: "all" | "batch" | "single" }> {
  if (images.length <= 1) {
    const result = await extractFieldsFromImages(images, materialName);
    return { result, mode: "single" };
  }

  try {
    const result = await extractFieldsFromImages(images, materialName);
    return { result, mode: "all" };
  } catch (e) {
    console.warn(
      "整件多图失败，改分批",
      materialName,
      images.length,
      e instanceof Error ? e.message : e
    );
  }

  const parts: VisionExtract[] = [];
  let anyBatchOk = false;
  for (let i = 0; i < images.length; i += BATCH_SIZE) {
    const batch = images.slice(i, i + BATCH_SIZE);
    try {
      parts.push(await extractFieldsFromImages(batch, materialName));
      anyBatchOk = true;
    } catch (e) {
      console.warn(
        "分批失败，改逐页",
        materialName,
        `p${batch[0]?.pageNo}+`,
        e instanceof Error ? e.message : e
      );
      for (const one of batch) {
        try {
          parts.push(await extractFieldsFromImages([one], materialName));
          anyBatchOk = true;
        } catch (e2) {
          console.warn(
            "单页失败",
            materialName,
            one.pageNo,
            e2 instanceof Error ? e2.message : e2
          );
        }
      }
    }
  }

  return {
    result: mergeExtracts(parts),
    mode: anyBatchOk && images.length > BATCH_SIZE ? "batch" : "single",
  };
}

type PageRow = {
  material_name: string;
  material_no: string;
  form_date: string | null;
  file_path: string | null;
  file_name: string | null;
  page_no: number;
};

async function listPagesForAudit(personCode: string): Promise<PageRow[]> {
  const ordered = await query<PageRow>(
    `SELECT p.material_name,
            p.formal_no AS material_no,
            p.form_date,
            pg.file_path,
            pg.file_name,
            pg.page_no
     FROM ordered_archive_pieces p
     JOIN ordered_archive_pages pg ON pg.piece_id = p.id
     WHERE p.person_code = $1
       AND coalesce(pg.file_path, '') <> ''
     ORDER BY p.sort_index, pg.page_no`,
    [personCode]
  );
  if (ordered.rows.length) return filterPages(ordered.rows);

  const unordered = await query<PageRow>(
    `SELECT coalesce(p.material_name, p.serial_no) AS material_name,
            coalesce(p.formal_no, p.serial_no) AS material_no,
            p.form_date,
            pg.file_path,
            pg.file_name,
            pg.page_no
     FROM archive_pieces p
     JOIN archive_pages pg ON pg.piece_id = p.id
     WHERE p.person_code = $1
       AND coalesce(pg.file_path, '') <> ''
     ORDER BY coalesce(p.sort_index, 0), p.serial_no, pg.page_no`,
    [personCode]
  );
  return filterPages(unordered.rows);
}

/**
 * 关键件 / 名称仍是占位（文件名、流水号）→ 多页通读以便抽出比对字段；
 * 其它件保留首页，控制调用量。
 */
function filterPages(rows: PageRow[]): PageRow[] {
  const byPiece = new Map<string, PageRow[]>();
  for (const row of rows) {
    const list = byPiece.get(row.material_no) || [];
    list.push(row);
    byPiece.set(row.material_no, list);
  }
  const out: PageRow[] = [];
  for (const list of byPiece.values()) {
    const sorted = [...list].sort((a, b) => a.page_no - b.page_no);
    const name = sorted[0]?.material_name || "";
    const needAll =
      PRIORITY_NAME_RE.test(name) || looksLikePlaceholderName(name);
    if (needAll) {
      // 至多 12 页：前 8 + 末 4，兼顾履历/志愿书尾部落款
      if (sorted.length <= 12) out.push(...sorted);
      else out.push(...sorted.slice(0, 8), ...sorted.slice(-4));
    } else {
      const first = sorted.find((r) => r.page_no === 1) || sorted[0];
      if (first) out.push(first);
    }
  }
  return out;
}

function groupByPiece(pages: PageRow[]): PageRow[][] {
  const map = new Map<string, PageRow[]>();
  for (const p of pages) {
    const list = map.get(p.material_no) || [];
    list.push(p);
    map.set(p.material_no, list);
  }
  return [...map.values()].map((list) =>
    list.sort((a, b) => a.page_no - b.page_no)
  );
}

async function maybeUpdatePieceTitle(
  personCode: string,
  piece: PageRow,
  title?: string,
  allowReplace = false
) {
  const t = (title || "").trim().replace(/\s+/g, "");
  if (!t || looksLikePlaceholderName(t, piece.material_no)) {
    return piece.material_name;
  }
  const cur = (piece.material_name || "").trim();
  if (cur === t) return t;
  // 已有正经题名则保留；占位名（含「档案材料 …」）一律可被视觉题名覆盖
  if (
    cur &&
    !looksLikePlaceholderName(cur, piece.material_no) &&
    !allowReplace
  ) {
    return cur;
  }
  await query(
    `UPDATE ordered_archive_pieces
     SET material_name = $1
     WHERE person_code = $2 AND formal_no = $3`,
    [t, personCode, piece.material_no]
  );
  await query(
    `UPDATE archive_pieces
     SET material_name = $1, updated_at = CURRENT_TIMESTAMP
     WHERE person_code = $2
       AND (serial_no = $3 OR formal_no = $3)`,
    [t, personCode, piece.material_no]
  );
  return t;
}

/**
 * 出处/页摘要已有正经题名，但左侧件表仍是「档案材料 …」时强制回写。
 * 核验后、加载材料时都会跑，避免只更新右侧出处。
 */
export async function repairPlaceholderTitles(personCode: string): Promise<number> {
  // 1) 直接从出处题名回写左侧（右侧已对、左侧未对的最常见情况）
  const fromSources = await query(
    `UPDATE ordered_archive_pieces p
     SET material_name = s.title
     FROM (
       SELECT material_no,
              min(material_name) AS title
       FROM audit_field_sources
       WHERE person_code = $1
         AND nullif(trim(material_name), '') IS NOT NULL
         AND material_name !~ '^档案材料'
         AND material_name !~ '^[0-9]{4,}-'
       GROUP BY material_no
     ) s
     WHERE p.person_code = $1
       AND p.formal_no = s.material_no
       AND (
         p.material_name IS NULL
         OR btrim(p.material_name) = ''
         OR p.material_name ~ '^档案材料'
         OR p.material_name = p.formal_no
       )`,
    [personCode]
  );

  // 2) 再从页文本缓存题名回写（出处若仍是占位）
  const fromPages = await query(
    `UPDATE ordered_archive_pieces p
     SET material_name = t.title
     FROM (
       SELECT piece_ref AS material_no,
              min(material_name) AS title
       FROM archive_page_texts
       WHERE person_code = $1
         AND nullif(trim(material_name), '') IS NOT NULL
         AND material_name !~ '^档案材料'
         AND material_name !~ '^[0-9]{4,}-'
       GROUP BY piece_ref
     ) t
     WHERE p.person_code = $1
       AND p.formal_no = t.material_no
       AND (
         p.material_name IS NULL
         OR btrim(p.material_name) = ''
         OR p.material_name ~ '^档案材料'
         OR p.material_name = p.formal_no
       )`,
    [personCode]
  );

  await query(
    `UPDATE archive_pieces p
     SET material_name = s.title,
         updated_at = CURRENT_TIMESTAMP
     FROM (
       SELECT material_no, min(material_name) AS title
       FROM (
         SELECT material_no, material_name FROM audit_field_sources
         WHERE person_code = $1
         UNION ALL
         SELECT piece_ref, material_name FROM archive_page_texts
         WHERE person_code = $1
       ) u
       WHERE nullif(trim(material_name), '') IS NOT NULL
         AND material_name !~ '^档案材料'
         AND material_name !~ '^[0-9]{4,}-'
       GROUP BY material_no
     ) s
     WHERE p.person_code = $1
       AND (p.serial_no = s.material_no OR p.formal_no = s.material_no)
       AND (
         p.material_name IS NULL
         OR btrim(p.material_name) = ''
         OR p.material_name ~ '^档案材料'
         OR p.material_name = p.serial_no
         OR p.material_name = coalesce(p.formal_no, '')
       )`,
    [personCode]
  ).catch(() => undefined);

  // 3) 页摘要正文里能猜出表名时再补一轮
  const rows = await query<{
    material_no: string;
    material_name: string | null;
    text_content: string | null;
  }>(
    `SELECT piece_ref AS material_no, material_name, text_content
     FROM archive_page_texts
     WHERE person_code = $1
     ORDER BY piece_ref, page_no`,
    [personCode]
  );
  let guessedN = 0;
  const seen = new Set<string>();
  for (const r of rows.rows) {
    if (seen.has(r.material_no)) continue;
    const already = cleanTitle(r.material_name || undefined);
    const guessed = already || cleanTitle(guessTitleFromRaw(r.text_content || ""));
    if (!guessed) continue;
    seen.add(r.material_no);
    const piece = await query<{ material_name: string; material_no: string }>(
      `SELECT material_name, formal_no AS material_no
       FROM ordered_archive_pieces
       WHERE person_code = $1 AND formal_no = $2
       UNION ALL
       SELECT material_name, coalesce(formal_no, serial_no) AS material_no
       FROM archive_pieces
       WHERE person_code = $1 AND (formal_no = $2 OR serial_no = $2)
       LIMIT 1`,
      [personCode, r.material_no]
    );
    if (!piece.rows[0]) continue;
    if (!looksLikePlaceholderName(piece.rows[0].material_name, r.material_no)) {
      continue;
    }
    const written = await maybeUpdatePieceTitle(
      personCode,
      piece.rows[0] as PageRow,
      guessed
    );
    if (written === guessed) guessedN += 1;
  }

  // 旧缓存曾把占位名写进出处。件表修复后也要同步这两处，
  // 否则默认「复用已有出处」仍会在右侧报告中显示旧名称。
  for (const target of [
    { table: "audit_field_sources", ref: "material_no" },
    { table: "archive_page_texts", ref: "piece_ref" },
  ]) {
    await query(
      `UPDATE ${target.table} dest
       SET material_name = p.material_name
       FROM (
         SELECT formal_no AS material_no, material_name
         FROM ordered_archive_pieces WHERE person_code = $1
         UNION ALL
         SELECT coalesce(formal_no, serial_no), material_name
         FROM archive_pieces WHERE person_code = $1
         UNION ALL
         SELECT serial_no, material_name
         FROM archive_pieces WHERE person_code = $1
       ) p
       WHERE dest.person_code = $1 AND dest.${target.ref} = p.material_no
         AND nullif(trim(p.material_name), '') IS NOT NULL
         AND p.material_name !~ '^档案材料'
         AND p.material_name !~ '^[0-9]{4,}-'
         AND (
           nullif(trim(dest.material_name), '') IS NULL
           OR dest.material_name ~ '^档案材料'
           OR dest.material_name = dest.${target.ref}
         )`,
      [personCode]
    );
  }

  const n =
    (fromSources.rowCount || 0) + (fromPages.rowCount || 0) + guessedN;
  if (n > 0) {
    console.info("repairPlaceholderTitles", personCode, "updated", n);
  }
  return n;
}

/** 出处里已有正经题名、件表仍是「档案材料 …」时回写左侧列表 */
async function syncTitlesFromSources(personCode: string) {
  await query(
    `UPDATE ordered_archive_pieces p
     SET material_name = s.title
     FROM (
       SELECT material_no,
              min(material_name) AS title
       FROM audit_field_sources
       WHERE person_code = $1
         AND nullif(trim(material_name), '') IS NOT NULL
         AND material_name !~ '^[0-9]{4,}-'
         AND material_name !~ '^档案材料'
       GROUP BY material_no
     ) s
     WHERE p.person_code = $1
       AND p.formal_no = s.material_no
       AND (
         p.material_name IS NULL
         OR btrim(p.material_name) = ''
         OR p.material_name ~ '^档案材料'
         OR p.material_name = p.formal_no
       )`,
    [personCode]
  );
  await query(
    `UPDATE archive_pieces p
     SET material_name = s.title,
         updated_at = CURRENT_TIMESTAMP
     FROM (
       SELECT material_no,
              min(material_name) AS title
       FROM audit_field_sources
       WHERE person_code = $1
         AND nullif(trim(material_name), '') IS NOT NULL
         AND material_name !~ '^[0-9]{4,}-'
         AND material_name !~ '^档案材料'
       GROUP BY material_no
     ) s
     WHERE p.person_code = $1
       AND (p.serial_no = s.material_no OR p.formal_no = s.material_no)
       AND (
         p.material_name IS NULL
         OR btrim(p.material_name) = ''
         OR p.material_name ~ '^档案材料'
         OR p.material_name = p.serial_no
         OR p.material_name = coalesce(p.formal_no, '')
       )`,
    [personCode]
  );
}

async function resolveSourceTitle(
  personCode: string,
  piece: PageRow,
  materialTitle?: string,
  rawHint?: string,
  preferVisionTitle = false
): Promise<string> {
  const knownTitle = auditUploadTitleCorrection(piece.material_no);
  const returnedTitle = cleanTitle(materialTitle);
  const guessed = guessTitleFromRaw(rawHint || "");
  const candidates = preferVisionTitle
    ? [returnedTitle, knownTitle, guessed]
    : [knownTitle, returnedTitle, guessed];
  for (const cand of candidates) {
    const t = cleanTitle(cand);
    if (!t) continue;
    const written = await maybeUpdatePieceTitle(
      personCode,
      piece,
      t,
      (preferVisionTitle && t === returnedTitle) || t === knownTitle
    );
    if (written && !looksLikePlaceholderName(written, piece.material_no)) {
      return written;
    }
    return t;
  }

  // 强制重抽会清空出处：再从页文本缓存 / 旧出处里找正经题名
  const prev = await query<{ material_name: string }>(
    `SELECT material_name FROM (
       SELECT material_name, id
       FROM audit_field_sources
       WHERE person_code = $1 AND material_no = $2
       UNION ALL
       SELECT material_name, id
       FROM archive_page_texts
       WHERE person_code = $1 AND piece_ref = $2
     ) t
     WHERE nullif(trim(material_name), '') IS NOT NULL
       AND material_name !~ '^档案材料'
       AND material_name !~ '^[0-9]{4,}-'
     ORDER BY id DESC
     LIMIT 1`,
    [personCode, piece.material_no]
  );
  if (prev.rows[0]?.material_name) {
    const keep = cleanTitle(prev.rows[0].material_name);
    if (keep) {
      await maybeUpdatePieceTitle(personCode, piece, keep);
      return keep;
    }
  }

  const cur = (piece.material_name || "").trim();
  if (cur && !looksLikePlaceholderName(cur, piece.material_no)) return cur;

  // 仍无题名：来源处显示件号，避免两侧都刷成「档案材料 …」
  return piece.material_no || "未命名材料";
}

async function insertFieldSources(
  personCode: string,
  piece: PageRow,
  fields: Record<string, string>,
  materialTitle?: string,
  rawHint?: string,
  preferVisionTitle = false
) {
  const displayName = await resolveSourceTitle(
    personCode,
    piece,
    materialTitle,
    rawHint,
    preferVisionTitle
  );
  const year = (piece.form_date || "").slice(0, 4);
  let n = 0;
  for (const [fieldKey, value] of Object.entries(fields)) {
    if (!value?.trim()) continue;
    await query(
      `INSERT INTO audit_field_sources
        (person_code, field_key, field_label, material_name, form_year, material_no, value, form_date, is_baseline)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,false)`,
      [
        personCode,
        fieldKey,
        FIELD_LABELS[fieldKey] || fieldKey,
        displayName,
        year || null,
        piece.material_no,
        value,
        piece.form_date,
      ]
    );
    n += 1;
  }
  return n;
}

/**
 * 补齐出处：优先 page_texts 缓存；缺缓存再按件多图视觉。
 */
export async function ensureAuditSourcesByVision(
  personCode: string,
  opts?: { force?: boolean; forceVision?: boolean }
): Promise<{
  extracted: number;
  skipped: boolean;
  reason?: string;
  fromCache: number;
  fromVision: number;
  pages: number;
}> {
  const before = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM audit_field_sources WHERE person_code = $1`,
    [personCode]
  );
  if ((before.rows[0]?.n || 0) > 0 && !opts?.force) {
    await syncTitlesFromSources(personCode).catch(() => undefined);
    return {
      extracted: 0,
      skipped: true,
      reason: "already_has_sources",
      fromCache: 0,
      fromVision: 0,
      pages: 0,
    };
  }

  if (opts?.force) {
    await query(`DELETE FROM audit_field_sources WHERE person_code = $1`, [
      personCode,
    ]);
    // 清掉缓存里被污染的「档案材料 …」题名，避免再次写回出处
    await query(
      `UPDATE archive_page_texts
       SET material_name = NULL
       WHERE person_code = $1
         AND (
           material_name IS NULL
           OR btrim(material_name) = ''
           OR material_name ~ '^档案材料'
           OR material_name ~ '^[0-9]{4,}-'
         )`,
      [personCode]
    ).catch(() => undefined);
  }

  const pages = await listPagesForAudit(personCode);
  if (!pages.length) {
    return {
      extracted: 0,
      skipped: true,
      reason: "no_page_files",
      fromCache: 0,
      fromVision: 0,
      pages: 0,
    };
  }

  const visionOk = isCozeVisionConfigured();
  let extracted = 0;
  let fromCache = 0;
  let fromVision = 0;
  const pieces = groupByPiece(pages);

  for (const piecePages of pieces) {
    const head = piecePages[0];
    if (!head) continue;

    try {
      // 仅当已抽出过比对字段时才走缓存；只有文件名/空字段则强制再读图
      if (!opts?.forceVision) {
        const cachedList = await Promise.all(
          piecePages.map((p) =>
            getPageText(personCode, p.material_no, p.page_no)
          )
        );
        const fields: Record<string, string> = {};
        let cachedTitle: string | undefined;
        const rawBits: string[] = [];
        for (const c of cachedList) {
          if (!c) continue;
          for (const [k, v] of Object.entries(c.fields || {})) {
            if (v && !fields[k]) fields[k] = v;
          }
          if (!cachedTitle && cleanTitle(c.materialName)) {
            cachedTitle = cleanTitle(c.materialName);
          }
          if (c.textContent) rawBits.push(c.textContent);
        }
        if (Object.keys(fields).length > 0) {
          fromCache += piecePages.length;
          extracted += await insertFieldSources(
            personCode,
            head,
            fields,
            cachedTitle,
            rawBits.join("\n")
          );
          continue;
        }
      }

      if (!visionOk) continue;

      const images: ImageInput[] = [];
      for (const p of piecePages) {
        if (!p.file_path) continue;
        const bytes = await getObjectBytes(p.file_path);
        images.push({
          bytes,
          fileName: p.file_name || `${p.material_no}-${p.page_no}.jpg`,
          pageNo: p.page_no,
        });
      }
      if (!images.length) continue;

      const { result } = await extractFieldsWithFallback(
        images,
        head.material_name
      );
      fromVision += images.length;

      const resolvedTitle = await resolveSourceTitle(
        personCode,
        head,
        result.materialTitle,
        `${result.pageText || ""}\n${result.raw || ""}`,
        true
      );

      // 首页写合并结果；其余页写占位便于缓存命中
      for (const p of piecePages) {
        const isFirst = p.page_no === piecePages[0].page_no;
        await upsertPageText({
          personCode,
          pieceRef: p.material_no,
          pageNo: p.page_no,
          materialName: resolvedTitle,
          filePath: p.file_path || undefined,
          textContent: isFirst ? result.pageText || result.raw || "" : "",
          fields: isFirst ? result.fields : {},
          source: "vision",
        });
      }

      extracted += await insertFieldSources(
        personCode,
        head,
        result.fields,
        resolvedTitle,
        `${result.pageText || ""}\n${result.raw || ""}`,
        true
      );
    } catch (e) {
      console.warn("audit vision piece failed", head.material_no, e);
    }
  }

  if (!visionOk && fromCache === 0 && extracted === 0) {
    await syncTitlesFromSources(personCode).catch(() => undefined);
    return {
      extracted: 0,
      skipped: true,
      reason: "vision_not_configured",
      fromCache: 0,
      fromVision: 0,
      pages: pages.length,
    };
  }

  await syncTitlesFromSources(personCode).catch(() => undefined);

  return {
    extracted,
    skipped: false,
    fromCache,
    fromVision,
    pages: pages.length,
  };
}
