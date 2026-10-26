import type { ArchiveCategoryCode, ArchivePiece, SortItem } from "@/types";
import { CLASSIFY_KEYWORDS, categoryName } from "@/lib/data/categories";
import { pad } from "@/lib/utils";

/** 演示用材料元数据：按流水件号映射（对应附件3样本语义） */
const DEMO_META: Record<
  string,
  { name: string; summary: string; date: string; category: ArchiveCategoryCode }
> = {
  L001: {
    name: "入党志愿书",
    summary: "接收预备党员及转正相关记载",
    date: "2002-03-15",
    category: "0600",
  },
  L002: {
    name: "员工年度考核登记表",
    summary: "年度考核等次记载",
    date: "2018-12-20",
    category: "0300",
  },
  L003: {
    name: "专业技术资格评定表",
    summary: "职称评审材料",
    date: "2015-06-10",
    category: "0402",
  },
  L004: {
    name: "劳动合同书",
    summary: "劳动用工合同",
    date: "2010-07-01",
    category: "0902",
  },
  L005: {
    name: "团员登记表",
    summary: "共青团组织关系材料",
    date: "1998-05-04",
    category: "0600",
  },
  L006: {
    name: "毕业生登记表（本科）",
    summary: "本科学历毕业生登记",
    date: "2004-06-30",
    category: "0401",
  },
  L007: {
    name: "学位授予审批表",
    summary: "学士学位授予",
    date: "2004-06-28",
    category: "0401",
  },
  L008: {
    name: "学习成绩表",
    summary: "在校学习成绩",
    date: "2004-06-01",
    category: "0401",
  },
  L009: {
    name: "入团志愿书",
    summary: "入团材料",
    date: "1996-05-04",
    category: "0600",
  },
  L010: {
    name: "工资变动审批表",
    summary: "调资审批",
    date: "2019-01-15",
    category: "0901",
  },
  L011: {
    name: "培训结业登记表",
    summary: "教育培训材料",
    date: "2016-09-20",
    category: "0404",
  },
  L012: {
    name: "入党申请书",
    summary: "书面入党申请",
    date: "2000-11-08",
    category: "0600",
  },
  L013: {
    name: "干部履历表",
    summary: "基本履历信息",
    date: "2017-03-12",
    category: "0100",
  },
  L014: {
    name: "员工年度考核登记表",
    summary: "年度考核",
    date: "2019-12-18",
    category: "0300",
  },
  L015: {
    name: "表彰决定",
    summary: "先进个人表彰",
    date: "2020-05-01",
    category: "0700",
  },
  L016: {
    name: "员工年度考核登记表",
    summary: "年度考核",
    date: "2017-12-15",
    category: "0300",
  },
  L017: {
    name: "高中毕业生登记表",
    summary: "高中学历材料",
    date: "2000-06-20",
    category: "0401",
  },
  L018: {
    name: "党员登记表",
    summary: "党员组织材料",
    date: "2012-06-01",
    category: "0600",
  },
  L019: {
    name: "干部任免审批表",
    summary: "职务任免（九类）",
    date: "2021-04-10",
    category: "0902",
  },
  L020: {
    name: "毕业生登记表（硕士）",
    summary: "研究生学历",
    date: "2007-06-25",
    category: "0401",
  },
  L021: {
    name: "奖励审批表",
    summary: "表彰奖励",
    date: "2018-07-01",
    category: "0700",
  },
  L022: {
    name: "毕业证复印件",
    summary: "本科学历证书复印件",
    date: "2004-07-01",
    category: "0401",
  },
  L023: {
    name: "职称聘任表",
    summary: "专业技术职务聘任",
    date: "2016-01-08",
    category: "0402",
  },
  L024: {
    name: "辽宁省就业人员登记表",
    summary: "就业登记",
    date: "2010-07-05",
    category: "0902",
  },
  L025: {
    name: "干部履历表",
    summary: "履历更新",
    date: "2022-01-10",
    category: "0100",
  },
  L026: {
    name: "干部任免审批表（全国干部人事档案专项审核工作专用）",
    summary: "专项审核任免审批表",
    date: "2016-08-20",
    category: "0500",
  },
  L027: {
    name: "转正申请书",
    summary: "预备党员转正申请",
    date: "2003-03-10",
    category: "0600",
  },
};

