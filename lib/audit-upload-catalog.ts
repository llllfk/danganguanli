import fs from "node:fs";
import path from "node:path";
import { formalSuffix } from "@/lib/audit-parse";

type CatalogEntry = {
  formalNo: string;
  category: string;
  materialName: string;
  formDate?: string;
  summary?: string;
};

const CORRECTED_TITLES: Record<string, string> = {
  "00001-0700-001": "先进个人审批表",
};

let bySuffix: Map<string, CatalogEntry> | null = null;

function loadCatalog() {
  if (bySuffix) return bySuffix;
  bySuffix = new Map();
  const file = path.join(process.cwd(), "scripts", "seed", "ordered-pieces.json");
  if (!fs.existsSync(file)) return bySuffix;
  const rows = JSON.parse(fs.readFileSync(file, "utf8")) as CatalogEntry[];
  for (const row of rows) bySuffix.set(formalSuffix(row.formalNo), row);
  return bySuffix;
}

export function auditUploadTitleCorrection(formalNo: string) {
  return CORRECTED_TITLES[formalNo];
}

export function auditUploadCatalogEntry(
  formalNo: string,
  categoryCode: string
): CatalogEntry | undefined {
  const catalog = loadCatalog();
  const exact = catalog.get(formalSuffix(formalNo));
  return exact || [...catalog.values()].find((row) => row.category === categoryCode);
}
