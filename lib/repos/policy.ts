import { query } from "@/lib/db";
import type { PolicyDoc } from "@/types";

type PolicyRow = {
  id: string;
  title: string;
  source_file: string;
  content: string;
  meta: Record<string, unknown> | null;
  updated_at?: string;
};

function asMeta(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (typeof raw === "object") return raw as Record<string, unknown>;
  return {};
}

function mapPolicyRow(row: PolicyRow): PolicyDoc {
  const meta = asMeta(row.meta);
  const cozeDocumentId = String(
    meta.cozeDocumentId || meta.coze_document_id || ""
  ).trim();
  return {
    id: row.id,
    title: row.title,
    sourceFile: row.source_file || "",
    content: row.content,
    cozeDocumentId: cozeDocumentId || undefined,
    updatedAt: row.updated_at,
  };
}

export async function listPolicyDocuments(): Promise<PolicyDoc[]> {
  const r = await query<PolicyRow>(
    `SELECT id::text, title, source_file, content, meta, updated_at::text
     FROM policy_documents
     ORDER BY
       COALESCE(
         NULLIF(substring(title from '^\\s*(\\d+)'), '')::int,
         NULLIF(substring(source_file from '^\\s*(\\d+)'), '')::int,
         2147483647
       ),
       title,
       id`
  );
  return r.rows.map(mapPolicyRow);
}

export async function getPolicyDocument(id: string): Promise<PolicyDoc | null> {
  const r = await query<PolicyRow>(
    `SELECT id::text, title, source_file, content, meta, updated_at::text
     FROM policy_documents WHERE id::text = $1 OR doc_key = $1`,
    [id]
  );
  const row = r.rows[0];
  if (!row) return null;
  return mapPolicyRow(row);
}

function makeDocKey(title: string) {
  const base = (title || "policy")
    .replace(/[^\w\u4e00-\u9fff-]+/g, "_")
    .slice(0, 40);
  return `${base}_${Date.now().toString(36)}`;
}

export async function createPolicyDocument(input: {
  title: string;
  content: string;
  sourceFile?: string;
  cozeDocumentId?: string;
}): Promise<PolicyDoc> {
  const title = (input.title || "").trim();
  if (!title) throw new Error("标题不能为空");
  const content = input.content ?? "";
  const meta = input.cozeDocumentId
    ? { cozeDocumentId: input.cozeDocumentId }
    : {};
  const r = await query<PolicyRow>(
    `INSERT INTO policy_documents (doc_key, title, source_file, content, meta)
     VALUES ($1,$2,$3,$4,$5::jsonb)
     RETURNING id::text, title, source_file, content, meta, updated_at::text`,
    [
      makeDocKey(title),
      title,
      input.sourceFile || "",
      content,
      JSON.stringify(meta),
    ]
  );
  return mapPolicyRow(r.rows[0]);
}

export async function updatePolicyDocument(
  id: string,
  patch: {
    title?: string;
    content?: string;
    sourceFile?: string;
    cozeDocumentId?: string | null;
  }
): Promise<PolicyDoc | null> {
  const cur = await query<PolicyRow>(
    `SELECT id::text, title, source_file, content, meta, updated_at::text
     FROM policy_documents WHERE id::text = $1`,
    [id]
  );
  const row = cur.rows[0];
  if (!row) return null;

  const meta = { ...asMeta(row.meta) };
  if (patch.cozeDocumentId === null) {
    delete meta.cozeDocumentId;
    delete meta.coze_document_id;
  } else if (patch.cozeDocumentId) {
    meta.cozeDocumentId = patch.cozeDocumentId;
  }

  const title = patch.title !== undefined ? patch.title.trim() : row.title;
  const content = patch.content !== undefined ? patch.content : row.content;
  const sourceFile =
    patch.sourceFile !== undefined ? patch.sourceFile : row.source_file;

  if (!title) throw new Error("标题不能为空");

  const r = await query<PolicyRow>(
    `UPDATE policy_documents
     SET title = $2,
         source_file = $3,
         content = $4,
         meta = $5::jsonb,
         updated_at = CURRENT_TIMESTAMP
     WHERE id::text = $1
     RETURNING id::text, title, source_file, content, meta, updated_at::text`,
    [id, title, sourceFile || "", content, JSON.stringify(meta)]
  );
  return mapPolicyRow(r.rows[0]);
}

