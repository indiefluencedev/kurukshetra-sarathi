/**
 * Look before you migrate.
 *
 * `discover_kurukshetra` already exists and is not ours. Every statement in
 * migrations/0001_init.sql is `CREATE TABLE IF NOT EXISTS`, which is safe in
 * the sense that it destroys nothing — and dangerous in the sense that it
 * silently does nothing when a table of that name is already there. The Worker
 * would then query columns that do not exist, against a live client database,
 * and the first sign of trouble would be the dashboard failing in production.
 *
 * So: list what is there, compare it with what the code needs, and refuse the
 * migration if the two disagree. A name collision is a conversation with the
 * client, not something to resolve by guessing.
 *
 * Run:  npm run inspect            (local)
 *       npm run inspect -- --remote
 */
import { execFileSync } from "node:child_process";

const DB = "discover_kurukshetra";
const remote = process.argv.includes("--remote");

/** Columns the Worker reads or writes. Keep in step with store.d1.ts. */
const NEEDED = {
  events: ["id", "kind", "name_en", "name_hi", "date_from", "date_to", "places",
           "visit_factor", "travel_factor", "blurb_en", "blurb_hi", "notice_en",
           "notice_hi", "bias", "img", "win_from", "win_to", "corridor", "advice", "updated_at"],
  subs: ["endpoint", "p256dh", "auth", "lang", "created_at"],
  sent: ["event_id", "day", "at"],
  audit: ["id", "at", "who", "action", "entity", "entity_id", "after"],
};

function d1(sql) {
  const args = ["wrangler", "d1", "execute", DB, remote ? "--remote" : "--local", "--json", "--command", sql];
  const out = execFileSync("npx", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const json = JSON.parse(out.slice(out.indexOf("[")));
  return json[0]?.results ?? [];
}

console.log(`Inspecting ${DB} (${remote ? "remote" : "local"})…\n`);

let tables;
try {
  tables = d1("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'");
} catch (e) {
  console.error("Could not reach the database.\n");
  console.error("If this is the client's account, check that CLOUDFLARE_API_TOKEN is set");
  console.error("and that account_id in wrangler.toml is theirs. See docs/12.\n");
  console.error(String(e.stderr || e.message).split("\n").slice(0, 6).join("\n"));
  process.exit(1);
}

const present = new Set(tables.map((t) => t.name));
console.log(present.size ? `Existing tables: ${[...present].join(", ")}` : "No tables yet — a clean database.");

const clashes = [];
for (const [table, cols] of Object.entries(NEEDED)) {
  if (!present.has(table)) {
    console.log(`  ${table.padEnd(8)} will be created`);
    continue;
  }
  const have = new Set(d1(`PRAGMA table_info(${table})`).map((c) => c.name));
  const missing = cols.filter((c) => !have.has(c));
  if (missing.length) {
    clashes.push({ table, missing, have: [...have] });
    console.log(`  ${table.padEnd(8)} EXISTS but is missing: ${missing.join(", ")}`);
  } else {
    console.log(`  ${table.padEnd(8)} exists and has every column we need`);
  }
}

if (clashes.length) {
  console.error(`\nRefusing to migrate: ${clashes.length} table(s) already exist with a different shape.`);
  console.error("CREATE TABLE IF NOT EXISTS would skip them and the Worker would then query");
  console.error("columns that are not there. Options, in order of preference:\n");
  console.error("  1. Ask the client what those tables are for. They may be dead.");
  console.error("  2. Rename ours — the table names live in worker/src/store.d1.ts and");
  console.error("     migrations/0001_init.sql, and nothing outside those two files knows them.");
  console.error("  3. Use a separate D1 database for the app and leave theirs alone.\n");
  process.exit(1);
}

console.log("\nSafe to migrate.");
