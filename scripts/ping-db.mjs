import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const line of fs.readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0 && !process.env[t.slice(0, i)]) process.env[t.slice(0, i)] = t.slice(i + 1);
}

const url = process.env.DATABASE_URL;
const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
await client.query(
  "INSERT INTO policy_history (question, answer, found) VALUES ($1, $2, $3)",
  ["连通性测试", "数据库已接通", true]
);
const r = await client.query("SELECT count(*)::int AS n FROM policy_history");
console.log("policy_history rows =", r.rows[0].n);
await client.end();
console.log("ok");
