import fs from "node:fs";
import path from "node:path";
import { query } from "@/lib/db";
import { formalSuffix } from "@/lib/audit-parse";

type CatalogHit = {
  materialName: string;
  formDate?: string;
  summary?: string;
  category: string;
};

let bySuffix: Map<string, CatalogHit> | null = null;

function loadCatalogMap() {
  if (bySuffix) return bySuffix;
  bySuffix = new Map();
  const p = path.join(process.cwd(), "scripts", "seed", "ordered-pieces.json");
  if (!fs.existsSync(p)) return bySuffix;
  const raw = JSON.parse(fs.readFileSync(p, "utf8")) as Array<{
    formalNo: string;
    category: string;
    materialName: string;
    formDate?: string;
    summary?: string;
  }>;
  for (const r of raw) {
    bySuffix.set(formalSuffix(r.formalNo), {
      materialName: r.materialName,
      formDate: r.formDate,
      summary: r.summary,
      category: r.category,
    });
  }
  return bySuffix;
}

function lookupCatalog(formalNo: string, categoryCode: string): CatalogHit | null {
  const map = loadCatalogMap();
  const hit = map.get(formalSuffix(formalNo));
  if (hit) return hit;
  for (const v of map.values()) {
    if (v.category === categoryCode) return v;
  }
  return null;
}

export async function ensurePerson(personCode: string, personName?: string) {
  await query(
    `INSERT INTO persons (person_code, person_name)
     VALUES ($1, $2)
     ON CONFLICT (person_code) DO NOTHING`,
    [personCode, personName || `人员${personCode}`]
  );
}

export type OrderedUploadPiece = {
  personCode: string;
  categoryCode: string;
  formalNo: string;
  pages: Array<{ pageNo: number; fileName: string; filePath: string }>;
};

/** 写入有序件；clearFirst 时先清空该人旧数据（分批上传仅首批清空） */
export async function replaceOrderedPieces(
  personCode: string,
  pieces: OrderedUploadPiece[],
  opts?: { clearFirst?: boolean; sortStart?: number }
) {
  await ensurePerson(personCode);
  if (opts?.clearFirst) {
    await query(`DELETE FROM ordered_archive_pieces WHERE person_code = $1`, [
      personCode,
    ]);
  }

  let sort = opts?.sortStart ?? 0;
  for (const piece of pieces) {
    const cat = lookupCatalog(piece.formalNo, piece.categoryCode);
    const materialName = cat?.materialName || `档案材料 ${piece.formalNo}`;
    const formDate = cat?.formDate || null;
    const summary = cat?.summary || null;

    const existing = await query<{ id: string; page_count: number }>(
      `SELECT id::text, page_count FROM ordered_archive_pieces
       WHERE person_code = $1 AND formal_no = $2`,
      [personCode, piece.formalNo]
    );

    let pieceId: string;
    if (existing.rows[0]) {
      pieceId = existing.rows[0].id;
      await query(
        `UPDATE ordered_archive_pieces
         SET page_count = GREATEST(page_count, $2),
             material_name = COALESCE(NULLIF($3,''), material_name)
         WHERE id = $1::bigint`,
        [
          pieceId,
          (existing.rows[0].page_count || 0) + piece.pages.length,
          materialName,
        ]
      );
    } else {
      sort += 1;
      const ins = await query<{ id: string }>(
        `INSERT INTO ordered_archive_pieces
          (person_code, formal_no, category_code, material_name, summary, form_date, page_count, sort_index)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id::text`,
        [
          personCode,
          piece.formalNo,
          piece.categoryCode,
          materialName,
          summary,
          formDate,
          piece.pages.length || 1,
          sort,
        ]
      );
      pieceId = ins.rows[0].id;
    }

    for (const page of piece.pages) {
      await query(
        `INSERT INTO ordered_archive_pages (piece_id, page_no, file_name, file_path)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (piece_id, page_no) DO UPDATE
         SET file_name = EXCLUDED.file_name, file_path = EXCLUDED.file_path`,
        [pieceId, page.pageNo, page.fileName, page.filePath]
      );
    }
  }

  // 校正 page_count
  await query(
    `UPDATE ordered_archive_pieces p
     SET page_count = sub.n
     FROM (
       SELECT piece_id, count(*)::int AS n FROM ordered_archive_pages GROUP BY piece_id
     ) sub
     WHERE p.id = sub.piece_id AND p.person_code = $1`,
    [personCode]
  );
}

export async function countAuditSources(personCode: string) {
  const r = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM audit_field_sources WHERE person_code = $1`,
    [personCode]
  );
  return r.rows[0]?.n || 0;
}
