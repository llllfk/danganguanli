import { query } from "@/lib/db";
import type { ArchiveCategoryCode, ArchivePiece, SortItem } from "@/types";
export async function listCategories() {
  const r = await query<{ code: string; name: string; parent_code: string | null }>(
    `SELECT code, name, parent_code FROM archive_categories ORDER BY sort_order, code`
  );
  return r.rows.map((row) => ({
    code: row.code as ArchiveCategoryCode,
    name: row.name,
    parent: row.parent_code || undefined,
  }));
}

export async function categoryName(code: string) {
  const r = await query<{ name: string }>(
    `SELECT name FROM archive_categories WHERE code = $1`,
    [code]
  );
  return r.rows[0]?.name || code;
}

export async function listPieces(personCode = "00001"): Promise<ArchivePiece[]> {
  const r = await query<{
    id: string;
    serial_no: string;
    person_code: string;
    page_count: number;
    material_name: string | null;
    summary: string | null;
    form_date: string | null;
    suggested_category: string | null;
    confirmed_category: string | null;
  }>(
    `SELECT id::text, serial_no, person_code, page_count, material_name, summary,
            form_date, suggested_category, confirmed_category
     FROM archive_pieces
     WHERE person_code = $1
     ORDER BY serial_no`,
    [personCode]
  );

  const pieces: ArchivePiece[] = [];
  for (const row of r.rows) {
    const pages = await query<{ file_name: string | null }>(
      `SELECT file_name FROM archive_pages WHERE piece_id = $1::bigint ORDER BY page_no`,
      [row.id]
    );
    pieces.push({
      id: row.id,
      serialNo: row.serial_no,
      personCode: row.person_code,
      pageCount: row.page_count,
      pages: pages.rows.map((p) => p.file_name || ""),
      materialName: row.material_name || undefined,
      summary: row.summary || undefined,
      formDate: row.form_date || undefined,
      suggestedCategory: (row.suggested_category as ArchiveCategoryCode) || undefined,
      confirmedCategory: (row.confirmed_category as ArchiveCategoryCode) || undefined,
    });
  }
  return pieces;
}

function needsVisionExtract(materialName: string | undefined, serialNo: string) {
  const name = (materialName || "").trim();
  if (!name) return true;
  if (name === serialNo) return true;
  // 仍是流水号形态，未识别出真实材料名
  if (/^\d{4,}-L\d+/i.test(name)) return true;
  return false;
}

type ClassifyKeyword = { code: ArchiveCategoryCode; keyword: string };

async function loadClassifyKeywords(): Promise<ClassifyKeyword[]> {
  const kw = await query<{ category_code: string; keyword: string }>(
    `SELECT category_code, keyword FROM classify_keywords`
  );
  // 长关键词优先，避免「任免审批表」抢先于「专项审核」专用表
  return kw.rows
    .map((row) => ({
      code: row.category_code as ArchiveCategoryCode,
      keyword: row.keyword,
    }))
    .sort((a, b) => b.keyword.length - a.keyword.length);
}

function matchCategory(
  materialName: string,
  rules: ClassifyKeyword[]
): ArchiveCategoryCode {
  for (const rule of rules) {
    if (materialName.includes(rule.keyword)) return rule.code;
  }
  return "1000";
}

async function getPiece(
  personCode: string,
  serialNo: string
): Promise<ArchivePiece | null> {
  const r = await query<{
    id: string;
    serial_no: string;
    person_code: string;
    page_count: number;
    material_name: string | null;
    summary: string | null;
    form_date: string | null;
    suggested_category: string | null;
    confirmed_category: string | null;
  }>(
    `SELECT id::text, serial_no, person_code, page_count, material_name, summary,
            form_date, suggested_category, confirmed_category
     FROM archive_pieces
     WHERE person_code = $1 AND serial_no = $2`,
    [personCode, serialNo]
  );
  const row = r.rows[0];
  if (!row) return null;
  const pages = await query<{ file_name: string | null }>(
    `SELECT file_name FROM archive_pages WHERE piece_id = $1::bigint ORDER BY page_no`,
    [row.id]
  );
  return {
    id: row.id,
    serialNo: row.serial_no,
    personCode: row.person_code,
    pageCount: row.page_count,
    pages: pages.rows.map((p) => p.file_name || ""),
    materialName: row.material_name || undefined,
    summary: row.summary || undefined,
    formDate: row.form_date || undefined,
    suggestedCategory:
      (row.suggested_category as ArchiveCategoryCode) || undefined,
    confirmedCategory:
      (row.confirmed_category as ArchiveCategoryCode) || undefined,
  };
}

