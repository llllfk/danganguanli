import fs from "fs/promises";
import path from "path";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

/** 扣子编程会自动注入：COZE_STORAGE_URL / AK / SK / BUCKET */
/** 本地未配置时，上传落到 data/uploads，file_path 记绝对路径 */

function storageEnv() {
  return {
    endpoint: process.env.COZE_STORAGE_URL || "",
    accessKeyId: process.env.COZE_STORAGE_AK || "",
    secretAccessKey: process.env.COZE_STORAGE_SK || "",
    bucket: process.env.COZE_STORAGE_BUCKET || "",
  };
}

let _client: S3Client | null = null;

export function hasStorage() {
  const e = storageEnv();
  return Boolean(e.endpoint && e.accessKeyId && e.secretAccessKey && e.bucket);
}

/**
 * 扣子 / ByteFaaS 运行时：只读工作区，禁止 mkdir data/uploads。
 * 可通过 COZE_RUNTIME=1 强制；或根据 cwd / BYTEFAAS_* 自动识别。
 */
export function isCozeRuntime() {
  const flag = (process.env.COZE_RUNTIME || "").trim().toLowerCase();
  if (flag === "1" || flag === "true" || flag === "yes") return true;
  if (flag === "0" || flag === "false" || flag === "no") return false;

  if (
    process.env.BYTEFAAS_POD_NAME ||
    process.env.BYTEFAAS_FUNC_NAME ||
    process.env.BYTEFAAS_RUNTIME ||
    process.env.COZE_WORKSPACE_PATH
  ) {
    return true;
  }

  const cwd = process.cwd().replace(/\\/g, "/");
  if (cwd.includes("/opt/bytefaas") || cwd.startsWith("/var/task")) {
    return true;
  }
  return false;
}

/** 当前写存储后端：s3 | local；扣子未配 S3 时直接抛错 */
export function resolveWriteBackend(): "s3" | "local" {
  if (hasStorage()) return "s3";
  if (isCozeRuntime()) {
    throw new Error(
      "当前为扣子运行环境，本地磁盘不可写。请在应用环境变量中配置 COZE_STORAGE_URL / COZE_STORAGE_AK / COZE_STORAGE_SK / COZE_STORAGE_BUCKET（扣子编程通常自动注入对象存储）。"
    );
  }
  return "local";
}

/** 本地上传根目录（相对项目） */
export function localUploadRoot() {
  return path.join(process.cwd(), "data", "uploads");
}

export function getBucket() {
  return storageEnv().bucket;
}

export function getS3Client() {
  if (!hasStorage()) {
    throw new Error(
      "未配置对象存储（需 COZE_STORAGE_URL / COZE_STORAGE_AK / COZE_STORAGE_SK / COZE_STORAGE_BUCKET）"
    );
  }
  if (!_client) {
    const e = storageEnv();
    _client = new S3Client({
      endpoint: e.endpoint,
      region: process.env.COZE_STORAGE_REGION || "us-east-1",
      credentials: {
        accessKeyId: e.accessKeyId,
        secretAccessKey: e.secretAccessKey,
      },
      forcePathStyle: true,
    });
  }
  return _client;
}

/** 库内 file_path 约定：s3://{bucket}/{key}；本地为绝对路径 */
export function toS3Path(key: string) {
  return `s3://${getBucket()}/${key.replace(/^\/+/, "")}`;
}

export function parseS3Path(filePath: string): { bucket: string; key: string } | null {
  const m = String(filePath || "").match(/^s3:\/\/([^/]+)\/(.+)$/);
  if (!m) return null;
  return { bucket: m[1], key: m[2] };
}

export function isS3Path(filePath: string | null | undefined) {
  return !!parseS3Path(filePath || "");
}

export async function putObject(params: {
  key: string;
  body: Buffer | Uint8Array;
  contentType?: string;
}) {
  const key = params.key.replace(/^\/+/, "").replace(/\\/g, "/");
  const backend = resolveWriteBackend();

  if (backend === "s3") {
    const client = getS3Client();
    const bucket = getBucket();
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: params.body,
        ContentType: params.contentType || "application/octet-stream",
      })
    );
    return toS3Path(key);
  }

  // 本地开发：写磁盘，返回绝对路径供 page-image 读取
  const abs = path.join(localUploadRoot(), ...key.split("/"));
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, params.body);
  return abs;
}

export async function getObjectBytes(filePathOrKey: string): Promise<Buffer> {
  const parsed = parseS3Path(filePathOrKey);
  if (parsed) {
    if (!hasStorage()) {
      throw new Error("文件在对象存储中，但当前环境未注入存储凭证");
    }
    const client = getS3Client();
    const res = await client.send(
      new GetObjectCommand({
        Bucket: parsed.bucket,
        Key: parsed.key,
      })
    );
    const stream = res.Body;
    if (!stream) throw new Error("对象为空");
    const bytes = await stream.transformToByteArray();
    return Buffer.from(bytes);
  }

  // 本地绝对路径或相对 data/uploads 的 key
  const abs = path.isAbsolute(filePathOrKey)
    ? filePathOrKey
    : path.join(localUploadRoot(), filePathOrKey.replace(/^\/+/, ""));
  return fs.readFile(abs);
}

/** 档案页对象键 */
export function archiveObjectKey(
  personCode: string,
  serialNo: string,
  fileName: string
) {
  return `archive/${personCode}/${serialNo}/${fileName}`.replace(/\\/g, "/");
}

/** 审核有序件对象键（扣子 S3 自动注入凭证时写入同一桶） */
export function auditObjectKey(
  personCode: string,
  formalNo: string,
  fileName: string
) {
  return `audit/${personCode}/${formalNo}/${fileName}`.replace(/\\/g, "/");
}
