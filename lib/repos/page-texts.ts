import { query } from "@/lib/db";

let ensured = false;

export async function ensurePageTextsTable() {
  if (ensured) return;
  await query(`
    CREATE TABLE IF NOT EXISTS archive_page_texts (
      id BIGSERIAL PRIMARY KEY,
      person_code VARCHAR(50) NOT NULL,
      piece_ref VARCHAR(80) NOT NULL,
      page_no INT4 NOT NULL DEFAULT 1,
      material_name VARCHAR(255),
      file_path TEXT,
      text_content TEXT NOT NULL DEFAULT '',
      fields JSONB NOT NULL DEFAULT '{}'::jsonb,
      source VARCHAR(20) NOT NULL DEFAULT 'vision',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (person_code, piece_ref, page_no)
    )
  `);
  await query(
    `CREATE INDEX IF NOT EXISTS idx_page_texts_person
     ON archive_page_texts (person_code)`
  );
  ensured = true;
}

export type PageTextRow = {
  personCode: string;
  pieceRef: string;
  pageNo: number;
  materialName?: string;
  filePath?: string;
  textContent: string;
  fields: Record<string, string>;
  source: string;
  /** Audit re-extraction must also clear fields/text that the new image doesn't contain. */
  replaceContent?: boolean;
};

export async function upsertPageText(row: PageTextRow) {
  await ensurePageTextsTable();
  await query(
    `INSERT INTO archive_page_texts
       (person_code, piece_ref, page_no, material_name, file_path,
        text_content, fields, source, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,CURRENT_TIMESTAMP)
     ON CONFLICT (person_code, piece_ref, page_no) DO UPDATE SET
       material_name = EXCLUDED.material_name,
       file_path = COALESCE(EXCLUDED.file_path, archive_page_texts.file_path),
       text_content = CASE
         WHEN $9 THEN EXCLUDED.text_content
         WHEN EXCLUDED.text_content <> '' THEN EXCLUDED.text_content
         ELSE archive_page_texts.text_content END,
       fields = CASE
         WHEN $9 THEN EXCLUDED.fields
         WHEN EXCLUDED.fields <> '{}'::jsonb THEN EXCLUDED.fields
         ELSE archive_page_texts.fields END,
       source = EXCLUDED.source,
       updated_at = CURRENT_TIMESTAMP`,
    [
      row.personCode,
      row.pieceRef,
      row.pageNo,
      row.materialName || null,
      row.filePath || null,
      row.textContent || "",
      JSON.stringify(row.fields || {}),
      row.source || "vision",
      !!row.replaceContent,
    ]
  );
}

export async function getPageText(
  personCode: string,
  pieceRef: string,
  pageNo: number
) {
  await ensurePageTextsTable();
  const r = await query<{
    text_content: string;
    fields: Record<string, string> | string;
    material_name: string | null;
    file_path: string | null;
    source: string;
  }>(
    `SELECT text_content, fields, material_name, file_path, source
     FROM archive_page_texts
     WHERE person_code = $1 AND piece_ref = $2 AND page_no = $3`,
    [personCode, pieceRef, pageNo]
  );
  const row = r.rows[0];
  if (!row) return null;
  const fields =
    typeof row.fields === "string"
      ? (JSON.parse(row.fields || "{}") as Record<string, string>)
      : row.fields || {};
  return {
    textContent: row.text_content || "",
    fields,
    materialName: row.material_name || undefined,
    filePath: row.file_path || undefined,
    source: row.source,
  };
}

export async function listPageTexts(personCode: string) {
  await ensurePageTextsTable();
  const r = await query<{
    piece_ref: string;
    page_no: number;
    material_name: string | null;
    text_content: string;
    fields: Record<string, string> | string;
  }>(
    `SELECT piece_ref, page_no, material_name, text_content, fields
     FROM archive_page_texts
     WHERE person_code = $1
     ORDER BY piece_ref, page_no`,
    [personCode]
  );
  return r.rows.map((row) => ({
    pieceRef: row.piece_ref,
    pageNo: row.page_no,
    materialName: row.material_name || undefined,
    textContent: row.text_content || "",
    fields:
      typeof row.fields === "string"
        ? (JSON.parse(row.fields || "{}") as Record<string, string>)
        : row.fields || {},
  }));
}

export async function countPageTexts(personCode: string) {
  await ensurePageTextsTable();
  const r = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM archive_page_texts WHERE person_code = $1`,
    [personCode]
  );
  return r.rows[0]?.n || 0;
}
