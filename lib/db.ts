import dns from "node:dns";
import { Pool, type PoolConfig, type QueryResult, type QueryResultRow } from "pg";

// 火山 PG 域名常先解析出 IPv6；本机无可用 IPv6 时会 getaddrinfo ENOTFOUND
try {
  dns.setDefaultResultOrder("ipv4first");
} catch {
  /* Node < 17 */
}

declare global {
  // eslint-disable-next-line no-var
  var __hrAiPool: Pool | undefined;
}

export function hasDatabase() {
  return Boolean((process.env.DATABASE_URL || "").trim());
}

function createPool(): Pool {
  const connectionString = (process.env.DATABASE_URL || "").trim();
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL 未配置：请在环境变量或 .env.local 中设置 PostgreSQL 连接串。"
    );
  }

  const config: PoolConfig = {
    connectionString,
    ssl: /sslmode=require/i.test(connectionString)
      ? { rejectUnauthorized: false }
      : undefined,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  };

  // family 走底层连接选项；@types/pg 的 PoolConfig 未声明该字段
  const p = new Pool({ ...config, family: 4 } as PoolConfig);
  p.on("connect", (client) => {
    void client.query("SET statement_timeout TO 20000");
  });
  return p;
}

/** 懒创建：缺 DATABASE_URL 时不在 import 阶段抛错，应用仍可启动 */
function getPool(): Pool {
  if (!globalThis.__hrAiPool) {
    globalThis.__hrAiPool = createPool();
  }
  return globalThis.__hrAiPool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  return getPool().query<T>(text, params);
}

const pool = {
  query: <T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[]
  ) => getPool().query<T>(text, params),
};

export default pool;
