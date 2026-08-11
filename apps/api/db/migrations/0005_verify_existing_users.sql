-- Mark the accounts that predate email verification as verified.
--
-- `requireEmailVerification` went from false to true in src/auth.ts. Every
-- account created from now on proves its address by clicking a link. The two
-- accounts that already existed never had the chance, and `emailVerified` was
-- `false` on both — so without this migration, turning the flag on locks the
-- Board out of its own dashboard the moment it deploys, with a "verify your
-- email" message and no email ever having been sent.
--
-- Is this a shortcut around the check? No, and the distinction matters:
--
--   * Both rows predate this migration. The clause below is `createdAt <` a
--     fixed timestamp, not `WHERE true` — it cannot catch a future sign-up,
--     even if someone re-runs it.
--   * Both addresses are already proved by other means. They are the two in
--     ADMIN_EMAILS, which is a value in wrangler.toml that only someone with
--     account access can change. Their claim to those addresses does not rest
--     on this column and never did.
--
-- The alternative — asking both to click a verification link — would have been
-- fine too, and is what to do if this ever involves more than two people you
-- can walk over to. At this size it trades a deploy-time lockout for nothing.
UPDATE "user"
   SET "emailVerified" = true,
       "updatedAt"     = now()
 WHERE "emailVerified" = false
   AND "createdAt" < timestamptz '2026-08-11 00:00:00+00';
