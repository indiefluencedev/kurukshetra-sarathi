// Read the latest confirmation code out of the database.
//
//   npm run otp                    the most recent code, whoever it is for
//   npm run otp -- you@example.org for one address
//
// For testing while the sending domain is not onboarded and no mail actually
// leaves. Sign up in the app, run this, type the six digits in.
//
// Better Auth keeps OTPs in `verification`, one row per outstanding code:
//   identifier = "email-verification-otp-<address>"
//   value      = "<code>:<attempts>"
//   expiresAt  = ten minutes out
//
// Reading it here rather than telling anyone to write SQL is the point: the
// query is short but the identifier prefix and the `code:attempts` shape are
// exactly the two things nobody remembers, and getting either wrong looks like
// "the OTP is missing" rather than "the query is wrong".
import { neon } from "@neondatabase/serverless";

if (!process.env.NEON_DB_URL) {
  console.error("NEON_DB_URL is not set. It lives in apps/api/.env — see docs/15.");
  process.exit(1);
}

const who = process.argv[2]?.trim().toLowerCase();
const sql = neon(process.env.NEON_DB_URL);

const rows = who
  ? await sql`SELECT identifier, value, "expiresAt" FROM verification
              WHERE identifier = ${"email-verification-otp-" + who}
              ORDER BY "createdAt" DESC LIMIT 1`
  : await sql`SELECT identifier, value, "expiresAt" FROM verification
              WHERE identifier LIKE 'email-verification-otp-%'
              ORDER BY "createdAt" DESC LIMIT 5`;

if (!rows.length) {
  console.error(
    who
      ? `No outstanding code for ${who}. Sign up, or ask for a new one — codes are deleted once used.`
      : "No outstanding codes. Sign up in the app first; codes are deleted once used.",
  );
  process.exit(1);
}

for (const r of rows) {
  const email = r.identifier.replace(/^email-verification-otp-/, "");
  // `value` is "<code>:<attempts used>". The attempts half matters: at 3 the
  // code is spent even though the row is still sitting here.
  const [code, attempts] = String(r.value).split(":");
  const left = Math.round((new Date(r.expiresAt) - new Date()) / 1000);
  const state = left <= 0 ? "EXPIRED" : `${Math.floor(left / 60)}m ${left % 60}s left`;
  console.log(`${code}   ${email}   ${state}${attempts && attempts !== "0" ? `   ${attempts} wrong so far` : ""}`);
}
