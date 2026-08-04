# 12 · The backend: access, deployment, and what is live

The Worker, the D1 database and the push keys live in **the client's**
Cloudflare account, not ours. That is the right way round — they own the data,
the subscriber list and the bill — and it decides how deployment works.

---

## What is live right now

Deployed 3 Aug 2026, app added 4 Aug 2026. Nothing here is a secret;
identifiers are not credentials.

| | |
|---|---|
| Account | `Indiefluence` — `4768790aa47814f60dd70c187c7a7bd9` |
| Worker | `kuk-saarthi-api` |
| URL | `https://kuk-saarthi-api.indiefluence-in-media.workers.dev` |
| D1 | `discover_kurukshetra` — `43389d66-b722-40bc-ae9f-ea5c194a6edf` |
| Cron | `*/15 * * * *` |
| App (Pages) | `kuk-saarthi` — `https://kuk-saarthi.pages.dev` |
| Access granted by | member invite; wrangler runs as your own login |

Verified live at deploy time:

| Endpoint | |
|---|---|
| `GET /content/events.json` | 200 · 4 events · `cache-control: max-age=300` |
| `GET /vapid` | 200 · serves the public key |
| `GET /admin` | 200 · the sign-in shell; every route it calls is guarded |
| `POST /subscribe` (bad body) | 400 |
| `GET /nope` | 404 |

Re-verified 4 Aug after setting `APP_URL`: same five results, plus
`https://kuk-saarthi.pages.dev/` and its `manifest.webmanifest` and `sw.js` at
200. The app was built with `VITE_CONTENT_URL` pointing at the Worker and
confirmed end to end: fetched 200, cached in IndexedDB as `rev
1785754690314-4`, 4 items.

The database was **empty** (`num_tables: 0`) when we found it, so the migration
went in clean and `window` / `corridor` JSON round-trips through D1 intact.

---

## Still to do

The full list lives in [TASKS.md](TASKS.md). What is specific to *deployment*:

- [ ] **`VAPID_SUBJECT`** — a real `mailto:`. Push services may reject a token
      whose subject is not a valid address, so this one must be set before the
      first push. Still `REPLACE@example.org`; waiting on the Board's contact
      address. One line in `wrangler.toml` and a redeploy.

Done since:

- [x] **`APP_URL`** — `https://kuk-saarthi.pages.dev/`, live.
- [x] **Where `VITE_CONTENT_URL` lives.** It stays in the committed
      `.env.production`. Pages *build settings* would be the cleaner half only
      for a git-connected project that builds on Cloudflare; we upload `dist`
      directly with `wrangler pages deploy`, so Cloudflare never runs the
      build and a build variable set there would do nothing. The value is a
      public URL, not a secret.

---

## Getting access: three ways, in order of preference

### 1. They add you as a member — what we used

The client invites your own Cloudflare login (*Manage Account → Members →
Invite*) with the **Workers Admin** role, plus **D1 Admin** if their plan
separates it.

```bash
npx wrangler login            # your own account, your own 2FA
npx wrangler whoami           # confirms which accounts you can see
```

`whoami` lists every account you can reach. If the client's is not there, the
invite has not been accepted, or the OAuth token predates it — log out and in
again.

With access to more than one account, set `account_id` in `wrangler.toml`;
wrangler will not guess.

No shared password, every action attributable to you in their audit log,
revoked in one click.

### 2. A scoped API token — when they will not add members

*My Profile → API Tokens → Create Token → Custom*:

| Scope | Permission |
|---|---|
| Account → Workers Scripts | Edit |
| Account → D1 | Edit |
| Account → Workers KV Storage | Edit *(only if KV is added later)* |
| Zone → Workers Routes | Edit *(only for a custom domain)* |

Restrict to the one account, set an expiry.

```bash
export CLOUDFLARE_API_TOKEN=...      # never committed, never in wrangler.toml
export CLOUDFLARE_ACCOUNT_ID=...
npm run deploy
```

The token is a password for their infrastructure. Password manager, not a shell
profile, and rotate it when the work ends.

### 3. Their laptop, your instructions

