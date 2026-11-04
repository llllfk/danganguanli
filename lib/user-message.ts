/** Present useful service failures without showing deployment/provider details in business pages. */
export function userMessage(message: string) {
  if (/COZE_[A-Z_]+|POLICY_DATASET_ID|VISION_BOT_ID|API_TOKEN|workload.identity/i.test(message)) {
    return "服务配置暂不可用，请联系管理员检查后重试。";
  }
  return message.replace(/Coze\s*S3/gi, "文件存储")
    .replace(/coze|扣子/gi, "服务").replace(/本地库兜底/g, "知识库检索");
}
