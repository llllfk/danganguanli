import { NextResponse } from "next/server";
import pool, { hasDatabase } from "@/lib/db";
import { hasStorage, storageDiagnostics } from "@/lib/storage";

export async function GET() {
  let databaseOk = false;
  let databaseError: string | undefined;
  let counts: Record<string, number> | undefined;

  if (hasDatabase()) {
    try {
      await pool.query("SELECT 1");
      const r = await pool.query(`
        SELECT 'policy_documents' t, count(*)::int n FROM policy_documents
        UNION ALL SELECT 'archive_pieces', count(*)::int FROM archive_pieces
        UNION ALL SELECT 'audit_field_sources', count(*)::int FROM audit_field_sources
        UNION ALL SELECT 'ordered_archive_pieces', count(*)::int FROM ordered_archive_pieces
        UNION ALL SELECT 'talent_stats', count(*)::int FROM talent_stats
      `);
      counts = Object.fromEntries(r.rows.map((row) => [row.t, row.n]));
      databaseOk = true;
    } catch (e) {
      databaseError = e instanceof Error ? e.message : String(e);
    }
  }

  return NextResponse.json({
    data: {
      status: databaseOk ? "ok" : "error",
      databaseConfigured: hasDatabase(),
      database: databaseOk,
      databaseError,
      counts,
      storage: hasStorage(),
      storageDetail: storageDiagnostics(),
      time: new Date().toISOString(),
    },
  });
}
