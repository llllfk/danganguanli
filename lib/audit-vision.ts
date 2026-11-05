/**
 * 审核查验视觉提取：
 * - 按「件」多图同传（同一文件夹/同一件全部页）
 * - 整件一次失败则分批；分批再失败则逐页
 * - 优先复用 archive_page_texts；字段写入 audit_field_sources
 */
import { query } from "@/lib/db";
import { AUDIT_VISION_SOURCE, cleanAuditTitle } from "@/lib/audit-title";
import { normalizeAuditDate, cleanEducationEvidence, cleanExperienceEvents, experienceText, jsonArray } from "@/lib/audit-rules";
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
  looksLikePlaceholderName,
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

type VisionExtract = {
  fields: Record<string, string>;
  pageText: string;
  materialTitle?: string;
  formDate?: string;
  raw: string;
};

type ImageInput = { bytes: Buffer; fileName: string; pageNo: number };

function buildPrompt(pageCount: number) {
  return `你是干部人事档案审核助手。以下共 ${pageCount} 张图片，属于同一件材料，已按页序排列。根据图片实际内容读取，不能根据分类号、件号或已有名称猜测题名。
请通读全部页面，抽取可用于信息比对的具体记载（不要只返回文件名/件号），某页看不清则从其它页补；确实没有则省略该键。只输出一行 JSON：
{"materialTitle":"材料正文题名","formDate":"本材料形成日期","assessmentYear":"仅年度考核表填写考核所属年度","name":"姓名","birth":"出生时间","work":"参加工作时间","party":"入党时间","education":"学历","degree":"学位","experienceEvents":[{"kind":"study或work或title","start":"开始/取得时间","end":"结束时间或至今","organization":"学校或单位","position":"仅领导职务","title":"仅取得的职称"}],"educationEvidence":[{"type":"graduationCertificate或degreeCertificate或graduateRegistration或degreeProof","level":"专科/本科/硕士/博士","education":"学历","degree":"学位全称如工学硕士学位","school":"学校","major":"专业"}],"reviewIssues":[{"kind":"alteration或overlap","message":"仅记录图片明确支持的涂改或时间重叠问题"}],"pageText":"各页关键文字摘要合并，400字内"}
规则：
- materialTitle：优先读取第一页顶部印刷的材料题名/表名，原样提取；禁止用文件名、流水号
- 若正文出现「表彰决定」等内容，不能用正文事项替代第一页顶部实际印刷的表名
- 所有日期必须保留原文精度：只有年份则YYYY，年月则YYYY-MM，年月日则YYYY-MM-DD，严禁补1月/1日
- formDate：依据本材料的填表、落款、签署、批准日期，通读末页后提取最后落款日期；不能把出生时间、考核所属年度当形成日期；看不到就留空
- experienceEvents只提取各阶段学习的时间段/学校、工作的时间段/单位/领导职务，以及取得职称的时间/名称。严禁论文、奖惩、工作内容、班级、学生职务、普通岗位、合同和保险信息；没有则[]
- end只填写原文明示的结束时间；未写结束时间就省略，不能自动填「至今」。原文「至今」仅指本材料形成时，不代表今天或未来；合同到期、试用期满、预计毕业日期不能用作实际经历结束日期
- educationEvidence只从当前图片中的毕业证书、学位证书、毕业生登记表、授予学位证明提取，不可从履历表、自传中生成证据。证件复印件同样有效，专业学位全称原样保留。每张证件分别列出，区分本科/硕士/博士及毕业证/学位证；没有则[]
- reviewIssues仅记录有原文证据的涂改和学习工作时间交叉等问题，禁止根据空白或印章猜测，没有则[]
- name/birth/work/party/education/degree必须是材料内写明的具体值。禁止编造`;
}

function cleanTitle(raw: string | undefined): string | undefined {
  return cleanAuditTitle(raw);
}

