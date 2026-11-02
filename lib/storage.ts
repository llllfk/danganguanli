import fs from "fs/promises";
import path from "path";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

/**
 * 扣子编程对象存储（官方自动注入）：
 * - COZE_BUCKET_ENDPOINT_URL
 * - COZE_BUCKET_NAME
 * 鉴权走 workload identity → 请求头 x-storage-token（无需 AK/SK）
 *
 * 兼容旧名 / 自建 S3：
 * - COZE_STORAGE_URL / COZE_STORAGE_AK / COZE_STORAGE_SK / COZE_STORAGE_BUCKET
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
  /** 扣子桶模式：有官方 endpoint/bucket 注入，或运行在扣子环境 */
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
let _tokenCache: { token: string; expireAt: number } | null = null;

export function hasStorage() {
  const e = storageEnv();
  if (!e.endpoint || !e.bucket) return false;
  // 扣子：endpoint + bucket 即可（x-storage-token）
  if (e.cozeBucketMode) return true;
  // 自建 S3：需要 AK/SK
  return Boolean(e.accessKeyId && e.secretAccessKey);
}

/**
 * 扣子 / ByteFaaS 运行时：只读工作区，禁止 mkdir data/uploads。
 */
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
    process.env.COZE_BUCKET_NAME
  ) {
    return true;
  }

  const cwd = process.cwd().replace(/\\/g, "/");
  if (cwd.includes("/opt/bytefaas") || cwd.startsWith("/var/task")) {
    return true;
  }
  return false;
}

/** 当前写存储后端：s3 | local */
export function resolveWriteBackend(): "s3" | "local" {
  if (hasStorage()) return "s3";
  if (isCozeRuntime()) {
    throw new Error(
      "当前为扣子运行环境，但未检测到对象存储注入（需 COZE_BUCKET_ENDPOINT_URL / COZE_BUCKET_NAME）。请在扣子编程中为项目开通对象存储后重新部署。"
    );
  }
  return "local";
}

export function localUploadRoot() {
  return path.join(process.cwd(), "data", "uploads");
}

export function getBucket() {
  return storageEnv().bucket;
}

/** 解析扣子 x-storage-token */
async function getCozeStorageToken(): Promise<string> {
  const now = Date.now();
  if (_tokenCache && _tokenCache.expireAt > now + 30_000) {
    return _tokenCache.token;
  }

  const ready = firstEnv(
    "COZE_WORKLOAD_IDENTITY_TOKEN",
    "COZE_ACCESS_TOKEN",
    "COZE_STORAGE_TOKEN"
  );
  if (ready) {
    _tokenCache = { token: ready, expireAt: now + 10 * 60_000 };
    return ready;
  }

  const clientId = firstEnv("COZE_WORKLOAD_IDENTITY_CLIENT_ID");
  const clientSecret = firstEnv("COZE_WORKLOAD_IDENTITY_CLIENT_SECRET");
  const idTokenEndpoint = firstEnv("COZE_WORKLOAD_IDENTITY_TOKEN_ENDPOINT");
  const accessTokenEndpoint = firstEnv("COZE_WORKLOAD_ACCESS_TOKEN_ENDPOINT");

  if (!clientId || !clientSecret || !idTokenEndpoint || !accessTokenEndpoint) {
    return "";
  }

  try {
    // 1) 取 ID Token
    const idRes = await fetch(idTokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "client_credentials",
      }),
    });
    const idJson = (await idRes.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const idToken =
      (idJson.id_token as string) ||
      (idJson.token as string) ||
      (idJson.access_token as string) ||
      "";
    if (!idToken) {
      console.warn("coze workload id token empty", idRes.status, idJson);
      return "";
    }

    // 2) 换 Access Token（用作 x-storage-token）
    const atRes = await fetch(accessTokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        id_token: idToken,
        grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      }),
    });
    const atJson = (await atRes.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const accessToken =
      (atJson.access_token as string) ||
      (atJson.token as string) ||
      (atJson.data as { access_token?: string } | undefined)?.access_token ||
      "";
    if (!accessToken) {
      console.warn("coze workload access token empty", atRes.status, atJson);
      return "";
    }

    const expiresIn = Number(atJson.expires_in || 600);
    _tokenCache = {
      token: accessToken,
      expireAt: now + Math.max(60, expiresIn - 30) * 1000,
    };
    return accessToken;
  } catch (e) {
    console.warn("coze storage token fetch failed", e);
    return "";
  }
}

export function getS3Client() {
  if (!hasStorage()) {
    throw new Error(
      "未配置对象存储（扣子需 COZE_BUCKET_ENDPOINT_URL / COZE_BUCKET_NAME；自建 S3 另需 COZE_STORAGE_AK/SK）"
    );
  }
  if (!_client) {
    const e = storageEnv();
    const client = new S3Client({
      endpoint: e.endpoint,
      region: e.region,
      credentials: {
        // 扣子忽略 AK/SK，用 x-storage-token；自建 S3 用真实密钥
        accessKeyId: e.accessKeyId || "coze",
        secretAccessKey: e.secretAccessKey || "coze",
      },
      forcePathStyle: true,
    });

    if (e.cozeBucketMode) {
      client.middlewareStack.add(
        (next) => async (args) => {
          const token = await getCozeStorageToken();
          if (token) {
            const req = args.request as {
              headers?: Record<string, string>;
            };
            req.headers = {
              ...(req.headers || {}),
              "x-storage-token": token,
            };
          }
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

/** 库内 file_path 约定：s3://{bucket}/{key}；本地为绝对路径 */
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

  const abs = path.isAbsolute(filePathOrKey)
    ? filePathOrKey
    : path.join(localUploadRoot(), filePathOrKey.replace(/^\/+/, ""));
  return fs.readFile(abs);
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

/** 诊断用：不回传密钥 */
export function storageDiagnostics() {
  const e = storageEnv();
  return {
    hasStorage: hasStorage(),
    cozeRuntime: isCozeRuntime(),
    cozeBucketMode: e.cozeBucketMode,
    hasEndpoint: Boolean(e.endpoint),
    hasBucket: Boolean(e.bucket),
    hasAkSk: Boolean(e.accessKeyId && e.secretAccessKey),
    endpointSource: process.env.COZE_BUCKET_ENDPOINT_URL
      ? "COZE_BUCKET_ENDPOINT_URL"
      : process.env.COZE_STORAGE_URL
        ? "COZE_STORAGE_URL"
        : "",
    bucketSource: process.env.COZE_BUCKET_NAME
      ? "COZE_BUCKET_NAME"
      : process.env.COZE_STORAGE_BUCKET
        ? "COZE_STORAGE_BUCKET"
        : "",
  };
}
