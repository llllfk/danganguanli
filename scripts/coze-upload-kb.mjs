/**
 * 创建扣子文本知识库并上传附件1政策文件
 * 用法：node scripts/coze-upload-kb.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const policyDir = path.resolve(
  __dirname,
  "..",
  "..",
  "需求",
  "附件1-8",
  "附件1-档案政策知识库"
);

const OPEN_API = "https://api.coze.cn";
const SPACE_ID =
  process.env.COZE_SPACE_ID ||
  (() => {
    try {
      const out = execFileSync("coze", ["config", "get", "spaceId", "--format", "json"], {
        encoding: "utf8",
      });
      const j = JSON.parse(out);
      return j.value || j.spaceId || j;
    } catch {
      return "";
    }
  })();

const TOKEN =
  process.env.COZE_API_TOKEN ||
  (() => {
    try {
      const out = execFileSync(
        "coze",
        ["config", "get", "accessToken", "--format", "json"],
        { encoding: "utf8" }
      );
      const j = JSON.parse(out);
      return typeof j === "string" ? j : j.value || j.accessToken;
    } catch {
      return "";
    }
  })();

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

console.log("space:", SPACE_ID);
console.log("files:", files.length, "from", policyDir);

const created = await api("POST", "/v1/datasets", {
  name: "档案政策知识库",
  description: "干部人事档案智能辅助系统 · 附件1政策原文（仅限政策问答检索）",
  space_id: String(SPACE_ID),
  format_type: 0,
});

const datasetId = created.data?.dataset_id || created.dataset_id;
console.log("dataset_id:", datasetId);

const batches = chunk(files, 10);
let ok = 0;
let fail = 0;
const failures = [];

for (let bi = 0; bi < batches.length; bi++) {
  const batch = batches[bi];
  console.log(`\nupload batch ${bi + 1}/${batches.length} (${batch.length} files)...`);

  const document_bases = [];
  for (const name of batch) {
    const fp = path.join(policyDir, name);
    const buf = fs.readFileSync(fp);
    // 单文件过大时跳过（接口通常有体积限制）
    if (buf.length > 20 * 1024 * 1024) {
      failures.push({ name, error: `file too large: ${buf.length}` });
      fail++;
      continue;
    }
    document_bases.push({
      name,
      source_info: {
        file_base64: buf.toString("base64"),
        file_type: "docx",
        document_source: 0,
      },
    });
  }

  if (!document_bases.length) continue;

  try {
    const r = await api("POST", "/open_api/knowledge/document/create", {
      dataset_id: String(datasetId),
      document_bases,
      chunk_strategy: {
        chunk_type: 0,
      },
      format_type: 0,
    });
    const n = r.document_infos?.length || document_bases.length;
    ok += n;
    console.log("  ok:", n, "docs");
  } catch (e) {
    console.warn("  batch failed, retry one-by-one:", e.message);
    for (const doc of document_bases) {
      try {
        await api("POST", "/open_api/knowledge/document/create", {
          dataset_id: String(datasetId),
          document_bases: [doc],
          chunk_strategy: { chunk_type: 0 },
          format_type: 0,
        });
        ok++;
        console.log("  +", doc.name);
      } catch (e2) {
        fail++;
        failures.push({ name: doc.name, error: e2.message });
        console.warn("  x", doc.name, e2.message);
      }
    }
  }
}

console.log("\n==== DONE ====");
console.log("dataset_id:", datasetId);
console.log("uploaded_ok:", ok, "failed:", fail);
console.log(
  "console:",
  `https://www.coze.cn/space/${SPACE_ID}/knowledge/${datasetId}`
);
if (failures.length) {
  console.log("failures:");
  for (const f of failures) console.log(" -", f.name, f.error);
}

fs.writeFileSync(
  path.join(__dirname, "coze-kb-result.json"),
  JSON.stringify(
    {
      dataset_id: datasetId,
      space_id: SPACE_ID,
      uploaded_ok: ok,
      failed: fail,
      failures,
      url: `https://www.coze.cn/space/${SPACE_ID}/knowledge/${datasetId}`,
    },
    null,
    2
  ),
  "utf8"
);
