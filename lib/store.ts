import type {
  AuditRecord,
  PolicyHistoryItem,
  RuleBundle,
} from "@/types";
import { todayKey, uid } from "@/lib/utils";
import {
  DEFAULT_AUDIT_RULES,
  DEFAULT_CLASSIFY_RULES,
  DEFAULT_COMPLETENESS_RULES,
  DEFAULT_SORT_RULES,
} from "@/lib/rules/defaults";

/**
 * 内存态存储：无数据库时保证功能可演示；
 * 有 DATABASE_URL 时可逐步切换到 PostgreSQL。
 */
type MemoryState = {
  policyHistory: PolicyHistoryItem[];
  auditRecords: AuditRecord[];
  rules: RuleBundle;
};

declare global {
  // eslint-disable-next-line no-var
  var __hrAiMemory: MemoryState | undefined;
}

function createState(): MemoryState {
  return {
    policyHistory: [],
    auditRecords: [],
    rules: {
      classify: DEFAULT_CLASSIFY_RULES,
      sort: DEFAULT_SORT_RULES,
      audit: DEFAULT_AUDIT_RULES,
      completeness: DEFAULT_COMPLETENESS_RULES,
    },
  };
}

export function getMemory(): MemoryState {
  if (!globalThis.__hrAiMemory) {
    globalThis.__hrAiMemory = createState();
  }
  return globalThis.__hrAiMemory;
}

export function addPolicyHistory(
  question: string,
  answer: string,
  found: boolean
): PolicyHistoryItem {
  const item: PolicyHistoryItem = {
    id: uid("qh"),
    question,
    answer,
    found,
    createdAt: new Date().toISOString(),
  };
  const mem = getMemory();
  mem.policyHistory = [item, ...mem.policyHistory].slice(0, 50);
  return item;
}

export function listPolicyHistory() {
  return getMemory().policyHistory;
}

export function addAuditRecord(record: Omit<AuditRecord, "id" | "createdAt">) {
  const item: AuditRecord = {
    ...record,
    id: uid("ar"),
    createdAt: new Date().toISOString(),
  };
  const mem = getMemory();
  const day = todayKey();
  mem.auditRecords = [item, ...mem.auditRecords]
    .filter((r) => r.createdAt.startsWith(day))
    .slice(0, 100);
  return item;
}

export function listAuditRecords(keyword?: string) {
  const day = todayKey();
  let rows = getMemory().auditRecords.filter((r) =>
    r.createdAt.startsWith(day)
  );
  if (keyword?.trim()) {
    const k = keyword.trim();
    rows = rows.filter(
      (r) => r.personName.includes(k) || r.personCode.includes(k)
    );
  }
  return rows;
}

export function getRules() {
  return getMemory().rules;
}

export function updateRules(patch: Partial<RuleBundle>) {
  const mem = getMemory();
  mem.rules = { ...mem.rules, ...patch };
  return mem.rules;
}
