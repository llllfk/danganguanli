/**
 * 向已有「档案政策知识库」补传附件1 docx（不新建库）
 * 用法：node scripts/coze-refill-kb.mjs [dataset_id]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
const DATASET_ID = process.argv[2] || "7700814053619777546";
const policyDir = path.resolve(
  __dirname,
  "..",
  "..",
  "需求",
  "附件1-8",
  "附件1-档案政策知识库"
);

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
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  if (json.code !== 0 && json.code !== undefined) {
    throw new Error(`${urlPath} failed: code=${json.code} msg=${json.msg}`);
  }
  return json;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const files = fs
  .readdirSync(policyDir)
  .filter((f) => f.toLowerCase().endsWith(".docx"))
  .sort((a, b) => a.localeCompare(b, "zh-CN", { numeric: true }));

console.log("dataset:", DATASET_ID);
console.log("files:", files.length, "from", policyDir);

const listed = await api("POST", "/open_api/knowledge/document/list", {
  dataset_id: DATASET_ID,
  page: 1,
  size: 100,
});
const existing = new Set(
  (listed.data?.document_infos || []).map((d) => d.name)
);
console.log("existing docs:", existing.size);

const todo = files.filter((f) => !existing.has(f));
console.log("to upload:", todo.length);
if (!todo.length) {
  console.log("nothing to upload");
  process.exit(0);
}

const batches = chunk(todo, 5);
let ok = 0;
let fail = 0;
const failures = [];

for (let bi = 0; bi < batches.length; bi++) {
  const batch = batches[bi];
  console.log(`\nbatch ${bi + 1}/${batches.length} (${batch.length})...`);
  for (const name of batch) {
    const buf = fs.readFileSync(path.join(policyDir, name));
    if (buf.length > 20 * 1024 * 1024) {
      fail++;
      failures.push({ name, error: `too large ${buf.length}` });
      continue;
    }
    try {
      await api("POST", "/open_api/knowledge/document/create", {
        dataset_id: String(DATASET_ID),
        document_bases: [
          {
            name,
            source_info: {
              file_base64: buf.toString("base64"),
              file_type: "docx",
              document_source: 0,
            },
          },
        ],
        chunk_strategy: { chunk_type: 0 },
        format_type: 0,
      });
      ok++;
      console.log("  +", name);
    } catch (e) {
      fail++;
      failures.push({ name, error: e.message });
      console.warn("  x", name, e.message);
    }
  }
}

const after = await api("POST", "/open_api/knowledge/document/list", {
  dataset_id: DATASET_ID,
  page: 1,
  size: 100,
});
console.log("\n==== DONE ====");
console.log("uploaded_ok:", ok, "failed:", fail);
console.log("docs now:", (after.data?.document_infos || []).length);
console.log(
  "console:",
  `https://www.coze.cn/space/${SPACE_ID}/knowledge/${DATASET_ID}`
);
if (failures.length) {
  for (const f of failures) console.log(" -", f.name, f.error);
}
