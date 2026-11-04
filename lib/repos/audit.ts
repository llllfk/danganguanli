import { query } from "@/lib/db";
import { AUDIT_VISION_SOURCE, cleanAuditTitle } from "@/lib/audit-title";
import { ensurePageTextsTable } from "@/lib/repos/page-texts";
import { buildAuditReport, type AuditDocument, type CompletenessRequirement } from "@/lib/audit-rules";
import type { AuditReport } from "@/types";

export async function listPersons() {
  const r = await query<{ person_code: string; person_name: string }>(
    `SELECT p.person_code, p.person_name
     FROM persons p
     WHERE EXISTS (
         SELECT 1 FROM ordered_archive_pieces o WHERE o.person_code = p.person_code
       )
        OR EXISTS (
         SELECT 1 FROM archive_pieces ap WHERE ap.person_code = p.person_code
       )
        OR EXISTS (
         SELECT 1 FROM audit_field_sources a WHERE a.person_code = p.person_code
       )
     ORDER BY p.person_code`
  );
  return r.rows.map((row) => ({
    personCode: row.person_code,
    personName: row.person_name,
  }));
}

export type PersonMaterial = {
  category: string;
  materialName: string;
  imageNames: string[];
  serialNo: string;
  pageCount: number;
  formalNo: string | null;
  source: "ordered" | "unordered";
};

/** Audit titles must be read from these scans, rather than a demo catalog or body text. */
async function resolveDisplayTitles(
  personCode: string,
  refs: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!refs.length) return map;
  await ensurePageTextsTable();
  const pages = await query<{ piece_ref: string; material_name: string | null }>(
    `SELECT t.piece_ref, t.material_name
     FROM archive_page_texts t
     WHERE t.person_code = $1 AND t.piece_ref = ANY($2::text[])
       AND t.source = $3
       AND (
         EXISTS (
           SELECT 1 FROM ordered_archive_pieces p
           JOIN ordered_archive_pages pg ON pg.piece_id = p.id
           WHERE p.person_code = t.person_code AND p.formal_no = t.piece_ref
             AND pg.page_no = t.page_no AND pg.file_path = t.file_path
         ) OR (
           NOT EXISTS (SELECT 1 FROM ordered_archive_pieces p WHERE p.person_code = t.person_code)
           AND EXISTS (
             SELECT 1 FROM archive_pieces p JOIN archive_pages pg ON pg.piece_id = p.id
             WHERE p.person_code = t.person_code
               AND (p.serial_no = t.piece_ref OR p.formal_no = t.piece_ref)
               AND pg.page_no = t.page_no AND pg.file_path = t.file_path
           )
         )
       )
     ORDER BY t.piece_ref, t.page_no`,
    [personCode, refs, AUDIT_VISION_SOURCE]
  );
  for (const row of pages.rows) {
    const title = cleanAuditTitle(row.material_name);
    if (title && !map.has(row.piece_ref)) map.set(row.piece_ref, title);
  }
  return map;
}

export async function getPersonMaterials(
  personCode: string
): Promise<PersonMaterial[]> {
  const ordered = await query<{
    category_code: string;
    material_name: string;
    formal_no: string;
    page_count: number;
    image_names: string[];
  }>(
    `SELECT category_code, material_name, formal_no, page_count,
            ARRAY(SELECT pg.file_name FROM ordered_archive_pages pg
                  WHERE pg.piece_id = p.id AND coalesce(pg.file_name, '') <> ''
                  ORDER BY pg.page_no) AS image_names
     FROM ordered_archive_pieces p
     WHERE person_code = $1
     ORDER BY sort_index, formal_no`,
    [personCode]
  );

  if (ordered.rows.length) {
    const titles = await resolveDisplayTitles(
      personCode,
      ordered.rows.map((r) => r.formal_no)
    );
    return ordered.rows.map((row) => {
      const title = titles.get(row.formal_no);
      return {
        category: row.category_code,
        materialName: title || row.formal_no,
        imageNames: row.image_names,
        serialNo: row.formal_no,
        pageCount: row.page_count,
        formalNo: row.formal_no,
        source: "ordered" as const,
      };
    });
  }

  const archive = await query<{
    confirmed_category: string | null;
    suggested_category: string | null;
    material_name: string | null;
    serial_no: string;
    page_count: number;
    formal_no: string | null;
    image_names: string[];
  }>(
    `SELECT confirmed_category, suggested_category, material_name, serial_no, page_count, formal_no,
            ARRAY(SELECT pg.file_name FROM archive_pages pg
                  WHERE pg.piece_id = p.id AND coalesce(pg.file_name, '') <> ''
                  ORDER BY pg.page_no) AS image_names
     FROM archive_pieces p
     WHERE person_code = $1
     ORDER BY COALESCE(formal_no, serial_no)`,
    [personCode]
  );

  const refs = archive.rows.map((row) => row.formal_no || row.serial_no);
  const titles = await resolveDisplayTitles(personCode, refs);
  return archive.rows.map((row) => {
    const ref = row.formal_no || row.serial_no;
    const raw = row.material_name || "";
    return {
      category: row.confirmed_category || row.suggested_category || "",
      materialName: titles.get(ref) || raw,
      imageNames: row.image_names,
      serialNo: row.serial_no,
      pageCount: row.page_count,
      formalNo: row.formal_no,
      source: "unordered" as const,
    };
  });
}