Everything here is plain `wrangler`. Hand them this document.

**Never take a client's Cloudflare login.** It is shared credentials for an
account that also holds their DNS, and nothing below needs it.

---

## Environment variables and secrets

Two different things, and the difference is what stops a key reaching git.

**Variables** — non-secret, live in `wrangler.toml` under `[vars]`, visible in
the dashboard, applied on `npm run deploy`:

```toml
[vars]
APP_URL = "https://…"
VAPID_SUBJECT = "mailto:…"
```

**Secrets** — never in any file, set once per environment, encrypted at rest:

```bash
npx wrangler secret put NAME      # prompts, or pipe from stdin
npx wrangler secret list          # names only, never values
npx wrangler secret delete NAME
```

Currently set: `VAPID_PUBLIC`, `VAPID_PRIVATE`, `AUTH_SECRET`.

`AUTH_SECRET` signs every session — rotating it logs everyone out. Generate it
with `openssl rand -base64 32 | npx wrangler secret put AUTH_SECRET`, and never
reuse the value from `.dev.vars`.

**Adding a new one:**

1. Add it to the `Env` interface in `apps/api/src/index.ts` — TypeScript is the
   only thing that will remind you it is missing.
2. `[vars]` if it is not sensitive, `wrangler secret put` if it is.
3. `npm run deploy`.

A secret that only exists in production will be `undefined` in `wrangler dev`.
For local work put it in `apps/api/.dev.vars` (gitignored, same `KEY=value`
shape as `.env`) — never in `wrangler.toml`.

### The app's own build variable

`VITE_CONTENT_URL` is a **build-time** variable, not a Worker one: Vite inlines
it, so changing it needs a rebuild, not a redeploy. Unset, the app falls back
to its bundled calendar — see `apps/web/src/content/live.ts` and docs/11.

---

## Deploying, in order

```bash
npm install                              # from the repo root — it is a workspace

cd apps/api
npx wrangler d1 list                     # ids for wrangler.toml
npm run inspect -- --remote              # LOOK FIRST — see below
npm run migrate                          # runs inspect again and refuses on a clash
npm run seed                             # optional: the bundled calendar as a start
npm run import                           # places into D1 — see docs/13

openssl rand -base64 32 | npx wrangler secret put AUTH_SECRET
npx wrangler secret put VAPID_PUBLIC     # client should own the private key
npx wrangler secret put VAPID_PRIVATE
npm run deploy
```

Then promote the first admin, because `role` cannot be granted by signing up
(docs/14) — sign up through the app first, then:

```bash
npx wrangler d1 execute discover_kurukshetra --remote \
  --command "update user set role='admin' where email='you@example.org'"
```

Then the app itself, from the repo root. `npm run build` reads
`.env.production`, so the Worker URL only needs naming when it changes:

```bash
npm run build
npx wrangler pages deploy apps/web/dist --project-name=kuk-saarthi --branch=main
```

`--branch=main` is what makes it the production deployment behind
`kuk-saarthi.pages.dev`; leave it off and you get a preview URL nobody is
looking at. The project was created once with
`npx wrangler pages project create kuk-saarthi --production-branch=main`.

### Why `inspect` exists, and why `migrate` will not run without it

Every statement in `migrations/0001_init.sql` is `CREATE TABLE IF NOT EXISTS`.
That destroys nothing — and silently does nothing when a table of that name is
already there. If the database already had an `events` table for something
else, the migration would appear to succeed, the Worker would query columns
that do not exist, and the first sign of trouble would be the dashboard failing
in front of the client.

So `npm run inspect` lists what is actually there, compares it with the columns
`store.d1.ts` reads, and **exits non-zero on a mismatch**. `npm run migrate`
runs it first and stops. Tested both ways: passes on a clean database, refuses
on a collision.

If it refuses: ask what those tables are (they may be dead), rename ours (the
names appear in exactly two files — `migrations/0001_init.sql` and
`src/store.d1.ts`), or give the app its own D1.

---

## Looking at what is actually in there

Three separate things, and it is worth knowing which one you are looking at:
the **database** (what is stored), the **API** (what the app receives), and the
**dashboard** (what the Board edits).

