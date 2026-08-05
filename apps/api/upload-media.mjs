// Put the photograph catalogue into R2.
//
// One-shot for the move off the bundle, and re-runnable forever after: `r2
// object put` overwrites, so running this again re-uploads whatever is in the
// folder and changes nothing else. Safe to interrupt.
//
//   node upload-media.mjs            # dry run — says what it would do
//   node upload-media.mjs --go       # upload to the REMOTE bucket
//   node upload-media.mjs --go --local   # upload to the wrangler dev bucket
//
// The key is the filename: brahma-sarovar.webp. That is the id the content
// already uses, which is why nothing in the database had to change.
//
// The logo is skipped. It stays in the app bundle — see data/images.ts for why.
import { readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const DIR = new URL("../web/src/assets/images/", import.meta.url).pathname;
const BUCKET = "kuk-saarthi-media";
const SKIP = new Set(["logo.webp", "logo-sm.webp"]);

const go = process.argv.includes("--go");
const local = process.argv.includes("--local");

const files = readdirSync(DIR)
  .filter((f) => f.endsWith(".webp"))
  .filter((f) => !SKIP.has(f))
  .sort();

const total = files.reduce((n, f) => n + statSync(join(DIR, f)).size, 0);
console.log(`${files.length} photographs, ${(total / 1024 / 1024).toFixed(2)} MB -> ${BUCKET}${local ? " (local)" : " (remote)"}`);
if (!go) {
  console.log("\nDry run. Nothing uploaded. Re-run with --go to upload.");
  console.log("First five keys:", files.slice(0, 5).join(", "));
  process.exit(0);
}

let done = 0;
const failed = [];
for (const f of files) {
  try {
    execFileSync(
      "npx",
      [
        "wrangler", "r2", "object", "put", `${BUCKET}/${f}`,
        "--file", join(DIR, f),
        "--content-type", "image/webp",
        local ? "--local" : "--remote",
      ],
      { stdio: "pipe" },
    );
    done++;
    if (done % 10 === 0 || done === files.length) console.log(`  ${done}/${files.length}`);
  } catch (e) {
    // Keep going. One bad object must not leave the catalogue half-moved with
    // no record of which half — the list at the end is the thing to act on.
    failed.push(f);
    console.error(`  FAILED ${f}: ${String(e.stderr || e.message).trim().split("\n").pop()}`);
  }
}

console.log(`\nUploaded ${done}/${files.length}.`);
if (failed.length) {
  console.error(`Still missing (${failed.length}): ${failed.join(", ")}`);
  process.exit(1);
}
