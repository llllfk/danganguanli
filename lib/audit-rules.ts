import type { AuditFieldResult, AuditReport, AuditSource, CompletenessIssue } from "@/types";

export type ExperienceEvent = {
  kind: "study" | "work" | "title";
  start: string;
  end?: string;
  organization?: string;
  position?: string;
  title?: string;
};
export type EducationEvidence = {
  type: "graduationCertificate" | "degreeCertificate" | "graduateRegistration" | "degreeProof";
  level: string;
  education?: string;
  degree?: string;
  school?: string;
  major?: string;
};
export type AuditDocument = {
  ref: string;
  title: string;
  category: string;
  formDate?: string;
  fields: Record<string, string>;
};
export type CompletenessRequirement = {
  category_hint: string; material_pattern: string; description: string; required_for?: string | null;
};

const LABELS: Record<string, string> = {
  name: "姓名", birth: "出生时间", work: "参加工作时间", party: "入党时间",
  education: "学历", degree: "学位", experience: "工作经历", recognition: "组织认定",
};

/** Preserve the precision actually written in a scan; never invent month/day values. */
export function normalizeAuditDate(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const match = value.trim().match(/^(\d{4})(?:\s*[年./-]\s*(\d{1,2})(?:\s*[月./-]\s*(\d{1,2})\s*日?)?\s*月?)?\s*年?$/);
  if (!match) return undefined;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  if (year < 1800 || year > 2200) return undefined;
  if (!match[2]) return match[1];
  if (month < 1 || month > 12) return undefined;
  const result = `${year}-${String(month).padStart(2, "0")}`;
  if (!match[3]) return result;
  if (day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return undefined;
  return `${result}-${String(day).padStart(2, "0")}`;
}

export function auditDatesCompatible(values: string[]) {
  const dates = values.map((value) => normalizeAuditDate(value));
  for (let i = 0; i < dates.length; i++) {
    for (let j = i + 1; j < dates.length; j++) {
      if (!dates[i] || !dates[j]) {
        if (values[i].trim() !== values[j].trim()) return false;
      } else if (dates[i]!.slice(0, Math.min(dates[i]!.length, dates[j]!.length)) !==
        dates[j]!.slice(0, Math.min(dates[i]!.length, dates[j]!.length))) return false;
    }
  }
  return true;
}

export function jsonArray<T>(value?: string): T[] {
  try { const result = JSON.parse(value || "[]"); return Array.isArray(result) ? result : []; }
  catch { return []; }
}

export function cleanExperienceEvents(value: unknown): ExperienceEvent[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const kind = item.kind;
    const start = normalizeAuditDate(item.start);
    if (!["study", "work", "title"].includes(kind) || !start) return [];
    const text = (key: string) => typeof item[key] === "string" ? item[key].trim() : "";
    const organization = text("organization");
    const title = text("title");
    if (kind === "title" ? !title : !organization) return [];
    // Ordinary posts and student roles are outside the requested chronology.
    const position = kind === "work" && /董事长|总经理|副总|书记|主任|院长|校长|局长|处长|科长|部长|总工程师|总会计师|总经济师/.test(text("position"))
      ? text("position") : undefined;
    const end = normalizeAuditDate(item.end) || (item.end === "至今" ? "至今" : undefined);
    return [{ kind, start, end, organization: organization || undefined, position, title: title || undefined } as ExperienceEvent];
  });
}

export function experienceText(events: ExperienceEvent[]) {
  return events.map((event) => event.kind === "title"
    ? `${event.start} 取得${event.title}`
    : `${event.start}${event.end ? `至${event.end}` : ""} ${event.organization}${event.position ? ` ${event.position}` : ""}`
  ).join("；");
}

function dateBounds(value: string): [string, string] {
  if (value === "至今") return ["9999-12-31", "9999-12-31"];
  const date = normalizeAuditDate(value) || value;
  if (date.length === 4) return [`${date}-01-01`, `${date}-12-31`];
  if (date.length === 7) {
    const [y, m] = date.split("-").map(Number);
    return [`${date}-01`, `${date}-${new Date(Date.UTC(y, m, 0)).getUTCDate()}`];
  }
  return [date, date];
}
function normalized(value?: string) { return (value || "").replace(/[\s，。；、（）()《》-]/g, "").toLowerCase(); }

