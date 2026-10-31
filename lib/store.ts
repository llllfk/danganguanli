import type {
  AuditRecord,
  PolicyConversation,
  PolicyHistoryItem,
  RuleBundle,
} from "@/types";
import { query } from "@/lib/db";

let policySchemaReady: Promise<void> | null = null;

/** 兼容旧库：补 conversation_id / thinking_ms / provider / sources */
export async function ensurePolicyHistorySchema() {
  if (!policySchemaReady) {
    policySchemaReady = (async () => {
      await query(`
        ALTER TABLE policy_history
          ADD COLUMN IF NOT EXISTS conversation_id VARCHAR(64),
          ADD COLUMN IF NOT EXISTS thinking_ms INT4 DEFAULT 0,
          ADD COLUMN IF NOT EXISTS provider VARCHAR(32),
          ADD COLUMN IF NOT EXISTS coze_conversation_id VARCHAR(64),
          ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
          ADD COLUMN IF NOT EXISTS sources JSONB DEFAULT '[]'::jsonb
      `);
      await query(`
        UPDATE policy_history
        SET conversation_id = 'legacy-' || id::text
        WHERE conversation_id IS NULL OR conversation_id = ''
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS idx_policy_history_conv
          ON policy_history (conversation_id, created_at)
      `);
    })().catch((e) => {
      policySchemaReady = null;
      throw e;
    });
  }
  return policySchemaReady;
}

function parseSourcesJson(raw: unknown): PolicyHistoryItem["sources"] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as PolicyHistoryItem["sources"];
  if (typeof raw === "string") {
    try {
      const j = JSON.parse(raw);
      return Array.isArray(j) ? j : [];
    } catch {
      return [];
    }
  }
  return [];
}

