/**
 * 扣子知识库文档 CRUD
 * POST /open_api/knowledge/document/{list,create,update,delete}
 *
 * 自定义环境变量（扣子勿用 COZE_ 前缀）：
 *   API_TOKEN / POLICY_DATASET_ID
 * 本地仍可兼容 COZE_API_TOKEN / COZE_DATASET_ID
 */

import {
  cozeApiBase,
  cozeApiToken,
  isKnowledgeConfigured,
  policyDatasetId,
} from "@/lib/coze-env";

const API = cozeApiBase();

const DEFAULT_CHUNK = {
  chunk_type: 0,
  max_tokens: 800,
  remove_extra_spaces: true,
  remove_urls_emails: false,
};

function token() {
  const t = cozeApiToken();
  if (!t) throw new Error("未配置 API_TOKEN（或本地 COZE_API_TOKEN）");
  return t;
}

export function cozeDatasetId() {
  return policyDatasetId();
}

export function isCozeKnowledgeConfigured() {
  return isKnowledgeConfigured();
}

async function api<T = Record<string, unknown>>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
      "Agw-Js-Conv": "str",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json()) as {
    code?: number;
    msg?: string;
    document_infos?: CozeDocumentInfo[];
    data?: { document_infos?: CozeDocumentInfo[] };
    total?: number;
  } & T;
  if (json.code !== undefined && json.code !== 0) {
    throw new Error(`扣子知识库接口失败: ${json.msg || json.code}`);
  }
  return json as T;
}

export type CozeDocumentInfo = {
  document_id: string;
  name: string;
  char_count?: number;
  slice_count?: number;
  size?: number;
  status?: number;
  type?: string;
  format_type?: number;
};

export async function listCozeDocuments(opts?: {
  datasetId?: string;
  pageSize?: number;
}): Promise<CozeDocumentInfo[]> {
  const datasetId = opts?.datasetId || cozeDatasetId();
  if (!datasetId) throw new Error("未配置 POLICY_DATASET_ID");
  const size = Math.min(Math.max(opts?.pageSize || 50, 1), 50);
  const all: CozeDocumentInfo[] = [];
  for (let page = 1; page <= 40; page++) {
    const r = await api<{
      document_infos?: CozeDocumentInfo[];
      data?: { document_infos?: CozeDocumentInfo[] };
    }>("POST", "/open_api/knowledge/document/list", {
      dataset_id: datasetId,
      page,
      size,
    });
    const infos = r.document_infos || r.data?.document_infos || [];
    all.push(...infos);
    if (infos.length < size) break;
  }
  return all;
}

export type CreateCozeDocInput = {
  name: string;
  /** 不含点，如 txt / docx / pdf / doc */
  fileType: string;
  bytes: Buffer;
  datasetId?: string;
};

export async function createCozeDocument(
  input: CreateCozeDocInput
): Promise<CozeDocumentInfo> {
  const datasetId = input.datasetId || cozeDatasetId();
  if (!datasetId) throw new Error("未配置 POLICY_DATASET_ID");
  if (!input.bytes?.length) throw new Error("文件内容为空");
  if (input.bytes.length > 20 * 1024 * 1024) {
    throw new Error("单文件不能超过 20MB");
  }
  const fileType = input.fileType.replace(/^\./, "").toLowerCase();
  const r = await api<{
    document_infos?: CozeDocumentInfo[];
    data?: { document_infos?: CozeDocumentInfo[] };
  }>("POST", "/open_api/knowledge/document/create", {
    dataset_id: String(datasetId),
    document_bases: [
      {
        name: input.name,
        source_info: {
          file_base64: input.bytes.toString("base64"),
          file_type: fileType,
          document_source: 0,
        },
      },
    ],
    chunk_strategy: DEFAULT_CHUNK,
    format_type: 0,
  });
  const info = r.document_infos?.[0] || r.data?.document_infos?.[0];
  if (!info?.document_id) {
    throw new Error("扣子未返回 document_id");
  }
  return info;
}

/** 仅支持改名（扣子 update 接口不支持改正文） */
export async function renameCozeDocument(
  documentId: string,
  documentName: string
) {
  await api("POST", "/open_api/knowledge/document/update", {
    document_id: documentId,
    document_name: documentName,
  });
}

export async function deleteCozeDocuments(documentIds: string[]) {
  const ids = documentIds.filter(Boolean);
  if (!ids.length) return;
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    await api("POST", "/open_api/knowledge/document/delete", {
      document_ids: batch,
    });
  }
}

/**
 * 正文更新：扣子无改内容接口 → 删旧建新，返回新 document_id
 */
export async function replaceCozeDocument(opts: {
  oldDocumentId?: string | null;
  name: string;
  fileType: string;
  bytes: Buffer;
}): Promise<CozeDocumentInfo> {
  if (opts.oldDocumentId) {
    try {
      await deleteCozeDocuments([opts.oldDocumentId]);
    } catch (e) {
      console.warn("delete old coze doc failed", opts.oldDocumentId, e);
    }
  }
  return createCozeDocument({
    name: opts.name,
    fileType: opts.fileType,
    bytes: opts.bytes,
  });
}

export function textToTxtBytes(title: string, content: string) {
  const body = `# ${title}\n\n${content || ""}`;
  return Buffer.from(body, "utf8");
}