export async function deletePolicyDocument(id: string): Promise<boolean> {
  const r = await query(`DELETE FROM policy_documents WHERE id::text = $1`, [
    id,
  ]);
  return (r.rowCount || 0) > 0;
}

function normPolicyTitle(t: string) {
  return (t || "")
    .replace(/[《》【】\[\]（）()\s]/g, "")
    .replace(/\.docx$/i, "")
    .replace(/^\d+[-_]/, "")
    .toLowerCase();
}

function titleKeys(raw: string) {
  const keys = new Set<string>();
  const t = (raw || "").trim();
  if (!t) return [];
  keys.add(normPolicyTitle(t));
  for (const m of t.matchAll(/《([^》]+)》/g)) {
    keys.add(normPolicyTitle(m[1]));
  }
  // 去掉「1-」编号后再取书名号内文
  keys.add(normPolicyTitle(t.replace(/^\d+[-_]/, "")));
  return [...keys].filter((k) => k.length >= 2);
}

export function matchPolicyDoc(
  docs: PolicyDoc[],
  title: string,
  sourceFile = ""
): PolicyDoc | null {
  const keys = [...titleKeys(title), ...titleKeys(sourceFile)];
  if (!keys.length) return null;

  const exact = docs.find((d) => {
    const nt = normPolicyTitle(d.title);
    const nf = normPolicyTitle(d.sourceFile);
    return keys.some((k) => k === nt || k === nf);
  });
  if (exact) return exact;

  // 宽松：较长一方包含较短一方（≥4 字）
  const scored = docs
    .map((d) => {
      const nt = normPolicyTitle(d.title);
      const nf = normPolicyTitle(d.sourceFile);
      let best = 0;
      for (const k of keys) {
        if (k.length < 4) continue;
        if (nt.includes(k) || k.includes(nt)) best = Math.max(best, k.length);
        if (nf.includes(k) || k.includes(nf)) best = Math.max(best, k.length);
      }
      return { d, best };
    })
    .filter((x) => x.best > 0)
    .sort((a, b) => b.best - a.best);
  return scored[0]?.d || null;
}

export async function findPolicyDocument(opts: {
  id?: string;
  title?: string;
  sourceFile?: string;
}): Promise<PolicyDoc | null> {
  if (opts.id) {
    const byId = await getPolicyDocument(opts.id);
    if (byId) return byId;
  }
  const docs = await listPolicyDocuments();
  return matchPolicyDoc(docs, opts.title || "", opts.sourceFile || "");
}

function matchByExcerpt(docs: PolicyDoc[], excerpt: string): PolicyDoc | null {
  const needle = (excerpt || "").replace(/\s+/g, "").slice(0, 48);
  if (needle.length < 16) return null;
  return (
    docs.find((d) => d.content.replace(/\s+/g, "").includes(needle)) || null
  );
}

/** 将来源标题/文件名对齐到本地 policy_documents，便于前端点开原文 */
export async function attachPolicyDocIds(
  sources: Array<{ title: string; excerpt: string; sourceFile: string }>
): Promise<
  Array<{ title: string; excerpt: string; sourceFile: string; id?: string }>
> {
  if (!sources.length) return sources;
  const docs = await listPolicyDocuments();
  const out: Array<{
    title: string;
    excerpt: string;
    sourceFile: string;
    id?: string;
  }> = [];
  const seenIds = new Set<string>();

  for (const s of sources) {
    const hit =
      matchPolicyDoc(docs, s.title, s.sourceFile) ||
      matchByExcerpt(docs, s.excerpt);
    if (hit) {
      if (seenIds.has(hit.id)) {
        // 同文档多切片：保留首条，摘录可更长则替换
        const prev = out.find((x) => x.id === hit.id);
        if (prev && s.excerpt.length > prev.excerpt.length) {
          prev.excerpt = s.excerpt;
        }
        continue;
      }
      seenIds.add(hit.id);
      out.push({
        id: hit.id,
        title: hit.title,
        excerpt: s.excerpt,
        sourceFile: hit.sourceFile || s.sourceFile,
      });
    } else {
      out.push({ ...s });
    }
  }
  return out;
}

