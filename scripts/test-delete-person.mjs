import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

function load(file, dependencies, globals = {}) {
  const context = { exports: {}, process, console, Buffer, ...globals,
    require(name) {
      if (!(name in dependencies)) throw new Error(`Unexpected import: ${name}`);
      return dependencies[name];
    } };
  const source = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(source, context);
  return context.exports;
}

function repository({ failAt, failFiles = false } = {}) {
  const calls = [], removedFiles = [];
  let committed = false, rolledBack = false;
  const tables = ["archive_pieces", "ordered_archive_pieces", "audit_field_sources", "audit_records",
    "archive_page_texts", "talent_reminders", "talent_match_scores", "talent_match_checks",
    "talent_profiles", "talent_title_promo"];
  const query = async (sql, params) => {
    calls.push({ sql, params });
    if (failAt && sql.startsWith(`DELETE FROM ${failAt}`)) throw new Error("database failure");
    if (sql.includes("SELECT person_name FROM persons")) return { rows: [{ person_name: "李四" }] };
    if (sql.includes("information_schema.columns")) return { rows: tables.map((table_name) => ({ table_name })) };
    if (sql.includes("SELECT id::text, file_path")) return { rows: [{ id: "1", file_path: "audit/20002/test/p.jpg" }] };
    if (sql.includes("count(*)::int AS n FROM person_file_cleanup")) return { rows: [{ n: failFiles ? 1 : 0 }] };
    return { rows: [], rowCount: 1 };
  };
  const repo = load("../lib/repos/clear-person.ts", {
    "@/lib/db": { query, withTransaction: async (run) => {
      try { const result = await run({ query }); committed = true; return result; }
      catch (e) { rolledBack = true; throw e; }
    } },
    "@/lib/storage": { deletePersonUpload: async (file, code) => {
      assert.equal(committed, true); removedFiles.push({ file, code });
      if (failFiles) throw new Error("storage offline");
      return "deleted";
    } },
  });
  return { repo, calls, removedFiles, state: () => ({ committed, rolledBack }) };
}

test("deletes an arbitrary selected person including master and all known child tables", async () => {
  const harness = repository();
  const result = await harness.repo.clearPersonData("20002");
  assert.equal(result.personCode, "20002");
  assert.equal(result.personName, "李四");
  assert.equal(result.deleted.persons, 1);
  assert.equal(result.filesDeleted, 1);
  assert.equal(result.filesPending, 0);
  assert.equal(harness.removedFiles[0].code, "20002");
  const deletions = harness.calls.filter((call) => /^DELETE FROM (?!person_file_cleanup)/.test(call.sql));
  assert.equal(deletions.length, 11);
  for (const call of deletions) {
    assert.match(call.sql, /WHERE person_code = \$1/);
    assert.equal(call.params[0], "20002");
  }
});

test("database errors roll back and do not delete uploaded files", async () => {
  const harness = repository({ failAt: "audit_field_sources" });
  await assert.rejects(harness.repo.clearPersonData("20002"), /database failure/);
  assert.equal(harness.state().rolledBack, true);
  assert.equal(harness.removedFiles.length, 0);
});

test("storage failure remains visible in the durable cleanup queue", async () => {
  const harness = repository({ failFiles: true });
  const result = await harness.repo.clearPersonData("20002");
  assert.equal(result.deleted.persons, 1);
  assert.equal(result.filesPending, 1);
  assert(harness.calls.some((call) => call.sql.includes("UPDATE person_file_cleanup SET last_error")));
  assert(!harness.calls.some((call) => call.sql.startsWith("DELETE FROM person_file_cleanup")));
});

test("empty or traversal-like person codes fail before any database access", async () => {
  for (const code of ["", "..", "../20002", "20002/other", "20002\\other"]) {
    const harness = repository();
    await assert.rejects(harness.repo.clearPersonData(code));
    assert.equal(harness.calls.length, 0);
  }
});

test("actual transaction helper commits or rolls back and always releases its client", async () => {
  const calls = [];
  const client = { query: async (sql) => { calls.push(sql); }, release: () => { calls.push("release"); } };
  const db = load("../lib/db.ts", { "node:dns": { setDefaultResultOrder() {} }, pg: {} }, {
    __hrAiPool: { connect: async () => client },
  });
  assert.equal(await db.withTransaction(async () => "ok"), "ok");
  assert.deepEqual(calls, ["BEGIN", "COMMIT", "release"]);
  calls.length = 0;
  await assert.rejects(db.withTransaction(async () => { throw new Error("fail"); }));
  assert.deepEqual(calls, ["BEGIN", "ROLLBACK", "release"]);
});

test("local file deletion is confined to the selected person's uploaded copies", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codex-person-delete-"));
  const storage = load("../lib/storage.ts", {
    "fs/promises": fs, path,
    "@aws-sdk/client-s3": {}, "@coze/workload-identity": {},
  }, { process: { cwd: () => root, env: {} } });
  const own = path.join(root, "data/uploads/audit/20002/001/p.jpg");
  const other = path.join(root, "data/uploads/audit/30003/001/p.jpg");
  const reference = path.join(root, "requirements/source.jpg");
  try {
    for (const file of [own, other, reference]) {
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, "sample");
    }
    assert.equal(await storage.deletePersonUpload(own, "20002"), "deleted");
    await assert.rejects(fs.access(own));
    await assert.rejects(storage.deletePersonUpload(other, "20002"));
    await fs.access(other);
    assert.equal(await storage.deletePersonUpload(reference, "20002"), "reference");
    await fs.access(reference);
    assert.equal(await storage.deletePersonUpload(own, "20002"), "deleted");
  } finally {
    assert(path.isAbsolute(root) && path.basename(root).startsWith("codex-person-delete-"));
    assert.equal(path.dirname(root).toLowerCase(), os.tmpdir().toLowerCase());
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("S3 deletion rejects another person's prefix or another bucket", async () => {
  const sent = [];
  class Command { constructor(input) { this.input = input; } }
  const storage = load("../lib/storage.ts", {
    "fs/promises": fs, path,
    "@aws-sdk/client-s3": { DeleteObjectCommand: Command, S3Client: class {
      async send(command) { sent.push(command.input); }
    } },
    "@coze/workload-identity": {},
  }, { process: { cwd: () => os.tmpdir(), env: {
    COZE_STORAGE_URL: "https://test.invalid", COZE_STORAGE_BUCKET: "test-bucket",
    COZE_STORAGE_AK: "test", COZE_STORAGE_SK: "test", COZE_RUNTIME: "false",
  } } });
  await assert.rejects(storage.deletePersonUpload("s3://test-bucket/audit/30003/001/p.jpg", "20002"));
  await assert.rejects(storage.deletePersonUpload("s3://other-bucket/audit/20002/001/p.jpg", "20002"));
  assert.equal(sent.length, 0);
  assert.equal(await storage.deletePersonUpload("s3://test-bucket/audit/20002/001/p.jpg", "20002"), "deleted");
  assert.deepEqual(JSON.parse(JSON.stringify(sent)), [{ Bucket: "test-bucket", Key: "audit/20002/001/p.jpg" }]);
});
