import { S3Client } from "@aws-sdk/client-s3";

export const s3Client = new S3Client({
  endpoint: process.env.COZE_STORAGE_URL,
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.COZE_STORAGE_AK || "",
    secretAccessKey: process.env.COZE_STORAGE_SK || "",
  },
  forcePathStyle: true,
});

export const BUCKET_NAME = process.env.COZE_STORAGE_BUCKET || "";

export function hasStorage() {
  return Boolean(
    process.env.COZE_STORAGE_URL &&
      process.env.COZE_STORAGE_AK &&
      process.env.COZE_STORAGE_SK &&
      process.env.COZE_STORAGE_BUCKET
  );
}
