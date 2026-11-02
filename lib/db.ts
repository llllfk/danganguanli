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

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL 未配置：全部业务数据必须从 PostgreSQL 读取，请在 .env.local 或环境变量中设置。"
    );
  }

  const config: PoolConfig = {
    connectionString,
    // 强制走 IPv4，避免 Windows/公司网下 IPv6 解析失败
    family: 4,
    ssl: /sslmode=require/i.test(connectionString)
      ? { rejectUnauthorized: false }
      : undefined,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  };

  const p = new Pool(config);
  p.on("connect", (client) => {
    // 避免单条 SQL 卡死占满连接池
    void client.query("SET statement_timeout TO 20000");
  });
  return p;
}

const pool = globalThis.__hrAiPool ?? createPool();
if (process.env.NODE_ENV !== "production") {
  globalThis.__hrAiPool = pool;
}

export function hasDatabase() {
  return Boolean(process.env.DATABASE_URL);
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  return pool.query<T>(text, params);
}

export default pool;
