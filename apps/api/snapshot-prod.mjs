// Pull production D1 into a local SQLite file, for Drizzle Studio.
//
// The live view (`npm run db:remote`) needs a Cloudflare API token with D1
// access, which someone has to create by hand. This needs nothing beyond the
// wrangler login you already have — `wrangler d1 export` speaks over the same
// session as every other command here.
//
//   npm run db:snapshot     → writes .prod.sqlite
//   npm run db:prod         → snapshot, then open Studio on it
//
// It is a SNAPSHOT, not a connection. Read it, do not edit it: changes go
// nowhere and the file is replaced by the next snapshot. For live production
// rows, use db:remote. See docs/15.
import { execFileSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";

const DB = "discover_kurukshetra";
const DUMP = ".prod-dump.sql";
const OUT = ".prod.sqlite";

const run = (cmd, args) => execFileSync(cmd, args, { stdio: "inherit" });

console.error(`Exporting ${DB} (remote)…`);
run("npx", ["wrangler", "d1", "export", DB, "--remote", "--output", DUMP]);

// sqlite3 ships with macOS and most Linux. Checked explicitly because the
// failure otherwise is a confusing ENOENT from execFileSync.
try {
  execFileSync("sqlite3", ["--version"], { stdio: "ignore" });
} catch {
  console.error("\nsqlite3 is not installed — needed to turn the dump into a file Studio can open.");
  console.error(`The raw SQL is in ${DUMP} if you want it another way.`);
  process.exit(1);
}

// Rebuilt from scratch every time: importing a dump over an existing file
// would append rows and quietly double every table.
if (existsSync(OUT)) unlinkSync(OUT);
run("sqlite3", [OUT, `.read ${DUMP}`]);
unlinkSync(DUMP);

// Row counts, generated then executed — SQLite cannot count a table named by
// a column, so the query that reports the snapshot has to be written by one.
const tables = execFileSync(
  "sqlite3",
  [OUT, "select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name"],
  { encoding: "utf8" },
)
  .split("\n")
  .filter(Boolean);

const counts = execFileSync(
  "sqlite3",
  [OUT, tables.map((t) => `select '  ${t}: ' || count(*) from "${t}"`).join(" union all ")],
  { encoding: "utf8" },
);
console.error(`\nWrote ${OUT} — a snapshot, not a connection.\n${counts}`);
