/**
 * 仅灌入附件6 有序样本到 ordered_archive_*（不破坏现有整编/政策数据）
 * 用法：node scripts/seed-ordered.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const projectRoot = path.resolve(root, "..");
const reqDir = path.join(projectRoot, "需求", "附件1-8");

function loadEnvLocal() {
  const p = path.join(root, ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0 && !process.env[t.slice(0, i)]) {
      process.env[t.slice(0, i)] = t.slice(i + 1);
    }
  }
}

loadEnvLocal();
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("缺少 DATABASE_URL");
  process.exit(1);
}

async function main() {
  const client = new pg.Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS ordered_archive_pieces (
      id BIGSERIAL PRIMARY KEY,
      person_code VARCHAR(50) NOT NULL REFERENCES persons(person_code),
      formal_no VARCHAR(50) NOT NULL,
      category_code VARCHAR(10) NOT NULL,
      material_name VARCHAR(255) NOT NULL,
      summary TEXT,
      form_date VARCHAR(32),
      page_count INT4 NOT NULL DEFAULT 1,
      sort_index INT4 DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (person_code, formal_no)
    );
    CREATE TABLE IF NOT EXISTS ordered_archive_pages (
      id BIGSERIAL PRIMARY KEY,
      piece_id BIGINT NOT NULL REFERENCES ordered_archive_pieces(id) ON DELETE CASCADE,
      page_no INT4 NOT NULL,
      file_name VARCHAR(255),
      file_path TEXT,
      UNIQUE (piece_id, page_no)
    );
  `);

  await client.query(`DELETE FROM ordered_archive_pages`);
  await client.query(`DELETE FROM ordered_archive_pieces`);

  const orderedMeta = JSON.parse(
    fs.readFileSync(path.join(__dirname, "seed", "ordered-pieces.json"), "utf8")
  );
  const orderedRoot = path.join(
    reqDir,
    "附件6-人事档案测试样本-张三00001-有序"
  );

  let orderedIdx = 0;
  for (const p of orderedMeta) {
    orderedIdx += 1;
    const catFolder = `00001-${p.category === "1000" ? "1001" : p.category}`;
    const pieceDir = path.join(orderedRoot, catFolder, p.formalNo);
    let pages = [];
    let baseDir = pieceDir;
    if (fs.existsSync(pieceDir) && fs.statSync(pieceDir).isDirectory()) {
      pages = fs
        .readdirSync(pieceDir)
        .filter((f) => /\.jpe?g$/i.test(f))
        .sort();
    } else {
      const catDir = path.join(orderedRoot, catFolder);
      baseDir = catDir;
      if (fs.existsSync(catDir)) {
        pages = fs
          .readdirSync(catDir)
          .filter(
            (f) =>
              /\.jpe?g$/i.test(f) &&
              (f.startsWith(p.formalNo) || f.includes(p.formalNo))
          )
          .sort();
        if (!pages.length) {
          pages = fs
            .readdirSync(catDir)
            .filter((f) => /\.jpe?g$/i.test(f))
            .sort();
        }
      }
    }
    const pageCount = pages.length || 1;
    const ins = await client.query(
      `INSERT INTO ordered_archive_pieces
        (person_code, formal_no, category_code, material_name, summary, form_date, page_count, sort_index)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id`,
      [
        "00001",
        p.formalNo,
        p.category,
        p.materialName,
        p.summary,
        p.formDate,
        pageCount,
        orderedIdx,
      ]
    );
    const pieceId = ins.rows[0].id;
    for (let i = 0; i < pageCount; i++) {
      const fileName =
        pages[i] || `${p.formalNo}-${String(i + 1).padStart(3, "0")}.jpg`;
      const filePath = pages[i] ? path.join(baseDir, pages[i]) : null;
      await client.query(
        `INSERT INTO ordered_archive_pages (piece_id, page_no, file_name, file_path)
         VALUES ($1,$2,$3,$4)`,
        [pieceId, i + 1, fileName, filePath]
      );
    }
  }

  const c = await client.query(
    `SELECT count(*)::int AS n FROM ordered_archive_pieces WHERE person_code='00001'`
  );
  console.log("ordered_archive_pieces:", c.rows[0].n);
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