export async function addPolicyHistory(input: {
  conversationId: string;
  question: string;
  answer: string;
  found: boolean;
  thinkingMs?: number;
  provider?: string;
  cozeConversationId?: string;
  sources?: PolicyHistoryItem["sources"];
}): Promise<PolicyHistoryItem> {
  await ensurePolicyHistorySchema();
  const sources = input.sources || [];
  const r = await query<{
    id: string;
    conversation_id: string;
    question: string;
    answer: string;
    found: boolean;
    thinking_ms: number | null;
    provider: string | null;
    sources: unknown;
    created_at: Date;
  }>(
    `INSERT INTO policy_history
       (conversation_id, question, answer, found, thinking_ms, provider, coze_conversation_id, sources)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
     RETURNING id::text, conversation_id, question, answer, found,
               thinking_ms, provider, sources, created_at`,
    [
      input.conversationId,
      input.question,
      input.answer,
      input.found,
      input.thinkingMs ?? 0,
      input.provider || null,
      input.cozeConversationId || null,
      JSON.stringify(sources),
    ]
  );
  const row = r.rows[0];
  return {
    id: row.id,
    conversationId: row.conversation_id,
    question: row.question,
    answer: row.answer,
    found: row.found,
    thinkingMs: row.thinking_ms || 0,
    provider: row.provider || undefined,
    sources: parseSourcesJson(row.sources),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

/** 取本会话最近一次扣子 conversation_id，用于续聊 */
export async function getCozeConversationId(
  conversationId: string
): Promise<string | undefined> {
  await ensurePolicyHistorySchema();
  const r = await query<{ coze_conversation_id: string | null }>(
    `SELECT coze_conversation_id FROM policy_history
     WHERE conversation_id = $1
       AND deleted_at IS NULL
       AND coze_conversation_id IS NOT NULL AND coze_conversation_id <> ''
     ORDER BY created_at DESC
     LIMIT 1`,
    [conversationId]
  );
  return r.rows[0]?.coze_conversation_id || undefined;
}

/** 会话逻辑删除：同 conversation_id 全部打 deleted_at */
export async function softDeleteConversation(conversationId: string) {
  await ensurePolicyHistorySchema();
  const r = await query(
    `UPDATE policy_history
     SET deleted_at = CURRENT_TIMESTAMP
     WHERE conversation_id = $1 AND deleted_at IS NULL`,
    [conversationId]
  );
  return r.rowCount || 0;
}

export async function listPolicyHistory(): Promise<PolicyHistoryItem[]> {
  await ensurePolicyHistorySchema();
  const r = await query<{
    id: string;
    conversation_id: string | null;
    question: string;
    answer: string;
    found: boolean;
    thinking_ms: number | null;
    provider: string | null;
    created_at: Date;
  }>(
    `SELECT id::text, conversation_id, question, answer, found,
            thinking_ms, provider, created_at
     FROM policy_history
     WHERE deleted_at IS NULL
     ORDER BY created_at DESC
     LIMIT 100`
  );
  return r.rows.map((row) => ({
    id: row.id,
    conversationId: row.conversation_id || `legacy-${row.id}`,
    question: row.question,
    answer: row.answer,
    found: row.found,
    thinkingMs: row.thinking_ms || 0,
    provider: row.provider || undefined,
    createdAt: new Date(row.created_at).toISOString(),
  }));
}

/** 近期提问：按时间倒序去重，供政策问答底部条展示 */
export async function listRecentPolicyQuestions(
  limit = 5
): Promise<string[]> {
  await ensurePolicyHistorySchema();
  const r = await query<{ question: string }>(
    `SELECT question FROM (
       SELECT DISTINCT ON (question) question, created_at
       FROM policy_history
       WHERE deleted_at IS NULL
         AND question IS NOT NULL AND question <> ''
       ORDER BY question, created_at DESC
     ) t
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  );
  return r.rows.map((row) => row.question);
}

export async function listPolicyConversations(): Promise<PolicyConversation[]> {
  await ensurePolicyHistorySchema();
  const r = await query<{
    conversation_id: string;
    title: string;
    message_count: number;
    last_at: Date;
    found: boolean;
  }>(
    `SELECT conversation_id,
            (ARRAY_AGG(question ORDER BY created_at ASC))[1] AS title,
            COUNT(*)::int AS message_count,
            MAX(created_at) AS last_at,
            BOOL_OR(found) AS found
     FROM policy_history
     WHERE conversation_id IS NOT NULL AND conversation_id <> ''
       AND deleted_at IS NULL
     GROUP BY conversation_id
     ORDER BY MAX(created_at) DESC
     LIMIT 80`
  );
  return r.rows.map((row) => ({
    conversationId: row.conversation_id,
    title: row.title,
    messageCount: row.message_count,
    lastAt: new Date(row.last_at).toISOString(),
    found: row.found,
  }));
}

export async function listPolicyMessages(
  conversationId: string
): Promise<PolicyHistoryItem[]> {
  await ensurePolicyHistorySchema();
  const r = await query<{
    id: string;
    conversation_id: string;
    question: string;
    answer: string;
    found: boolean;
    thinking_ms: number | null;
    provider: string | null;
    sources: unknown;
    created_at: Date;
  }>(
    `SELECT id::text, conversation_id, question, answer, found,
            thinking_ms, provider, sources, created_at
     FROM policy_history
     WHERE conversation_id = $1 AND deleted_at IS NULL
     ORDER BY created_at ASC`,
    [conversationId]
  );
  return r.rows.map((row) => ({
    id: row.id,
    conversationId: row.conversation_id,
    question: row.question,
    answer: row.answer,
    found: row.found,
    thinkingMs: row.thinking_ms || 0,
    provider: row.provider || undefined,
    sources: parseSourcesJson(row.sources),
    createdAt: new Date(row.created_at).toISOString(),
  }));
}

export async function addAuditRecord(
  record: Omit<AuditRecord, "id" | "createdAt">
): Promise<AuditRecord> {
  const r = await query<{
    id: string;
    person_name: string;
    person_code: string;
    summary: string;
    issue_count: number;
    report: AuditRecord["report"];
    created_at: Date;
  }>(
    `INSERT INTO audit_records
       (person_name, person_code, summary, issue_count, report)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     RETURNING id::text, person_name, person_code, summary, issue_count, report, created_at`,
    [
      record.personName,
      record.personCode,
      record.summary,
      record.issueCount,
      JSON.stringify(record.report || {}),
    ]
  );
  const row = r.rows[0];
  return {
    id: row.id,
    personName: row.person_name,
    personCode: row.person_code,
    summary: row.summary,
    issueCount: row.issue_count,
    report: row.report,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

/** 某人最近一次核验报告（不限当日） */
export async function getLatestAuditRecord(
  personCode: string
): Promise<AuditRecord | null> {
  const r = await query<{
    id: string;
    person_name: string;
    person_code: string;
    summary: string;
    issue_count: number;
    report: AuditRecord["report"];
    created_at: Date;
  }>(
    `SELECT id::text, person_name, person_code, summary, issue_count, report, created_at
     FROM audit_records
     WHERE person_code = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [personCode]
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    personName: row.person_name,
    personCode: row.person_code,
    summary: row.summary,
    issueCount: row.issue_count,
    report: row.report,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export async function listAuditRecords(
  keyword?: string
): Promise<AuditRecord[]> {
  const params: string[] = [];
  let where = "created_at::date = CURRENT_DATE";
  if (keyword?.trim()) {
    params.push(`%${keyword.trim()}%`);
    where += ` AND (person_name ILIKE $1 OR person_code ILIKE $1)`;
  }
  const r = await query<{
    id: string;
    person_name: string;
    person_code: string;
    summary: string;
    issue_count: number;
    report: AuditRecord["report"];
    created_at: Date;
  }>(
    `SELECT id::text, person_name, person_code, summary, issue_count, report, created_at
     FROM audit_records
     WHERE ${where}
     ORDER BY created_at DESC
     LIMIT 100`,
    params
  );
  return r.rows.map((row) => ({
    id: row.id,
    personName: row.person_name,
    personCode: row.person_code,
    summary: row.summary,
    issueCount: row.issue_count,
    report: row.report,
    createdAt: new Date(row.created_at).toISOString(),
  }));
}

export async function getRules(): Promise<RuleBundle> {
  const r = await query<{ rule_key: string; content: string }>(
    `SELECT rule_key, content FROM business_rules
     WHERE rule_key = ANY($1)`,
    [["classify", "sort", "audit", "completeness"]]
  );
  const next: RuleBundle = {
    classify: "",
    sort: "",
    audit: "",
    completeness: "",
  };
  for (const row of r.rows) {
    if (row.rule_key === "classify") next.classify = row.content;
    if (row.rule_key === "sort") next.sort = row.content;
    if (row.rule_key === "audit") next.audit = row.content;
    if (row.rule_key === "completeness") next.completeness = row.content;
  }
  return next;
}

export async function updateRules(
  patch: Partial<RuleBundle>
): Promise<RuleBundle> {
  for (const [key, content] of Object.entries(patch)) {
    if (content === undefined) continue;
    await query(
      `INSERT INTO business_rules (rule_key, content, updated_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (rule_key)
       DO UPDATE SET content = EXCLUDED.content, updated_at = CURRENT_TIMESTAMP`,
      [key, content]
    );
  }
  return getRules();
}
