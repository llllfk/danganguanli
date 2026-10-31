/** 审核有序档案件页命名：人员代码-分类号-件号-页号.jpg */

export type ParsedOrderedPage = {
  personCode: string;
  categoryCode: string;
  pieceSeq: string;
  formalNo: string;
  pageNo: number;
  fileName: string;
  relativePath: string;
};

/** 00001-0401-001-001.jpg */
const PAGE_RE = /(\d{4,})-(\d{4})-(\d{3,})-(\d{3,})/i;
/** 00001-0401-001.jpg（单页件） */
const PIECE_RE = /(\d{4,})-(\d{4})-(\d{3,})(?!\d)/i;

export function parseOrderedPagePath(
  relativePath: string
): ParsedOrderedPage | null {
  const normalized = relativePath.replace(/\\/g, "/");
  const base = normalized.split("/").pop() || normalized;
  if (!/\.jpe?g$/i.test(base)) return null;

  const pageMatch = base.match(PAGE_RE) || normalized.match(PAGE_RE);
  if (pageMatch) {
    const personCode = pageMatch[1];
    const categoryCode = pageMatch[2];
    const pieceSeq = pageMatch[3];
    return {
      personCode,
      categoryCode: categoryCode === "1001" ? "1000" : categoryCode,
      pieceSeq,
      formalNo: `${personCode}-${categoryCode}-${pieceSeq}`,
      pageNo: parseInt(pageMatch[4], 10),
      fileName: base,
      relativePath: normalized,
    };
  }

  const pieceMatch = base.match(PIECE_RE) || normalized.match(PIECE_RE);
  if (pieceMatch) {
    const personCode = pieceMatch[1];
    const categoryCode = pieceMatch[2];
    const pieceSeq = pieceMatch[3];
    return {
      personCode,
      categoryCode: categoryCode === "1001" ? "1000" : categoryCode,
      pieceSeq,
      formalNo: `${personCode}-${categoryCode}-${pieceSeq}`,
      pageNo: 1,
      fileName: base,
      relativePath: normalized,
    };
  }

  return null;
}

export function groupOrderedPages(pages: ParsedOrderedPage[]) {
  const byFormal = new Map<string, ParsedOrderedPage[]>();
  for (const p of pages) {
    const list = byFormal.get(p.formalNo) || [];
    list.push(p);
    byFormal.set(p.formalNo, list);
  }

  const pieces: Array<{
    personCode: string;
    categoryCode: string;
    formalNo: string;
    pages: ParsedOrderedPage[];
  }> = [];

  for (const [formalNo, list] of byFormal) {
    const sorted = [...list].sort((a, b) => a.pageNo - b.pageNo);
    pieces.push({
      personCode: sorted[0].personCode,
      categoryCode: sorted[0].categoryCode,
      formalNo,
      pages: sorted,
    });
  }

  pieces.sort((a, b) =>
    a.formalNo.localeCompare(b.formalNo, "zh-CN", { numeric: true })
  );
  return pieces;
}

/** 用件号后缀匹配种子目录（忽略人员代码前缀） */
export function formalSuffix(formalNo: string) {
  const parts = formalNo.split("-");
  if (parts.length >= 3) return parts.slice(1).join("-");
  return formalNo;
}
