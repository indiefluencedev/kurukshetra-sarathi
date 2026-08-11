// Apply the Postgres migrations, in order, once each.
//
// Replaces `wrangler d1 migrations apply`, which went with D1. Same contract:
// files are numbered, applied in filename order, and a file that has run is
// never run again — the record of what has run lives in the database itself,
// not in anyone's memory.
//
//   npm run migrate            → against NEON_DB_URL from .env
//
// Each file runs inside a transaction, so a migration that fails halfway
// leaves nothing behind. That is the one thing D1 could not do, and it is the
// reason a failed migration used to mean hand-repairing the table.
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Client } from "@neondatabase/serverless";

const dir = join(dirname(fileURLToPath(import.meta.url)), "migrations");

const url = process.env.NEON_DB_URL;
if (!url) {
  console.error("NEON_DB_URL is not set. It lives in apps/api/.env — see docs/15.");
  process.exit(1);
}

const client = new Client(url);
await client.connect();

await client.query(
  `CREATE TABLE IF NOT EXISTS _migrations (
     name text PRIMARY KEY,
     at   timestamptz NOT NULL DEFAULT now()
   )`,
);

const done = new Set((await client.query("SELECT name FROM _migrations")).rows.map((r) => r.name));
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

let applied = 0;
for (const name of files) {
  if (done.has(name)) {
    console.log(`·  ${name}`);
    continue;
  }
  const sql = readFileSync(join(dir, name), "utf8");
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("INSERT INTO _migrations (name) VALUES ($1)", [name]);
    await client.query("COMMIT");
    console.log(`✅ ${name}`);
    applied++;
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(`❌ ${name}\n   ${e.message}`);
    await client.end();
    process.exit(1);
  }
}

console.log(applied ? `\n${applied} applied.` : "\nNothing to do — already current.");
await client.end();
