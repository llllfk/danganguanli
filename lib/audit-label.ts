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
  return [materialName && materialName !== ref ? materialName : "", ref]
    .filter(Boolean).join(" ");
}
