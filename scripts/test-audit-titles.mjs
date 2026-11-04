import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

function loadModule(file, dependencies = {}, globals = {}) {
  const context = {
    exports: {}, process, console, Buffer, AbortSignal, ...globals,
    require(name) {
      if (!(name in dependencies)) throw new Error(`Unexpected import: ${name}`);
      return dependencies[name];
    },
  };
  const { outputText } = ts.transpileModule(
    readFileSync(new URL(file, import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022, esModuleInterop: true } }
  );
  vm.runInNewContext(outputText, context, { filename: file });
  return context;
}

const meta = loadModule("../lib/vision-meta.ts").exports;
const titles = loadModule("../lib/audit-title.ts", { "@/lib/vision-meta": meta }).exports;
const rules = loadModule("../lib/audit-rules.ts").exports;
function loadAudit(query, dependencies = {}, globals = {}) {
  return loadModule("../lib/audit-vision.ts", {
    "@/lib/db": { query },
    "@/lib/coze-vision": {},
    "@/lib/coze-env": { cozeApiBase: () => "" },
    "@/lib/repos/page-texts": {},
    "@/lib/storage": {},
    "@/lib/vision-meta": meta,
    "@/lib/audit-title": titles,
    "@/lib/audit-rules": rules,
    ...dependencies,
  }, globals);
}

test("placeholder and missing-title markers are rejected without removing real title text", () => {
  for (const name of ["档案材料 00001-0300-003", "00001-0300-003", "未识别", "未知"]) {
    assert.equal(titles.cleanAuditTitle(name), undefined);
  }
  assert.equal(titles.cleanAuditTitle(" G 省就业人员登记表 "), "G 省就业人员登记表");
});

test("wrapped Coze answer uses explicit title and never a title mentioned only in the body", () => {
  const audit = loadAudit(async () => ({ rows: [] }));
  const title = "专业技术人员年度考核评价表（1994年度）";
  const result = audit.parseVisionAnswer(JSON.stringify({ choices: [{ message: {
    content: JSON.stringify({ materialTitle: title, name: "张三", pageText: "参照《干部履历表》" }),
  } }] }));
  assert.equal(result.materialTitle, title);
  assert.equal(result.fields.name, "张三");
  assert.equal(audit.parseVisionAnswer(JSON.stringify({ pageText: "参照《干部任免审批表》" })).materialTitle, undefined);
});

test("formation dates, source date precision and structured evidence survive parsing and page merging", () => {
  const audit = loadAudit(async () => ({ rows: [] }));
  const first = audit.parseVisionAnswer(JSON.stringify({
    materialTitle: "毕业生登记表", formDate: "2022年6月", work: "2022年8月",
    experienceEvents: [{ kind: "study", start: "2018-09", end: "2022-06", organization: "S大学", position: "班长" }],
    educationEvidence: [{ type: "graduateRegistration", level: "本科", education: "本科", school: "S大学" }],
  }));
  assert.equal(first.formDate, "2022-06");
  assert.equal(first.fields.work, "2022-08");
  assert.equal(first.fields._formDate, "2022-06");
  assert(!first.fields.experience.includes("班长"));
  const last = audit.parseVisionAnswer(JSON.stringify({ materialTitle: "毕业生登记表", formDate: "2022-07-15",
    educationEvidence: [{ type: "degreeCertificate", level: "本科", degree: "工学学士学位" }] }));
  const merged = audit.mergeExtracts([first, last]);
  assert.equal(merged.formDate, "2022-07-15");
  assert.equal(merged.fields._formDate, "2022-07-15");
  assert.equal(JSON.parse(merged.fields._educationEvidence).length, 2);
});

test("new Coze title replaces a real-looking legacy name without changing archive records", async () => {
  const calls = [];
  const audit = loadAudit(async (sql, params) => {
    calls.push({ sql, params }); return { rows: [], rowCount: 1 };
  });
  const title = await audit.resolveSourceTitle("00001", {
    material_no: "00001-0902-001", material_name: "干部任免审批表",
  }, "劳动合同书");
  assert.equal(title, "劳动合同书");
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /UPDATE ordered_archive_pieces/);
  assert.equal(calls[0].params[0], "劳动合同书");
});

