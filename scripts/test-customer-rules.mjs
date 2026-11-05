import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

function load(file, dependencies = {}) {
  const context = { exports: {}, process, console, Buffer, AbortSignal,
    require(name) { if (!(name in dependencies)) throw Error(`Unexpected import: ${name}`); return dependencies[name]; } };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, context);
  return context.exports;
}
const rules = load("../lib/audit-rules.ts");
const titleRules = load("../lib/audit-title.ts", { "@/lib/vision-meta": load("../lib/vision-meta.ts") });
const now = new Date("2026-11-04T04:00:00Z");
const doc = (title, fields, formDate, category = "0100", ref = title) => ({ title, fields, formDate, category, ref });
const field = (docs, key) => rules.buildAuditFields(docs).find((item) => item.field === key);
const events = (entries) => ({ _experienceEvents: JSON.stringify(entries), experience: "履历" });
const evidence = (entry) => ({ _educationEvidence: JSON.stringify([entry]) });

test("dates preserve year/month/day precision and reject invalid calendar dates", () => {
  for (const [input, output] of [["2022-08", "2022-08"], ["2022年8月", "2022-08"], ["2022年", "2022"],
    ["2022.8.5", "2022-08-05"], ["2024-02-29", "2024-02-29"]]) assert.equal(rules.normalizeAuditDate(input), output);
  assert.equal(rules.normalizeAuditDate("2023-02-29"), undefined);
  assert.equal(rules.normalizeAuditDate("2022-13"), undefined);
});

test("unreadable or placeholder scan titles are rejected, but actual form titles survive", () => {
  for (const value of ["未识别题名", "无法判断", "无法读取", "题名不详", "无标题"]) {
    assert.equal(titleRules.cleanAuditTitle(value), undefined);
  }
  assert.equal(titleRules.cleanAuditTitle("劳动合同书"), "劳动合同书");
});

test("compare only shared date precision, while conflicting fully specified days still conflict", () => {
  assert.equal(rules.auditDatesCompatible(["2022-08", "2022-08-17"]), true);
  assert.equal(rules.auditDatesCompatible(["2022", "2022-08-17"]), true);
  assert.equal(rules.auditDatesCompatible(["2022-08", "2022-09-01"]), false);
  assert.equal(rules.auditDatesCompatible(["2022-08", "2022-08-01", "2022-08-17"]), false);
});

test("birth opinion selects actual material formation date rather than birth date or null", () => {
  const result = field([
    doc("自传", { birth: "1997-11-03" }, "2022-08"),
    doc("学生登记表", { birth: "1997-10-03" }, "2010-09"),
  ], "birth");
  assert.equal(result.status, "warn");
  assert.equal(result.value, "1997-10-03");
  assert(result.aiOpinion.startsWith("建议以最早形成材料《学生登记表》形成时间2010-09"));
  assert(!result.aiOpinion.includes("null"));
  assert.equal(result.sources[1].formDate, "2010-09");
});

test("unknown formation date does not claim that a specific document is the earliest", () => {
  const result = field([doc("自传", { birth: "1997-11-03" }), doc("登记表", { birth: "1997-10-03" }, "2010")], "birth");
  assert(result.aiOpinion.includes("暂不能确定最早形成材料"));
  assert(!result.aiOpinion.includes("null"));
});

test("overlapping formation-date precision cannot establish which material is earliest", () => {
  const result = field([doc("材料A", { birth: "1997-11-03" }, "2010"),
    doc("材料B", { birth: "1997-10-03" }, "2010-09")], "birth");
  assert(result.aiOpinion.includes("暂不能确定最早形成材料"));
});

test("work and party opinions follow the requested wording", () => {
  const docs = [doc("干部履历表", { work: "2022-08", party: "2020-01" }), doc("入党志愿书", { work: "2021-08", party: "2020-02" })];
  assert.equal(field(docs, "work").aiOpinion, "请结合材料。");
  assert.equal(field(docs, "party").aiOpinion, "建议以《入党志愿书》记载的2020-02为准。");
  assert.equal(field([docs[0], doc("自传", { party: "2020-02" })], "party").aiOpinion, "请结合材料。");
});

