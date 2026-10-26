import type { PolicyDoc } from "@/types";

/**
 * 政策知识库摘要（源自附件1，仅用于系统内检索答复，禁止自由发挥）。
 * 完整原文可在「管理知识库」页面查看；正式部署可改为数据库/向量库。
 */
export const POLICY_KB: PolicyDoc[] = [
  {
    id: "p6",
    title: "《干部人事档案工作条例》中办发〔2018〕60号",
    sourceFile: "6-《干部人事档案工作条例》中办发〔2018〕60号.docx",
    content: `干部人事档案是教育培养、选拔任用、管理监督干部和评鉴人才的重要基础，是党的重要执政资源。
干部人事档案内容应当真实、准确、完整、规范。
干部人事档案材料分为十类，其中第四类、第九类分别设立四个二级类目。
第一类履历材料；第二类自传和思想类材料；第三类考核鉴定类材料；第四类学历学位、专业技术职务（职称）、学术评鉴和教育培训类材料；第五类政审、审计和审核类材料；第六类党、团类材料；第七类表彰奖励类材料；第八类违规违纪违法处理处分类材料；第九类工资、任免、出国和会议代表类材料；第十类其他可供组织参考的材料。
第四类下设：学历学位材料；专业技术职务（职称）及职业资格材料；学术评鉴材料；教育培训材料。
第九类下设：工资材料；任免材料；出国（境）材料；会议代表材料。
档案专项审核应当重点审核干部的出生时间、参加工作时间、入党时间、学历学位、工作经历、干部身份、家庭主要成员及重要社会关系等。
严禁涂改造假、严禁档案造假。`,
  },
  {
    id: "p11",
    title: "《关于认真做好干部出生日期管理工作的通知》组通字〔2006〕1号",
    sourceFile: "11-《关于认真做好干部出生日期管理工作的通知》组通字〔2006〕1号.docx",
    content: `干部出生日期的认定，原则上以本人档案中最早形成材料记载的出生日期为依据。
档案中最早记载的出生日期与户口簿、身份证不一致的，应调查核实后按程序认定。
严禁随意更改干部出生日期。
认定出生日期应当形成书面材料，归入本人档案。`,
  },
  {
    id: "p8",
    title: "《干部人事档案材料收集归档规定》中组发〔2009〕12号",
    sourceFile: "8-《干部人事档案材料收集归档规定》中组发〔2009〕12号.docx",
    content: `干部人事档案材料收集归档应当做到全面、及时、准确、规范。
第四类材料包括学历学位、专业技术职务、学术评鉴、教育培训材料。
入党志愿书、入党申请书、转正申请书等党团材料应当及时归档。
学历材料应当包括毕业生登记表、成绩表、学位授予材料及证书复印件等。`,
  },
  {
    id: "p10",
    title: "《干部人事档案造假问题处理办法(试行)》中组发〔2015〕23号",
    sourceFile: "10-《干部人事档案造假问题处理办法(试行)》中组发〔2015〕23号.docx",
    content: `干部人事档案造假，是指在档案材料形成、收集、保管、转递、利用等环节中，伪造、篡改、抽取、添加档案材料，或者隐瞒、编造个人重要信息等行为。
对档案造假问题应当严肃查处，实行谁形成谁负责、谁管理谁负责。
发现涂改、造假线索的，应当组织调查核实。`,
  },
  {
    id: "p12",
    title: "《关于完善干部人事档案材料的通知》组通字〔2017〕25号",
    sourceFile: "12-《关于完善干部人事档案材料的通知》组通字〔2017〕25号.docx",
    content: `进一步完善干部人事档案材料内容，规范材料收集范围。
专项审核相关材料应当归入第五类。
干部任免审批表（全国干部人事档案专项审核工作专用）应当归档。
干部基本信息审核认定表应当归档。`,
  },
  {
    id: "p13",
    title: "《干部档案整理工作细则》组通字〔1991〕11号",
    sourceFile: "13-《干部档案整理工作细则》组通字〔1991〕11号.docx",
    content: `档案整理包括分类、排序、编目、技术加工、装订等。
材料排序一般按形成时间或内容主次关系排列。
目录应当准确反映档案材料名称、形成时间、页数等信息。
冲突内容以2018年《干部人事档案工作条例》为准。`,
  },
  {
    id: "p34",
    title: "中组部《关于干部人事档案审核工作的问答》",
    sourceFile: "34-中组部《关于干部人事档案审核工作的问答》.docx",
    content: `档案审核重点是“三龄两历一身份”等信息。
三龄：出生时间、参加工作时间、入党时间。
两历：学历学位、工作经历。
出生时间认定一般以档案中最早形成材料记载为准。
入党时间以入党志愿书记载的接收为预备党员时间为准。
学历审核以毕业生登记表等学籍材料为依据。`,
  },
  {
    id: "p33",
    title: "中组部《干部人事档案工作条例》问答",
    sourceFile: "33-中组部《干部人事档案工作条例》问答.docx",
    content: `干部人事档案第四类下设四个子类：学历学位材料、专业技术职务（职称）及职业资格材料、学术评鉴材料、教育培训材料。
第九类下设四个子类：工资材料、任免材料、出国（境）材料、会议代表材料。
专项审核是干部人事档案工作的重要内容。`,
  },
];

