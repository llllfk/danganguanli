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

// find bad encoding rows
const bad = await client.query(`
  SELECT id, title, octet_length(content) AS bytes,
         length(content) AS chars
  FROM policy_documents
  ORDER BY id
`);
console.log("all docs:", bad.rows.length);

const with4 = await client.query(`
  SELECT id::text, title
  FROM policy_documents
  WHERE content LIKE '%' || chr(31532) || chr(22235) || chr(31867) || '%'
`);
// fallback simpler
const with4b = await client.query(
  `SELECT id::text, title, left(content, 80) AS head
   FROM policy_documents
   WHERE position($1 in content) > 0`,
  ["第四类"]
);
console.log("\nDocs containing 第四类:", with4b.rowCount);
for (const r of with4b.rows) {
  console.log("-", r.id, r.title);
}

for (const r of with4b.rows) {
  const full = await client.query(
    `SELECT content FROM policy_documents WHERE id::text = $1`,
    [r.id]
  );
  const content = full.rows[0].content;
  const idx = content.indexOf("第四类");
  const snip = content.slice(Math.max(0, idx - 40), idx + 200).replace(/\s+/g, " ");
  console.log("\n===", r.title);
  console.log(snip);
  console.log(
    "has 学历学位?",
    content.includes("学历学位"),
    "has 4-1?",
    content.includes("4-1"),
    "has 子类?",
    content.includes("子类")
  );
}

await client.end();
