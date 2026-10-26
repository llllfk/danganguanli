import type { ArchiveCategory, ArchiveCategoryCode } from "@/types";

export const ARCHIVE_CATEGORIES: ArchiveCategory[] = [
  { code: "0100", name: "第一类 履历类材料" },
  { code: "0200", name: "第二类 自传和思想类材料" },
  { code: "0300", name: "第三类 考核鉴定类材料" },
  { code: "0401", name: "第四类（4-1）学历学位材料", parent: "04" },
  { code: "0402", name: "第四类（4-2）专业技术职务材料", parent: "04" },
  { code: "0403", name: "第四类（4-3）学术评鉴材料", parent: "04" },
  { code: "0404", name: "第四类（4-4）教育培训材料", parent: "04" },
  { code: "0500", name: "第五类 政审审计审核类材料" },
  { code: "0600", name: "第六类 党团类材料" },
  { code: "0700", name: "第七类 表彰奖励类材料" },
  { code: "0800", name: "第八类 处分处理类材料" },
  { code: "0901", name: "第九类（9-1）工资材料", parent: "09" },
  { code: "0902", name: "第九类（9-2）任免材料", parent: "09" },
  { code: "0903", name: "第九类（9-3）出国（境）材料", parent: "09" },
  { code: "0904", name: "第九类（9-4）会议代表材料", parent: "09" },
  { code: "1000", name: "第十类 其他材料" },
];

export function categoryName(code: ArchiveCategoryCode | string) {
  return (
    ARCHIVE_CATEGORIES.find((c) => c.code === code)?.name || String(code)
  );
}

/** 关键词 → 分类号（规则引擎，可被修正规则文本覆盖语义） */
export const CLASSIFY_KEYWORDS: Array<{
  code: ArchiveCategoryCode;
  keywords: string[];
}> = [
  { code: "0100", keywords: ["履历表", "简历表", "履历书", "职工登记表"] },
  { code: "0200", keywords: ["自传", "思想汇报", "个人有关事项"] },
  {
    code: "0300",
    keywords: ["年度考核", "考核登记表", "考核评价表", "鉴定", "民主评议"],
  },
  {
    code: "0401",
    keywords: [
      "毕业生登记表",
      "学位授予",
      "学习成绩表",
      "毕业证",
      "学位证",
      "学生登记表",
      "高考",
    ],
  },
  {
    code: "0402",
    keywords: ["专业技术资格", "职称", "任职资格", "聘任", "职业资格"],
  },
  { code: "0403", keywords: ["科研成果", "论文", "院士", "博士生导师"] },
  { code: "0404", keywords: ["培训登记", "进修", "培训结业", "初任培训"] },
  {
    code: "0500",
    keywords: [
      "政审",
      "专项审核",
      "审核认定",
      "任免审批表（全国干部人事档案专项",
      "基本信息审核认定",
    ],
  },
  {
    code: "0600",
    keywords: [
      "入党志愿书",
      "入党申请书",
      "转正申请书",
      "入团志愿书",
      "党员登记表",
      "团员",
    ],
  },
  { code: "0700", keywords: ["表彰", "奖励", "荣誉", "嘉奖"] },
  { code: "0800", keywords: ["处分", "违纪", "调查报告", "本人检查"] },
  { code: "0901", keywords: ["工资", "调资", "薪级"] },
  {
    code: "0902",
    keywords: ["任免审批表", "劳动合同", "就业人员登记表", "任职"],
  },
  { code: "0903", keywords: ["出国", "出境", "护照"] },
  { code: "0904", keywords: ["党代会", "人代会", "会议代表"] },
  { code: "1000", keywords: ["体检", "其他"] },
];