export async function getAuditPageFile(
  personCode: string,
  pieceRef: string,
  pageNo: number,
  preferred?: "ordered" | "unordered"
) {
  async function fromOrdered() {
    return query<{ file_name: string | null; file_path: string | null }>(
      `SELECT pg.file_name, pg.file_path
       FROM ordered_archive_pages pg
       JOIN ordered_archive_pieces p ON p.id = pg.piece_id
       WHERE p.person_code = $1 AND p.formal_no = $2 AND pg.page_no = $3`,
      [personCode, pieceRef, pageNo]
    );
  }
  async function fromUnordered() {
    return query<{ file_name: string | null; file_path: string | null }>(
      `SELECT pg.file_name, pg.file_path
       FROM archive_pages pg
       JOIN archive_pieces p ON p.id = pg.piece_id
       WHERE p.person_code = $1
         AND (p.serial_no = $2 OR p.formal_no = $2)
         AND pg.page_no = $3`,
      [personCode, pieceRef, pageNo]
    );
  }

  if (preferred === "unordered") {
    const u = await fromUnordered();
    if (u.rows[0]) return u.rows[0];
    const o = await fromOrdered();
    return o.rows[0] || null;
  }

  const o = await fromOrdered();
  if (o.rows[0]) return o.rows[0];
  const u = await fromUnordered();
  return u.rows[0] || null;
}

async function loadAuditDocuments(personCode: string): Promise<AuditDocument[]> {
  const materials = await getPersonMaterials(personCode);
  const pages = await query<{
    piece_ref: string; fields: Record<string, string> | string; page_no: number;
  }>(
    `SELECT t.piece_ref, t.fields, t.page_no FROM archive_page_texts t
     WHERE t.person_code = $1 AND t.source = $2
       AND (
         EXISTS (
           SELECT 1 FROM ordered_archive_pieces p JOIN ordered_archive_pages pg ON pg.piece_id = p.id
           WHERE p.person_code = t.person_code AND p.formal_no = t.piece_ref
             AND pg.page_no = t.page_no AND pg.file_path = t.file_path
         ) OR (
           NOT EXISTS (SELECT 1 FROM ordered_archive_pieces p WHERE p.person_code = t.person_code)
           AND EXISTS (
             SELECT 1 FROM archive_pieces p JOIN archive_pages pg ON pg.piece_id = p.id
             WHERE p.person_code = t.person_code AND (p.serial_no = t.piece_ref OR p.formal_no = t.piece_ref)
               AND pg.page_no = t.page_no AND pg.file_path = t.file_path
           )
         )
       ) ORDER BY t.piece_ref, t.page_no`,
    [personCode, AUDIT_VISION_SOURCE]
  );
  const byRef = new Map<string, Record<string, string>>();
  for (const row of pages.rows) {
    if (!byRef.has(row.piece_ref)) {
      byRef.set(row.piece_ref, typeof row.fields === "string" ? JSON.parse(row.fields) : row.fields);
    }
  }
  return materials.map((material) => {
    const ref = material.formalNo || material.serialNo;
    const fields = byRef.get(ref) || byRef.get(material.serialNo) || {};
    return { ref, title: material.materialName, category: material.category,
      formDate: fields._formDate, fields };
  });
}

export async function runAuditFromDb(personCode: string, personName: string): Promise<AuditReport> {
  const [documents, requirements] = await Promise.all([
    loadAuditDocuments(personCode),
    query<CompletenessRequirement>(
      `SELECT category_hint, material_pattern, description, required_for
       FROM completeness_requirements ORDER BY sort_order`
    ),
  ]);
  return buildAuditReport(personCode, personName, documents, requirements.rows);
}

/** Refresh cached reports under the current rules without making another model call. */
export async function refreshReportCompleteness(report: AuditReport): Promise<AuditReport> {
  const refreshed = await runAuditFromDb(report.personCode, report.personName);
  return { ...refreshed, createdAt: report.createdAt };
}

export function summarizeAudit(report: AuditReport) {
  const issues = report.fields.filter((f) => f.status !== "ok");
  const miss = report.completeness;
  return {
    issueCount: issues.length + miss.length,
    summary: `问题项 ${issues.length} 个，材料缺失提示 ${miss.length} 条`,
  };
}
