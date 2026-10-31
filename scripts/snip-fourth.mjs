import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = fs.readFileSync(path.join(root, ".env.local"), "utf8");
for (const line of env.split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0 && !process.env[t.slice(0, i)]) process.env[t.slice(0, i)] = t.slice(i + 1);
}

const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();
const { rows } = await c.query(
  `SELECT id, title, content FROM policy_documents WHERE id IN (6,8,13,22,30,33)`
);
for (const r of rows) {
  console.log("\n====", r.id, r.title.slice(0, 50));
  for (const m of ["4-1", "4－1", "学历学位材料", "下设", "二级类", "十类", "第四类"]) {
    let from = 0;
    let n = 0;
    while (n < 2) {
      const i = r.content.indexOf(m, from);
      if (i < 0) break;
      n++;
      from = i + m.length;
      console.log(`  [${m}#${n}]`, r.content.slice(Math.max(0, i - 50), i + 160).replace(/\s+/g, " "));
    }
    if (n === 0) console.log(`  [${m}] none`);
  }
}
await c.end();
