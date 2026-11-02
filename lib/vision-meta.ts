/**
 * 整编/审核共用：材料题名与形成日期解析
 * 日期规则：通读材料中出现的全部日期，取最后一个作为形成日期
 */

export type VisionExtractResult = {
  materialName?: string;
  formDate?: string;
  summary?: string;
  /** 解析过程中收集到的全部日期（出现顺序） */
  dates?: string[];
  raw?: string;
};

/** 合并多次单页识别：题名优先首页，形成日期取全部日期中的最后一个 */
export function mergeVisionMeta(
  parts: VisionExtractResult[]
): VisionExtractResult {
  let materialName: string | undefined;
  let summary: string | undefined;
  const dates: string[] = [];
  const raws: string[] = [];
  for (const p of parts) {
    if (p.materialName && !materialName) materialName = p.materialName;
    if (p.summary && !summary) summary = p.summary;
    if (p.dates?.length) {
      for (const d of p.dates) {
        if (d && !dates.includes(d)) dates.push(d);
      }
    } else if (p.formDate && !dates.includes(p.formDate)) {
      dates.push(p.formDate);
    }
    if (p.raw) raws.push(p.raw);
  }
  return {
    materialName,
    formDate: pickLastDate(dates),
    summary,
    dates,
    raw: raws.join("\n").slice(0, 4000),
  };
}

const DATE_RE =
  /(\d{4})\s*[年./\-]\s*(\d{1,2})\s*[月./\-]\s*(\d{1,2})\s*日?/g;

export function normalizeOneDate(input: string): string | null {
  const s = String(input || "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/(\d{4})[年./-](\d{1,2})[月./-](\d{1,2})/);
  if (!m) return null;
  const y = m[1];
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** 从文本中按出现顺序抽出全部可解析日期 */
export function extractAllDates(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const src = String(text || "");
  DATE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = DATE_RE.exec(src))) {
    const n = normalizeOneDate(`${m[1]}-${m[2]}-${m[3]}`);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

/** 取列表中最后一个日期；无则 undefined */
export function pickLastDate(dates: string[]): string | undefined {
  for (let i = dates.length - 1; i >= 0; i--) {
    const n = normalizeOneDate(dates[i]);
    if (n) return n;
  }
  return undefined;
}

export function looksLikeFileName(name: string) {
  const s = (name || "").trim();
  if (!s) return false;
  if (/\.(jpe?g|png|gif|webp|pdf|tif{1,2})$/i.test(s)) return true;
  if (/[/\\]/.test(s)) return true;
  return false;
}

export function looksLikePlaceholderName(name: string, serialNo = "") {
  const s = (name || "").trim();
  if (!s) return true;
  if (serialNo && s === serialNo) return true;
  if (/^\d{4,}-L\d+/i.test(s)) return true;
  if (/^档案材料\s*\d+/i.test(s)) return true;
  if (looksLikeFileName(s)) return true;
  return false;
}

export const ARCHIVE_META_PROMPT = `你是干部人事档案材料识别助手。请完整阅读下列扫描件（同一件材料，已按页序排列；可能多张），只提取字段，严格输出一行 JSON，不要 Markdown，不要其它说明：
{"materialName":"材料题名","dates":["按出现顺序的全部日期"],"formDate":"最后一个日期","summary":"不超过30字的摘要"}

规则：
- materialName：读材料正文的题名/表名（如「干部履历表」「中国共产主义青年团入团志愿书」），不要用文件名、流水号、页码
- dates：通读所给全部页面，按出现先后列出所有日期（填表、落款、批准、印发等），格式 YYYY-MM-DD；没有则 []
- formDate：取 dates 中的最后一个；dates 为空则 ""
- 禁止编造看不到的内容`;

export function parseArchiveMetaJson(text: string): VisionExtractResult {
  const raw = text.trim();
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) {
    const fallbackDates = extractAllDates(raw);
    return {
      formDate: pickLastDate(fallbackDates),
      raw,
    };
  }
  try {
    const obj = JSON.parse(m[0]) as Record<string, unknown>;
    let materialName = String(obj.materialName || obj.material_name || "")
      .trim()
      .replace(/\s+/g, "");
    if (looksLikeFileName(materialName)) materialName = "";

    const datesFromArr: string[] = [];
    const arr = obj.dates;
    if (Array.isArray(arr)) {
      for (const item of arr) {
        const n = normalizeOneDate(String(item));
        if (n) datesFromArr.push(n);
      }
    }

    const fromForm = normalizeOneDate(
      String(obj.formDate || obj.form_date || "")
    );
    const fromRaw = extractAllDates(raw);
    const all = [...datesFromArr];
    for (const d of fromRaw) {
      if (!all.includes(d)) all.push(d);
    }
    if (fromForm && !all.includes(fromForm)) all.push(fromForm);

    const formDate = pickLastDate(all) || fromForm || undefined;
    const summary = String(obj.summary || "")
      .trim()
      .slice(0, 80);

    return {
      materialName: materialName || undefined,
      formDate,
      dates: all.length ? all : undefined,
      summary: summary || undefined,
      raw,
    };
  } catch {
    const fallback = extractAllDates(raw);
    return {
      formDate: pickLastDate(fallback),
      dates: fallback.length ? fallback : undefined,
      raw,
    };
  }
}
