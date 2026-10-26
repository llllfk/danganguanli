import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __hrAiPool: Pool | undefined;
}

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return null;
  return new Pool({ connectionString });
}

const pool = globalThis.__hrAiPool ?? createPool();
if (process.env.NODE_ENV !== "production" && pool) {
  globalThis.__hrAiPool = pool;
}

export function hasDatabase() {
  return Boolean(process.env.DATABASE_URL && pool);
}

export default pool;
