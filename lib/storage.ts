import fs from "fs/promises";
import path from "path";
import {
  GetObjectCommand,
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Client as CozeWorkloadClient } from "@coze/workload-identity";

/**
 * 扣子对象存储接入（对齐官方文档）：
 * - 环境变量自动注入：COZE_BUCKET_ENDPOINT_URL / COZE_BUCKET_NAME
 * - access_key / secret_key：留空即可（文档明确无需填写）
 * - 鉴权：SDK 用 workload identity 取 token，请求头注入 x-storage-token
 *   （业务侧不用手填 token；扣子运行时会注入 CLIENT_ID/SECRET/端点）
 *
 * 本地开发无桶时：落到 data/uploads
 * 自建 S3：仍可用 COZE_STORAGE_URL + AK/SK/BUCKET
 */

function firstEnv(...keys: string[]) {
  for (const k of keys) {
    const v = (process.env[k] || "").trim();
    if (v) return v;
  }
  return "";
}

function storageEnv() {
  const endpoint = firstEnv(
    "COZE_BUCKET_ENDPOINT_URL",
    "COZE_STORAGE_URL"
  );
  const bucket = firstEnv("COZE_BUCKET_NAME", "COZE_STORAGE_BUCKET");
  const accessKeyId = firstEnv("COZE_STORAGE_AK", "AWS_ACCESS_KEY_ID");
  const secretAccessKey = firstEnv(
    "COZE_STORAGE_SK",
    "AWS_SECRET_ACCESS_KEY"
  );
  const cozeBucketMode = Boolean(
    process.env.COZE_BUCKET_ENDPOINT_URL ||
      process.env.COZE_BUCKET_NAME ||
      isCozeRuntime()
  );
  return {
    endpoint,
    bucket,
    accessKeyId,
    secretAccessKey,
    cozeBucketMode,
    region:
      firstEnv("COZE_STORAGE_REGION", "AWS_REGION", "COZE_BUCKET_REGION") ||
      "cn-beijing",
  };
}

let _client: S3Client | null = null;
let _resolvedEndpoint = "";
let _resolvedBucket = "";

export function hasStorage() {
  const e = storageEnv();
  if (e.endpoint && e.bucket) {
    if (e.cozeBucketMode) return true;
    return Boolean(e.accessKeyId && e.secretAccessKey);
  }
  // 扣子环境：端点可能仅在项目环境变量服务中，运行时再 resolve
  return e.cozeBucketMode;
}

export function isCozeRuntime() {
  const flag = (process.env.COZE_RUNTIME || "").trim().toLowerCase();
  if (flag === "1" || flag === "true" || flag === "yes") return true;
  if (flag === "0" || flag === "false" || flag === "no") return false;

  if (
    process.env.BYTEFAAS_POD_NAME ||
    process.env.BYTEFAAS_FUNC_NAME ||
    process.env.BYTEFAAS_RUNTIME ||
    process.env.COZE_WORKSPACE_PATH ||
    process.env.COZE_BUCKET_ENDPOINT_URL ||
    process.env.COZE_BUCKET_NAME ||
    process.env.COZE_WORKLOAD_IDENTITY_CLIENT_ID
  ) {
    return true;
  }

  const cwd = process.cwd().replace(/\\/g, "/");
  if (cwd.includes("/opt/bytefaas") || cwd.startsWith("/var/task")) {
    return true;
  }
  return false;
}

export function resolveWriteBackend(): "s3" | "local" {
  if (hasStorage()) return "s3";
  if (isCozeRuntime()) {
    throw new Error(
      "当前为扣子运行环境，但未检测到对象存储。请在扣子编程为项目开通对象存储后重新部署（平台会注入 COZE_BUCKET_ENDPOINT_URL / COZE_BUCKET_NAME）。"
    );
  }
  return "local";
}

export function localUploadRoot() {
  return path.join(process.cwd(), "data", "uploads");
}

export function getBucket() {
  return _resolvedBucket || storageEnv().bucket;
}

/**
 * 官方方式取 x-storage-token：
 * @coze/workload-identity → Client.getAccessToken()
 * 对应 Python：coze_workload_identity.Client().get_access_token()
 */
async function getCozeStorageToken(): Promise<string> {
  const client = new CozeWorkloadClient();
  try {
    const token = await client.getAccessToken();
    if (!token) {
      throw new Error("workload identity 返回空 token");
    }
    return token;
  } finally {
    await client.close().catch(() => undefined);
  }
}

/** 端点/桶名：优先进程环境变量；缺失时按文档从项目环境变量服务补齐 */
async function resolveCozeBucketConfig(): Promise<{
  endpoint: string;
  bucket: string;
}> {
  let endpoint = firstEnv("COZE_BUCKET_ENDPOINT_URL", "COZE_STORAGE_URL");
  let bucket = firstEnv("COZE_BUCKET_NAME", "COZE_STORAGE_BUCKET");
  if (endpoint && bucket) {
    _resolvedEndpoint = endpoint;
    _resolvedBucket = bucket;
    return { endpoint, bucket };
  }

  try {
    const client = new CozeWorkloadClient();
    try {
      const envVars = await client.getProjectEnvVars();
      endpoint =
        endpoint ||
        envVars.get("COZE_BUCKET_ENDPOINT_URL") ||
        envVars.get("COZE_STORAGE_URL") ||
        "";
      bucket =
        bucket ||
        envVars.get("COZE_BUCKET_NAME") ||
        envVars.get("COZE_STORAGE_BUCKET") ||
        "";
    } finally {
      await client.close().catch(() => undefined);
    }
  } catch (e) {
    console.warn("resolve coze bucket via project env failed", e);
  }

  if (!endpoint || !bucket) {
    throw new Error(
      "未配置存储端点/桶名：请确认项目已开通对象存储（COZE_BUCKET_ENDPOINT_URL / COZE_BUCKET_NAME）。"
    );
  }
  _resolvedEndpoint = endpoint;
  _resolvedBucket = bucket;
  return { endpoint, bucket };
}