test("experience contains only schools, work units/leadership, and title attainment", () => {
  const cleaned = rules.cleanExperienceEvents([
    { kind: "study", start: "2010-09", end: "2014-06", organization: "S大学", position: "班长" },
    { kind: "work", start: "2014-07", organization: "E公司", position: "技术岗", insurance: "养老保险" },
    { kind: "work", start: "2020-01", organization: "F公司", position: "副总经理" },
    { kind: "title", start: "2018-09", title: "工程师" },
    { kind: "award", start: "2019", title: "先进个人" },
    { kind: "work", start: "2014", organization: "", content: "论文" },
  ]);
  const text = rules.experienceText(cleaned);
  assert(text.includes("2010-09至2014-06 S大学"));
  assert(text.includes("副总经理"));
  assert(text.includes("2018-09 取得工程师"));
  for (const excluded of ["班长", "技术岗", "保险", "论文", "先进个人"]) assert(!text.includes(excluded));
});

test("non-overlapping periods and partial histories are compatible; same-period conflicting organizations are not", () => {
  const study = { kind: "study", start: "2000-09", end: "2006-06", organization: "A小学" };
  const university = { kind: "study", start: "2012-09", end: "2016-06", organization: "S大学" };
  assert.equal(rules.experiencesCompatible([[study], [university]]), true);
  assert.equal(rules.experiencesCompatible([[study, university], [study]]), true);
  assert.equal(rules.experiencesCompatible([[university], [{ ...university, organization: "T大学" }]]), false);
  assert.equal(field([doc("自传", events([study])), doc("登记表", events([university]))], "experience").status, "ok");
});

const bachelor = { type: "graduationCertificate", level: "本科", education: "本科", school: "A大学" };
const master = { type: "graduateRegistration", level: "硕士", education: "研究生", degree: "工学硕士学位", school: "S大学", major: "水利水电工程" };
const eduDocs = [
  doc("本科毕业证书复印件", evidence(bachelor)),
  doc("硕士毕业生登记表", evidence(master)),
  doc("干部履历表", { education: "博士研究生", degree: "博士", ...evidence({ ...master, level: "博士" }) }),
];
test("highest education/degree is selected from authoritative documents and never cross-compared with older claims", () => {
  const education = field(eduDocs, "education"), degree = field(eduDocs, "degree");
  assert.equal(education.value, "研究生-S大学");
  assert.equal(degree.value, "工学硕士学位-水利水电工程");
  assert.equal(education.status, "ok");
  assert.equal(degree.status, "ok");
  assert.equal(education.sources[0].materialName, "硕士毕业生登记表");
});

test("education display uses concise education level with school and degree keeps its full name", () => {
  const docs = [doc("硕士毕业生登记表", evidence({ ...master, education: "硕士研究生" }))];
  assert.equal(field(docs, "education").value, "研究生-S大学");
  assert.equal(field(docs, "degree").value, "工学硕士学位-水利水电工程");
});

test("unsubstantiated personal-form education claims do not become authoritative education evidence", () => {
  assert.equal(field([eduDocs[2]], "education").value, "未检出");
  assert.equal(field([doc("硕士毕业生登记表", evidence({ ...master, degree: "" }))], "degree").value, "未检出");
  assert.equal(rules.buildCompleteness([doc("干部履历表", { education: "博士研究生", degree: "博士学位" })], [], now).some((issue) => /毕业证书|学位证书/.test(issue.message)), false);
});

test("organization recognition is determined exclusively by the category-five special review form", () => {
  for (const title of ["干部任免审批表（干部人事档案专项审核专用）", "干部任免审批表（全国干部人事档案专项审核专用）"]) {
    const result = field([doc(title, {}, undefined, "0500")], "recognition");
    assert.equal(result.value, "已认定");
    assert.equal(result.sources.length, 0);
    assert.equal(result.aiOpinion, "建议进行干部人事档案专项审核。");
    assert.equal(field([doc(title, {}, undefined, "0902")], "recognition").value, "未检出");
  }
  assert.equal(field([doc("干部任免审批表", { recognition: "已认定" }, undefined, "0500")], "recognition").value, "未检出");
});

