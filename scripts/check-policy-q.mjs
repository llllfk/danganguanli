import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const p = path.join(root, ".env.local");
if (fs.existsSync(p)) {
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
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

const n = await client.query("select count(*)::int n from policy_documents");
console.log("count", n.rows[0].n);

const q = await client.query(`
  select id, title, length(content) as len,
    (position('第四类' in content) > 0) as has4,
    (position('学历学位' in content) > 0) as has_edu,
    (position('4-1' in content) > 0) as has41
  from policy_documents
  where content like '%第四类%' or content like '%学历学位材料%'
  order by (position('学历学位' in content) > 0) desc, id
  limit 20
`);
console.log("hits", q.rows.length);
for (const r of q.rows) {
  console.log(`#${r.id} len=${r.len} 4=${r.has4} edu=${r.has_edu} 41=${r.has41} | ${r.title}`);
}

const snips = await client.query(`
  select title,
    substring(content from greatest(1, position('第四类' in content)-30) for 320) as snip
  from policy_documents
  where content like '%第四类%' and content like '%学历%'
  limit 5
`);
for (const r of snips.rows) {
  console.log("\nSNIP:", r.title);
  console.log(String(r.snip || "").replace(/\s+/g, " ").slice(0, 300));
}

// simulate score
const question = "干部档案第四类下设哪几个子类";
const keywords = ["第四类", "第九类", "子类", "出生日期", "学历学位", "整理规范"].filter(
  (k) => question.includes(k)
);
console.log("\nkeywords from Q:", keywords);

const all = await client.query(`select title, content from policy_documents`);
let scored = all.rows
  .map((d) => {
    let score = 0;
    const hay = d.title + "\n" + d.content;
    for (const t of keywords) if (hay.includes(t)) score += 3;
    if (hay.includes(question)) score += 5;
    return { title: d.title, score, hasBoth: hay.includes("第四类") && hay.includes("学历学位") };
  })
  .filter((x) => x.score > 0)
  .sort((a, b) => b.score - a.score)
  .slice(0, 8);
console.log("top scores:");
for (const s of scored) console.log(s.score, s.hasBoth, s.title);

await client.end();
