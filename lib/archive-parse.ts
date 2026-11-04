/** 从相对路径/文件名解析人事档案件页命名 */

export type ParsedPage = {
  personCode: string;
  serialNo: string;
  pageNo: number;
  fileName: string;
  relativePath: string;
};

const PAGE_RE = /(\d{4,})-L(\d{3,})-(\d{3,})/i;
const PIECE_RE = /(\d{4,})-L(\d{3,})/i;

export function parseArchivePagePath(relativePath: string): ParsedPage | null {
  const normalized = relativePath.replace(/\\/g, "/");
  const base = normalized.split("/").pop() || normalized;
  if (!/\.jpe?g$/i.test(base)) return null;

  const pageMatch = base.match(PAGE_RE) || normalized.match(PAGE_RE);
  if (pageMatch) {
    const personCode = pageMatch[1];
    const serialNo = `${pageMatch[1]}-L${pageMatch[2]}`;
    return {
      personCode,
      serialNo,
      pageNo: parseInt(pageMatch[3], 10),
      fileName: base,
      relativePath: normalized,
    };
  }

  // 仅件号文件夹内未按规范命名的 jpg：按件归并，页号后补
  const parts = normalized.split("/").filter(Boolean);
  for (let i = parts.length - 2; i >= 0; i--) {
    const m = parts[i].match(PIECE_RE);
    if (m) {
      return {
        personCode: m[1],
        serialNo: `${m[1]}-L${m[2]}`,
        pageNo: 0,
        fileName: base,
        relativePath: normalized,
      };
    }
  }

  return null;
}

export function groupParsedPages(pages: ParsedPage[]) {
  const bySerial = new Map<string, ParsedPage[]>();
  for (const p of pages) {
    const list = bySerial.get(p.serialNo) || [];
    list.push(p);
    bySerial.set(p.serialNo, list);
  }

  const pieces: Array<{
    personCode: string;
    serialNo: string;
    pages: ParsedPage[];
  }> = [];

  for (const [serialNo, list] of bySerial) {
    const sorted = [...list].sort((a, b) => {
      if (a.pageNo && b.pageNo) return a.pageNo - b.pageNo;
      return a.fileName.localeCompare(b.fileName, "zh-CN", { numeric: true });
    });
    // 补全未解析出的页号
    sorted.forEach((p, i) => {
      if (!p.pageNo) p.pageNo = i + 1;
    });
    pieces.push({
      personCode: sorted[0].personCode,
      serialNo,
      pages: sorted,
    });
  }

  pieces.sort((a, b) => a.serialNo.localeCompare(b.serialNo, "zh-CN", { numeric: true }));
  return pieces;
}

/** UI 短分类号：9-1 / 4-1 / 5 */
export const CATEGORY_SHORT: Record<string, string> = {
  "0100": "1",
  "0200": "2",
  "0300": "3",
  "0401": "4-1",
  "0402": "4-2",
  "0403": "4-3",
  "0404": "4-4",
  "0500": "5",
  "0600": "6",
  "0700": "7",
  "0800": "8",
  "0901": "9-1",
  "0902": "9-2",
  "0903": "9-3",
  "0904": "9-4",
  "1000": "10",
};

export function categoryTagColor(code?: string): string {
  const colors: Record<string, string> = {
    "01": "bg-[#2563eb]", "02": "bg-[#7c3aed]", "03": "bg-[#0891b2]",
    "04": "bg-[#16a34a]", "05": "bg-[#d97706]", "06": "bg-[#dc2626]",
    "07": "bg-[#db2777]", "08": "bg-[#92400e]", "09": "bg-[#4f46e5]",
    "10": "bg-[#475569]",
  };
  return colors[(code || "").slice(0, 2)] || "bg-[#94a3b8]";
}
