# Task list — what is done, what is not

Living document. Every other file in `docs/` describes how something *works*;
this one is the only place that says what is **finished**. If they disagree,
this file is wrong — fix it here.

Last updated: **4 August 2026** (second pass)

---

## How the stages are meant to be read

| Stage | Means |
|---|---|
| **DEV** | Runs on a laptop. `wrangler dev`, local D1, `npm run dev`. Nobody outside sees it. |
| **STAGE** | Deployed to the client's Cloudflare account and reachable, but not announced. What is live today. |
| **PROD** | A real visitor could be handed the URL without a caveat. **We are not here yet.** |

The gap between STAGE and PROD is not deployment. It is the list under
"Blocking production" below — every one of those is something a real user
would hit.

---

## Where things actually are

| | |
|---|---|
| Worker | `kuk-saarthi-api` — **STAGE**, version `5f15721c` |
| App | `kuk-saarthi.pages.dev` — **STAGE** |
| D1 | `discover_kurukshetra` — 10 tables, 36 places, 4 events, 1 admin |
| Auth | Better Auth, email + password live. Google configured, no credentials yet |

---

## Done

### Foundation
- [x] Repo split into `apps/web`, `apps/api`, `packages/shared`; docs outside the code
- [x] npm workspaces; `@kuk/shared` imported by both sides instead of `../../`
- [x] `.env.production` moved to the Vite root (it was silently ignored after the move)

### Backend
- [x] D1 schema: events, subs, sent, audit, content, + 4 auth tables
- [x] Migrations run through `wrangler d1 migrations apply` (tracked, ordered)
- [x] `inspect-db.mjs` refuses a migration on a table-name collision — covers all 9 tables
- [x] `content(kind, id, doc, updated_at)` for places / hotels / e-rickshaw
- [x] `GET /content/<kind>.json` with ETag → **147 KB becomes 0 bytes** when unchanged
- [x] `kind` validated against a closed list before it reaches SQL
- [x] Admin CRUD for content, audited under the editing identity
- [x] 36 places imported into remote D1

### Auth
- [x] Better Auth on Workers + D1, bearer tokens (cookies cannot work cross-site)
- [x] Email + password sign-up / sign-in / sign-out / session
- [x] `role` with `input:false` — verified a sign-up posting `"role":"admin"` stays a visitor
- [x] `/admin` gated on role; Cloudflare Access no longer needed
- [x] `nodejs_compat` (without it the Worker fails to *start*)
- [x] `AUTH_SECRET` set in production, freshly generated, never the dev value

### App
- [x] Hamburger menu in the top bar, reusing the existing bottom sheet
- [x] Account screen: sign in / sign up / signed-in state, one route
- [x] Session loaded at boot, never awaited before first paint
- [x] Places read from D1 with the bundled copy as the floor
- [x] New UI strings in both `en.json` and `hi.json`
- [x] Push notifications: permission card on first visit, subscribe, Settings toggle
- [x] Service-worker push + notificationclick (`public/push-sw.js`)
- [x] `GET /config` — the app learns what the deployment can actually do
- [x] Change password, requiring the current one, revoking other sessions
- [x] Rate limiting in D1, keyed per client IP
- [x] Admin dashboard sign-in (it was unreachable after the move to bearer tokens)
- [x] Saved plans list — was crashing on the content cache sharing its store
- [x] Five-tab bar with Explore restored; pill width driven by `--tabs`
- [x] Show/hide password on every password field
- [x] Drizzle Studio as a database browser (`npm run db`)

---

## Blocking production

Ordered by what hurts a real visitor first.

- [ ] **Change the admin password.** `anuragmishra262000@gmail.com` was created
      with the placeholder `change-this-password-now`. A known password on an
      admin account of a live system. Do this first — the app can now do it:
      hamburger → Account → Change password.
- [ ] **`VAPID_SUBJECT` is still `mailto:REPLACE@example.org`.** Push services
      may reject a token whose subject is not a real address, so the first
      notification can fail. One line in `wrangler.toml` + redeploy.
- [ ] **No password reset.** Someone who forgets their password today has no
      way back in. The app now says so plainly instead of pretending
      ("Forgotten your password?" explains it is unavailable), but that is a
      message, not a fix. Needs an email sender — Cloudflare Email Sending is
      free and in the same account.
- [ ] **No email verification.** Anyone can sign up as anyone's address.
      Tolerable while an account holds only itineraries; not once it holds
      anything else. Turn on *with* the sender, not before.
- [ ] **Saved plans still do not sync.** The account currently buys the user
      nothing — plans live in IndexedDB on one device. This is the entire
      reason login exists, and it is not built.
- [ ] **Custom domain.** `pages.dev` + `workers.dev` are different sites, which
      is why sessions use bearer tokens in localStorage. One domain with the
      Worker on `/api/*` makes cookies first-party and is strictly better.

---

## Not blocking, but promised

- [ ] **Hotels** — schema, endpoint and admin routes exist and serve empty.
      Data to come from an OSM harvest (`tools/harvest-places.mjs` extension).
- [ ] **E-rickshaw** — same, but OSM has no usable source. Needs a hand-made
      list of stands and fares from the Board.
- [ ] **Admin dashboard cannot edit places yet.** The API accepts it
      (`PUT /admin/content/places`); the HTML in `admin.ts` only has an events
      form.
- [ ] **Google sign-in** — coded and dormant, and now correctly *hidden* until
      the server reports credentials. Needs a Google Cloud OAuth client with
      `https://kuk-saarthi-api.indiefluence-in-media.workers.dev/api/auth/callback/google`
      as the authorised redirect URI, then:
      `npx wrangler secret put GOOGLE_CLIENT_ID`, same for
      `GOOGLE_CLIENT_SECRET`, then `npm run deploy`. Nothing else to change —
      the button appears on its own once `/config` says `google: true`.
- [ ] **Nothing has been pushed yet.** The cron fires every 15 minutes and the
      encryption is unit-tested, but no real notification has reached a real
      phone. It cannot until `VAPID_SUBJECT` is a real address.
- [ ] **Promoting an admin is a raw SQL statement.** Fine for three people,
      not a process.
- [ ] `npm run build-matrix` after any new place, or its travel times stay estimated.

---

## Deliberately not doing

Recorded so they are not re-proposed.

- **Drizzle.** One `content` table read as whole documents and four auth tables
  the library owns. An ORM would add a build step and a second schema to keep
  in step with `migrations/`, and remove no SQL worth removing — `store.d1.ts`
  is the only file with any.
- **Per-field columns for places.** See docs/13.
- **Cloudflare Access for `/admin`.** Replaced by the role check, so the Board
  uses one login rather than two systems.
- **A client-side auth library.** See the header of `features/account/auth.ts`.
