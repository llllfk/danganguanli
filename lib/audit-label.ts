import { looksLikePlaceholderName } from "@/lib/vision-meta";

/** 审核列表按件显示题名和正式件号，不逐页展开图片编号。 */
export function auditMaterialLabel(materialName: string, materialNo = "") {
  const title = materialName && !looksLikePlaceholderName(materialName, materialNo)
    ? materialName : "";
  return [title && title !== materialNo ? title : "", materialNo]
    .filter(Boolean).join(" ");
}
