/** 人才四页演示数据（按参考图写死，不走数据库） */

export const talentCharts = {
  age: [
    { label: "56岁以上", count: 43, color: "#A878D0" },
    { label: "46-55岁", count: 66, color: "#F0A04B" },
    { label: "36-45岁", count: 178, color: "#4A9FD9" },
    { label: "35岁以下", count: 89, color: "#3DB883" },
  ],
  rank: [
    { label: "正高级", total: 66, eligible: 0 },
    { label: "副高级", total: 145, eligible: 81 },
    { label: "中级", total: 109, eligible: 64 },
    { label: "初级", total: 25, eligible: 20 },
    { label: "无职称", total: 31, eligible: 0 },
  ],
  edu: [
    { label: "本科", count: 200, pct: "53.2%", color: "#4A9FD9" },
    { label: "研究生", count: 127, pct: "33.8%", color: "#3DB883" },
    { label: "大专", count: 26, pct: "6.9%", color: "#F0A04B" },
    { label: "中专", count: 14, pct: "3.7%", color: "#E8704B" },
    { label: "初中", count: 6, pct: "1.6%", color: "#E85C60" },
    { label: "高中", count: 3, pct: "0.8%", color: "#A878D0" },
  ],
  major: [
    { label: "水利水电类", count: 142 },
    { label: "水文水资源类", count: 39 },
    { label: "地质勘查类", count: 25 },
    { label: "建筑土木类", count: 24 },
    { label: "电气动力类", count: 24 },
    { label: "经济管理类", count: 19 },
    { label: "测绘地理类", count: 19 },
    { label: "环境生态类", count: 18 },
    { label: "港航海岸类", count: 16 },
    { label: "其他", count: 14 },
    { label: "农业园林类", count: 13 },
    { label: "机械材料类", count: 11 },
    { label: "计算机信息类", count: 7 },
    { label: "市政给排水", count: 5 },
  ],
};

export const talentPortraitWang = {
  personCode: "20631",
  name: "王宇轩",
  title: "20631 · 助理工程师",
  tags: ["理工背景", "党员", "初级职称"],
  gender: "男",
  ethnicity: "汉族",
  dob: "2002-03-15",
  political: "中共党员",
  joinParty: "2023-06-20",
  workStart: "2024-07-01",
  education: "大学本科",
  degree: "工学学士",
  jobTitle: "助理工程师",
  position: "无",
  contractLevel: "二级合同制",
  archiveStatus: "已审核",
  timeline: [
    {
      date: "2025-07",
      text: "至今 · XX公司 助理工程师",
      source: "来源：毕业生确定专业技术职务审核表（2025）",
    },
    {
      date: "2024-07",
      text: "至 2025-06 · XX公司 见习",
      source: "来源：干部履历表（2024）",
    },
    {
      date: "2020-09",
      text: "至 2024-06 · XX大学 本科（工学学士）",
      source: "来源：本科毕业生登记表（2024）",
    },
    {
      date: "2015-09",
      text: "至 2018-06 · XX中学 高中学习",
      source: "来源：中学生登记表（2016）",
    },
    {
      date: "2010-09",
      text: "至 2015-06 · 义务教育阶段",
      source: "来源：学生登记表（2010）",
    },
  ],
  promotion: [
    { date: "2025-07", label: "助理工程师（初级）" },
    { date: "2029-07", label: "中级（预测）", pending: true },
  ],
  assessments: [
    { year: "2026", result: "", note: "—" },
    { year: "2025", result: "优秀", note: "年度考核" },
    { year: "2024", result: "称职", note: "年度考核" },
  ],
  trend: [
    { year: "2024", level: "称职" },
    { year: "2025", level: "优秀" },
    { year: "2026", level: "待归档" },
  ],
  awards: [
    {
      year: "2025",
      title: "先进个人",
      source: "来源：2025年度XX公司先进个人审批表",
    },
  ],
};