function scoreDoc(content: string, title: string, q: string) {
  const keywords = [
    "第四类",
    "第九类",
    "子类",
    "出生日期",
    "出生时间",
    "认定",
    "专项审核",
    "三龄两历",
    "档案分类",
    "整理规范",
    "履历",
    "学历学位",
    "学历",
    "学位",
    "审核",
    "材料",
    "报考登记表",
    "毕业生登记表",
    "学习成绩表",
  ].filter((k) => q.includes(k));
  const tokens = [
    ...keywords,
    ...q
      .replace(/[，。？?！!、；;：:\s]+/g, " ")
      .split(" ")
      .filter((t) => t.length >= 2),
  ];
  const hay = `${title}\n${content}`;
  let score = 0;
  for (const t of [...new Set(tokens)]) {
    if (hay.includes(t)) score += t.length >= 3 ? 3 : 2;
  }
  if (hay.includes(q)) score += 5;
  return score;
}

export async function answerFromKnowledge(question: string) {
  const docs = await listPolicyDocuments();
  const ranked = docs
    .map((doc) => ({
      doc,
      score: scoreDoc(doc.content, doc.title, question.trim()),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (ranked.length === 0) {
    return {
      found: false as const,
      answer: "未找到相关政策依据",
      sources: [] as Array<{ title: string; excerpt: string; sourceFile: string }>,
    };
  }

  const sources = ranked.map(({ doc }) => {
    const q = question.trim().slice(0, 4);
    const idx = q ? doc.content.indexOf(q) : -1;
    const start = Math.max(0, idx >= 0 ? idx - 20 : 0);
    const excerpt = doc.content.slice(start, start + 180).replace(/\s+/g, "");
    return {
      id: doc.id,
      title: doc.title,
      excerpt: excerpt || doc.content.slice(0, 180),
      sourceFile: doc.sourceFile,
    };
  });

  const primary = ranked[0].doc;
  let answer = "";
  if (/第四类|4类|子类|二级类目/.test(question)) {
    const hit = docs.find((d) => d.content.includes("第四类") && d.content.includes("学历学位"));
    answer = hit
      ? `根据《${hit.title}》，干部人事档案第四类下设四个子类：学历学位材料；专业技术职务（职称）及职业资格材料；学术评鉴材料；教育培训材料。`
      : `依据《${primary.title}》：${sources[0].excerpt}`;
  } else if (/出生日期|出生时间|认定/.test(question)) {
    const hit = docs.find((d) => d.content.includes("最早形成材料") && d.content.includes("出生"));
    answer = hit
      ? `根据《${hit.title}》，干部出生日期的认定原则上以本人档案中最早形成材料记载的出生日期为依据。`
      : `依据《${primary.title}》：${sources[0].excerpt}`;
  } else if (/学历|学位/.test(question) && /审核|材料|查|核/.test(question)) {
    const hit =
      docs.find((d) => d.title.includes("收集归档规定") && d.content.includes("学历学位材料")) ||
      docs.find(
        (d) =>
          d.content.includes("学习成绩表") &&
          d.content.includes("毕业生登记表") &&
          d.content.includes("报考登记表")
      );
    if (hit) {
      const idx = hit.content.indexOf("学历学位材料");
      const excerpt =
        idx >= 0
          ? hit.content.slice(idx, idx + 220).replace(/\s+/g, "")
          : sources[0].excerpt;
      const cleanTitle = hit.title.replace(/^\d+-/, "");
      answer = `根据${cleanTitle.startsWith("《") ? cleanTitle : `《${cleanTitle}》`}，学历审核重点核验各学历阶段材料是否齐全、真实，主要包括：高中/中专毕业生登记表；普通高等教育等报考登记表、学生（学员、学籍）登记表、学习成绩表、毕业生登记表；授予学位的材料及毕业证书、学位证书复印件等。\n\n原文摘录：${excerpt}`;
      // 来源卡片也改为该条依据
      sources.length = 0;
      sources.push({
        id: hit.id,
        title: hit.title,
        excerpt,
        sourceFile: hit.sourceFile,
      });
    } else {
      answer = `依据《${primary.title}》相关规定：${sources[0].excerpt}`;
    }
  } else if (/专项审核|三龄两历/.test(question)) {
    answer = `依据《${primary.title}》相关规定：${sources[0].excerpt}`;
  } else if (/档案分类|十大类|十类/.test(question)) {
    answer = `依据《${primary.title}》相关规定：${sources[0].excerpt}`;
  } else {
    answer = `依据《${primary.title}》相关规定：${sources[0].excerpt}`;
  }

  return { found: true as const, answer, sources };
}
