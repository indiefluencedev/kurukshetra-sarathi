# Task list — what is done, what is not

Living document. Every other file in `docs/` describes how something *works*;
this one is the only place that says what is **finished**. If they disagree,
this file is wrong — fix it here.

Last updated: **13 August 2026**

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
| Worker | `kuk-saarthi-api` — **STAGE**, deployed 13 Aug **on Neon**, with Workers Cache in front of it |
| App | `kuk-saarthi.pages.dev` — **STAGE**, deployed 13 Aug with the stays catalogue |
| Database | **Neon Postgres** (`neondb`, ap-southeast-1) — live, serving production |
| Auth | Better Auth, email + password, **verified by email**. Google configured, no credentials yet |
| Email | **Resend**, as `noreply@kkr.indietribe.space` — code done, domain pending DNS |

---

## Now

Day-by-day work lives in **[`docs/tasks/`](tasks/)**, a checklist per date —
two lines an item, issues logged under the task they happened in. That is where
a change is explained; this file only says what is true.
Today: [2026-08-13](tasks/2026-08-13.md).

## Pending — everything open, in one list

Nothing here is scheduled and nothing here is forgotten. Each line says where
it is explained; the sections below say why it matters. An item leaves this
list by being done or by being moved to "Deliberately not doing" — not by
being quietly dropped.

**Blocking a real launch**

- [ ] **Resend DNS** — 3 records at Hostinger. No mail leaves the building
      until they land · [§3](#3--email-verification-and-password-reset)
- [ ] **`storeOTP: "hashed"`** — the same hour the DNS lands.
      `apps/api/src/auth.ts:266` is `"plain"`, which is a live credential
      sitting in a readable row
- [ ] **`RESEND_API_KEY`** — in `.env`, never `wrangler secret put` for
      production
- [ ] **`VAPID_SUBJECT`** — still `mailto:REPLACE@example.org` in
      `wrangler.toml`, so push is untested as well as unset

**Correctness, found and not yet fixed**

- [ ] **The walk order zig-zags.** `npm run check-planner` is red: a six-stop
      pocket walks 1148 m where 843 m was available. Production has been
      building that day for weeks. Needs a 2-opt pass over the pocket's walking
      legs with opening hours re-checked, which changes every itinerary the app
      builds — its own session, with the whole suite as the judge ·
      [tasks/2026-08-13 §4](tasks/2026-08-13.md)
- [ ] **Confirm a cache tag purge actually fires.** Replace a photograph in the
      dashboard, then `curl -I .../img/<id>.webp`: `cf-cache-status: MISS` means
      it works. `HIT` with the old picture means `ctx.cache` is absent and the
      hour in `s-maxage` is the only thing holding it · [§4](#4--speed-and-the-load-the-api-carries)

**Data the Board owns**

- [ ] **68 stays have no pin** — every one is in the dashboard with its phone
      number, hidden from the app until somebody places it on the map. Re-run
      `npm run build-matrix` after pinning any, or its travel times stay
      estimated
- [ ] **E-rickshaw is still empty** — OSM has no usable source, so this needs a
      hand-made list of stands and fares from the Board
- [ ] **`npm run build-matrix`** after any new place, for the same reason

**Next pieces of work**

- [ ] **Split the bundle.** 825 KB, 270 KB gzipped, and Leaflet is in it on
      every screen including the ones with no map. The next real speed win, and
      a bigger change than anything done on 13 August ·
      [tasks/2026-08-13 §5](tasks/2026-08-13.md)
- [ ] **Admin gallery** — a place carries up to three photographs and the
      dashboard manages them one at a time: ordering, replacing and removing
      within a record, not just adding
- [ ] **UI restructuring** — the dashboard as a whole rather than one form at a
      time, and a second pass over the app screens shipped on 11 August
- [ ] **How values are stored** across the forms, reviewed as a whole — the
      last open half of task 2
- [~] **Delete D1** — held on purpose; it is the rollback that does not live on
      one laptop · [§1](#1--d1--neon-postgres-then-d1-off)

Carried from the 4 August list and still wanted, but not scoped: saved plans do
not sync between devices, there is no custom domain, Google sign-in has no
credentials, nothing has ever been pushed to a real phone, and promoting an
admin is a raw SQL statement. See [Deprecated](#deprecated--carried-over-from-the-4-august-2026-list).

---

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

**Places, stays and start points are done** — 13 August. Editing a place works
and always did; what it did *not* do was keep a field no form owned, so
`hoursEst` and `approx` are now editable and a check refuses to let another one
appear. Stays went from 2 records to **80**, off the district's own dharamshala
chart and hotel list, of which 12 have a pin and 68 wait for one. Start points
are terminals only: a hotel is a stay, and the planner's "start from my hotel"
step reads the stays catalogue.

**Left in task 2:** e-rickshaw (no data source yet — the Board has to supply
one), and the review of how values are stored across the forms as a whole.

**One red check.** `check-planner` fails on a walking pocket that is 36% longer
than it needs to be. Production has been building that day for weeks; syncing
the bundled copy to the database is what made it visible. The fix is a 2-opt
pass over the pocket's walking legs and it changes every itinerary, so it wants
its own session. See [tasks/2026-08-13 §4](tasks/2026-08-13.md).

**Still wanted:** the admin gallery (a place has up to three photographs and the
dashboard manages them one at a time) and a UI restructure of the dashboard as
a whole.

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

### 4 — Speed, and the load the API carries

**Done 13 August.** Workers Cache sits in front of the Worker, so a repeat
request for a photograph or a feed is answered at the edge without the Worker
running at all — no CPU, no Neon query, no R2 read. It works on workers.dev and
costs nothing beyond the request. Feeds are a minute at the edge with a purge on
every dashboard write; photographs are an hour, tagged per key. The app stopped
forcing a revalidation of six feeds on every launch, preconnects to the media
origin, decodes every image off the main thread, and marks its two hero images
as the priority fetch they are. Details and the one thing still unverified:
[tasks/2026-08-13 §5](tasks/2026-08-13.md).

**Next lever, not pulled:** the bundle is 825 KB (270 KB gzipped) and carries
Leaflet on every screen, including the ones with no map.

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

- ~~Hotels — schema, endpoint and admin routes exist and serve empty.~~
  **Done 13 Aug** — 80 stays off the district's own lists. OSM was not the
  source in the end: it had two of them.
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