export const talentMatch = {
  summary: [
    { label: "岗位总数", value: "74", tip: "组织手册", tone: "blue" as const },
    { label: "在岗人员", value: "376", tip: "人事档案", tone: "green" as const },
    { label: "部门单位", value: "15", tip: "组织手册", tone: "orange" as const },
  ],
  departments: [
    {
      name: "党群部",
      count: 4,
      expanded: true,
      posts: [
        {
          name: "党群部部长",
          req: "本科及以上 · 管理/思政类 · 中级及以上 · 5年",
        },
        { name: "党建管理岗", req: "本科及以上 · 中共党员 · 2年" },
        { name: "工会管理岗", req: "本科及以上 · 2年" },
        { name: "文化宣传岗", req: "本科及以上 · 2年" },
      ],
    },
    {
      name: "生产部门",
      count: 4,
      expanded: true,
      posts: [
        {
          name: "生产部门院长",
          req: "本科及以上 · 水利类 · 中级及以上 · 5年",
        },
        {
          name: "生产部门副院长",
          req: "本科及以上 · 水利类 · 中级及以上 · 5年",
        },
        {
          name: "生产部门总工程师",
          req: "本科及以上 · 水利类 · 高级及以上 · 8年",
        },
        {
          name: "专业技术岗",
          req: "本科及以上 · 水利类 · 初级及以上 · 3年",
        },
      ],
    },
    { name: "综合办公室", count: 6, posts: [] },
    { name: "人力资源部", count: 5, posts: [] },
    { name: "财务部", count: 6, posts: [] },
    { name: "法务部", count: 4, posts: [] },
    { name: "总工程师办公室", count: 8, posts: [] },
    { name: "纪检部", count: 2, posts: [] },
    { name: "勘察分院", count: 4, posts: [] },
    { name: "测绘分院", count: 3, posts: [] },
    { name: "数字信息部", count: 2, posts: [] },
  ],
  persons: [
    { code: "20631", name: "王宇轩" },
    { code: "20612", name: "李淑芬" },
    { code: "20587", name: "张建国" },
  ],
  verifyRows: [
    {
      item: "学历",
      require: "本科及以上",
      record: "大学本科（工学学士）",
      ok: true,
      postName: "专业技术岗",
      deptName: "生产部门",
    },
    {
      item: "专业",
      require: "水利水电工程及相关",
      record: "水利水电工程",
      ok: true,
      postName: "专业技术岗",
      deptName: "生产部门",
    },
    {
      item: "职称",
      require: "初级及以上",
      record: "助理工程师（初级）",
      ok: true,
      postName: "专业技术岗",
      deptName: "生产部门",
    },
    {
      item: "工作年限",
      require: "3 年及以上",
      record: "2 年（2024-07 起）",
      ok: false,
      postName: "专业技术岗",
      deptName: "生产部门",
    },
  ],
  scores: [
    {
      post: "专业技术岗",
      score: 75,
      reason: "学历专业匹配，工作年限不足",
    },
  ],
};

export type DemoReminder = {
  id: string;
  code: string;
  name: string;
  type: "retire" | "contract" | "probation";
  date: string;
  label: string;
  editable: boolean;
};

/** 参考图展示的临期节点（可点开改日期，存 localStorage） */
export const talentRemindersSeed: DemoReminder[] = [
  {
    id: "retire-20595",
    code: "20595",
    name: "刘德海",
    type: "retire",
    date: "2026-12-15",
    label: "退休时间",
    editable: true,
  },
  {
    id: "contract-20603",
    code: "20603",
    name: "陈志远",
    type: "contract",
    date: "2026-11-05",
    label: "合同到期",
    editable: true,
  },
  {
    id: "contract-20612",
    code: "20612",
    name: "李淑芬",
    type: "contract",
    date: "2026-11-15",
    label: "合同到期",
    editable: true,
  },
  {
    id: "contract-20587",
    code: "20587",
    name: "张建国",
    type: "contract",
    date: "2026-11-23",
    label: "合同到期",
    editable: true,
  },
  {
    id: "probation-20621",
    code: "20621",
    name: "赵文博",
    type: "probation",
    date: "2026-11-15",
    label: "试用期满",
    editable: true,
  },
];

export const talentTitlePromo = [
  {
    id: "t1",
    code: "20631",
    name: "王宇轩",
    meta: "本科 · 初级（2025-07 取得）",
    verdict: "预计 2029-07 起可申报中级",
    ok: false,
  },
  {
    id: "t2",
    code: "10256",
    name: "李杨",
    meta: "硕士 · 初级（2023-09 取得）",
    verdict: "已满足中级基础条件",
    ok: true,
  },
  {
    id: "t3",
    code: "10840",
    name: "张洁",
    meta: "本科 · 中级（2021-07 取得）",
    verdict: "已满足副高基础条件",
    ok: true,
  },
];

const LS_KEY = "talent-reminder-dates-v1";

export function loadReminderOverrides(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "{}") as Record<
      string,
      string
    >;
  } catch {
    return {};
  }
}

export function saveReminderOverride(id: string, date: string) {
  const cur = loadReminderOverrides();
  cur[id] = date;
  localStorage.setItem(LS_KEY, JSON.stringify(cur));
}

export function getRemindersWithOverrides(): DemoReminder[] {
  const ov = loadReminderOverrides();
  return talentRemindersSeed.map((r) =>
    ov[r.id] ? { ...r, date: ov[r.id] } : r
  );
}
