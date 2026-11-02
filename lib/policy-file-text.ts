import JSZip from "jszip";

/** 从上传字节尽量抽出纯文本，供本地 policy_documents 检索兜底 */
export async function extractPolicyText(
  bytes: Buffer,
  fileType: string
): Promise<string> {
  const t = fileType.replace(/^\./, "").toLowerCase();
  if (t === "txt" || t === "md" || t === "csv") {
    return bytes.toString("utf8");
  }
  if (t === "docx") {
    try {
      const zip = await JSZip.loadAsync(bytes);
      const xml = await zip.file("word/document.xml")?.async("string");
      if (!xml) return "";
      return xml
        .replace(/<\/w:p>/g, "\n")
        .replace(/<w:tab\/>/g, "\t")
        .replace(/<[^>]+>/g, "")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    } catch {
      return "";
    }
  }
  return "";
}

export function guessFileType(name: string, mime?: string) {
  const m = (name || "").toLowerCase().match(/\.([a-z0-9]+)$/);
  if (m) return m[1];
  if (mime?.includes("pdf")) return "pdf";
  if (mime?.includes("word")) return "docx";
  if (mime?.includes("text")) return "txt";
  return "txt";
}