function scoreDoc(doc: PolicyDoc, query: string) {
  const q = query.trim();
  if (!q) return 0;
  const tokens = q
    .replace(/[，。？?！!、；;：:\s]+/g, " ")
    .split(" ")
    .filter((t) => t.length >= 2);
  const hay = `${doc.title}\n${doc.content}`;
  let score = 0;
  for (const t of tokens) {
    if (hay.includes(t)) score += 2;
  }
  if (hay.includes(q)) score += 5;
  return score;
}

export function searchPolicy(query: string, topK = 3) {
  const ranked = POLICY_KB.map((doc) => ({
    doc,
    score: scoreDoc(doc, query),
  }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
  return ranked;
}

export function answerFromKnowledge(query: string) {
  const hits = searchPolicy(query);
  if (hits.length === 0) {
    return {
      found: false as const,
      answer: "未找到相关政策依据",
      sources: [] as Array<{
        title: string;
        excerpt: string;
        sourceFile: string;
      }>,
    };
  }

  const sources = hits.map(({ doc }) => {
    const idx = doc.content.indexOf(
      query.trim().slice(0, 4) || doc.content.slice(0, 4)
    );
    const start = Math.max(0, idx >= 0 ? idx - 20 : 0);
    const excerpt = doc.content.slice(start, start + 120).replace(/\n+/g, "");
    return {
      title: doc.title,
      excerpt: excerpt || doc.content.slice(0, 120),
      sourceFile: doc.sourceFile,
    };
  });

  const primary = hits[0].doc;
  let answer = "";
  if (/第四类|4类|子类|二级类目/.test(query)) {
    answer =
      "根据《干部人事档案工作条例》，干部人事档案第四类下设四个子类：学历学位材料；专业技术职务（职称）及职业资格材料；学术评鉴材料；教育培训材料。";
  } else if (/出生日期|出生时间|认定/.test(query)) {
    answer =
      "根据《关于认真做好干部出生日期管理工作的通知》，干部出生日期的认定原则上以本人档案中最早形成材料记载的出生日期为依据。";
  } else if (/专项审核|三龄两历/.test(query)) {
    answer =
      "根据相关审核工作要求，档案专项审核重点审核出生时间、参加工作时间、入党时间、学历学位、工作经历等“三龄两历”信息。";
  } else if (/档案分类|十大类|十类/.test(query)) {
    answer =
      "根据《干部人事档案工作条例》，干部人事档案材料分为十类，其中第四类、第九类分别设立四个二级类目。";
  } else {
    answer = `依据《${primary.title}》相关规定：${sources[0].excerpt}`;
  }

  return { found: true as const, answer, sources };
}
