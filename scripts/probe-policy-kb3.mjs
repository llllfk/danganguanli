import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0 && !process.env[t.slice(0, i)]) {
      process.env[t.slice(0, i)] = t.slice(i + 1);
    }
  }
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

// Pull as bytea to avoid server-side UTF8 decode failures on corrupt rows
const rows = await client.query(`
  SELECT id::text, title,
         convert_to(content, 'UTF8') IS NOT NULL AS ok_dummy
  FROM policy_documents
  LIMIT 1
`);

// Check each row validity via Node
const meta = await client.query(
  `SELECT id::text, title, encode(convert_to(coalesce(content,''), 'UTF8'), 'hex') AS hx
   FROM policy_documents
   ORDER BY id`
);

console.log("fetch via convert_to failed? skipped");

const list = await client.query(
  `SELECT id::text, title, length(content::bytea) AS blen
   FROM (
     SELECT id, title, convert_to(content, 'UTF8') AS content
     FROM policy_documents
   ) t`
).catch((e) => ({ error: e.message }));

if (list.error) {
  console.log("convert_to all failed:", list.error);
}

// row-by-row with exception handling in plpgsql style: use bytea store
const ids = await client.query(`SELECT id::text, title FROM policy_documents ORDER BY id`);
console.log("ids", ids.rowCount);

let ok = 0;
let bad = 0;
const fourth = [];
for (const row of ids.rows) {
  try {
    const r = await client.query(
      `SELECT content FROM policy_documents WHERE id = $1::bigint`,
      [row.id]
    );
    const c = r.rows[0].content;
    // validate utf8 in node
    Buffer.from(c, "utf8");
    ok++;
    if (c.includes("第四类")) {
      fourth.push({
        id: row.id,
        title: row.title,
        hasXueLi: c.includes("学历学位"),
        has41: c.includes("4-1") || c.includes("4－1"),
        hasZiLei: c.includes("子类"),
        snip: c.replace(/\s+/g, " ").slice(
          Math.max(0, c.indexOf("第四类") - 30),
          c.indexOf("第四类") + 180
        ),
      });
    }
  } catch (e) {
    bad++;
    console.log("BAD ROW", row.id, row.title, e.message);
  }
}
console.log({ ok, bad, fourthCount: fourth.length });
for (const f of fourth) {
  console.log("\n===", f.id, f.title);
  console.log(f);
}

await client.end();
