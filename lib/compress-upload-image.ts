/** 档案扫描件上传前压缩：保留原始像素尺寸，避免缩图影响细小文字识别。 */
export async function compressUploadImage(file: File): Promise<File> {
  // ZIP 不在浏览器解包；小图片避免重复有损编码。
  if (!/\.jpe?g$/i.test(file.name) || file.size <= 1024 * 1024) return file;

  const url = URL.createObjectURL(file);
  const canvas = document.createElement("canvas");
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("图片解码失败"));
      img.src = url;
    });
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(image, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.85);
    });
    // 编码失败或未节省体积时使用原图，避免压缩本身阻断上传。
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name, {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(url);
    canvas.width = 0;
    canvas.height = 0;
  }
}
