// Load the bundled JSON into the `content` table.
//
// The app ships a complete copy of its data and always will — that is what
// makes it work on a dead signal. This script makes the database agree with
// that copy, so the endpoint and the fallback start life identical and the
// Board edits forward from there.
//
//   npm run import              every kind
//   npm run import -- hero      one kind
//
// It used to emit SQL for `wrangler d1 execute --file` to run, and had to
// hand-escape every quote to do it. Postgres takes parameters over the wire,
// so the escaping is gone — which is the better half of this change, because
// hand-quoting a place's blurb was one apostrophe away from a syntax error in
// the middle of a bulk import.
//
// Re-running is safe: every statement is an upsert keyed on (kind, id). It
// does NOT delete rows that have vanished from the JSON — a script that can
// silently empty the live catalogue because someone mistyped a filename is a
// worse failure than a stale row. Deletions go through the dashboard.
//
// There is one database now. This writes to the real one; there is no local
// copy to practise on. Use a Neon branch if you want somewhere to practise.
//
// It goes ROUND the Worker, so it cannot purge what the edge is holding — the
// dashboard's own writes do that, this cannot. The feeds carry `s-maxage=60`,
// so give it a minute before deciding an import did not land. See the [cache]
// block in wrangler.toml.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Client } from "@neondatabase/serverless";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, "..", "web", "src", "content", "data");

/** content kind → the bundled file it mirrors. Must match CONTENT_KINDS. */
const FEEDS = {
  places: "destinations.json",
  startpoints: "places-index.json",
  hotels: "hotels.json",
  erickshaw: "erickshaw.json",
  hero: "hero.json",
};

if (!process.env.NEON_DB_URL) {
  console.error("NEON_DB_URL is not set. It lives in apps/api/.env — see docs/15.");
  process.exit(1);
}

/** [kind, id, doc] per row, collected before anything is written. */
const rows = [];

/* Which kinds to write, named on the command line. Without this the only
   available import is ALL of them, and the whole file is an upsert — so
   bringing in one missing catalogue would overwrite fifty-seven places the
   Board has been editing in the dashboard for a month with the copy in the
   repo. `node import-content.mjs hero` writes the one that is missing. */
const only = process.argv.slice(2).filter((a) => a[0] !== "-");
for (const bad of only)
  if (!FEEDS[bad]) throw new Error(`no such kind: ${bad}. Known: ${Object.keys(FEEDS).join(", ")}`);

for (const [kind, file] of Object.entries(FEEDS)) {
  if (only.length && only.indexOf(kind) < 0) continue;
  const path = join(DATA, file);
  if (!existsSync(path)) {
    console.error(`skip ${kind}: ${file} does not exist yet`);
    continue;
  }

  const items = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(items)) throw new Error(`${file} is not an array`);

  const seen = new Set();
  for (const item of items) {
    if (!item?.id) throw new Error(`${file}: an item has no id`);
    // A duplicate id would silently become one row and lose a place. Loud here
    // beats a catalogue that is quietly one short.
    if (seen.has(item.id)) throw new Error(`${file}: duplicate id ${item.id}`);
    seen.add(item.id);

    rows.push([kind, item.id, JSON.stringify(item)]);
  }
  console.error(`${kind}: ${items.length} items from ${file}`);
}

if (!rows.length) {
  console.error("nothing to import");
  process.exit(1);
}

const client = new Client(process.env.NEON_DB_URL);
await client.connect();
try {
  await client.query("BEGIN");
  for (const [kind, id, doc] of rows) {
    await client.query(
      `INSERT INTO content (kind, id, doc, updated_at) VALUES ($1,$2,$3,$4)
       ON CONFLICT (kind, id) DO UPDATE SET doc=excluded.doc, updated_at=excluded.updated_at`,
      [kind, id, doc, Date.now()],
    );
  }
  // Every kind touched gets its revision moved on, or the app keeps serving
  // its cached copy of a catalogue this script just rewrote. The Worker does
  // this on its own writes; a script that goes round the Worker has to do it
  // itself. See db/migrations/0004_rev.sql.
  for (const kind of new Set(rows.map((r) => r[0]))) {
    await client.query(
      "INSERT INTO rev (scope, n) VALUES ($1, 1) ON CONFLICT (scope) DO UPDATE SET n = rev.n + 1",
      [kind],
    );
  }
  await client.query("COMMIT");
} catch (e) {
  await client.query("ROLLBACK");
  console.error(`\nRolled back — nothing was imported.\n${e.message}`);
  await client.end();
  process.exit(1);
}
await client.end();
console.error(`${rows.length} rows imported`);
