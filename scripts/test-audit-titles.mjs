import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

function loadModule(file, dependencies = {}) {
  const context = {
    exports: {},
    process,
    console,
    require(name) {
      if (!(name in dependencies)) throw new Error(`Unexpected import: ${name}`);
      return dependencies[name];
    },
  };
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  vm.runInNewContext(outputText, context, { filename: file });
  return context;
}

const meta = loadModule("../lib/vision-meta.ts").exports;
function loadAudit(query) {
  return loadModule("../lib/audit-vision.ts", {
    "@/lib/db": { query },
    "@/lib/coze-vision": {},
    "@/lib/coze-env": { cozeApiBase: () => "" },
    "@/lib/repos/page-texts": {},
    "@/lib/storage": {},
    "@/lib/vision-meta": meta,
  });
}

test("Chinese placeholder names are replaceable; real document titles are preserved", () => {
  for (const title of ["档案材料 00001-0300-003", "档案材料00001-0300-003", "档案材料"]) {
    assert.equal(meta.looksLikePlaceholderName(title), true, title);
  }
  for (const title of ["专业技术人员年度考核评价表（1994年度）", "档案材料登记表"]) {
    assert.equal(meta.looksLikePlaceholderName(title), false, title);
  }
});

test("Coze choices wrapper retains materialTitle and uses it for piece names and all field sources", async () => {
  const calls = [];
  const audit = loadAudit(async (sql, params) => {
    calls.push({ sql, params });
    return { rows: [], rowCount: 1 };
  });
  const title = "专业技术人员年度考核评价表（1994年度）";
  const answer = JSON.stringify({ choices: [{ message: { content: JSON.stringify({
    materialTitle: title, name: "张三", birth: "1968-01-01", education: "大学本科", pageText: "姓名张三",
  }) } }] });
  const result = audit.parseVisionAnswer(answer);
  assert.equal(result.materialTitle, title);
  assert.equal(result.fields.name, "张三");
  const count = await audit.insertFieldSources("00001", {
    material_name: "档案材料 00001-0300-003", material_no: "00001-0300-003", form_date: null,
  }, result.fields, result.materialTitle, result.raw);
  assert.equal(count, 3);
  const updates = calls.filter(c => c.sql.includes("SET material_name"));
  assert.equal(updates.length, 2);
  for (const call of updates) assert.equal(call.params[0], title);
  const inserts = calls.filter(c => c.sql.includes("INSERT INTO audit_field_sources"));
  assert.equal(inserts.length, 3);
  for (const call of inserts) assert.equal(call.params[3], title);
});

test("a recognized real title is not overwritten by a later conflicting extraction", async () => {
  let calls = 0;
  const audit = loadAudit(async () => { calls++; return { rows: [] }; });
  const result = await audit.maybeUpdatePieceTitle("00001", {
    material_name: "干部履历表", material_no: "00001-0100-001",
  }, "年度考核登记表");
  assert.equal(result, "干部履历表");
  assert.equal(calls, 0);
});
