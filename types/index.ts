/** 档案十大类（含4/9小类） */
export type ArchiveCategoryCode =
  | "0100"
  | "0200"
  | "0300"
  | "0401"
  | "0402"
  | "0403"
  | "0404"
  | "0500"
  | "0600"
  | "0700"
  | "0800"
  | "0901"
  | "0902"
  | "0903"
  | "0904"
  | "1000";

export interface ArchiveCategory {
  code: ArchiveCategoryCode;
  name: string;
  parent?: string;
}

export interface PolicyDoc {
  id: string;
  title: string;
  content: string;
  sourceFile: string;
}

export interface PolicyAskResult {
  answer: string;
  sources: Array<{
    title: string;
    excerpt: string;
    sourceFile: string;
  }>;
  found: boolean;
}

export interface PolicyHistoryItem {
  id: string;
  question: string;
  answer: string;
  found: boolean;
  createdAt: string;
}

export interface ArchivePiece {
  id: string;
  serialNo: string;
  personCode: string;
  pageCount: number;
  pages: string[];
  materialName?: string;
  summary?: string;
  formDate?: string;
  suggestedCategory?: ArchiveCategoryCode;
  confirmedCategory?: ArchiveCategoryCode;
}

export interface SortItem {
  category: ArchiveCategoryCode;
  categoryName: string;
  items: Array<{
    serialNo: string;
    materialName: string;
    formDate: string;
    pageCount: number;
    formalNo: string;
  }>;
}

export interface AuditSource {
  materialName: string;
  formYear: string;
  materialNo: string;
  value: string;
}

export interface AuditFieldResult {
  field: string;
  label: string;
  value: string;
  status: "ok" | "warn" | "error" | "missing";
  statusText: string;
  sources: AuditSource[];
  aiOpinion?: string;
}

export interface CompletenessIssue {
  category: string;
  message: string;
}

export interface AuditReport {
  personCode: string;
  personName: string;
  fields: AuditFieldResult[];
  completeness: CompletenessIssue[];
  createdAt: string;
}

export interface AuditRecord {
  id: string;
  personName: string;
  personCode: string;
  summary: string;
  issueCount: number;
  createdAt: string;
  report?: AuditReport;
}

export interface RuleBundle {
  classify: string;
  sort: string;
  audit: string;
  completeness: string;
}

export type ApiOk<T> = { data: T };
export type ApiErr = { error: string };
