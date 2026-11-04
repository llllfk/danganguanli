import { query, withTransaction } from "@/lib/db";
import { deletePersonUpload } from "@/lib/storage";

const PERSON_TABLES = [
  "archive_pieces", "ordered_archive_pieces", "audit_field_sources", "audit_records",
  "archive_page_texts", "talent_reminders", "talent_match_scores", "talent_match_checks",
  "talent_profiles", "talent_title_promo",
];

export type ClearPersonResult = {
  personCode: string;
  personName: string;
  deleted: Record<string, number>;
  filesDeleted: number;
  filesPending: number;
  referencesPreserved: number;
};

async function ensureCleanupTable() {
  await query(`CREATE TABLE IF NOT EXISTS person_file_cleanup (
    id BIGSERIAL PRIMARY KEY,
    person_code VARCHAR(50) NOT NULL,
    file_path TEXT NOT NULL,
    last_error TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(person_code, file_path)
  )`);
}

export async function listDeletablePersons() {
  await ensureCleanupTable();
  const result = await query<{
    person_code: string; person_name: string; pending_files: number;
  }>(`SELECT p.person_code, p.person_name,
          (SELECT count(*)::int FROM person_file_cleanup f WHERE f.person_code = p.person_code) AS pending_files
        FROM persons p
        UNION ALL
        SELECT f.person_code, '文件待清理' AS person_name, count(*)::int AS pending_files
        FROM person_file_cleanup f
        WHERE NOT EXISTS (SELECT 1 FROM persons p WHERE p.person_code = f.person_code)
        GROUP BY f.person_code
        ORDER BY person_code`);
  return result.rows.map((row) => ({
    personCode: row.person_code, personName: row.person_name, pendingFiles: row.pending_files,
  }));
}

/** Remove a single person's records atomically, then drain a durable upload cleanup queue. */
export async function clearPersonData(personCode: string): Promise<ClearPersonResult> {
  const code = String(personCode || "").trim();
  if (!code || code.length > 50 || /[/\\\x00]/.test(code) || code === "." || code === "..") {
    throw new Error("人员代码不正确");
  }
  await ensureCleanupTable();
  const data = await withTransaction(async (client) => {
    const person = await client.query<{ person_name: string }>(
      "SELECT person_name FROM persons WHERE person_code = $1 FOR UPDATE", [code]
    );
    const available = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.columns
       WHERE table_schema = current_schema() AND column_name = 'person_code'
         AND table_name = ANY($1::text[])`, [PERSON_TABLES]
    );
    const tables = new Set(available.rows.map((row) => row.table_name));
    const fileQueries: string[] = [];
    if (tables.has("archive_pieces")) fileQueries.push(
      "SELECT pg.file_path, p.person_code FROM archive_pages pg JOIN archive_pieces p ON p.id = pg.piece_id"
    );
    if (tables.has("ordered_archive_pieces")) fileQueries.push(
      "SELECT pg.file_path, p.person_code FROM ordered_archive_pages pg JOIN ordered_archive_pieces p ON p.id = pg.piece_id"
    );
    if (tables.has("archive_page_texts")) fileQueries.push("SELECT file_path, person_code FROM archive_page_texts");
    if (fileQueries.length) {
      // Do not delete a file still referenced by any other person.
      await client.query(
        `WITH files AS (${fileQueries.join(" UNION ALL ")})
         INSERT INTO person_file_cleanup (person_code, file_path)
         SELECT DISTINCT $1, f.file_path FROM files f
         WHERE f.person_code = $1 AND nullif(f.file_path, '') IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM files other WHERE other.file_path = f.file_path AND other.person_code <> $1)
         ON CONFLICT (person_code, file_path) DO NOTHING`, [code]
      );
    }
    const deleted: Record<string, number> = {};
    for (const table of PERSON_TABLES) {
      if (!tables.has(table)) continue;
      const result = await client.query(`DELETE FROM ${table} WHERE person_code = $1`, [code]);
      deleted[table] = result.rowCount || 0;
    }
    const result = await client.query("DELETE FROM persons WHERE person_code = $1", [code]);
    deleted.persons = result.rowCount || 0;
    return { personName: person.rows[0]?.person_name || code, deleted };
  });
  const pending = await query<{ id: string; file_path: string }>(
    "SELECT id::text, file_path FROM person_file_cleanup WHERE person_code = $1 ORDER BY id", [code]
  );
  let filesDeleted = 0, referencesPreserved = 0;
  for (const file of pending.rows) {
    try {
      const status = await deletePersonUpload(file.file_path, code);
      if (status === "reference") referencesPreserved++; else filesDeleted++;
      await query("DELETE FROM person_file_cleanup WHERE id = $1::bigint AND person_code = $2", [file.id, code]);
    } catch (error) {
      await query("UPDATE person_file_cleanup SET last_error = $1 WHERE id = $2::bigint AND person_code = $3", [
        error instanceof Error ? error.message : String(error), file.id, code,
      ]);
    }
  }
  const remaining = await query<{ n: number }>(
    "SELECT count(*)::int AS n FROM person_file_cleanup WHERE person_code = $1", [code]
  );
  return { personCode: code, ...data, filesDeleted, referencesPreserved, filesPending: remaining.rows[0]?.n || 0 };
}