/** Different descriptions are compatible unless they disagree about the same event/period. */
export function experiencesCompatible(groups: ExperienceEvent[][]) {
  for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
    for (const a of groups[i]) for (const b of groups[j]) {
      if (a.kind !== b.kind) continue;
      if (a.kind === "title") {
        if (normalized(a.title) === normalized(b.title) && !auditDatesCompatible([a.start, b.start])) return false;
        continue;
      }
      const sameOrg = normalized(a.organization) === normalized(b.organization) ||
        normalized(a.organization).includes(normalized(b.organization)) || normalized(b.organization).includes(normalized(a.organization));
      const sameStart = auditDatesCompatible([a.start, b.start]);
      if (sameOrg) {
        if (sameStart && a.end && b.end && !auditDatesCompatible([a.end, b.end])) return false;
        if (!sameStart && a.end && b.end && auditDatesCompatible([a.end, b.end])) return false;
      } else {
        const start = [dateBounds(a.start)[0], dateBounds(b.start)[0]].sort().at(-1)!;
        const end = [dateBounds(a.end || a.start)[1], dateBounds(b.end || b.start)[1]].sort()[0];
        // A shared transition month is a boundary, not evidence of conflicting employers.
        if (sameStart || (start < end && start.slice(0, 7) !== end.slice(0, 7))) return false;
      }
    }
  }
  return true;
}

export function educationRank(value: string) {
  if (/博士/.test(value)) return 4;
  if (/硕士/.test(value)) return 3;
  if (/研究生/.test(value)) return 3;
  if (/本科|学士/.test(value)) return 2;
  if (/专科|大专/.test(value)) return 1;
  return 0;
}
export function cleanEducationEvidence(value: unknown): EducationEvidence[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item && typeof item === "object" &&
    ["graduationCertificate", "degreeCertificate", "graduateRegistration", "degreeProof"].includes(item.type) &&
    typeof item.level === "string" && educationRank(item.level) > 0
  ).map((item) => Object.fromEntries(["type", "level", "education", "degree", "school", "major"]
    .filter((key) => typeof item[key] === "string").map((key) => [key, item[key].trim()])) as EducationEvidence);
}

function isSpecialReview(doc: AuditDocument) {
  return doc.category === "0500" && /干部任免审批表/.test(doc.title) && /专项审核/.test(doc.title) && /专用/.test(doc.title);
}
function evidenceFor(doc: AuditDocument) {
  const evidence = cleanEducationEvidence(jsonArray(doc.fields._educationEvidence));
  // Only the actually recognized title can qualify the document as authoritative.
  return evidence.filter((item) => item.type === "graduationCertificate" ? /毕业证/.test(doc.title)
    : item.type === "degreeCertificate" ? /学位证/.test(doc.title)
    : item.type === "graduateRegistration" ? /毕业生登记表/.test(doc.title)
    : /授予.*学位|学位.*证明|学位授予/.test(doc.title));
}
function sourceFor(doc: AuditDocument, value: string): AuditSource {
  return { materialName: doc.title, materialNo: doc.ref, formYear: doc.formDate?.slice(0, 4) || "", formDate: doc.formDate, value };
}
function selectEducation(docs: AuditDocument[], field: "education" | "degree"): AuditFieldResult {
  const candidates = docs.flatMap((doc) => evidenceFor(doc).filter((e) => field === "education"
    ? ["graduationCertificate", "graduateRegistration"].includes(e.type)
    : ["degreeCertificate", "degreeProof", "graduateRegistration"].includes(e.type) && !!e.degree
  ).map((e) => ({ doc, evidence: e })));
  candidates.sort((a, b) => educationRank(b.evidence.level) - educationRank(a.evidence.level) ||
    Number(a.evidence.type === "graduateRegistration") - Number(b.evidence.type === "graduateRegistration"));
  const selected = candidates[0];
  if (!selected) return { field, label: LABELS[field], value: "未检出", status: "missing", statusText: "未检出", sources: [], aiOpinion: "请结合材料。" };
  const e = selected.evidence;
  const value = field === "education"
    ? `${e.education || (educationRank(e.level) >= 3 ? "研究生" : e.level)}${e.school ? `-${e.school}` : ""}`
    : `${e.degree || `${e.level.replace(/研究生/g, "")}学位`}${e.major ? `-${e.major}` : ""}`;
  return { field, label: LABELS[field], value, status: "ok", statusText: "已提取", sources: [sourceFor(selected.doc, value)] };
}

