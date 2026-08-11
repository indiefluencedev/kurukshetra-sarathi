// Copy the D1 snapshot into Neon. Run once, at the cut-over.
//
//   npm run db:snapshot     → pulls production D1 into .prod.sqlite
//   npm run migrate         → builds the Neon schema
//   npm run copy-from-d1    → this
//
// Reads the SNAPSHOT, not live D1: `wrangler d1 export` has already done the
// hard part, the file is the rollback we want to keep anyway, and a copy that
// reads from a file can be re-run without touching production. `node:sqlite`
// is in the standard library as of Node 22, so reading it needs no dependency.
//
// The whole copy is one transaction. Either Neon ends up holding everything or
// it ends up holding nothing — a half-copied database that looks plausible is
// the worst outcome available here.
//
// REFUSES to run if the target already has content, unless --force. By then
// the Worker may be serving from Neon and its rows are the real ones; this
// script would overwrite them with a snapshot taken before the cut-over.
import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Client } from "@neondatabase/serverless";

const SNAPSHOT = join(dirname(fileURLToPath(import.meta.url)), "..", ".prod.sqlite");
const force = process.argv.includes("--force");

if (!existsSync(SNAPSHOT)) {
  console.error(`No snapshot at ${SNAPSHOT}. Run: npm run db:snapshot`);
  process.exit(1);
}
if (!process.env.NEON_DB_URL) {
  console.error("NEON_DB_URL is not set. It lives in apps/api/.env — see docs/15.");
  process.exit(1);
}

/**
 * What moves, and what does not.
 *
 * `session` is deliberately absent. Copying it would keep two browsers logged
 * in; not copying it costs one sign-in each and saves porting Better Auth's
 * session rows by hand. `rateLimit` is absent for the same kind of reason —
 * they are counters for the last five minutes, not records.
 *
 * Order matters: `account` and `session` reference `user`, so users first.
 */
const TABLES = [
  { name: "user", cast: { emailVerified: (v) => !!v } },
  { name: "account" },
  { name: "verification" },
  { name: "content" },
  { name: "events" },
  { name: "subs" },
  { name: "sent" },
  { name: "audit" },
  { name: "rev" },
];

const db = new DatabaseSync(SNAPSHOT, { readOnly: true });
const client = new Client(process.env.NEON_DB_URL);
await client.connect();

// Guard: is there anything in there already?
const existing = await client.query(
  `SELECT (SELECT COUNT(*) FROM content) + (SELECT COUNT(*) FROM events) + (SELECT COUNT(*) FROM "user") AS n`,
);
if (Number(existing.rows[0].n) > 0 && !force) {
  console.error(
    `Neon already holds ${existing.rows[0].n} rows across content, events and user.\n` +
      `Refusing to overwrite live data with a snapshot. Re-run with --force if that is really what you want.`,
  );
  await client.end();
  process.exit(1);
}

let total = 0;
try {
  await client.query("BEGIN");

  for (const { name, cast = {} } of TABLES) {
    const rows = db.prepare(`SELECT * FROM "${name}"`).all();
    // Emptied first so the script is re-runnable, and inside the transaction so
    // a failure halfway does not leave the table empty.
    await client.query(`DELETE FROM "${name}"`);

    for (const row of rows) {
      const cols = Object.keys(row);
      const values = cols.map((c) => (cast[c] ? cast[c](row[c]) : row[c]));
      const params = cols.map((_, i) => `$${i + 1}`).join(",");
      const quoted = cols.map((c) => `"${c}"`).join(",");
      await client.query(`INSERT INTO "${name}" (${quoted}) VALUES (${params})`, values);
    }

    console.log(`${String(rows.length).padStart(4)}  ${name}`);
    total += rows.length;
  }

  // The identity sequence behind audit.id does not notice ids inserted past
  // it. Without this the next audit entry the Worker writes collides with a
  // copied row and the whole edit fails — on the *audit* write, after the edit
  // has already landed, which would be a confusing thing to debug at 3am.
  await client.query(
    `SELECT setval(pg_get_serial_sequence('audit','id'), COALESCE((SELECT MAX(id) FROM audit), 0) + 1, false)`,
  );

  await client.query("COMMIT");
} catch (e) {
  await client.query("ROLLBACK");
  console.error(`\nRolled back — nothing was copied.\n${e.message}`);
  await client.end();
  process.exit(1);
}

console.log(`\n${total} rows copied. Sessions were not: everyone signs in once more.`);
await client.end();
