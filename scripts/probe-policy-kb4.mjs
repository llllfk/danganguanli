import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0 && !process.env[t.slice(0, i)]) {
      process.env[t.slice(0, i)] = t.slice(i + 1);
    }
  }
}

const KEY_FOURTH = "\u7b2c\u56db\u7c7b"; // 第四类
const KEY_XUELI = "\u5b66\u5386\u5b66\u4f4d"; // 学历学位
const KEY_ZILEI = "\u5b50\u7c7b"; // 子类

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const ids = await client.query(
  `SELECT id::text, title FROM policy_documents ORDER BY id`
);
console.log("docs", ids.rowCount);

let ok = 0;
let bad = 0;
const fourth = [];

for (const row of ids.rows) {
  try {
    // fetch as bytea to bypass utf8 validation on server for corrupt text
    const r = await client.query(
      `SELECT encode(convert_to(content, 'UTF8'), 'base64') AS b64
       FROM policy_documents WHERE id = $1::bigint`,
      [row.id]
    ).catch(async () => {
      // if convert_to fails, content itself is invalid utf8 in DB
      const r2 = await client.query(
        `SELECT encode(content::bytea, 'base64') AS b64
         FROM policy_documents WHERE id = $1::bigint`,
        [row.id]
      );
      return r2;
    });

    const buf = Buffer.from(r.rows[0].b64, "base64");
    const c = buf.toString("utf8");
    ok++;
    if (c.includes(KEY_FOURTH)) {
      const idx = c.indexOf(KEY_FOURTH);
      fourth.push({
        id: row.id,
        title: row.title,
        hasXueLi: c.includes(KEY_XUELI),
        hasZiLei: c.includes(KEY_ZILEI),
        has41: c.includes("4-1"),
        snip: c.slice(Math.max(0, idx - 40), idx + 200).replace(/\s+/g, " "),
      });
    }
  } catch (e) {
    bad++;
    console.log("BAD", row.id, row.title, e.message.slice(0, 120));
  }
}

console.log(JSON.stringify({ ok, bad, fourthCount: fourth.length }, null, 2));
for (const f of fourth) {
  console.log("\n===", f.id, f.title);
  console.log(
    "flags",
    JSON.stringify({
      hasXueLi: f.hasXueLi,
      hasZiLei: f.hasZiLei,
      has41: f.has41,
    })
  );
  console.log(f.snip);
}

await client.end();