async function writeKeywordClassify(
  personCode: string,
  serialNo: string,
  materialName: string,
  rules: ClassifyKeyword[]
): Promise<ArchiveCategoryCode> {
  const code = matchCategory(materialName || "", rules);
  await query(
    `UPDATE archive_pieces
     SET suggested_category = $1,
         confirmed_category = $1,
         formal_no = NULL,
         sort_index = NULL,
         status = 'classified',
         updated_at = CURRENT_TIMESTAMP
     WHERE person_code = $2 AND serial_no = $3`,
    [code, personCode, serialNo]
  );
  return code;
}

async function visionExtractOnePiece(
  personCode: string,
  serialNo: string
): Promise<{ ok: boolean; error?: string }> {
  const { isCozeVisionConfigured, extractMetaFromImage } = await import(
    "@/lib/coze-vision"
  );
  const { getObjectBytes } = await import("@/lib/storage");
  if (!isCozeVisionConfigured()) {
    return { ok: false, error: "未配置 COZE_VISION_BOT_ID" };
  }

  const page = await query<{
    file_path: string | null;
    file_name: string | null;
  }>(
    `SELECT pg.file_path, pg.file_name
     FROM archive_pages pg
     JOIN archive_pieces ap ON ap.id = pg.piece_id
     WHERE ap.person_code = $1 AND ap.serial_no = $2
     ORDER BY pg.page_no ASC
     LIMIT 1`,
    [personCode, serialNo]
  );
  const row = page.rows[0];
  if (!row?.file_path && !row?.file_name) {
    return { ok: false, error: "无首页文件" };
  }
  try {
    const bytes = await getObjectBytes(row.file_path || row.file_name || "");
    const meta = await extractMetaFromImage(
      bytes,
      row.file_name || `${serialNo}-001.jpg`
    );
    if (!meta.materialName && !meta.formDate) {
      return { ok: false, error: "视觉未返回有效字段" };
    }
    await query(
      `UPDATE archive_pieces
       SET material_name = COALESCE(NULLIF($1, ''), material_name),
           form_date = COALESCE(NULLIF($2, ''), form_date),
           summary = COALESCE(NULLIF($3, ''), summary),
           updated_at = CURRENT_TIMESTAMP
       WHERE person_code = $4 AND serial_no = $5`,
      [
        meta.materialName || "",
        meta.formDate || "",
        meta.summary || "",
        personCode,
        serialNo,
      ]
    );
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/** 扣子视觉：按件取首页 JPG，抽取材料名称/形成日期写回库 */
export async function extractPersonPiecesWithVision(
  personCode = "00001",
  opts?: { force?: boolean; concurrency?: number }
) {
  const { isCozeVisionConfigured } = await import("@/lib/coze-vision");

  if (!isCozeVisionConfigured()) {
    return {
      skipped: true as const,
      reason:
        "未配置 COZE_VISION_BOT_ID（需发布支持视觉理解的扣子智能体为 API）",
      extracted: 0,
      failed: 0,
      data: await listPieces(personCode),
    };
  }

  const pieces = await listPieces(personCode);
  const concurrency = Math.max(1, Math.min(opts?.concurrency || 2, 3));
  let extracted = 0;
  let failed = 0;
  const errors: Array<{ serialNo: string; error: string }> = [];

  const targets = pieces.filter(
    (p) => opts?.force || needsVisionExtract(p.materialName, p.serialNo)
  );

  async function runOne(p: (typeof pieces)[0]) {
    const r = await visionExtractOnePiece(personCode, p.serialNo);
    if (r.ok) extracted++;
    else {
      failed++;
      errors.push({ serialNo: p.serialNo, error: r.error || "失败" });
    }
  }

  for (let i = 0; i < targets.length; i += concurrency) {
    const batch = targets.slice(i, i + concurrency);
    await Promise.all(batch.map(runOne));
  }

  return {
    skipped: false as const,
    extracted,
    failed,
    total: targets.length,
    errors: errors.slice(0, 20),
    data: await listPieces(personCode),
  };
}

export async function classifyPersonPieces(personCode = "00001") {
  const rules = await loadClassifyKeywords();
  const pieces = await listPieces(personCode);
  for (const p of pieces) {
    await writeKeywordClassify(
      personCode,
      p.serialNo,
      p.materialName || "",
      rules
    );
  }
  return listPieces(personCode);
}

export type ClassifyProgressEvent =
  | {
      type: "start";
      total: number;
      visionTargets: number;
      visionEnabled: boolean;
      reason?: string;
    }
  | {
      type: "piece";
      done: number;
      total: number;
      piece: ArchivePiece;
      vision: "ok" | "skip" | "fail" | "none";
      error?: string;
    }
  | {
      type: "done";
      extracted: number;
      failed: number;
      total: number;
      data: ArchivePiece[];
    }
  | { type: "error"; error: string };

/**
 * 逐件：视觉提取（如需）→ 立即关键词分类落库 → 回调进度。
 */
export async function classifyPersonPiecesProgressive(
  personCode = "00001",
  opts: {
    skipVision?: boolean;
    forceVision?: boolean;
    concurrency?: number;
    onEvent: (ev: ClassifyProgressEvent) => void | Promise<void>;
  }
) {
  const { isCozeVisionConfigured } = await import("@/lib/coze-vision");
  const rules = await loadClassifyKeywords();
  const pieces = await listPieces(personCode);
  const total = pieces.length;
  const visionEnabled = !opts.skipVision && isCozeVisionConfigured();
  const visionTargets = pieces.filter(
    (p) => opts.forceVision || needsVisionExtract(p.materialName, p.serialNo)
  ).length;

  await opts.onEvent({
    type: "start",
    total,
    visionTargets,
    visionEnabled,
    reason: visionEnabled
      ? undefined
      : opts.skipVision
        ? "已跳过视觉"
        : "未配置 COZE_VISION_BOT_ID",
  });

  if (!total) {
    await opts.onEvent({
      type: "done",
      extracted: 0,
      failed: 0,
      total: 0,
      data: [],
    });
    return [];
  }

  const concurrency = Math.max(1, Math.min(opts.concurrency || 2, 3));
  let done = 0;
  let extracted = 0;
  let failed = 0;
  let emitChain: Promise<void> = Promise.resolve();

  async function processOne(p: ArchivePiece) {
    let vision: "ok" | "skip" | "fail" | "none" = "none";
    let err: string | undefined;
    const needVision =
      opts.forceVision || needsVisionExtract(p.materialName, p.serialNo);

    if (needVision) {
      if (visionEnabled) {
        const r = await visionExtractOnePiece(personCode, p.serialNo);
        if (r.ok) vision = "ok";
        else {
          vision = "fail";
          err = r.error;
        }
      } else {
        vision = "skip";
      }
    }

    const afterVision = (await getPiece(personCode, p.serialNo)) || p;
    await writeKeywordClassify(
      personCode,
      afterVision.serialNo,
      afterVision.materialName || "",
      rules
    );
    const updated = (await getPiece(personCode, p.serialNo)) || afterVision;

    emitChain = emitChain.then(async () => {
      done += 1;
      if (vision === "ok") extracted += 1;
      if (vision === "fail") failed += 1;
      await opts.onEvent({
        type: "piece",
        done,
        total,
        piece: updated,
        vision,
        error: err,
      });
    });
    await emitChain;
  }

  for (let i = 0; i < pieces.length; i += concurrency) {
    const batch = pieces.slice(i, i + concurrency);
    await Promise.all(batch.map(processOne));
  }

  await emitChain;
  const data = await listPieces(personCode);
  await opts.onEvent({
    type: "done",
    extracted,
    failed,
    total,
    data,
  });
  return data;
}

export async function updateConfirmedCategory(
  personCode: string,
  serialNo: string,
  category: ArchiveCategoryCode
) {
  await query(
    `UPDATE archive_pieces
     SET confirmed_category = $1, updated_at = CURRENT_TIMESTAMP,
         formal_no = NULL, sort_index = NULL, status = 'classified'
     WHERE person_code = $2 AND serial_no = $3`,
    [category, personCode, serialNo]
  );
}

const PARTY_ORDER = [
  "入团志愿书",
  "入团申请书",
  "团员登记表",
  "退团",
  "入党志愿书",
  "入党申请书",
  "转正申请书",
  "党员登记表",
  "退党",
];

function partyRank(name: string) {
  const idx = PARTY_ORDER.findIndex((k) => name.includes(k));
  return idx >= 0 ? idx : 50;
}

/** 附件2 目录序号前缀（与导出一致） */
const CATALOG_PREFIX: Partial<Record<ArchiveCategoryCode, string>> = {
  "0100": "1",
  "0200": "2",
  "0300": "3",
  "0401": "4-1",
  "0402": "4-2",
  "0403": "4-3",
  "0404": "4-4",
  "0500": "5",
  "0600": "6",
  "0700": "7",
  "0800": "8",
  "0901": "9-1",
  "0902": "9-2",
  "0903": "9-3",
  "0904": "9-4",
  "1000": "10",
};

export async function sortPersonPieces(personCode = "00001"): Promise<SortItem[]> {
  const pieces = await listPieces(personCode);
  if (pieces.some((p) => !p.confirmedCategory && !p.suggestedCategory)) {
    throw new Error("请先完成分类核定");
  }

  const cats = await listCategories();
  const groups = new Map<ArchiveCategoryCode, ArchivePiece[]>();
  for (const p of pieces) {
    const code = (p.confirmedCategory || p.suggestedCategory || "1000") as ArchiveCategoryCode;
    if (!groups.has(code)) groups.set(code, []);
    groups.get(code)!.push(p);
  }

  const result: SortItem[] = [];
  let globalIdx = 0;
  for (const cat of cats) {
    const list = groups.get(cat.code);
    if (!list?.length) continue;
    list.sort((a, b) => {
      if (cat.code === "0600") {
        const ra = partyRank(a.materialName || "");
        const rb = partyRank(b.materialName || "");
        if (ra !== rb) return ra - rb;
      }
      return String(a.formDate).localeCompare(String(b.formDate));
    });

    const prefix = CATALOG_PREFIX[cat.code] || cat.code;
    const items = [];
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      // 制式序号：1-1 / 4-1-1；内部仍可按 sort_index 还原顺序
      const formalNo = `${prefix}-${i + 1}`;
      globalIdx += 1;
      await query(
        `UPDATE archive_pieces
         SET formal_no = $1, sort_index = $2, status = 'sorted',
             confirmed_category = $3, updated_at = CURRENT_TIMESTAMP
         WHERE person_code = $4 AND serial_no = $5`,
        [formalNo, globalIdx, cat.code, personCode, p.serialNo]
      );
      items.push({
        serialNo: p.serialNo,
        materialName: p.materialName || "-",
        formDate: p.formDate || "-",
        pageCount: p.pageCount,
        formalNo,
      });
    }
    result.push({
      category: cat.code,
      categoryName: cat.name,
      items,
    });
  }
  return result;
}

export async function getSortedGroups(personCode = "00001"): Promise<SortItem[]> {
  const cats = await listCategories();
  const r = await query<{
    confirmed_category: string;
    serial_no: string;
    material_name: string | null;
    form_date: string | null;
    page_count: number;
    formal_no: string | null;
  }>(
    `SELECT confirmed_category, serial_no, material_name, form_date, page_count, formal_no
     FROM archive_pieces
     WHERE person_code = $1 AND status = 'sorted' AND formal_no IS NOT NULL
     ORDER BY sort_index NULLS LAST, formal_no`,
    [personCode]
  );

  return cats
    .map((cat) => {
      const items = r.rows
        .filter((row) => row.confirmed_category === cat.code)
        .map((row) => ({
          serialNo: row.serial_no,
          materialName: row.material_name || "-",
          formDate: row.form_date || "-",
          pageCount: row.page_count,
          formalNo: row.formal_no || "",
        }));
      return items.length
        ? { category: cat.code, categoryName: cat.name, items }
        : null;
    })
    .filter(Boolean) as SortItem[];
}

export async function resetPiecesToUploaded(personCode = "00001") {
  await query(
    `UPDATE archive_pieces
     SET suggested_category = NULL,
         confirmed_category = NULL,
         formal_no = NULL,
         sort_index = NULL,
         status = 'uploaded',
         updated_at = CURRENT_TIMESTAMP
     WHERE person_code = $1`,
    [personCode]
  );
  return listPieces(personCode);
}

export async function ensurePerson(personCode: string, personName?: string) {
  await query(
    `INSERT INTO persons (person_code, person_name, meta)
     VALUES ($1, $2, '{}'::jsonb)
     ON CONFLICT (person_code) DO NOTHING`,
    [personCode, personName || personCode]
  );
}

export type UploadPieceInput = {
  personCode: string;
  serialNo: string;
  pages: Array<{ pageNo: number; fileName: string; publicPath: string; absPath: string }>;
  materialName?: string;
  formDate?: string;
};

/** 按件 upsert：保留已有材料名/日期，重置分类排序，重写页文件 */
export async function upsertUploadedPieces(inputs: UploadPieceInput[]) {
  if (!inputs.length) return { personCode: "", count: 0 };

  const personCodes = [...new Set(inputs.map((i) => i.personCode))];
  for (const code of personCodes) {
    await ensurePerson(code);
  }

  for (const piece of inputs) {
    const existing = await query<{
      id: string;
      material_name: string | null;
      form_date: string | null;
      summary: string | null;
    }>(
      `SELECT id::text, material_name, form_date, summary
       FROM archive_pieces WHERE person_code = $1 AND serial_no = $2`,
      [piece.personCode, piece.serialNo]
    );

    const materialName =
      existing.rows[0]?.material_name || piece.materialName || piece.serialNo;
    const formDate = existing.rows[0]?.form_date || piece.formDate || null;
    const summary = existing.rows[0]?.summary || null;
    const pageCount = piece.pages.length || 1;

    let pieceId: string;
    if (existing.rows[0]) {
      await query(
        `UPDATE archive_pieces
         SET page_count = $1,
             material_name = $2,
             form_date = $3,
             summary = $4,
             suggested_category = NULL,
             confirmed_category = NULL,
             formal_no = NULL,
             sort_index = NULL,
             status = 'uploaded',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $5::bigint`,
        [pageCount, materialName, formDate, summary, existing.rows[0].id]
      );
      pieceId = existing.rows[0].id;
      await query(`DELETE FROM archive_pages WHERE piece_id = $1::bigint`, [pieceId]);
    } else {
      const ins = await query<{ id: string }>(
        `INSERT INTO archive_pieces
          (person_code, serial_no, page_count, material_name, summary, form_date, status)
         VALUES ($1,$2,$3,$4,$5,$6,'uploaded')
         RETURNING id::text`,
        [piece.personCode, piece.serialNo, pageCount, materialName, summary, formDate]
      );
      pieceId = ins.rows[0].id;
    }

    for (const pg of piece.pages) {
      await query(
        `INSERT INTO archive_pages (piece_id, page_no, file_name, file_path)
         VALUES ($1::bigint, $2, $3, $4)`,
        [pieceId, pg.pageNo, pg.publicPath || pg.fileName, pg.absPath]
      );
    }
  }

  return {
    personCode: personCodes[0],
    personCodes,
    count: inputs.length,
  };
}

export async function getPageFile(
  personCode: string,
  serialNo: string,
  pageNo: number
) {
  const r = await query<{ file_name: string | null; file_path: string | null }>(
    `SELECT pg.file_name, pg.file_path
     FROM archive_pages pg
     JOIN archive_pieces p ON p.id = pg.piece_id
     WHERE p.person_code = $1 AND p.serial_no = $2 AND pg.page_no = $3`,
    [personCode, serialNo, pageNo]
  );
  return r.rows[0] || null;
}