### The database

```bash
cd apps/api
npm run inspect -- --remote        # tables + the column check

npx wrangler d1 execute discover_kurukshetra --remote --json \
  --command "select id, name_en, date_from, date_to from events order by date_from" \
  | jq -r '.[0].results[] | [.id, .name_en, .date_from] | @tsv'
```

`--json | jq` is the readable form; without it wrangler prints a wall of
timing metadata and the rows scroll off the top. **`--remote` is not
optional** — leave it off and you are querying the empty local sandbox in
`apps/api/.wrangler`, which is the fastest way to conclude the data is missing
when it is fine.

As of 4 Aug: 4 events, 0 subs, 0 sent, 0 audit. The last three being empty is
correct — nobody has subscribed, so nothing has been pushed, and no edit has
been made through the dashboard.

### The API

```bash
curl -s https://kuk-saarthi-api.indiefluence-in-media.workers.dev/content/events.json \
  | jq '{rev, count: (.items|length)}'
```

This is the only endpoint the app reads. If it is right and the app still
shows old events, the problem is the app's IndexedDB cache or a stale build,
not the backend — see docs/11.

### The dashboard

`/admin` needs a signed-in user whose role is `admin` — see
[14](14-accounts-and-roles.md). The page itself is public (it is a sign-in
form); everything it calls is guarded.

```bash
# sign in and keep the token
TOKEN=$(curl -s -D- -o /dev/null -X POST \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.org","password":"…"}' \
  https://kuk-saarthi-api.indiefluence-in-media.workers.dev/api/auth/sign-in/email \
  | tr -d '\r' | awk -F': ' 'tolower($1)=="set-auth-token"{print $2}')

curl -s -H "Authorization: Bearer $TOKEN" \
  https://kuk-saarthi-api.indiefluence-in-media.workers.dev/admin/content/places | jq
```

`403` means the account exists but is not an admin. Promote it with the SQL in
[14](14-accounts-and-roles.md#roles).

> **Historical note, kept because it cost an afternoon.** This used to be a
> Cloudflare Access header, and testing it through `wrangler dev --remote` was
> impossible: Cloudflare strips inbound `cf-*` headers at the edge, so a
> spoofed identity never reached the Worker and the 403 looked like a bug.
> Bearer tokens have no such problem — they work identically local and remote.

---

## Two things that cost time, so they are written down

**`account_id` must sit above every `[section]`.** In TOML a bare key after a
section header belongs to that section. Putting it below `[triggers]` made
wrangler warn *"Unexpected fields found in triggers field: account_id"* and
ignore it — which would have deployed to the wrong account had more than one
been visible. It is at the top of `wrangler.toml` now, with a comment.

**Cloudflare error 1042 straight after a deploy is propagation, not a fault.**
Two endpoints returned `error code: 1042` for about a minute after `wrangler
deploy`. `wrangler tail` showed the requests were not reaching the Worker at
all; a minute later everything was correct. Wait ~30 seconds before concluding
a deploy is broken.

---

## Rolling back

```bash
npx wrangler deployments list            # every version, newest first
npx wrangler rollback [version-id]
```

Rolling back the Worker does **not** roll back D1. A bad *edit* is recovered
from the `audit` table, which stores the whole row in `after`; a bad
*migration* needs a hand-written reverse. There is no automatic undo for
schema changes, which is the argument for `inspect` running first.

---

## What the client owns

| | Where |
|---|---|
| Event data, subscribers, audit log | Their D1 |
| VAPID private key | Their Worker secrets — we never held a copy after upload |
| Who may edit | Their Access policy |
| The bill | Free tier at this size: Workers 100k req/day, cron free, D1 5 GB |

If the relationship ends they revoke one member or one token and everything
keeps running. Nothing in this repo holds a credential — verified.

---

## Switching the database later

`apps/api/src/store.ts` is the whole interface and `store.d1.ts` is the only file
with SQL in it. Moving off D1 means writing one more implementation of `Store`
and changing the line in `index.ts` that constructs it — not auditing the
codebase for queries.
