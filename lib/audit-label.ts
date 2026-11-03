import { looksLikePlaceholderName } from "@/lib/vision-meta";

/** 题名后显示真实扫描图片名（省略扩展名），不根据件号猜页号。 */
export function auditMaterialLabel(
  materialName: string,
  imageNames: string[] = [],
  materialNo = ""
) {
  const images = [...new Set(imageNames.map((name) =>
    name.split(/[/\\]/).pop()!.replace(/\.(jpe?g|png|webp|tiff?)$/i, "")
  ).filter(Boolean))];
  const ref = images.length ? images.join("、") : materialNo;
  const title = materialName && !looksLikePlaceholderName(materialName, materialNo)
    ? materialName : "";
  return [title && title !== ref ? title : "", ref]
    .filter(Boolean).join(" ");
}
