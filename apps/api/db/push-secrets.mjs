// Push the SECRETS out of .env into Cloudflare. Nothing else.
//
//   npm run secrets:push          show what would go, change nothing
//   npm run secrets:push -- --go  actually upload
//
// Secrets travel one way — Cloudflare will never give them back (docs/15) — so
// `.env` is the only copy and this is the only route from it to production.
//
// ── Why a list, and not just `wrangler secret bulk .env` ───────────────────
//
// Wrangler will happily take the whole file, and that would be wrong twice:
//
//   1. CLOUDFLARE_API_TOKEN would become a Worker secret. That is a DEPLOY
//      credential — it can rewrite this Worker. Handing it to the thing it
//      deploys turns a bug in the Worker into account access.
//   2. ADMIN_EMAILS, EMAIL_PROVIDER, VAPID_SUBJECT and friends belong in
//      wrangler.toml [vars], where they are visible, reviewable and in git.
//      Uploaded as secrets they SHADOW the [vars] — the dashboard shows
//      "encrypted", nobody can see who is an admin, and editing wrangler.toml
//      silently stops having any effect.
//
// So the list below is explicit. A variable is a secret here only if it is a
// credential; everything else is config and lives in git.
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";

/** The only things that may become Worker secrets. */
const SECRETS = [
  "NEON_DB_URL",   // the database, with its password in it
  "AUTH_SECRET",   // signs every session
  "RESEND_API_KEY",// sends mail as us
  "VAPID_PRIVATE", // signs push tokens
  "VAPID_PUBLIC",  // not actually secret, but Cloudflare already holds it as one
];

const go = process.argv.includes("--go");

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split("\n")
    .filter((l) => /^[A-Z_][A-Z0-9_]*=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

/**
 * Values that are obviously not real.
 *
 * `.env` ships with `AUTH_SECRET=local-dev-only-replace-me`, and that string
 * uploaded to production is not a weak secret, it is a PUBLISHED one — it is
 * in `.env.example`, in git, in this repo. Anyone could mint a valid session.
 * The failure is silent: sessions keep working, so nothing ever complains.
 *
 * Cheap to check, catastrophic to miss, so it is checked.
 */
const looksFake = (v) =>
  /replace|example|changeme|your[-_]?key|xxx|placeholder|local-dev/i.test(v) || v.length < 16;

const present = SECRETS.filter((k) => env[k] && !looksFake(env[k]));
const missing = SECRETS.filter((k) => !env[k]);
const fake = SECRETS.filter((k) => env[k] && looksFake(env[k]));

for (const k of present) console.log(`  will upload  ${k.padEnd(15)} ${env[k].slice(0, 6)}… (${env[k].length} chars)`);
// Missing is reported, never guessed at. An empty secret uploaded over a good
// one is worse than not uploading: it looks set and behaves as absent.
for (const k of missing) console.log(`  SKIPPED      ${k.padEnd(15)} empty in .env — left as-is in Cloudflare`);
for (const k of fake) console.log(`  REFUSED      ${k.padEnd(15)} still a placeholder — "${env[k].slice(0, 28)}"`);

if (fake.length) {
  console.error(
    `\n${fake.join(", ")} ${fake.length > 1 ? "are" : "is"} a placeholder from .env.example, which is in git.` +
      `\nUploaded to production that is not a weak secret, it is a published one.` +
      `\n\n  openssl rand -base64 32        # AUTH_SECRET` +
      `\n  npx web-push generate-vapid-keys # the VAPID pair, both halves together` +
      `\n\nPut the real values in .env and run this again.`,
  );
  process.exit(1);
}

if (!present.length) {
  console.error("\nNothing to upload. Fill the values in .env first.");
  process.exit(1);
}

if (!go) {
  console.log(`\nDry run. Nothing was sent. Add --go to upload.`);
  process.exit(0);
}

// Written, uploaded, deleted. `wrangler secret bulk` reads .env format, which
// saves one interactive prompt per secret and the copy-paste mistakes that
// come with them.
const tmp = ".secrets-upload.env";
try {
  writeFileSync(tmp, present.map((k) => `${k}=${env[k]}`).join("\n") + "\n", { mode: 0o600 });
  execFileSync("npx", ["wrangler", "secret", "bulk", tmp], { stdio: "inherit" });
  console.log(`\n${present.length} secrets uploaded. They cannot be read back — .env is the only copy.`);
} finally {
  try {
    unlinkSync(tmp);
  } catch {
    /* never existed */
  }
}
