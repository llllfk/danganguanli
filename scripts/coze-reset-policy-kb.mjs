/**
 * 清空扣子知识库并重新上传附件1全部 docx（统一自动分段 max_tokens=800）
 * 用法：node scripts/coze-reset-policy-kb.mjs [dataset_id]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
for (const line of fs
  .readFileSync(path.join(__dirname, "..", ".env.local"), "utf8")
  .split(/\r?\n/)
) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0 && !process.env[t.slice(0, i)]) {
    process.env[t.slice(0, i)] = t.slice(i + 1);
  }
}

const OPEN_API = process.env.COZE_API_BASE || "https://api.coze.cn";
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

const CHUNK = {
  chunk_type: 0,
  max_tokens: 800,
  remove_extra_spaces: true,
  remove_urls_emails: false,
};

if (!TOKEN) {
  console.error("缺少 COZE_API_TOKEN");
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

async function listAllDocs() {
  const all = [];
  for (let page = 1; page <= 20; page++) {
    const r = await api("POST", "/open_api/knowledge/document/list", {
      dataset_id: DATASET_ID,
      page,
      size: 50,
    });
    const infos = r.document_infos || r.data?.document_infos || [];
    all.push(...infos);
    if (infos.length < 50) break;
  }
  return all;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

console.log("dataset:", DATASET_ID);
console.log("policyDir:", policyDir);

// ---- clear ----
let docs = await listAllDocs();
console.log("existing docs:", docs.length);
while (docs.length) {
  for (const batch of chunk(
    docs.map((d) => d.document_id),
    50
  )) {
    const del = await api("POST", "/open_api/knowledge/document/delete", {
      document_ids: batch,
    });
    console.log("deleted batch", batch.length, "code", del.code);
  }
  await new Promise((r) => setTimeout(r, 1500));
  docs = await listAllDocs();
  console.log("remaining:", docs.length);
  if (docs.length === 0) break;
}
console.log("cleared.");

// ---- upload ----
const files = fs
  .readdirSync(policyDir)
  .filter((f) => f.toLowerCase().endsWith(".docx"))
  .sort((a, b) => a.localeCompare(b, "zh-CN", { numeric: true }));

if (files.length !== 34) {
  console.warn("expected 34 docx, got", files.length);
}
console.log("uploading", files.length, "files...");

let ok = 0;
let fail = 0;
const failures = [];
let first = true;

for (const batch of chunk(files, 5)) {
  for (const name of batch) {
    const buf = fs.readFileSync(path.join(policyDir, name));
    if (buf.length > 20 * 1024 * 1024) {
      fail++;
      failures.push({ name, error: `too large ${buf.length}` });
      continue;
    }
    const body = {
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
      format_type: 0,
    };
    // 清空后第一次上传写入分段策略；之后可省略（仍带上更稳妥）
    if (first) {
      body.chunk_strategy = CHUNK;
      first = false;
    } else {
      body.chunk_strategy = CHUNK;
    }
    try {
      const r = await api("POST", "/open_api/knowledge/document/create", body);
      const info = r.document_infos?.[0];
      console.log(
        " +",
        name.slice(0, 50),
        "id",
        info?.document_id,
        "chars",
        info?.char_count,
        "slices",
        info?.slice_count
      );
      ok++;
    } catch (e) {
      fail++;
      failures.push({ name, error: e.message });
      console.warn(" x", name, e.message);
    }
  }
}

console.log("\nwait indexing...");
await new Promise((r) => setTimeout(r, 12000));

const after = await listAllDocs();
const byName = new Map();
for (const d of after) {
  byName.set(d.name, (byName.get(d.name) || 0) + 1);
}
const slices = after.reduce((s, d) => s + (d.slice_count || 0), 0);
const chars = after.reduce((s, d) => s + (d.char_count || 0), 0);

console.log("\n==== DONE ====");
console.log("uploaded_ok:", ok, "failed:", fail);
console.log("docs now:", after.length, "unique names:", byName.size);
console.log("total chars:", chars, "total slices:", slices);
console.log(
  "chunk samples:",
  [...new Set(after.map((d) => JSON.stringify(d.chunk_strategy || {})))]
);
if (failures.length) {
  console.log("failures:");
  for (const f of failures) console.log(" -", f.name, f.error);
}

fs.writeFileSync(
  path.join(__dirname, "coze-kb-result.json"),
  JSON.stringify(
    {
      dataset_id: DATASET_ID,
      uploaded_ok: ok,
      failed: fail,
      docs: after.length,
      slices,
      chars,
      failures,
      chunk: CHUNK,
      url: `https://www.coze.cn/space/${process.env.COZE_SPACE_ID}/knowledge/${DATASET_ID}`,
    },
    null,
    2
  )
);