export function parsePieceFromFolderName(folderName: string): {
  personCode: string;
  serialNo: string;
  pieceKey: string;
} | null {
  // 00001-L001
  const m = folderName.match(/^(\d+)-(L\d+)$/i);
  if (!m) return null;
  return {
    personCode: m[1],
    serialNo: `${m[1]}-${m[2].toUpperCase()}`,
    pieceKey: m[2].toUpperCase(),
  };
}

export function parseOrderedPiece(pathParts: string[]): {
  personCode: string;
  category: ArchiveCategoryCode;
  pieceNo: string;
  serialNo: string;
} | null {
  // 00001-0401-001
  const leaf = pathParts[pathParts.length - 1] || "";
  const m = leaf.match(/^(\d+)-(\d{4})-(\d{3})$/);
  if (!m) return null;
  return {
    personCode: m[1],
    category: m[2] as ArchiveCategoryCode,
    pieceNo: m[3],
    serialNo: leaf,
  };
}

export function classifyByName(name: string): ArchiveCategoryCode {
  for (const row of CLASSIFY_KEYWORDS) {
    if (row.keywords.some((k) => name.includes(k))) return row.code;
  }
  return "1000";
}

export function enrichPiece(
  serialNo: string,
  personCode: string,
  pages: string[]
): ArchivePiece {
  const pieceKey = serialNo.split("-")[1] || "";
  const meta = DEMO_META[pieceKey];
  const materialName = meta?.name || `未识别材料-${serialNo}`;
  const suggested = meta?.category || classifyByName(materialName);
  return {
    id: serialNo,
    serialNo,
    personCode,
    pageCount: pages.length || 1,
    pages,
    materialName,
    summary: meta?.summary || "材料主要内容待核验",
    formDate: meta?.date || "未知",
    suggestedCategory: suggested,
    confirmedCategory: suggested,
  };
}

export function buildDemoPieces(personCode = "00001"): ArchivePiece[] {
  return Object.keys(DEMO_META)
    .sort()
    .map((key) => {
      const serialNo = `${personCode}-${key}`;
      const pageCount =
        key === "L001" || key === "L013" || key === "L025" ? 6 : key === "L008" ? 11 : 2;
      const pages = Array.from({ length: pageCount }, (_, i) =>
        `${serialNo}-${pad(i + 1)}`
      );
      return enrichPiece(serialNo, personCode, pages);
    });
}

const PARTY_ORDER = [
  "入团志愿书",
  "入团申请书",
  "团员登记表",
  "退团",
  "入党志愿书",
  "入党申请书",
  "转正申请书",
  "党员登记表",
  "退党",
];

function partyRank(name: string) {
  const idx = PARTY_ORDER.findIndex((k) => name.includes(k));
  return idx >= 0 ? idx : 50;
}

export function sortPieces(pieces: ArchivePiece[]): SortItem[] {
  const groups = new Map<ArchiveCategoryCode, ArchivePiece[]>();
  for (const p of pieces) {
    const code = (p.confirmedCategory || p.suggestedCategory || "1000") as ArchiveCategoryCode;
    if (!groups.has(code)) groups.set(code, []);
    groups.get(code)!.push(p);
  }

  const codes = Object.keys(
    Object.fromEntries(
      [...groups.keys()].map((k) => [k, true])
    )
  ).sort() as ArchiveCategoryCode[];

  // 固定十大类顺序展示（含空类标题由前端控制；这里只输出有材料的）
  const orderedCodes: ArchiveCategoryCode[] = [
    "0100",
    "0200",
    "0300",
    "0401",
    "0402",
    "0403",
    "0404",
    "0500",
    "0600",
    "0700",
    "0800",
    "0901",
    "0902",
    "0903",
    "0904",
    "1000",
  ];

  return orderedCodes
    .filter((c) => groups.has(c))
    .map((code) => {
      const list = [...(groups.get(code) || [])];
      list.sort((a, b) => {
        if (code === "0600") {
          const ra = partyRank(a.materialName || "");
          const rb = partyRank(b.materialName || "");
          if (ra !== rb) return ra - rb;
        }
        return String(a.formDate).localeCompare(String(b.formDate));
      });

      return {
        category: code,
        categoryName: categoryName(code),
        items: list.map((p, idx) => ({
          serialNo: p.serialNo,
          materialName: p.materialName || "-",
          formDate: p.formDate || "-",
          pageCount: p.pageCount,
          formalNo: `${p.personCode}-${code}-${pad(idx + 1)}`,
        })),
      };
    });
}
