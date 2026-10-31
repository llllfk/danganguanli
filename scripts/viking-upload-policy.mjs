/**
 * 将附件1政策写入火山 VikingDB 知识库 danganguanli
 * 因 API 不支持本地直传：先抽文本 → 临时公网托管 → add_type=url
 *
 * 用法：node scripts/viking-upload-policy.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
for (const line of fs.readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0 && !process.env[t.slice(0, i)]) process.env[t.slice(0, i)] = t.slice(i + 1);
}

const KEY = process.env.VIKING_API_KEY;
const COLLECTION = process.env.VIKING_COLLECTION || "danganguanli";
const PROJECT = process.env.VIKING_PROJECT || "default";
const BASE = "https://api-knowledgebase.mlp.cn-beijing.volces.com";

if (!KEY) {
  console.error("缺少 VIKING_API_KEY");
  process.exit(1);
}

async function viking(pathName, body) {
  const res = await fetch(`${BASE}${pathName}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  return { status: res.status, json };
}

async function hostTxt(filePath, name) {
  const buf = fs.readFileSync(filePath);
  // 0x0.st
  try {
    const form = new FormData();
    form.append("file", new Blob([buf], { type: "text/plain" }), name);
    const up = await fetch("https://0x0.st", { method: "POST", body: form });
    const url = (await up.text()).trim();
    if (up.ok && url.startsWith("http")) return url;
    console.warn("0x0.st fail", up.status, url.slice(0, 120));
  } catch (e) {
    console.warn("0x0.st error", e.message);
  }
  // catbox
  try {
    const form = new FormData();
    form.append("reqtype", "fileupload");
    form.append("fileToUpload", new Blob([buf], { type: "text/plain" }), name);
    const up = await fetch("https://catbox.moe/user/api.php", {
      method: "POST",
      body: form,
    });
    const url = (await up.text()).trim();
    if (up.ok && url.startsWith("http")) return url;
    console.warn("catbox fail", up.status, url.slice(0, 120));
  } catch (e) {
    console.warn("catbox error", e.message);
  }
  return null;
}

function safeDocId(id) {
  return `policy_${id}`;
}

function safeDocName(title) {
  return String(title || "policy")
    .replace(/[<>:'"/\\|?*\s]+/g, "_")
    .slice(0, 200);
}

const tmpDir = path.join(root, "data", "tmp-kb");
fs.mkdirSync(tmpDir, { recursive: true });

const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();
const rows = (
  await c.query(
    `SELECT id::text AS id, title, content FROM policy_documents ORDER BY id`
  )
).rows;
await c.end();
console.log("local policies:", rows.length, "→ collection", COLLECTION);

let ok = 0;
let fail = 0;
const failures = [];

for (const row of rows) {
  const docId = safeDocId(row.id);
  const docName = safeDocName(row.title);
  const fp = path.join(tmpDir, `${docId}.txt`);
  fs.writeFileSync(fp, `# ${row.title}\n\n${row.content}`, "utf8");

  process.stdout.write(`+ ${docId} ... `);
  const url = await hostTxt(fp, `${docId}.txt`);
  if (!url) {
    fail++;
    failures.push({ docId, error: "临时托管失败" });
    console.log("host FAIL");
    continue;
  }

  const add = await viking("/api/knowledge/doc/add", {
    collection_name: COLLECTION,
    project: PROJECT,
    add_type: "url",
    doc_id: docId,
    doc_name: docName,
    doc_type: "txt",
    url,
  });

  if (add.json.code === 0) {
    ok++;
    console.log("OK", url.slice(0, 40));
  } else {
    fail++;
    failures.push({ docId, error: add.json.message || JSON.stringify(add.json) });
    console.log("ADD FAIL", add.json.code, add.json.message);
  }
  await new Promise((r) => setTimeout(r, 400));
}

console.log("\n==== DONE ====");
console.log("ok", ok, "fail", fail);
if (failures.length) {
  for (const f of failures.slice(0, 10)) console.log(" -", f.docId, f.error);
}

const listed = await viking("/api/knowledge/collection/list", {
  project: PROJECT,
});
const hit = (listed.json.data?.collection_list || []).find(
  (x) => x.collection_name === COLLECTION
);
const stat = hit?.pipeline_list?.[0]?.pipeline_stat;
console.log("collection docs:", stat);