function parseVisionAnswer(answer: string): VisionExtract {
  const payload = unwrapAssistantJsonPayload(answer);
  const m = payload.match(/\{[\s\S]*\}/);
  if (!m) {
    return {
      fields: {},
      pageText: "",
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
        v = normalizeAuditDate(v) || v;
      }
      if (k === "experience" || k === "recognition") continue;
      fields[k] = v;
    }
    const formDate = normalizeAuditDate(String(obj.formDate || obj.form_date || ""));
    if (formDate) fields._formDate = formDate;
    const assessmentYear = String(obj.assessmentYear || "");
    if (/^(?:19|20)\d{2}$/.test(assessmentYear)) fields._assessmentYear = assessmentYear;
    const events = cleanExperienceEvents(obj.experienceEvents);
    fields._experienceEvents = JSON.stringify(events);
    if (events.length) fields.experience = experienceText(events);
    fields._educationEvidence = JSON.stringify(cleanEducationEvidence(obj.educationEvidence));
    const reviewIssues = Array.isArray(obj.reviewIssues) ? obj.reviewIssues.filter((issue) =>
      issue && ["alteration", "overlap"].includes(issue.kind) && typeof issue.message === "string"
    ) : [];
    fields._reviewIssues = JSON.stringify(reviewIssues);
    const pageText = String(obj.pageText || "").trim();
    const materialTitle = [
      obj.materialTitle, obj.material_title, obj.materialName,
      obj.material_name, obj.title, obj.题名,
    ].map(cleanAuditTitle).find(Boolean);
    return {
      fields,
      pageText,
      materialTitle,
      formDate,
      raw: answer,
    };
  } catch {
    return {
      fields: {},
      pageText: "",
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
  for (const key of ["_educationEvidence", "_experienceEvents", "_reviewIssues"]) {
    fields[key] = JSON.stringify(parts.flatMap((part) => jsonArray(part.fields[key])));
  }
  const events = cleanExperienceEvents(jsonArray(fields._experienceEvents));
  if (events.length) fields.experience = experienceText(events);
  const latestDate = parts.map((part) => part.formDate || part.fields._formDate).filter(Boolean).at(-1);
  if (latestDate) fields._formDate = latestDate;
  return {
    fields,
    pageText: texts.join("\n").slice(0, 2000),
    materialTitle,
    raw: raws.join("\n").slice(0, 4000),
    formDate: parts.map((part) => part.formDate).filter(Boolean).at(-1),
  };
}

/** 一次对话多图同传；失败抛错供上层分批 */
async function extractFieldsFromImages(
  images: ImageInput[],
  materialName: string,
  signal?: AbortSignal
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
      text: buildPrompt(images.length),
    },
  ];
  for (const img of images) {
    const fileId = await uploadCozeFile(
      img.bytes,
      img.fileName || `p${img.pageNo}.jpg`,
      { signal }
    );
    parts.push({ type: "image", file_id: fileId });
  }

  const content = JSON.stringify(parts);
  const res = await fetch(`${API}/v3/chat`, {
    method: "POST",
    signal,
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
  const started = (await res.json().catch(() => {
    throw new Error(`扣子会话服务返回异常（HTTP ${res.status}），请稍后重试`);
  })) as {
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
    signal?.throwIfAborted();
    const detail = await fetch(
      `${API}/v3/chat/retrieve?conversation_id=${encodeURIComponent(convId)}&chat_id=${encodeURIComponent(chatId)}`,
      { headers: { Authorization: `Bearer ${token()}` }, signal }
    );
    const dj = (await detail.json().catch(() => {
      throw new Error(`扣子进度服务返回异常（HTTP ${detail.status}），请稍后重试`);
    })) as {
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
    { headers: { Authorization: `Bearer ${token()}` }, signal }
  );
  const mj = (await msgRes.json().catch(() => {
    throw new Error(`扣子结果服务返回异常（HTTP ${msgRes.status}），请稍后重试`);
  })) as {
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
  materialName: string,
  signal?: AbortSignal
): Promise<{ result: VisionExtract; mode: "all" | "batch" | "single" }> {
  if (images.length <= 1) {
    const result = await extractFieldsFromImages(images, materialName, signal);
    return { result, mode: "single" };
  }

  try {
    const result = await extractFieldsFromImages(images, materialName, signal);
    return { result, mode: "all" };
  } catch (e) {
    signal?.throwIfAborted();
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
      parts.push(await extractFieldsFromImages(batch, materialName, signal));
      anyBatchOk = true;
    } catch (e) {
      signal?.throwIfAborted();
      console.warn(
        "分批失败，改逐页",
        materialName,
        `p${batch[0]?.pageNo}+`,
        e instanceof Error ? e.message : e
      );
      for (const one of batch) {
        try {
          parts.push(await extractFieldsFromImages([one], materialName, signal));
          anyBatchOk = true;
        } catch (e2) {
          signal?.throwIfAborted();
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
     ORDER BY p.sort_index, p.formal_no, pg.page_no`,
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
  return groupByPiece(rows).flatMap((pages) => pages);
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
  title?: string
) {
  const t = cleanTitle(title);
  if (!t || looksLikePlaceholderName(t, piece.material_no)) {
    return piece.material_name;
  }
  const cur = (piece.material_name || "").trim();
  if (cur === t) return t;
  // Title comes only from the current audit extraction or its matching versioned cache.
  await query(
    `UPDATE ordered_archive_pieces
     SET material_name = $1
     WHERE person_code = $2 AND formal_no = $3`,
    [t, personCode, piece.material_no]
  );
  return t;
}

/**
 * 只同步新版审核缓存中从当前图片识别的题名；不把旧演示题名回填到界面。
 */
export async function repairPlaceholderTitles(personCode: string): Promise<number> {
  const result = await query(
    `UPDATE ordered_archive_pieces p
     SET material_name = t.material_name
     FROM archive_page_texts t
     WHERE p.person_code = $1 AND t.person_code = p.person_code
       AND t.piece_ref = p.formal_no AND t.source = $2
       AND nullif(trim(t.material_name), '') IS NOT NULL
       AND p.material_name IS DISTINCT FROM t.material_name
       AND t.page_no = (
         SELECT min(pg.page_no) FROM ordered_archive_pages pg WHERE pg.piece_id = p.id
       )
       AND EXISTS (
         SELECT 1 FROM ordered_archive_pages pg
         WHERE pg.piece_id = p.id AND pg.page_no = t.page_no AND pg.file_path = t.file_path
       )`,
    [personCode, AUDIT_VISION_SOURCE]
  );
  await query(
    `UPDATE audit_field_sources s SET material_name = t.material_name
     FROM archive_page_texts t
     WHERE s.person_code = $1 AND t.person_code = s.person_code
       AND t.piece_ref = s.material_no AND t.source = $2
       AND nullif(trim(t.material_name), '') IS NOT NULL
       AND s.material_name IS DISTINCT FROM t.material_name
       AND t.page_no = (
         SELECT min(t2.page_no) FROM archive_page_texts t2
         WHERE t2.person_code = t.person_code AND t2.piece_ref = t.piece_ref
           AND t2.source = $2
       )
       AND (
         EXISTS (
           SELECT 1 FROM ordered_archive_pieces p
           JOIN ordered_archive_pages pg ON pg.piece_id = p.id
           WHERE p.person_code = t.person_code AND p.formal_no = t.piece_ref
             AND pg.page_no = t.page_no AND pg.file_path = t.file_path
         ) OR (
           NOT EXISTS (SELECT 1 FROM ordered_archive_pieces p WHERE p.person_code = t.person_code)
           AND EXISTS (
             SELECT 1 FROM archive_pieces p JOIN archive_pages pg ON pg.piece_id = p.id
             WHERE p.person_code = t.person_code
               AND (p.serial_no = t.piece_ref OR p.formal_no = t.piece_ref)
               AND pg.page_no = t.page_no AND pg.file_path = t.file_path
           )
         )
       )`,
    [personCode, AUDIT_VISION_SOURCE]
  );
  return result.rowCount || 0;
}

async function resolveSourceTitle(
  personCode: string,
  piece: PageRow,
  materialTitle?: string
): Promise<string> {
  const title = cleanTitle(materialTitle);
  if (title) {
    return maybeUpdatePieceTitle(personCode, piece, title);
  }
  return piece.material_no || "";
}

async function insertFieldSources(
  personCode: string,
  piece: PageRow,
  fields: Record<string, string>,
  materialTitle?: string
) {
  const displayName = await resolveSourceTitle(
    personCode,
    piece,
    materialTitle
  );
  const year = (piece.form_date || "").slice(0, 4);
  let n = 0;
  for (const [fieldKey, value] of Object.entries(fields)) {
    if (!FIELD_LABELS[fieldKey] || !value?.trim()) continue;
    await query(
      `INSERT INTO audit_field_sources
        (person_code, field_key, field_label, material_name, form_year, material_no, value, form_date, is_baseline, meta)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,false,$9::jsonb)`,
      [
        personCode,
        fieldKey,
        FIELD_LABELS[fieldKey] || fieldKey,
        displayName,
        year || null,
        piece.material_no,
        value,
        piece.form_date,
        JSON.stringify({
          experienceEvents: jsonArray(fields._experienceEvents),
          educationEvidence: jsonArray(fields._educationEvidence),
          reviewIssues: jsonArray(fields._reviewIssues),
        }),
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
  opts?: {
    forceVision?: boolean;
    cursor?: number;
    pieceLimit?: number;
    onProgress?: (progress: { done: number; total: number; materialNo: string }) => void;
  }
): Promise<{
  extracted: number;
  skipped: boolean;
  reason?: string;
  fromCache: number;
  fromVision: number;
  pages: number;
  failures: Array<{ materialNo: string; error: string }>;
  nextCursor: number | null;
  totalPieces: number;
}> {
  const pages = await listPagesForAudit(personCode);
  if (!pages.length) {
    return { extracted: 0, skipped: true, reason: "no_page_files", fromCache: 0,
      fromVision: 0, pages: 0, failures: [], nextCursor: null, totalPieces: 0 };
  }
  const visionOk = isCozeVisionConfigured();
  let extracted = 0;
  let fromCache = 0;
  let fromVision = 0;
  const failures: Array<{ materialNo: string; error: string }> = [];

  const allPieces = groupByPiece(pages);
  const cursor = Math.max(0, Math.min(Math.trunc(opts?.cursor || 0), allPieces.length));
  const pieceLimit = opts?.pieceLimit ? Math.max(1, Math.trunc(opts.pieceLimit)) : allPieces.length;
  const pieces = allPieces.slice(cursor, cursor + pieceLimit);
  let completed = 0;
  const processPiece = async (piecePages: PageRow[]) => {
    const head = piecePages[0];
    if (!head) return;
    try {
      let result: VisionExtract | undefined;
      let cached = false;
      if (!opts?.forceVision) {
        const cachedPages = await Promise.all(piecePages.map((p) =>
          getPageText(personCode, p.material_no, p.page_no)
        ));
        const first = cachedPages[0];
        const title = cleanTitle(first?.materialName);
        const sameImages = cachedPages.every((c, i) =>
          c?.source === AUDIT_VISION_SOURCE && c.filePath === piecePages[i].file_path
        );
        // A title-only document is a valid cache hit. Legacy/incomplete caches retry.
        if (sameImages && title && first) {
          result = {
            fields: first.fields,
            pageText: first.textContent,
            materialTitle: title,
            formDate: first.fields._formDate,
            raw: "",
          };
          cached = true;
        }
      }
      if (!result) {
        if (!visionOk) {
          failures.push({ materialNo: head.material_no, error: "vision_not_configured" });
          return;
        }
        const images: ImageInput[] = [];
        const signal = AbortSignal.timeout(150_000);
        for (const page of piecePages) {
          if (!page.file_path) continue;
          images.push({
            bytes: await getObjectBytes(page.file_path),
            fileName: page.file_name || `${page.material_no}-${page.page_no}.jpg`,
            pageNo: page.page_no,
          });
          signal.throwIfAborted();
        }
        if (!images.length) throw new Error("no_page_files");
        result = (await extractFieldsWithFallback(images, head.material_name, signal)).result;
        fromVision += images.length;
        if (!cleanTitle(result.materialTitle) && !Object.keys(result.fields).some((key) => FIELD_LABELS[key])) {
          throw new Error("vision_returned_no_title_or_fields");
        }
      }
      const title = cleanTitle(result.materialTitle);
      head.form_date = result.formDate || result.fields._formDate || null;
      await query(
        `UPDATE ordered_archive_pieces SET form_date = $1 WHERE person_code = $2 AND formal_no = $3`,
        [head.form_date, personCode, head.material_no]
      );
      const resolvedTitle = await resolveSourceTitle(
        personCode, head, title
      );
      // Replace per piece only after successful extraction, preserving other pieces on failure.
      await query(
        `DELETE FROM audit_field_sources WHERE person_code = $1 AND material_no = $2`,
        [personCode, head.material_no]
      );
      if (!cached) {
        for (const page of piecePages) {
          const firstPage = page.page_no === head.page_no;
          await upsertPageText({
            personCode,
            pieceRef: page.material_no,
            pageNo: page.page_no,
            materialName: title,
            filePath: page.file_path || undefined,
            textContent: firstPage ? result.pageText || result.raw : "",
            fields: firstPage ? result.fields : {},
            source: AUDIT_VISION_SOURCE,
            replaceContent: true,
          });
        }
      } else {
        fromCache += piecePages.length;
      }
      extracted += await insertFieldSources(
        personCode, { ...head, material_name: resolvedTitle }, result.fields,
        title
      );
      if (!title) {
        failures.push({ materialNo: head.material_no, error: "vision_returned_no_title" });
      }
    } catch (e) {
      failures.push({ materialNo: head.material_no,
        error: e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")
          ? "该件识别超时，请再次检验重试"
          : e instanceof Error ? e.message : String(e) });
      console.warn("audit vision piece failed", head.material_no, e);
    } finally {
      completed++;
      opts?.onProgress?.({ done: cursor + completed, total: allPieces.length, materialNo: head.material_no });
    }
  };
  let nextPiece = 0;
  await Promise.all(Array.from({ length: Math.min(3, pieces.length) }, async () => {
    while (nextPiece < pieces.length) {
      const piece = pieces[nextPiece++];
      await processPiece(piece);
    }
  }));
  await repairPlaceholderTitles(personCode);
  return {
    extracted,
    skipped: !visionOk && !fromCache && !extracted,
    reason: !visionOk && !fromCache && !extracted ? "vision_not_configured" : undefined,
    fromCache, fromVision, pages: pages.length, failures,
    nextCursor: cursor + pieces.length < allPieces.length ? cursor + pieces.length : null,
    totalPieces: allPieces.length,
  };
}
