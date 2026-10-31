import type { SortItem } from "@/types";
import * as XLSX from "xlsx";

/** 附件2 类目展示结构 */
const MAJOR: Array<{
  roman: string;
  title: string;
  codes: string[];
  subs?: Array<{ key: string; title: string; code: string }>;
}> = [
  { roman: "一", title: "履历材料", codes: ["0100"] },
  { roman: "二", title: "自传和思想材料", codes: ["0200"] },
  { roman: "三", title: "考核鉴定材料", codes: ["0300"] },
  {
    roman: "四",
    title: "学历学位、专业技术职务（职称）、学术评鉴和教育培训材料",
    codes: ["0401", "0402", "0403", "0404"],
    subs: [
      { key: "4-1", title: "学历学位材料", code: "0401" },
      {
        key: "4-2",
        title: "职业（任职）资格和评（聘）专业技术职务（职称）材料",
        code: "0402",
      },
      { key: "4-3", title: "反映科研学术水平材料", code: "0403" },
      { key: "4-4", title: "培训材料", code: "0404" },
    ],
  },
  { roman: "五", title: "政审、审计和审核材料", codes: ["0500"] },
  { roman: "六", title: "党、团材料", codes: ["0600"] },
  { roman: "七", title: "表彰奖励材料", codes: ["0700"] },
  { roman: "八", title: "违规违纪违法处分材料", codes: ["0800"] },
  {
    roman: "九",
    title: "工资、任免、出国和会议代表材料",
    codes: ["0901", "0902", "0903", "0904"],
    subs: [
      { key: "9-1", title: "工资材料", code: "0901" },
      { key: "9-2", title: "任免材料", code: "0902" },
      { key: "9-3", title: "出国（境）材料", code: "0903" },
      { key: "9-4", title: "参加会议的代表登记表等其他材料", code: "0904" },
    ],
  },
  { roman: "十", title: "其他可供组织参考材料", codes: ["1000"] },
];

const SIMPLE_PREFIX: Record<string, string> = {
  "0100": "1",
  "0200": "2",
  "0300": "3",
  "0500": "5",
  "0600": "6",
  "0700": "7",
  "0800": "8",
  "1000": "10",
};

function splitDate(formDate: string) {
  const m = String(formDate || "").match(/(\d{4})[-/.年]?(\d{1,2})?[-/.月]?(\d{1,2})?/);
  if (!m) return { y: "", m: "", d: "" };
  return {
    y: m[1] || "",
    m: m[2] ? m[2].padStart(2, "0") : "",
    d: m[3] ? m[3].padStart(2, "0") : "",
  };
}

function emptyRow(): (string | number)[] {
  return ["", "", "", "", "", "", "", ""];
}

/** 按附件2结构生成 AOA，再写 xlsx */
export function buildCatalogWorkbook(
  personName: string,
  sorted: SortItem[]
): XLSX.WorkBook {
  const byCode = new Map(sorted.map((g) => [g.category, g.items]));
  const aoa: (string | number)[][] = [];

  aoa.push(["", "人事档案目录", "", "", "", "", "", ""]);
  aoa.push(["", `姓名：${personName}`, "", "", "", "", "", ""]);
  aoa.push(["", "序号", "材 料 名 称", "材料形成日期", "", "", "页数", "备注"]);
  aoa.push(["", "", "", "年", "月", "日", "", ""]);

  for (const major of MAJOR) {
    const hasAny = major.codes.some((c) => (byCode.get(c as never) || []).length);
    if (!hasAny) continue;

    aoa.push(["", major.roman, major.title, "", "", "", "", ""]);

    if (major.subs?.length) {
      for (const sub of major.subs) {
        const items = byCode.get(sub.code as never) || [];
        if (!items.length) continue;
        aoa.push(["", sub.key, sub.title, "", "", "", "", ""]);
        items.forEach((it, idx) => {
          const { y, m, d } = splitDate(it.formDate);
          aoa.push([
            "",
            `${sub.key}-${idx + 1}`,
            it.materialName,
            y,
            m,
            d,
            it.pageCount,
            "",
          ]);
        });
      }
    } else {
      const code = major.codes[0];
      const items = byCode.get(code as never) || [];
      const prefix = SIMPLE_PREFIX[code] || code;
      items.forEach((it, idx) => {
        const { y, m, d } = splitDate(it.formDate);
        aoa.push([
          "",
          `${prefix}-${idx + 1}`,
          it.materialName,
          y,
          m,
          d,
          it.pageCount,
          "",
        ]);
      });
    }

    // 类与类之间留一空行，接近制式观感
    aoa.push(emptyRow());
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 2 },
    { wch: 10 },
    { wch: 42 },
    { wch: 6 },
    { wch: 4 },
    { wch: 4 },
    { wch: 6 },
    { wch: 10 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "1");
  return wb;
}