export function getS3Client() {
  const e = storageEnv();
  if (!_client) {
    const endpoint = e.endpoint || _resolvedEndpoint || "https://placeholder";
    const client = new S3Client({
      endpoint,
      region: e.region,
      credentials: {
        // 文档：扣子无需 AK/SK，填占位即可；自建 S3 用真实密钥
        accessKeyId: e.accessKeyId || "coze",
        secretAccessKey: e.secretAccessKey || "coze",
      },
      forcePathStyle: true,
    });

    if (e.cozeBucketMode) {
      client.middlewareStack.add(
        (next) => async (args) => {
          const token = await getCozeStorageToken();
          const req = args.request as { headers?: Record<string, string> };
          req.headers = {
            ...(req.headers || {}),
            "x-storage-token": token,
          };
          return next(args);
        },
        {
          step: "build",
          name: "injectCozeStorageToken",
          priority: "high",
        }
      );
    }

    _client = client;
  }
  return _client;
}

/** 库内 file_path：s3://{bucket}/{key}；本地为绝对路径 */
export function toS3Path(key: string) {
  return `s3://${getBucket()}/${key.replace(/^\/+/, "")}`;
}

export function parseS3Path(
  filePath: string
): { bucket: string; key: string } | null {
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
    const e = storageEnv();
    if (e.cozeBucketMode) {
      await resolveCozeBucketConfig();
      // endpoint 可能是运行时才解析到的，重建 client
      _client = null;
    } else if (!e.endpoint || !e.bucket) {
      throw new Error("未配置对象存储端点或桶名");
    }

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

  const abs = path.join(localUploadRoot(), ...key.split("/"));
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, params.body);
  return abs;
}

export async function getObjectBytes(filePathOrKey: string): Promise<Buffer> {
  const parsed = parseS3Path(filePathOrKey);
  if (parsed) {
    const e = storageEnv();
    if (e.cozeBucketMode) {
      await resolveCozeBucketConfig();
      _client = null;
    } else if (!hasStorage()) {
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

  const abs = path.isAbsolute(filePathOrKey)
    ? filePathOrKey
    : path.join(localUploadRoot(), filePathOrKey.replace(/^\/+/, ""));
  return fs.readFile(abs);
}

/** Delete only this person's uploaded copy; original requirement/sample sources are references. */
export async function deletePersonUpload(
  filePath: string,
  personCode: string
): Promise<"deleted" | "reference"> {
  const parsed = parseS3Path(filePath);
  if (parsed) {
    if (![`archive/${personCode}/`, `audit/${personCode}/`].some((prefix) => parsed.key.startsWith(prefix))) {
      throw new Error("文件路径不属于该人员的上传目录");
    }
    const env = storageEnv();
    if (env.cozeBucketMode) {
      await resolveCozeBucketConfig();
      _client = null;
    }
    if (parsed.bucket !== getBucket()) throw new Error("当前存储配置与文件所在桶不一致");
    await getS3Client().send(new DeleteObjectCommand({ Bucket: parsed.bucket, Key: parsed.key }));
    return "deleted";
  }
  const root = path.resolve(localUploadRoot());
  const target = path.isAbsolute(filePath) ? path.resolve(filePath) : path.resolve(root, filePath);
  const relative = path.relative(root, target);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    return "reference";
  }
  const segments = relative.split(path.sep);
  if (!["archive", "audit"].includes(segments[0]) || segments[1] !== personCode || segments.length < 4) {
    throw new Error("文件路径不属于该人员的上传目录");
  }
  try {
    const [realRoot, realTarget] = await Promise.all([fs.realpath(root), fs.realpath(target)]);
    const realRelative = path.relative(realRoot, realTarget);
    if (realRelative === ".." || realRelative.startsWith(`..${path.sep}`) || path.isAbsolute(realRelative)) {
      throw new Error("上传文件指向上传目录之外");
    }
    await fs.unlink(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return "deleted";
}

export function archiveObjectKey(
  personCode: string,
  serialNo: string,
  fileName: string
) {
  return `archive/${personCode}/${serialNo}/${fileName}`.replace(/\\/g, "/");
}

export function auditObjectKey(
  personCode: string,
  formalNo: string,
  fileName: string
) {
  return `audit/${personCode}/${formalNo}/${fileName}`.replace(/\\/g, "/");
}

export function storageDiagnostics() {
  const e = storageEnv();
  return {
    hasStorage: hasStorage(),
    cozeRuntime: isCozeRuntime(),
    cozeBucketMode: e.cozeBucketMode,
    hasEndpoint: Boolean(e.endpoint || _resolvedEndpoint),
    hasBucket: Boolean(e.bucket || _resolvedBucket),
    hasAkSk: Boolean(e.accessKeyId && e.secretAccessKey),
    hasWorkloadIdentity: Boolean(
      process.env.COZE_WORKLOAD_IDENTITY_CLIENT_ID
    ),
    endpointSource: process.env.COZE_BUCKET_ENDPOINT_URL
      ? "COZE_BUCKET_ENDPOINT_URL"
      : process.env.COZE_STORAGE_URL
        ? "COZE_STORAGE_URL"
        : _resolvedEndpoint
          ? "project_env"
          : "",
    bucketSource: process.env.COZE_BUCKET_NAME
      ? "COZE_BUCKET_NAME"
      : process.env.COZE_STORAGE_BUCKET
        ? "COZE_STORAGE_BUCKET"
        : _resolvedBucket
          ? "project_env"
          : "",
  };
}
