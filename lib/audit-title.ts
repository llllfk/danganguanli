import { looksLikePlaceholderName } from "@/lib/vision-meta";

/** Only this version's cache contains titles read from the actual audit images. */
export const AUDIT_VISION_SOURCE = "audit-vision-v3";

export function cleanAuditTitle(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const title = value.trim().replace(/\s+/g, " ");
  if (
    !title ||
    looksLikePlaceholderName(title) ||
    /^(?:未识别(?:题名|材料)?|未检出|未命名|不详|未知|无法识别|无法判断|无法读取|未能识别|看不清|不明确|无|无标题|题名不详|材料题名|材料正文题名|材料名称|unknown|null|undefined)$/i.test(title)
  ) return undefined;
  return title;
}
