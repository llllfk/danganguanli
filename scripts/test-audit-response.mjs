import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

function load(file, dependencies = {}, globals = {}) {
  const context = { exports: {}, console, Response, TextDecoder, TextEncoder,
    ReadableStream, setInterval, clearInterval, ...globals,
    require(name) {
      if (!(name in dependencies)) throw new Error(`Unexpected import: ${name}`);
      return dependencies[name];
    } };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, context);
  return context.exports;
}
const { readAuditResponse } = load("../lib/audit-response.ts");

test("plain-text upstream failure becomes a readable retry message instead of JSON syntax error", async () => {
  const response = new Response("upstream failure: request timeout", { status: 504 });
  await assert.rejects(readAuditResponse(response, () => {}), (error) => {
    assert(!error.message.includes("Unexpected token"));
    return error.message.includes("超时") && error.message.includes("已完成的识别会保留");
  });
});

test("login errors and legacy JSON responses remain readable", async () => {
  await assert.rejects(readAuditResponse(new Response("unauthorized", { status: 401 }), () => {}), /重新登录/);
  const result = await readAuditResponse(Response.json({ data: { nextCursor: null, report: {} } }), () => {});
  assert.equal(result.nextCursor, null);
});

test("stream parsing handles split UTF-8 chunks, heartbeat and final line without a newline", async () => {
  const encoder = new TextEncoder();
  const bytes = encoder.encode([
    JSON.stringify({ type: "start" }),
    JSON.stringify({ type: "heartbeat" }),
    JSON.stringify({ type: "progress", done: 1, total: 3, materialNo: "20229-0902-001" }),
    JSON.stringify({ type: "result", data: { nextCursor: 2, label: "劳动合同书" } }),
  ].join("\n"));
  const progress = [];
  const stream = new ReadableStream({ start(controller) {
    for (let i = 0; i < bytes.length; i += 5) controller.enqueue(bytes.slice(i, i + 5));
    controller.close();
  } });
  const result = await readAuditResponse(new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson" },
  }), (value) => progress.push(value));
  assert.equal(result.nextCursor, 2);
  assert.equal(result.label, "劳动合同书");
  assert.equal(progress[0].done, 1);
});

test("a closed stream without a result is never reported as success", async () => {
  await assert.rejects(readAuditResponse(new Response('{"type":"heartbeat"}\n', {
    headers: { "Content-Type": "application/x-ndjson" },
  }), () => {}), /连接已中断/);
});

test("streamed server errors keep their specific reason", async () => {
  await assert.rejects(readAuditResponse(new Response(JSON.stringify({
    type: "error", error: "数据库连接失败",
  }), { headers: { "Content-Type": "application/x-ndjson" } }), () => {}), /数据库连接失败/);
});

test("verification immediately streams, continues batches and saves the report only at the end", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let records = 0, reports = 0;
  const route = load("../app/api/audit/verify/route.ts", {
    "next/server": { NextResponse: { json: (data, init) => Response.json(data, init) } },
    "@/lib/audit-vision": {
      ensureAuditSourcesByVision: async (_code, options) => {
        await gate;
        assert.equal(options.pieceLimit, 2);
        options.onProgress({ done: (options.cursor || 0) + 2, total: 4, materialNo: "20229-0902-001" });
        return { failures: [], nextCursor: options.cursor ? null : 2,
          totalPieces: 4, fromVision: 2, fromCache: 0, extracted: 1 };
      },
      repairPlaceholderTitles: async () => 0,
    },
    "@/lib/repos/audit": {
      runAuditFromDb: async () => { reports++; return { personCode: "20229" }; },
      summarizeAudit: () => ({ issueCount: 0, summary: "完成" }),
    },
    "@/lib/repos/audit-upload": { countAuditSources: async () => 1 },
    "@/lib/repos/page-texts": { countPageTexts: async () => 4 },
    "@/lib/store": { addAuditRecord: async () => { records++; return {}; } },
    "@/lib/db": { query: async () => ({ rows: [{ person_name: "测试" }] }) },
  });
  const request = (cursor) => ({ json: async () => ({ personCode: "20229", cursor }),
    headers: new Headers({ Accept: "application/x-ndjson" }) });
  const response = await route.POST(request(0));
  assert.match(response.headers.get("content-type"), /x-ndjson/);
  const reader = response.body.getReader();
  const first = await reader.read();
  assert.equal(JSON.parse(new TextDecoder().decode(first.value)).type, "start");
  assert.equal(records, 0);
  release();
  let text = "";
  for (;;) { const packet = await reader.read(); if (packet.done) break; text += new TextDecoder().decode(packet.value); }
  const events = text.trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(events.at(-1).data.nextCursor, 2);
  assert.equal(records, 0);
  assert.equal(reports, 0);
  const final = await readAuditResponse(await route.POST(request(2)), () => {});
  assert.equal(final.nextCursor, null);
  assert.equal(final.report.personCode, "20229");
  assert.equal(records, 1);
  assert.equal(reports, 1);
});
