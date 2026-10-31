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

const q = "干部档案第四类下设哪几个子类";
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const n = await client.query("SELECT count(*)::int AS n FROM policy_documents");
console.log("policy_documents count =", n.rows[0].n);

for (const k of ["第四类", "4-1", "学历学位", "子类", "十大类", "整理规范"]) {
  const r = await client.query(
    `SELECT count(*)::int AS n FROM policy_documents
     WHERE content ILIKE $1 OR title ILIKE $1`,
    [`%${k}%`]
  );
  console.log(`keyword "${k}" docs=`, r.rows[0].n);
}

const samples = await client.query(
  `SELECT title,
          CASE WHEN position('第四类' IN content) > 0
            THEN substr(content, GREATEST(1, position('第四类' IN content) - 30), 240)
            ELSE substr(content, 1, 120)
          END AS snip
   FROM policy_documents
   WHERE content LIKE '%第四类%' AND content LIKE '%学历%'
   LIMIT 5`
);
console.log("\nsamples with 第四类+学历:");
for (const row of samples.rows) {
  console.log("-", row.title);
  console.log(" ", String(row.snip).replace(/\s+/g, " ").slice(0, 180));
}

// simulate score
const all = await client.query(
  `SELECT title, content FROM policy_documents`
);
const keywords = ["第四类", "第九类", "子类", "学历学位"].filter((k) =>
  q.includes(k)
);
function score(title, content) {
  const hay = title + "\n" + content;
  let s = 0;
  for (const t of keywords) if (hay.includes(t)) s += 3;
  if (hay.includes(q)) s += 5;
  return s;
}
const ranked = all.rows
  .map((d) => ({ title: d.title, score: score(d.title, d.content) }))
  .filter((x) => x.score > 0)
  .sort((a, b) => b.score - a.score)
  .slice(0, 5);
console.log("\nlocal score top:", ranked);

await client.end();
