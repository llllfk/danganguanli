import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function loadEnvLocal() {
  const p = path.join(root, ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnvLocal();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("缺少 DATABASE_URL");
  process.exit(1);
}

const sqlPath = path.join(root, "scripts", "schema.sql");
const sql = fs.readFileSync(sqlPath, "utf8");

const client = new pg.Client({
  connectionString: url,
  ssl: url.includes("sslmode=require")
    ? { rejectUnauthorized: false }
    : undefined,
});

try {
  console.log("连接数据库...");
  await client.connect();
  const ping = await client.query("select version() as v, current_database() as db");
  console.log("已连接:", ping.rows[0].db);
  console.log("版本:", String(ping.rows[0].v).split(",")[0]);
  await client.query(sql);
  console.log("建表完成: policy_history / audit_records / business_rules / policy_documents");
  const tables = await client.query(`
    select table_name from information_schema.tables
    where table_schema = 'public'
      and table_name in ('policy_history','audit_records','business_rules','policy_documents')
    order by table_name
  `);
  console.log(
    "确认表:",
    tables.rows.map((r) => r.table_name).join(", ")
  );
} catch (err) {
  console.error("初始化失败:", err.message || err);
  process.exit(1);
} finally {
  await client.end();
}