export function buildAuditFields(docs: AuditDocument[]): AuditFieldResult[] {
  return Object.keys(LABELS).map((field) => {
    if (field === "education" || field === "degree") return selectEducation(docs, field);
    if (field === "recognition") {
      const found = docs.find(isSpecialReview);
      return { field, label: LABELS[field], value: found ? "已认定" : "未检出", status: found ? "ok" : "missing",
        statusText: found ? "已认定" : "未检出", sources: [],
        aiOpinion: found ? "建议进行干部人事档案专项审核。" : "请结合材料。" };
    }
    const matching = docs.filter((doc) => doc.fields[field]?.trim());
    const sources = matching.map((doc) => sourceFor(doc, doc.fields[field]));
    if (!sources.length) return { field, label: LABELS[field], value: "未检出", status: "missing", statusText: "未检出", sources: [], aiOpinion: "请结合材料。" };
    const dated = matching.filter((d) => normalizeAuditDate(d.formDate)).sort((a, b) =>
      dateBounds(a.formDate!)[0].localeCompare(dateBounds(b.formDate!)[0]));
    const baseline = field === "birth" ? dated[0] || matching[0] : matching[0];
    const earliestIsCertain = dated.length === matching.length && dated.slice(1).every((doc) =>
      dateBounds(baseline.formDate!)[1] <= dateBounds(doc.formDate!)[0]);
    const values = sources.map((s) => s.value);
    const consistent = ["birth", "work", "party"].includes(field) ? auditDatesCompatible(values)
      : field === "experience" ? experiencesCompatible(matching.map((doc) => cleanExperienceEvents(jsonArray(doc.fields._experienceEvents))))
      : new Set(values.map(normalized)).size === 1;
    let aiOpinion: string | undefined;
    if (!consistent) {
      if (field === "birth") aiOpinion = earliestIsCertain
        ? `建议以最早形成材料《${baseline.title}》形成时间${baseline.formDate}，记载的${baseline.fields.birth}为准；请核查差异材料原文。`
        : "请结合材料。部分材料形成时间缺失或精度不足，暂不能确定最早形成材料，请核查差异材料原文。";
      else if (field === "party") {
        const application = matching.find((doc) => /入党志愿书/.test(doc.title));
        aiOpinion = application ? `建议以《入党志愿书》记载的${application.fields.party}为准。` : "请结合材料。";
      } else aiOpinion = "请结合材料。";
    }
    return { field, label: LABELS[field], value: baseline.fields[field], status: consistent ? "ok" : "warn",
      statusText: consistent ? "一致" : `${LABELS[field]}信息记载不一致`, sources, aiOpinion };
  });
}

function missingMessage(description: string, pattern: string) {
  const cleaned = description.replace(/^(?:缺少|未检出|须有|应有|需有|必须有|须提供|需提供)+/g, "")
    .replace(/[《》]/g, "").replace(/[。；;]$/, "");
  return `缺少${cleaned || pattern}`;
}

