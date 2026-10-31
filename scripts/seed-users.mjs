/**
 * 初始化登录账号（幂等：已有手机号则跳过）
 * 13800000001 / Admin@123  管理员
 * 13800000002 / User@123   普通用户
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, scryptSync } from "node:crypto";
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

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
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
    CREATE TABLE IF NOT EXISTS sys_users (
      id BIGSERIAL PRIMARY KEY,
      username VARCHAR(64) NOT NULL UNIQUE,
      display_name VARCHAR(100) NOT NULL,
      password_hash TEXT NOT NULL,
      role VARCHAR(16) NOT NULL DEFAULT 'user',
      status VARCHAR(16) NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 兼容旧账号
  await client.query(
    `UPDATE sys_users SET username='13800000001' WHERE username='admin'
     AND NOT EXISTS (SELECT 1 FROM sys_users u2 WHERE u2.username='13800000001')`
  );
  await client.query(
    `UPDATE sys_users SET username='13800000002' WHERE username='user'
     AND NOT EXISTS (SELECT 1 FROM sys_users u2 WHERE u2.username='13800000002')`
  );

  const users = [
    ["13800000001", "系统管理员", "Admin@123", "admin"],
    ["13800000002", "档案员", "User@123", "user"],
  ];

  for (const [phone, displayName, password, role] of users) {
    const exists = await client.query(
      `SELECT id FROM sys_users WHERE username = $1`,
      [phone]
    );
    if (exists.rowCount) {
      console.log("skip", phone);
      continue;
    }
    await client.query(
      `INSERT INTO sys_users (username, display_name, password_hash, role)
       VALUES ($1,$2,$3,$4)`,
      [phone, displayName, hashPassword(password), role]
    );
    console.log("created", phone, role);
  }

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
