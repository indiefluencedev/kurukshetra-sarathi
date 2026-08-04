// Print the path of wrangler's local D1 file, for Drizzle Studio.
//
// wrangler names it after a hash of the binding and keeps several databases
// under the same directory, so hardcoding the path breaks the first time the
// sandbox is recreated. This picks the D1 file that actually has our tables in
// it, which is also the check that you are about to browse the right one.
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const DIR = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";

let files;
try {
  files = readdirSync(DIR).filter((f) => f.endsWith(".sqlite") && f !== "metadata.sqlite");
} catch {
  console.error("No local D1 yet. Run: npm run migrate:local");
  process.exit(1);
}

// The biggest one is ours — the others are empty sandboxes wrangler made for
// bindings that were never written to.
const best = files.map((f) => ({ f, size: statSync(join(DIR, f)).size })).sort((a, b) => b.size - a.size)[0];

if (!best || best.size === 0) {
  console.error("Local D1 is empty. Run: npm run migrate:local && npm run import:local");
  process.exit(1);
}

const path = join(process.cwd(), DIR, best.f);
if (process.argv.includes("--check")) {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", "discover_kurukshetra", "--local", "--json",
    "--command", "select name from sqlite_master where type='table'"], { encoding: "utf8" });
  console.error(out.slice(out.indexOf("[")));
}
console.log(path);
