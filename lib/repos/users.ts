import { query } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { assertCnMobile } from "@/lib/phone";
import type { AuthUser, SysUser, UserRole } from "@/types";

type UserRow = {
  id: string;
  username: string;
  display_name: string;
  password_hash: string;
  role: UserRole;
  status: string;
  created_at: Date;
  updated_at: Date;
};

function mapUser(row: UserRow): SysUser {
  return {
    id: row.id,
    phone: row.username,
    displayName: row.display_name,
    role: row.role,
    status: row.status === "disabled" ? "disabled" : "active",
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function ensureUsersSchema() {
  await query(`
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
  // 旧演示账号 admin/user → 手机号
  await query(
    `UPDATE sys_users SET username = '13800000001', updated_at = CURRENT_TIMESTAMP
     WHERE username = 'admin'
       AND NOT EXISTS (SELECT 1 FROM sys_users WHERE username = '13800000001')`
  );
  await query(
    `UPDATE sys_users SET username = '13800000002', updated_at = CURRENT_TIMESTAMP
     WHERE username = 'user'
       AND NOT EXISTS (SELECT 1 FROM sys_users WHERE username = '13800000002')`
  );
}

export async function findUserByPhone(phone: string) {
  await ensureUsersSchema();
  const normalized = assertCnMobile(phone);
  const r = await query<UserRow>(
    `SELECT id::text, username, display_name, password_hash, role, status, created_at, updated_at
     FROM sys_users WHERE username = $1`,
    [normalized]
  );
  return r.rows[0] || null;
}

/** @deprecated 使用 findUserByPhone；保留别名避免热更新缓存断裂 */
export const findUserByUsername = findUserByPhone;

export async function findUserById(id: string) {
  await ensureUsersSchema();
  const r = await query<UserRow>(
    `SELECT id::text, username, display_name, password_hash, role, status, created_at, updated_at
     FROM sys_users WHERE id = $1::bigint`,
    [id]
  );
  return r.rows[0] || null;
}

export async function listUsers(): Promise<SysUser[]> {
  await ensureUsersSchema();
  const r = await query<UserRow>(
    `SELECT id::text, username, display_name, password_hash, role, status, created_at, updated_at
     FROM sys_users
     ORDER BY id ASC`
  );
  return r.rows.map(mapUser);
}

export async function createUser(input: {
  phone: string;
  displayName: string;
  password: string;
  role: UserRole;
}): Promise<SysUser> {
  await ensureUsersSchema();
  const phone = assertCnMobile(input.phone);
  const r = await query<UserRow>(
    `INSERT INTO sys_users (username, display_name, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id::text, username, display_name, password_hash, role, status, created_at, updated_at`,
    [
      phone,
      input.displayName.trim(),
      hashPassword(input.password),
      input.role,
    ]
  );
  return mapUser(r.rows[0]);
}

export async function updateUser(
  id: string,
  patch: {
    displayName?: string;
    role?: UserRole;
    status?: "active" | "disabled";
    password?: string;
    phone?: string;
  }
): Promise<SysUser> {
  await ensureUsersSchema();
  const cur = await findUserById(id);
  if (!cur) throw new Error("用户不存在");

  const displayName = patch.displayName?.trim() || cur.display_name;
  const role = patch.role || cur.role;
  const status = patch.status || cur.status;
  const passwordHash = patch.password
    ? hashPassword(patch.password)
    : cur.password_hash;
  const phone = patch.phone ? assertCnMobile(patch.phone) : cur.username;

  const r = await query<UserRow>(
    `UPDATE sys_users
     SET username = $2, display_name = $3, role = $4, status = $5, password_hash = $6,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1::bigint
     RETURNING id::text, username, display_name, password_hash, role, status, created_at, updated_at`,
    [id, phone, displayName, role, status, passwordHash]
  );
  return mapUser(r.rows[0]);
}

export async function deleteUser(id: string) {
  await ensureUsersSchema();
  const r = await query(`DELETE FROM sys_users WHERE id = $1::bigint RETURNING id`, [
    id,
  ]);
  if (!r.rowCount) throw new Error("用户不存在");
}

export function toAuthUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    phone: row.username,
    displayName: row.display_name,
    role: row.role,
  };
}

export async function seedDefaultUsers() {
  await ensureUsersSchema();
  const count = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM sys_users`
  );
  if (count.rows[0].n > 0) return;

  await createUser({
    phone: "13800000001",
    displayName: "系统管理员",
    password: "Admin@123",
    role: "admin",
  });
  await createUser({
    phone: "13800000002",
    displayName: "档案员",
    password: "User@123",
    role: "user",
  });
}
