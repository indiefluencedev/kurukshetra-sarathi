# Task list — what is done, what is not

Living document. Every other file in `docs/` describes how something *works*;
this one is the only place that says what is **finished**. If they disagree,
this file is wrong — fix it here.

Last updated: **11 August 2026** (cleared; scope reopened)

---

## How the stages are meant to be read

| Stage | Means |
|---|---|
| **DEV** | Runs on a laptop. One `npm run dev` from the repo root. Nobody outside sees it. |
| **STAGE** | Deployed to the client's Cloudflare account and reachable, but not announced. What is live today. |
| **PROD** | A real visitor could be handed the URL without a caveat. **We are not here yet.** |

---

## Where things actually are

| | |
|---|---|
| Worker | `kuk-saarthi-api` — **STAGE**, deployed 11 Aug **on Neon** |
| App | `kuk-saarthi.pages.dev` — **STAGE**, rebuilt 11 Aug with the code screen |
| Database | **Neon Postgres** (`neondb`, ap-southeast-1) — live, serving production |
| Auth | Better Auth, email + password, **verified by email**. Google configured, no credentials yet |
| Email | **Resend**, as `noreply@kkr.indietribe.space` — code done, domain pending DNS |

---

## Now

Day-by-day work lives in **[`docs/tasks/`](tasks/)**, a checklist per date —
two lines an item, issues logged under the task they happened in. That is where
a change is explained; this file only says what is true.
Today: [2026-08-11](tasks/2026-08-11.md).

### 1 — D1 → Neon Postgres, then D1 off

**DEPLOYED 11 Aug and verified in production.** All five secrets are set, the
Worker and the app are both rebuilt, and production reads Neon:

| | |
|---|---|
| feeds | 57 places · 13 startpoints · 2 hotels · 15 hero · 4 events, all 200 |
| `/img/` | 200 — R2 unaffected by the move |
| `/admin/events` unauthenticated | 403 |
| sign-up | 200 with `token: null`, and the code lands in Neon |

**One step left: turn D1 off.** It still exists — 475 KB, and `num_tables: 0`
now reports oddly, but the data is there. It is the rollback that does not
depend on a file on one laptop, so leave it a few days. When you are ready,
docs/16 step 5.

D1 holds 475 KB against a 5 GB free tier, so it is not billing. Turning it off
is housekeeping, not cost control.

What was done, what was verified, and what is deliberately not:
[tasks/2026-08-11](tasks/2026-08-11.md).

### 2 — One source of truth: app, database and admin in sync

**Events are done, both sides.** The admin form and the app agree, and the work
that came out of checking them is shipped: the event form was rebuilt around
one map, the app gained an event detail page, and place photographs are visible
for the first time.

**Four kinds left** — places, stays, start points, e-rickshaw — plus a review of
how values are stored across the forms as a whole.

**Next session (12 August):** the admin gallery (a place has up to three
photographs and the dashboard manages them one at a time), the same form pass
for places that events got, and a UI restructure of the dashboard as a whole.

Note that `npm run dev` now points the app at the local Worker, so an admin
edit and its effect on the app can be seen in one place — which this task
needs and did not have this morning.

What the admin saves is what the database holds is what the app shows. Any field the
admin can edit must reach the app, and any field the app reads must be editable
in the admin. Where the three disagree today, the database wins and the other
two are corrected to it.

Two halves:

1. **Sync.** Walk every content kind end to end — admin form → `PUT /admin/content/<kind>`
   → `content` row → `GET /content/<kind>.json` → the screen that renders it.
   Fields that are written but never read, read but never writable, or silently
   dropped in between are the bugs to find.
2. **The admin side.** Layout, and how values are stored. The forms grew one
   feature at a time (folders, tabs, tagging, the map) and the storing has not
   been reviewed as a whole.

Everything under "Deprecated" stays parked until this lands.

### 3 — Email verification and password reset

**Built and verified locally; one manual step left.** Verification is now
required to sign in, a forgotten password is recoverable, and neither form
reveals whether an address is registered. Two of the oldest blocking items,
closed together because they were always one item: both needed a sender.

**The sender is configuration, not code.** `EMAIL_PROVIDER` is `cloudflare`,
`resend` or `log`, with `EMAIL_FROM` / `EMAIL_NAME` alongside it. The move from
Cloudflare to Resend was exactly that — three variables, no code touched.
Verification is a six-digit code, and `npm run otp` reads it out of the
database, so the whole flow is testable with no mail being delivered at all.

**Before this is public:** `storeOTP` is `"plain"` so the code is readable.
That is deliberate and temporary — turn it to `"hashed"` once mail works.

