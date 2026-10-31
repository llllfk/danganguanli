/**
 * 从本地 PostgreSQL policy_documents 以纯文本写入扣子知识库
 * 用法：node scripts/coze-refill-kb-text.mjs [dataset_id]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
for (const line of fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0 && !process.env[t.slice(0, i)]) process.env[t.slice(0, i)] = t.slice(i + 1);
}

const OPEN_API = process.env.COZE_API_BASE || "https://api.coze.cn";
const SPACE_ID = process.env.COZE_SPACE_ID;
const TOKEN = process.env.COZE_API_TOKEN;
let DATASET_ID = process.argv[2] || "";

if (!TOKEN || !SPACE_ID) {
  console.error("缺少 TOKEN 或 SPACE_ID");
  process.exit(1);
}

async function api(method, urlPath, body) {
  const res = await fetch(`${OPEN_API}${urlPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      "Agw-Js-Conv": "str",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (json.code !== 0 && json.code !== undefined) {
    throw new Error(`${urlPath} failed: code=${json.code} msg=${json.msg}`);
  }
  return json;
}

if (!DATASET_ID) {
  const created = await api("POST", "/v1/datasets", {
    name: "档案政策知识库",
    description: "干部人事档案政策原文（PostgreSQL 同步纯文本）",
    space_id: String(SPACE_ID),
    format_type: 0,
  });
  DATASET_ID = created.data?.dataset_id;
  console.log("created dataset:", DATASET_ID);
} else {
  console.log("use dataset:", DATASET_ID);
}

const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();
const rows = (
  await c.query(
    `SELECT id, title, content FROM policy_documents ORDER BY id`
  )
).rows;
await c.end();
console.log("local docs:", rows.length);

let ok = 0;
let fail = 0;
for (const row of rows) {
  const name = `${row.title}.txt`.replace(/[\\/:*?"<>|]/g, "_");
  const text = `# ${row.title}\n\n${row.content}`;
  const b64 = Buffer.from(text, "utf8").toString("base64");
  try {
    const r = await api("POST", "/open_api/knowledge/document/create", {
      dataset_id: String(DATASET_ID),
      document_bases: [
        {
          name,
          source_info: {
            file_base64: b64,
            file_type: "txt",
            document_source: 0,
          },
        },
      ],
      chunk_strategy: {
        chunk_type: 1,
        max_tokens: 800,
        separator: "\n\n",
        remove_extra_spaces: true,
        remove_urls_emails: false,
      },
      format_type: 0,
    });
    const info = r.document_infos?.[0] || r.data?.document_infos?.[0];
    console.log(
      " +",
      row.id,
      "doc",
      info?.document_id,
      "status",
      info?.status,
      "chars",
      info?.char_count,
      "size",
      info?.size
    );
    ok++;
  } catch (e) {
    fail++;
    console.warn(" x", row.id, row.title, e.message);
  }
}

// wait briefly then report
await new Promise((r) => setTimeout(r, 8000));
const ds = await api(
  "GET",
  `/v1/datasets?space_id=${SPACE_ID}&page_num=1&page_size=50`
);
const hit = (ds.data?.dataset_list || []).find((d) => d.dataset_id === DATASET_ID);
console.log("\n==== DONE ====");
console.log("uploaded_ok:", ok, "failed:", fail);
console.log("doc_count:", hit?.doc_count, "slice_count:", hit?.slice_count);
console.log("failed_files:", hit?.failed_file_list);
console.log(`https://www.coze.cn/space/${SPACE_ID}/knowledge/${DATASET_ID}`);

fs.writeFileSync(
  path.join(__dirname, "coze-kb-result.json"),
  JSON.stringify(
    {
      dataset_id: DATASET_ID,
      space_id: SPACE_ID,
      uploaded_ok: ok,
      failed: fail,
      doc_count: hit?.doc_count,
      slice_count: hit?.slice_count,
      url: `https://www.coze.cn/space/${SPACE_ID}/knowledge/${DATASET_ID}`,
    },
    null,
    2
  )
);
