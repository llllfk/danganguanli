import { execFileSync } from "node:child_process";

const datasetId = process.argv[2] || "7700812543191269417";
const OPEN_API = "https://api.coze.cn";

function cfg(key) {
  const out = execFileSync("coze", ["config", "get", key, "--format", "json"], {
    encoding: "utf8",
  });
  return JSON.parse(out).value;
}

const TOKEN = process.env.COZE_API_TOKEN || cfg("accessToken");
const SPACE = process.env.COZE_SPACE_ID || cfg("spaceId");

async function api(method, path, body) {
  const res = await fetch(`${OPEN_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      "Agw-Js-Conv": "str",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

console.log("dataset:", datasetId);

// 1) list docs
const listed = await api("POST", "/open_api/knowledge/document/list", {
  dataset_id: datasetId,
  page: 1,
  size: 100,
});
console.log("list docs:", JSON.stringify(listed).slice(0, 500));

if (listed.code === 0 && listed.document_infos?.length) {
  const ids = listed.document_infos.map((d) => d.document_id);
  const delDocs = await api("POST", "/open_api/knowledge/document/delete", {
    document_ids: ids,
  });
  console.log("delete docs:", delDocs);
}

// 2) delete dataset
const del = await api("DELETE", `/v1/datasets/${datasetId}`);
console.log("delete dataset:", del);

// 3) verify gone
const search = await api(
  "GET",
  `/v1/datasets?space_id=${SPACE}&name=${encodeURIComponent("档案政策")}&page_num=1&page_size=20`
);
console.log("search after:", search.code, search.data?.total_count, search.data?.dataset_list?.map((d) => d.name));

const all = await api(
  "GET",
  `/v1/datasets?space_id=${SPACE}&page_num=1&page_size=50`
);
const hit = (all.data?.dataset_list || []).find((d) => d.dataset_id === datasetId);
console.log("still exists:", Boolean(hit));