**Provider is Resend**, sending as `noreply@kkr.indietribe.space`. Cloudflare
Email Sending was abandoned — `wrangler email sending enable` answered `2036
Unauthorized` on every credential available.

**Left to do: three DNS records.** The domain is registered with Resend and
**pending**. `indietribe.space` is on Hostinger, not Cloudflare, so the records
have to be added there by hand:

| Type | Name | Value |
|---|---|---|
| TXT | `resend._domainkey.kkr` | DKIM `p=…` — run `npm run email:status` for it |
| MX | `send.kkr` | `feedback-smtp.ap-northeast-1.amazonses.com`, priority 10 |
| TXT | `send.kkr` | `v=spf1 include:amazonses.com ~all` |

Then `npm run email:status -- --verify`. Until it verifies every send fails
with a Resend 403 — logged, and deliberately not fatal, so the symptom is
sign-ups that work and mail that never arrives. `npm run otp` covers testing
meanwhile.

Also outstanding: `RESEND_API_KEY` is in `.env` but **not yet
`wrangler secret put`** for production.

### Done today, alongside 1

- **`npm run dev` runs everything.** One command from the repo root: Worker and
  app together, labelled output, both reachable from a phone on the same wifi.
  See `dev.mjs`.
- **Drizzle is gone** — viewer only, and it existed because looking at D1 was
  awkward. The Neon console does the job. `npm run inspect` went with it; the
  migration runner covers what it guarded.
- **R2 is `remote` in dev.** Production was never broken — 99 objects, 99
  content references, all serving. Local dev was: an empty emulated bucket
  against the real Neon database, so every `/img/` 404'd and the media library
  was empty. One line. Note the cost — an upload from a laptop is now an
  upload in production, the same deal the database already has.


---

## Deprecated — carried over from the 4 August 2026 list

Kept verbatim as a record of what was open when the list was cleared. **None of
these is a commitment.** Anything still wanted gets rewritten under "Now" in
today's scope, in today's words; anything not rewritten is not being done.
Several were already overtaken by the admin work of 5–11 August.

### Was "blocking production"

- `VAPID_SUBJECT` is still `mailto:REPLACE@example.org` — push services may
  reject a token whose subject is not a real address. One line in
  `wrangler.toml` + redeploy.
- ~~No password reset.~~ **Done 11 Aug** — see 3 above.
- ~~No email verification.~~ **Done 11 Aug** — see 3 above.
- Saved plans do not sync. Plans live in IndexedDB on one device, so the
  account currently buys the user nothing.
- Custom domain. `pages.dev` + `workers.dev` are different sites, which is why
  sessions use bearer tokens in localStorage. One domain with the Worker on
  `/api/*` makes cookies first-party.

### Was "not blocking, but promised"

- Hotels — schema, endpoint and admin routes exist and serve empty. Data to
  come from an OSM harvest (`tools/harvest-places.mjs` extension).
- E-rickshaw — same, but OSM has no usable source. Needs a hand-made list of
  stands and fares from the Board.
- Admin dashboard cannot edit places. *(Overtaken — `admin-forms.ts` now edits
  and tags places; recheck before rewriting.)*
- Google sign-in — coded and dormant, hidden until `/config` reports
  credentials. Needs a Google Cloud OAuth client with
  `https://kuk-saarthi-api.indiefluence-in-media.workers.dev/api/auth/callback/google`
  as the authorised redirect URI, then `npx wrangler secret put
  GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, then `npm run deploy`.
- Nothing has been pushed yet. The cron fires every 15 minutes and the
  encryption is unit-tested, but no real notification has reached a real phone.
- Promoting an admin is a raw SQL statement. Fine for three people, not a
  process.
- `npm run build-matrix` after any new place, or its travel times stay
  estimated.

---

## Deliberately not doing

Recorded so they are not re-proposed.

- **Drizzle.** Both halves of it. As an ORM: one `content` table read as whole
  documents and five auth tables the library owns, so it would add a build step
  and a second schema to keep in step with `db/migrations/`, and remove no SQL
  worth removing — `store.neon.ts` is the only file with any. As Studio: it was
  a viewer, kept because looking at D1 was awkward, and the Neon console does
  that better. Removed 11 August 2026.
- **Per-field columns for places.** See docs/13.
- **Cloudflare Access for `/admin`.** Replaced by the role check, so the Board
  uses one login rather than two systems.
- **A client-side auth library.** See the header of `features/account/auth.ts`.
- **Prose design specs.** The tokens in `apps/web/src/styles/global.css` are
  the design system. Docs 06 and 07 were deleted on 11 August 2026 — they
  described a palette the code had already replaced.