test("audit labels remain at piece level", () => {
  const label = loadModule("../lib/audit-label.ts", { "@/lib/vision-meta": meta }).exports.auditMaterialLabel;
  assert.equal(label("先进个人审批表", "00001-0700-001"), "先进个人审批表 00001-0700-001");
  assert.equal(label("档案材料 00001-0300-001", "00001-0300-001"), "00001-0300-001");
});

function pipelineHarness(documents, initialCache = new Map()) {
  const calls = [], prompts = [], chats = new Map(), cache = new Map(initialCache);
  const sources = new Map(documents.map((d) => [d.ref, "old source"]));
  const pages = documents.map((d) => ({ material_no: d.ref, material_name: d.oldTitle,
    file_path: `image/${d.ref}.jpg`, file_name: `${d.ref}-001.jpg`, page_no: 1, form_date: null }));
  const audit = loadAudit(async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes("JOIN ordered_archive_pages pg") && sql.startsWith("SELECT")) return { rows: pages };
    if (sql.includes("DELETE FROM audit_field_sources")) sources.delete(params[1]);
    if (sql.includes("INSERT INTO audit_field_sources")) sources.set(params[5], params[3]);
    return { rows: [], rowCount: 1 };
  }, {
    "@/lib/coze-vision": { isCozeVisionConfigured: () => true, uploadCozeFile: async (_b, name) => name },
    "@/lib/coze-env": { cozeApiBase: () => "https://coze.test", cozeApiToken: () => "test", visionBotId: () => "test" },
    "@/lib/repos/page-texts": {
      getPageText: async (_p, ref) => cache.get(ref),
      upsertPageText: async (row) => cache.set(row.pieceRef, { materialName: row.materialName,
        fields: row.fields, textContent: row.textContent, source: row.source, filePath: row.filePath }),
    },
    "@/lib/storage": { getObjectBytes: async (filePath) => {
      const doc = documents.find((d) => filePath.includes(d.ref));
      if (doc.fail) throw new Error("cannot read scan");
      return Buffer.from("test image");
    } },
  }, {
    console: { info() {}, warn() {} },
    fetch: async (url, init) => {
      if (url.endsWith("/v3/chat")) {
        const body = JSON.parse(init.body);
        const content = JSON.parse(body.additional_messages[0].content);
        prompts.push(content[0].text);
        const doc = documents.find((d) => content.some((p) => p.file_id?.includes(d.ref)));
        chats.set(doc.ref, doc);
        return { json: async () => ({ code: 0, data: { id: doc.ref, conversation_id: doc.ref, status: "completed" } }) };
      }
      const doc = chats.get(new URL(url).searchParams.get("chat_id"));
      return { json: async () => ({ data: [{ role: "assistant", type: "answer", content: JSON.stringify({
        materialTitle: doc.title, pageText: "扫描页文字", ...(doc.fields || {}),
      }) }] }) };
    },
  });
  return { audit: audit.exports, cache, calls, sources, prompts };
}

const categoryDocs = [
  { ref: "00001-0200-001", oldTitle: "档案材料 00001-0200-001", title: "自传" },
  { ref: "00001-0300-001", oldTitle: "档案材料 00001-0300-001", title: "年度考核登记表" },
  { ref: "00001-0902-001", oldTitle: "干部任免审批表", title: "劳动合同书", fields: { name: "张三" } },
  { ref: "00001-0902-002", oldTitle: "干部任免审批表", title: "员工入职通知单" },
  { ref: "00001-0902-003", oldTitle: "干部任免审批表", title: "G省就业人员登记表" },
  { ref: "00001-1001-001", oldTitle: "其他参考材料", title: "F市中小学生体格检查表" },
  { ref: "00001-1001-002", oldTitle: "其他参考材料", title: "就业通知书" },
];

test("all categories read their own Coze titles despite existing sources; title-only caches are reusable", async () => {
  const harness = pipelineHarness(categoryDocs);
  const first = await harness.audit.ensureAuditSourcesByVision("00001");
  assert.equal(first.fromVision, categoryDocs.length);
  assert.equal(first.failures.length, 0);
  for (const doc of categoryDocs) assert.equal(harness.cache.get(doc.ref).materialName, doc.title);
  assert.equal(harness.sources.get("00001-0902-001"), "劳动合同书");
  assert.equal(harness.sources.has("00001-1001-002"), false);
  for (const prompt of harness.prompts) assert(!prompt.includes("当前标记名"));
  const second = await harness.audit.ensureAuditSourcesByVision("00001");
  assert.equal(second.fromCache, categoryDocs.length);
  assert.equal(second.fromVision, 0);
  assert.equal(second.failures.length, 0);
});

