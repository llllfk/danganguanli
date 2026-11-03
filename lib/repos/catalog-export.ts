import ExcelJS from "exceljs";
import type { SortItem } from "@/types";

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

const THIN: Partial<ExcelJS.Border> = {
  style: "thin",
  color: { argb: "FF000000" },
};

const BOX: Partial<ExcelJS.Borders> = {
  top: THIN,
  left: THIN,
  bottom: THIN,
  right: THIN,
};

function splitDate(formDate: string) {
  const m = String(formDate || "").match(
    /(\d{4})[-/.年]?(\d{1,2})?[-/.月]?(\d{1,2})?/
  );
  if (!m) return { y: "", m: "", d: "" };
  return {
    y: m[1] || "",
    m: m[2] ? m[2].padStart(2, "0") : "",
    d: m[3] ? m[3].padStart(2, "0") : "",
  };
}

function styleRange(
  ws: ExcelJS.Worksheet,
  row: number,
  fromCol: number,
  toCol: number,
  opts: {
    bold?: boolean;
    align?: ExcelJS.Alignment["horizontal"];
    border?: boolean;
    size?: number;
  }
) {
  for (let c = fromCol; c <= toCol; c++) {
    const cell = ws.getCell(row, c);
    cell.font = {
      name: "宋体",
      bold: !!opts.bold,
      size: opts.size || 11,
    };
    cell.alignment = {
      vertical: "middle",
      horizontal: opts.align || "center",
      wrapText: true,
    };
    if (opts.border) cell.border = BOX as ExcelJS.Borders;
  }
}

function writeHeader(ws: ExcelJS.Worksheet, personName: string) {
  // A 列留白，B–H 为制式区（对齐附件2）
  ws.mergeCells(1, 2, 1, 8);
  ws.getCell(1, 2).value = "人事档案目录";
  styleRange(ws, 1, 2, 8, { bold: true, size: 16, border: true });

  ws.mergeCells(2, 2, 2, 8);
  ws.getCell(2, 2).value = `姓名：${personName}`;
  styleRange(ws, 2, 2, 8, {
    bold: true,
    align: "left",
    size: 12,
    border: true,
  });

  // 表头两行
  ws.mergeCells(3, 2, 4, 2); // 序号
  ws.mergeCells(3, 3, 4, 3); // 材料名称
  ws.mergeCells(3, 4, 3, 6); // 材料形成日期
  ws.mergeCells(3, 7, 4, 7); // 页数
  ws.mergeCells(3, 8, 4, 8); // 备注

  ws.getCell(3, 2).value = "序号";
  ws.getCell(3, 3).value = "材 料 名 称";
  ws.getCell(3, 4).value = "材料形成日期";
  ws.getCell(3, 7).value = "页数";
  ws.getCell(3, 8).value = "备注";
  ws.getCell(4, 4).value = "年";
  ws.getCell(4, 5).value = "月";
  ws.getCell(4, 6).value = "日";

  styleRange(ws, 3, 2, 8, { bold: true, border: true });
  styleRange(ws, 4, 2, 8, { bold: true, border: true });
  ws.getRow(1).height = 28;
  ws.getRow(2).height = 22;
  ws.getRow(3).height = 20;
  ws.getRow(4).height = 18;
}

function writeDataRow(
  ws: ExcelJS.Worksheet,
  row: number,
  cols: Array<string | number>,
  opts?: { bold?: boolean; nameLeft?: boolean }
) {
  for (let i = 0; i < 7; i++) {
    const cell = ws.getCell(row, i + 2);
    cell.value = cols[i] ?? "";
    cell.font = {
      name: "宋体",
      bold: !!opts?.bold,
      size: 11,
    };
    cell.alignment = {
      vertical: "middle",
      horizontal:
        i === 1 && opts?.nameLeft
          ? "left"
          : ("center" as ExcelJS.Alignment["horizontal"]),
      wrapText: true,
    };
    cell.border = BOX as ExcelJS.Borders;
  }
  ws.getRow(row).height = opts?.bold ? 20 : 18;
}

/**
 * 按附件2制式生成目录：一件材料一行，含边框/加粗。
 * 返回 xlsx Buffer。
 */
export async function buildCatalogWorkbookBuffer(
  personName: string,
  sorted: SortItem[]
): Promise<Buffer> {
  const byCode = new Map(sorted.map((g) => [g.category, g.items]));
  const wb = new ExcelJS.Workbook();
  wb.creator = "档案管理智能体";
  const ws = wb.addWorksheet("1", {
    properties: { defaultRowHeight: 18 },
    views: [{ showGridLines: false }],
  });

  ws.getColumn(1).width = 2;
  ws.getColumn(2).width = 10;
  ws.getColumn(3).width = 42;
  ws.getColumn(4).width = 6;
  ws.getColumn(5).width = 5;
  ws.getColumn(6).width = 5;
  ws.getColumn(7).width = 6;
  ws.getColumn(8).width = 10;

  writeHeader(ws, personName);
  let row = 5;

  for (const major of MAJOR) {
    const hasAny = major.codes.some(
      (c) => (byCode.get(c as never) || []).length
    );
    if (!hasAny) continue;

    writeDataRow(ws, row, [major.roman, major.title, "", "", "", "", ""], {
      bold: true,
      nameLeft: true,
    });
    // 类标题：序号列+名称列视觉上成组，名称左对齐
    ws.getCell(row, 3).alignment = {
      vertical: "middle",
      horizontal: "left",
      wrapText: true,
    };
    row += 1;

    if (major.subs?.length) {
      for (const sub of major.subs) {
        const items = byCode.get(sub.code as never) || [];
        if (!items.length) continue;
        writeDataRow(ws, row, [sub.key, sub.title, "", "", "", "", ""], {
          bold: true,
          nameLeft: true,
        });
        row += 1;
        items.forEach((it, idx) => {
          const { y, m, d } = splitDate(it.formDate);
          writeDataRow(
            ws,
            row,
            [
              `${sub.key}-${idx + 1}`,
              it.materialName || "",
              y,
              m,
              d,
              it.pageCount || "",
              "",
            ],
            { nameLeft: true }
          );
          row += 1;
        });
      }
    } else {
      const code = major.codes[0];
      const items = byCode.get(code as never) || [];
      const prefix = SIMPLE_PREFIX[code] || code;
      items.forEach((it, idx) => {
        const { y, m, d } = splitDate(it.formDate);
        writeDataRow(
          ws,
          row,
          [
            `${prefix}-${idx + 1}`,
            it.materialName || "",
            y,
            m,
            d,
            it.pageCount || "",
            "",
          ],
          { nameLeft: true }
        );
        row += 1;
      });
    }

    // 类之间空一行（带边框空白，贴近制式纸面）
    writeDataRow(ws, row, ["", "", "", "", "", "", ""]);
    row += 1;
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
