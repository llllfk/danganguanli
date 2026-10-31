/**
 * 仅灌入组织岗位配置（部门/岗位）。
 * 人才统计/画像/提醒由档案与审核提取字段实时计算，不再灌示意图假人员。
 * 用法：node scripts/seed-talent.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
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

const data = JSON.parse(
  fs.readFileSync(path.join(__dirname, "seed/talent-data.json"), "utf8")
);

async function main() {
  const client = new pg.Client({
    connectionString: url,
    ssl: url.includes("sslmode=require")
      ? { rejectUnauthorized: false }
      : undefined,
  });
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS talent_chart_items (
      id BIGSERIAL PRIMARY KEY,
      chart_key VARCHAR(32) NOT NULL,
      label VARCHAR(100) NOT NULL,
      value_num NUMERIC NOT NULL DEFAULT 0,
      value_extra NUMERIC,
      color VARCHAR(32),
      pct_text VARCHAR(32),
      sort_order INT4 DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS talent_departments (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE,
      post_count INT4 DEFAULT 0,
      expanded BOOL DEFAULT FALSE,
      sort_order INT4 DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS talent_posts (
      id BIGSERIAL PRIMARY KEY,
      dept_id BIGINT NOT NULL REFERENCES talent_departments(id) ON DELETE CASCADE,
      post_name VARCHAR(100) NOT NULL,
      requirements TEXT,
      sort_order INT4 DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS talent_match_checks (
      id BIGSERIAL PRIMARY KEY,
      person_code VARCHAR(50) NOT NULL,
      post_name VARCHAR(100) NOT NULL,
      dept_name VARCHAR(100),
      item_name VARCHAR(100) NOT NULL,
      require_text TEXT,
      record_text TEXT,
      is_ok BOOL DEFAULT FALSE,
      sort_order INT4 DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS talent_title_promo (
      id BIGSERIAL PRIMARY KEY,
      person_code VARCHAR(50),
      person_name VARCHAR(100) NOT NULL,
      meta_text TEXT,
      verdict TEXT,
      is_ok BOOL DEFAULT FALSE,
      sort_order INT4 DEFAULT 0
    );
  `);

  // 清除旧示意图统计/画像假数据
  await client.query(`DELETE FROM talent_chart_items`);
  await client.query(`DELETE FROM talent_profiles`);
  await client.query(`DELETE FROM talent_match_checks`);
  await client.query(`DELETE FROM talent_title_promo`);
  await client.query(`DELETE FROM talent_stats`);

  await client.query(`DELETE FROM talent_posts`);
  await client.query(`DELETE FROM talent_departments`);
  for (const d of data.departments) {
    const ins = await client.query(
      `INSERT INTO talent_departments (name, post_count, expanded, sort_order)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [d.name, d.posts?.length || 0, !!d.expanded, d.sort]
    );
    const deptId = ins.rows[0].id;
    let pi = 0;
    for (const post of d.posts || []) {
      pi += 1;
      await client.query(
        `INSERT INTO talent_posts (dept_id, post_name, requirements, sort_order)
         VALUES ($1,$2,$3,$4)`,
        [deptId, post.name, post.req, pi]
      );
    }
  }

  const c = await client.query(`
    SELECT 'depts' t, count(*)::int n FROM talent_departments
    UNION ALL SELECT 'posts', count(*)::int FROM talent_posts
  `);
  console.log(
    "talent org seed ok:",
    Object.fromEntries(c.rows.map((r) => [r.t, r.n]))
  );
  console.log(
    "提示：信息统计/画像/提醒已改为从 audit_field_sources 与档案材料实时计算"
  );
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