test("batch cursors cover every material once and retain progress across requests", async () => {
  const harness = pipelineHarness(categoryDocs);
  let cursor = 0;
  const completed = [];
  let requests = 0;
  do {
    const result = await harness.audit.ensureAuditSourcesByVision("00001", {
      cursor, pieceLimit: 2, onProgress: (progress) => completed.push(progress),
    });
    requests++;
    assert(result.fromVision <= 2);
    if (result.nextCursor === null) break;
    assert(result.nextCursor > cursor);
    cursor = result.nextCursor;
  } while (requests < 10);
  assert.equal(requests, 4);
  assert.equal(new Set(completed.map((p) => p.materialNo)).size, categoryDocs.length);
  assert.deepEqual(completed.map((p) => p.done), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(harness.cache.size, categoryDocs.length);
});

test("legacy or incomplete caches retry, and a failed piece preserves its old sources", async () => {
  const docs = [categoryDocs[0], { ...categoryDocs[2], fail: true }, categoryDocs[6]];
  const cache = new Map([[docs[0].ref, { materialName: "旧演示题名", fields: { name: "张三" },
    source: "vision", filePath: `image/${docs[0].ref}.jpg`, textContent: "old" }]]);
  const harness = pipelineHarness(docs, cache);
  const result = await harness.audit.ensureAuditSourcesByVision("00001");
  assert.equal(harness.cache.get(docs[0].ref).materialName, docs[0].title);
  assert.equal(harness.cache.get(docs[2].ref).materialName, docs[2].title);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].materialNo, docs[1].ref);
  assert.equal(harness.sources.get(docs[1].ref), "old source");
  assert(!harness.calls.some((c) => c.sql.includes("DELETE FROM audit_field_sources") && !c.sql.includes("material_no")));
});

test("a missing title is reported and retried even when Coze extracted person fields", async () => {
  const doc = { ...categoryDocs[2], title: "" };
  const harness = pipelineHarness([doc]);
  const first = await harness.audit.ensureAuditSourcesByVision("00001");
  assert.equal(first.failures[0].error, "vision_returned_no_title");
  doc.title = "劳动合同书";
  const second = await harness.audit.ensureAuditSourcesByVision("00001");
  assert.equal(second.fromVision, 1);
  assert.equal(second.failures.length, 0);
  assert.equal(harness.sources.get(doc.ref), "劳动合同书");
});

test("audit uploads invalidate replaced scans and never assign demo titles, dates or summaries", async () => {
  const calls = [];
  const repo = loadModule("../lib/repos/audit-upload.ts", {
    "@/lib/db": { query: async (sql, params) => {
      calls.push({ sql, params });
      return { rows: sql.includes("RETURNING id") ? [{ id: "1" }] : [] };
    } },
    "@/lib/repos/page-texts": { ensurePageTextsTable: async () => {} },
  }).exports;
  await repo.replaceOrderedPieces("00001", categoryDocs.map((d) => ({
    formalNo: d.ref, personCode: "00001", categoryCode: d.ref.split("-")[1],
    pages: [{ pageNo: 1, fileName: `${d.ref}-001.jpg`, filePath: `image/${d.ref}.jpg` }],
  })), { clearFirst: false });
  const inserts = calls.filter((c) => c.sql.includes("INSERT INTO ordered_archive_pieces"));
  assert.equal(inserts.length, categoryDocs.length);
  for (const insert of inserts) {
    assert.match(insert.params[3], /^档案材料 /);
    assert.equal(insert.params[4], null);
    assert.equal(insert.params[5], null);
  }
  for (const table of ["archive_page_texts", "audit_field_sources"]) {
    const invalidation = calls.find((c) => c.sql.includes(`DELETE FROM ${table}`));
    assert.equal(invalidation.params[0], "00001");
    assert.equal(invalidation.params[1].length, categoryDocs.length);
    assert.equal(invalidation.params[2], false);
  }
});
