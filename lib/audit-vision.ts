/**
 * 审核查验视觉提取：
 * - 按「件」多图同传（同一文件夹/同一件全部页）
 * - 整件一次失败则分批；分批再失败则逐页
 * - 优先复用 archive_page_texts；字段写入 audit_field_sources
 */
import { query } from "@/lib/db";
import {
  isCozeVisionConfigured,
  uploadCozeFile,
} from "@/lib/coze-vision";
import {
  getPageText,
  upsertPageText,
} from "@/lib/repos/page-texts";
import { getObjectBytes } from "@/lib/storage";

const API = process.env.COZE_API_BASE || "https://api.coze.cn";
/** 整件失败后的分批大小 */
const BATCH_SIZE = Math.max(
  2,
  Math.min(parseInt(process.env.COZE_VISION_BATCH || "6", 10) || 6, 12)
);

function token() {
  return process.env.COZE_API_TOKEN || process.env.COZE_PAT || "";
}

function visionBotId() {
  return (
    process.env.COZE_VISION_BOT_ID ||
    process.env.COZE_ARCHIVE_BOT_ID ||
    ""
  );
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
  raw: string;
};

type ImageInput = { bytes: Buffer; fileName: string; pageNo: number };

function buildPrompt(pageCount: number, materialName: string) {
  return `你是干部人事档案审核助手。以下共 ${pageCount} 张图片，属于同一件材料《${materialName || "未命名"}》，已按页序排列。请综合所有页抽取字段（某页看不清则从其它页补；都没有则省略该键），只输出一行 JSON：
{"name":"姓名","birth":"出生日期YYYY-MM-DD","work":"参加工作时间YYYY-MM-DD","party":"入党时间YYYY-MM-DD","education":"学历","degree":"学位","experience":"工作经历摘要","recognition":"组织认定摘要","pageText":"各页关键文字摘要合并，400字内"}
禁止编造。`;
}

function parseVisionAnswer(answer: string): VisionExtract {
  const m = answer.match(/\{[\s\S]*\}/);
  if (!m) return { fields: {}, pageText: "", raw: answer };
  try {
    const obj = JSON.parse(m[0]) as Record<string, unknown>;
    const fields: Record<string, string> = {};
    for (const k of Object.keys(FIELD_LABELS)) {
      const v = String(obj[k] || "").trim();
      if (v) fields[k] = v;
    }
    const pageText = String(obj.pageText || "").trim();
    return { fields, pageText, raw: answer };
  } catch {
    return { fields: {}, pageText: "", raw: answer };
  }
}

function mergeExtracts(parts: VisionExtract[]): VisionExtract {
  const fields: Record<string, string> = {};
  const texts: string[] = [];
  const raws: string[] = [];
  for (const p of parts) {
    for (const [k, v] of Object.entries(p.fields)) {
      if (v && !fields[k]) fields[k] = v;
    }
    if (p.pageText) texts.push(p.pageText);
    if (p.raw) raws.push(p.raw);
  }
  return {
    fields,
    pageText: texts.join("\n").slice(0, 2000),
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
  return parseVisionAnswer(answer);
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

/** 关键件全页，其余仅首页 */
function filterPages(rows: PageRow[]): PageRow[] {
  return rows.filter((row) => {
    if (row.page_no === 1) return true;
    return PRIORITY_NAME_RE.test(row.material_name || "");
  });
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

async function insertFieldSources(
  personCode: string,
  piece: PageRow,
  fields: Record<string, string>
) {
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
        piece.material_name,
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
      // 件内各页均有缓存 → 合并字段，不调模型
      if (!opts?.forceVision) {
        const cachedList = await Promise.all(
          piecePages.map((p) =>
            getPageText(personCode, p.material_no, p.page_no)
          )
        );
        const allCached = cachedList.every(
          (c) => c && (Object.keys(c.fields).length || c.textContent)
        );
        if (allCached) {
          const fields: Record<string, string> = {};
          const texts: string[] = [];
          for (const c of cachedList) {
            if (!c) continue;
            for (const [k, v] of Object.entries(c.fields || {})) {
              if (v && !fields[k]) fields[k] = v;
            }
            if (c.textContent) texts.push(c.textContent);
          }
          fromCache += piecePages.length;
          extracted += await insertFieldSources(personCode, head, fields);
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

      // 首页写合并结果；其余页写占位便于缓存命中
      for (const p of piecePages) {
        const isFirst = p.page_no === piecePages[0].page_no;
        await upsertPageText({
          personCode,
          pieceRef: p.material_no,
          pageNo: p.page_no,
          materialName: p.material_name,
          filePath: p.file_path || undefined,
          textContent: isFirst ? result.pageText || result.raw || "" : "",
          fields: isFirst ? result.fields : {},
          source: "vision",
        });
      }

      extracted += await insertFieldSources(
        personCode,
        head,
        result.fields
      );
    } catch (e) {
      console.warn("audit vision piece failed", head.material_no, e);
    }
  }

  if (!visionOk && fromCache === 0 && extracted === 0) {
    return {
      extracted: 0,
      skipped: true,
      reason: "vision_not_configured",
      fromCache: 0,
      fromVision: 0,
      pages: pages.length,
    };
  }

  return {
    extracted,
    skipped: false,
    fromCache,
    fromVision,
    pages: pages.length,
  };
}