export function buildCompleteness(docs: AuditDocument[], requirements: CompletenessRequirement[], now = new Date()): CompletenessIssue[] {
  const issues: CompletenessIssue[] = [];
  const entries = docs.flatMap((doc) => evidenceFor(doc).map((evidence) => ({ doc, evidence })));
  const inferredRank = Math.max(0, ...entries.map(({ evidence }) => educationRank(evidence.level)),
    ...docs.map((doc) => educationRank(`${doc.fields.education || ""} ${doc.fields.degree || ""} ${doc.title}`)));
  const levels = ["本科", "硕士", "博士"].filter((_, i) => inferredRank >= i + 2);
  for (const level of levels) for (const type of ["graduationCertificate", "degreeCertificate"] as const) {
    if (!entries.some(({ evidence: e }) => e.type === type && educationRank(e.level) === educationRank(level))) {
      issues.push({ category: "4-1类", message: `缺少${type === "graduationCertificate" ? "毕业证书" : "学位证书"}（${level}）` });
    }
  }
  const years = [...new Set(docs.filter((doc) => /年度.*考核|考核.*年度/.test(doc.title)).map((doc) => {
    const value = doc.fields._assessmentYear || doc.title.match(/(?:19|20)\d{2}/)?.[0];
    return Number(value);
  }).filter((year) => year >= 1900 && year <= now.getFullYear()))].sort((a, b) => a - b);
  const work = docs.map((doc) => normalizeAuditDate(doc.fields.work)).filter(Boolean).sort()[0];
  const start = work ? Number(work.slice(0, 4)) + 1 : years[0];
  const end = work ? now.getFullYear() - 1 : years.at(-1);
  if (start && end && end >= start) {
    for (let year = start; year <= end; year++) if (!years.includes(year)) issues.push({ category: "3类", message: `缺少${year}年度考核表` });
  } else if (!years.length) issues.push({ category: "3类", message: docs.some((doc) => /年度.*考核|考核.*年度/.test(doc.title))
    ? "请结合材料，核查年度考核表所属年度" : "缺少年度考核表" });

  const party = docs.some((doc) => /入党|党员|转正申请/.test(doc.title) || doc.fields.party);
  const titled = docs.some((doc) => /职称|专业技术资格|专业技术职务/.test(doc.title) || doc.fields._experienceEvents?.includes('"title"'));
  for (const req of requirements) {
    // Education requirements are now exclusively the two certificate types per level.
    if (/年度考核|毕业|学历|学位/.test(req.material_pattern) || req.category_hint === "4-1类") continue;
    if (req.required_for === "party" && !party || req.required_for === "titled" && !titled) continue;
    if (/专项审核/.test(req.material_pattern)) {
      if (!docs.some(isSpecialReview)) issues.push({ category: req.category_hint, message: "缺少干部任免审批表（干部人事档案专项审核专用）" });
    } else if (!docs.some((doc) => normalized(doc.title).includes(normalized(req.material_pattern)))) {
      issues.push({ category: req.category_hint, message: missingMessage(req.description, req.material_pattern) });
    }
  }
  // Preserve explicitly visible alteration/overlap findings, including education evidence.
  for (const doc of docs) for (const issue of jsonArray<{ kind: string; message: string }>(doc.fields._reviewIssues)) {
    if (["alteration", "overlap"].includes(issue.kind) && issue.message) issues.push({ category: "材料核查", message: `请核查《${doc.title}》：${issue.message}` });
  }
  const chronology = docs.flatMap((doc) => cleanExperienceEvents(jsonArray(doc.fields._experienceEvents)));
  for (const study of chronology.filter((event) => event.kind === "study" && event.end)) {
    for (const work of chronology.filter((event) => event.kind === "work")) {
      const start = [dateBounds(study.start)[0], dateBounds(work.start)[0]].sort().at(-1)!;
      const end = [dateBounds(study.end!)[1], dateBounds(work.end || "至今")[1]].sort()[0];
      if (start < end && start.slice(0, 7) !== end.slice(0, 7)) issues.push({
        category: "材料核查", message: `请结合材料，核查学习与工作经历时间重叠：${study.organization}与${work.organization}（${start.slice(0, 7)}至${end.slice(0, 7)}）`,
      });
    }
  }
  const seen = new Set<string>();
  return issues.filter((issue) => { if (seen.has(issue.message)) return false; seen.add(issue.message); return true; });
}

export function buildAuditReport(personCode: string, personName: string, docs: AuditDocument[], requirements: CompletenessRequirement[], now = new Date()): AuditReport {
  return { personCode, personName, fields: buildAuditFields(docs), completeness: buildCompleteness(docs, requirements, now), createdAt: now.toISOString() };
}
