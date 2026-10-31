/** 中国大陆手机号：1 开头，第二位 3-9，共 11 位 */
const CN_MOBILE = /^1[3-9]\d{9}$/;

export function normalizePhone(input: string): string {
  return String(input || "")
    .trim()
    .replace(/[\s\-()+]/g, "");
}

export function isValidCnMobile(input: string): boolean {
  return CN_MOBILE.test(normalizePhone(input));
}

export function assertCnMobile(input: string): string {
  const phone = normalizePhone(input);
  if (!phone) throw new Error("请输入手机号");
  if (!CN_MOBILE.test(phone)) {
    throw new Error("手机号格式不正确（需为11位中国大陆手机号）");
  }
  return phone;
}
