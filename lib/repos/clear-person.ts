import pool from "@/lib/db";

export type ClearPersonResult = {
  personCode: string;
  deleted: Record<string, number>;
};

/**
 * 清空某人员全部业务数据（保留 persons 主档，便于反复测试上传）。
 * 覆盖：整编乱序件、有序件、审核出处/记录、页文本缓存，以及人才相关表（若存在）。
 */
export async function clearPersonData(
  personCode: string
): Promise<ClearPersonResult> {
  const code = String(personCode || "").trim();
  if (!code) throw new Error("缺少人员代码");

  const deleted: Record<string, number> = {};
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const del = async (sql: string) => {
      const r = await client.query(sql, [code]);
      return r.rowCount ?? 0;
    };

    // 页表随件 CASCADE
    deleted.archive_pieces = await del(
      `DELETE FROM archive_pieces WHERE person_code = $1`
    );
    deleted.ordered_archive_pieces = await del(
      `DELETE FROM ordered_archive_pieces WHERE person_code = $1`
    );
    deleted.audit_field_sources = await del(
      `DELETE FROM audit_field_sources WHERE person_code = $1`
    );
    deleted.audit_records = await del(
      `DELETE FROM audit_records WHERE person_code = $1`
    );
    deleted.archive_page_texts = await del(
      `DELETE FROM archive_page_texts WHERE person_code = $1`
    );

    for (const t of [
      "talent_reminders",
      "talent_match_scores",
      "talent_match_checks",
      "talent_profiles",
      "talent_title_promo",
    ]) {
      try {
        deleted[t] = await del(`DELETE FROM ${t} WHERE person_code = $1`);
      } catch {
        /* 表可能不存在 */
      }
    }

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }

  return { personCode: code, deleted };
}
