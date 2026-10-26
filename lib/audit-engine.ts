import type {
  AuditFieldResult,
  AuditReport,
  AuditSource,
  CompletenessIssue,
} from "@/types";

/** 演示用「张三 00001」核验数据（对应需求三龄两历交叉比对） */
const DEMO_SOURCES: Record<string, AuditSource[]> = {
  name: [
    {
      materialName: "干部履历表",
      formYear: "2017",
      materialNo: "00001-0100-001-001",
      value: "张三",
    },
    {
      materialName: "入党志愿书",
      formYear: "2002",
      materialNo: "00001-0600-002-001",
      value: "张三",
    },
  ],
  birth: [
    {
      materialName: "入团志愿书",
      formYear: "1996",
      materialNo: "00001-0600-001-001",
      value: "1982-05-12",
    },
    {
      materialName: "中学生社会实践活动表",
      formYear: "1999",
      materialNo: "00001-0401-000-002",
      value: "1982-05-12",
    },
    {
      materialName: "干部履历表",
      formYear: "2017",
      materialNo: "00001-0100-001-003",
      value: "1982-05-12",
    },
  ],
  work: [
    {
      materialName: "辽宁省就业人员登记表",
      formYear: "2010",
      materialNo: "00001-0902-002-001",
      value: "2004-07-15",
    },
    {
      materialName: "干部任免审批表（专项）",
      formYear: "2016",
      materialNo: "00001-0500-001-002",
      value: "2004-07-15",
    },
  ],
  party: [
    {
      materialName: "入党志愿书",
      formYear: "2002",
      materialNo: "00001-0600-002-004",
      value: "2002-03-15",
    },
    {
      materialName: "干部履历表",
      formYear: "2017",
      materialNo: "00001-0100-001-005",
      value: "2002-03-15",
    },
  ],
  education: [
    {
      materialName: "毕业生登记表（本科）",
      formYear: "2004",
      materialNo: "00001-0401-001-001",
      value: "大学本科",
    },
    {
      materialName: "干部履历表",
      formYear: "2017",
      materialNo: "00001-0100-001-006",
      value: "大学本科",
    },
  ],
  degree: [
    {
      materialName: "学位授予审批表",
      formYear: "2004",
      materialNo: "00001-0401-004-001",
      value: "学士",
    },
  ],
  experience: [
    {
      materialName: "干部任免审批表（专项）",
      formYear: "2016",
      materialNo: "00001-0500-001-003",
      value: "2004.07-2010.06 某公司科员；2010.07至今 本单位",
    },
  ],
  recognition: [
    {
      materialName: "干部基本信息审核认定表",
      formYear: "2016",
      materialNo: "00001-0500-002-001",
      value: "已认定",
    },
  ],
};

function uniqueValues(sources: AuditSource[]) {
  return [...new Set(sources.map((s) => s.value))];
}

function buildField(
  field: string,
  label: string,
  sources: AuditSource[],
  opts?: { baseline?: string; missingText?: string }
): AuditFieldResult {
  if (!sources.length) {
    return {
      field,
      label,
      value: "未检出",
      status: "missing",
      statusText: opts?.missingText || "未检出",
      sources: [],
      aiOpinion: "档案材料中未检索到相关记载，请补充或人工核查。",
    };
  }

  const values = uniqueValues(sources);
  const baseline = opts?.baseline || sources[0].value;
  if (values.length === 1) {
    return {
      field,
      label,
      value: baseline,
      status: "ok",
      statusText: "一致",
      sources,
    };
  }

  return {
    field,
    label,
    value: baseline,
    status: "warn",
    statusText: `${label}信息记载不一致`,
    sources,
    aiOpinion: `检测到多处记载不一致。建议以基准值「${baseline}」为准，并核查差异材料原文。`,
  };
}

export function runAudit(personCode = "00001", personName = "张三"): AuditReport {
  const birthSources = DEMO_SOURCES.birth;
  const earliest = [...birthSources].sort((a, b) =>
    a.formYear.localeCompare(b.formYear)
  )[0];

  const fields: AuditFieldResult[] = [
    buildField("name", "姓名", DEMO_SOURCES.name),
    {
      ...buildField("birth", "出生时间", birthSources, {
        baseline: earliest?.value,
      }),
      aiOpinion:
        birthSources.length > 1 && uniqueValues(birthSources).length > 1
          ? `以最早形成材料《${earliest.materialName}》（${earliest.formYear}）记载的出生日期 ${earliest.value} 作为认定参考。`
          : undefined,
    },
    buildField("work", "参加工作时间", DEMO_SOURCES.work, {
      baseline: DEMO_SOURCES.work[0]?.value,
    }),
    buildField("party", "入党时间", DEMO_SOURCES.party, {
      baseline: DEMO_SOURCES.party[0]?.value,
    }),
    buildField("education", "学历", DEMO_SOURCES.education),
    buildField("degree", "学位", DEMO_SOURCES.degree),
    buildField("experience", "工作经历", DEMO_SOURCES.experience),
    buildField("recognition", "组织认定", DEMO_SOURCES.recognition, {
      missingText: "未检出",
    }),
  ];

  // 演示：人为制造一条不一致以便展示 AI 意见
  if (fields[1].sources.length >= 2) {
    fields[1].sources = [
      fields[1].sources[0],
      {
        ...fields[1].sources[1],
        value: "1982-08-05",
        materialName: "中学生社会实践活动表",
        formYear: "1999",
        materialNo: "00001-0401-000-002",
      },
      ...fields[1].sources.slice(2),
    ];
    fields[1].status = "warn";
    fields[1].statusText = "出生日期信息记载不一致";
    fields[1].value = earliest.value;
    fields[1].aiOpinion = `以最早形成材料《${earliest.materialName}》（${earliest.formYear}）记载的 ${earliest.value} 为准；另有材料记载 1982-08-05，建议核查涂改与登记口径。`;
  }

  const completeness: CompletenessIssue[] = [
    { category: "1类", message: "已检出《干部履历表》" },
    {
      category: "3类",
      message: "年度考核登记表未连续：缺失 2015、2016 年度",
    },
    { category: "4-1类", message: "已检出毕业生登记表、学位授予审批表及证书复印件" },
    { category: "4-2类", message: "已检出专业技术资格评定表" },
    {
      category: "5类",
      message: "已检出《干部任免审批表（全国干部人事档案专项审核工作专用）》",
    },
    { category: "6类", message: "党员材料齐全（志愿书/申请书/转正申请书）" },
    { category: "9-2类", message: "已检出劳动合同书、辽宁省就业人员登记表" },
  ].map((x) =>
    x.message.includes("缺失")
      ? x
      : x
  );

  // 仅把缺失类作为问题输出，其余作说明也可保留；按需求「审查缺失」突出问题
  const issues = completeness.filter((c) => c.message.includes("缺失"));

  return {
    personCode,
    personName,
    fields,
    completeness: issues.length ? issues : completeness.filter((c) => c.message.includes("缺失")),
    createdAt: new Date().toISOString(),
  };
}

export function summarizeAudit(report: AuditReport) {
  const issues = report.fields.filter((f) => f.status !== "ok");
  const miss = report.completeness;
  return {
    issueCount: issues.length + miss.length,
    summary: `问题项 ${issues.length} 个，材料缺失提示 ${miss.length} 条`,
  };
}