test("annual completeness reports exact missing years from first complete employment year to previous year", () => {
  const docs = [doc("干部履历表", { work: "2022-08" }), doc("2023年度考核表", { _assessmentYear: "2023" }, "2024-01")];
  const result = rules.buildCompleteness(docs, [], now).map((issue) => issue.message);
  assert(result.includes("缺少2024年度考核表"));
  assert(result.includes("缺少2025年度考核表"));
  assert(!result.includes("缺少2022年度考核表"));
  assert(!result.includes("缺少2026年度考核表"));
});

test("annual fallback checks internal gaps and uses assessment year rather than form creation year", () => {
  const docs = [doc("年度考核表", { _assessmentYear: "2022" }, "2023-01"), doc("2024年度考核表", {}, "2025-01")];
  const result = rules.buildCompleteness(docs, [], now);
  assert.equal(result.length, 1);
  assert.equal(result[0].message, "缺少2023年度考核表");
});

test("formation year alone is never used as the assessment year", () => {
  const issues = rules.buildCompleteness([doc("年度考核表", {}, "2025-01-10")], [], now);
  assert(issues.some((issue) => issue.message === "请结合材料，核查年度考核表所属年度"));
});

test("a master's archive needs separate bachelor/master graduation and degree certificates", () => {
  const docs = [doc("硕士毕业生登记表", evidence(master)),
    doc("本科毕业证书（复印件）", evidence(bachelor)),
    doc("学士学位证书复印件", evidence({ type: "degreeCertificate", level: "本科", degree: "工学学士学位" })),
    doc("硕士研究生毕业证书", evidence({ ...bachelor, level: "硕士", education: "研究生" })),
  ];
  const messages = rules.buildCompleteness(docs, [], now).map((i) => i.message);
  assert(messages.includes("缺少学位证书（硕士）"));
  assert(!messages.includes("缺少毕业证书（本科）"));
  assert(!messages.includes("缺少学位证书（本科）"));
  assert(!messages.includes("缺少毕业证书（硕士）"));
});

test("obsolete education requirements are ignored, missing statements are clean, and explicit review issues remain", () => {
  const result = rules.buildCompleteness([doc("毕业生登记表", { _reviewIssues: JSON.stringify([{ kind: "alteration", message: "姓名处有明显涂改痕迹" }]) })], [
    { category_hint: "4-1类", material_pattern: "毕业生登记表", description: "须有各阶段毕业生登记表" },
    { category_hint: "9-2类", material_pattern: "劳动合同", description: "须有《劳动合同书》" },
  ], now).map((i) => i.message);
  assert(result.includes("缺少劳动合同书"));
  assert(!result.some((message) => /缺少须有|缺少未检出/.test(message)));
  assert(result.some((message) => message.includes("涂改痕迹")));
});

test("learning/work chronology overlap remains a review item", () => {
  const docs = [doc("毕业生登记表", events([{ kind: "study", start: "2019-09", end: "2022-06", organization: "S大学" }])),
    doc("履历表", events([{ kind: "work", start: "2021-01", end: "至今", organization: "E公司" }]))];
  assert(rules.buildCompleteness(docs, [], now).some((issue) => issue.message.includes("学习与工作经历时间重叠")));
});

test("classification colors are unique by major class and shared by its subclasses", () => {
  const { categoryTagColor } = load("../lib/archive-parse.ts");
  const codes = ["0100", "0200", "0300", "0401", "0500", "0600", "0700", "0800", "0901", "1000"];
  assert.equal(new Set(codes.map(categoryTagColor)).size, 10);
  assert.equal(categoryTagColor("0401"), categoryTagColor("0404"));
  assert.equal(categoryTagColor("0901"), categoryTagColor("0904"));
});

test("overdue reminders show elapsed days and date math is stable", () => {
  const { daysUntil, reminderDateLabel } = load("../lib/reminder-date.ts");
  assert.equal(daysUntil("2026-11-01", new Date(2026, 10, 4)), -3);
  assert.equal(reminderDateLabel(-3), "已超期3天");
});

test("business errors conceal provider credentials without claiming a different backend", () => {
  const { userMessage } = load("../lib/user-message.ts");
  assert(!/扣子|Coze/i.test(userMessage("扣子服务超时 Coze S3")));
  assert(!/API_TOKEN/.test(userMessage("未配置 API_TOKEN")));
  assert(!/Dify/i.test(userMessage("Coze service error")));
});
