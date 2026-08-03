# 12 · The backend: access, deployment, and what is live

The Worker, the D1 database and the push keys live in **the client's**
Cloudflare account, not ours. That is the right way round — they own the data,
the subscriber list and the bill — and it decides how deployment works.

---

## What is live right now

Deployed 3 Aug 2026. Nothing here is a secret; identifiers are not credentials.

| | |
|---|---|
| Account | `Indiefluence` — `4768790aa47814f60dd70c187c7a7bd9` |
| Worker | `kuk-saarthi-api` |
| URL | `https://kuk-saarthi-api.indiefluence-in-media.workers.dev` |
| D1 | `discover_kurukshetra` — `43389d66-b722-40bc-ae9f-ea5c194a6edf` |
| Cron | `*/15 * * * *` |
| Access granted by | member invite; wrangler runs as your own login |

Verified live at deploy time:

| Endpoint | |
|---|---|
| `GET /content/events.json` | 200 · 4 events · `cache-control: max-age=300` |
| `GET /vapid` | 200 · serves the public key |
| `GET /admin` | **403** · refuses, because Access is not configured yet |
| `POST /subscribe` (bad body) | 400 |
| `GET /nope` | 404 |

The app was built with `VITE_CONTENT_URL` pointing at the Worker and confirmed
end to end: fetched 200, cached in IndexedDB as `rev 1785754690314-4`, 4 items.

The database was **empty** (`num_tables: 0`) when we found it, so the migration
went in clean and `window` / `corridor` JSON round-trips through D1 intact.

---

## Still to do

- [ ] **Attach a Cloudflare Access policy to `/admin*`.** Zero Trust → Access →
      Applications → Self-hosted, path `admin*`, allow the Board's emails.
      Until then the dashboard is *unreachable*: the Worker returns 403 when the
      identity header is missing rather than accepting an anonymous edit. That
      403 is the safety net, not a bug.
- [ ] **`APP_URL`** — where the PWA is served. Only used for the notification's
      click-through, so nothing breaks before the app has a home.
- [ ] **`VAPID_SUBJECT`** — a real `mailto:`. Push services may reject a token
      whose subject is not a valid address, so this one must be set before the
      first push.
- [ ] Decide where `VITE_CONTENT_URL` lives for the app build — Pages build
      settings rather than a committed `.env.production` is the cleaner half.

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

Currently set: `VAPID_PUBLIC`, `VAPID_PRIVATE`.

**Adding a new one:**

1. Add it to the `Env` interface in `worker/src/index.ts` — TypeScript is the
   only thing that will remind you it is missing.
2. `[vars]` if it is not sensitive, `wrangler secret put` if it is.
3. `npm run deploy`.

A secret that only exists in production will be `undefined` in `wrangler dev`.
For local work put it in `worker/.dev.vars` (gitignored, same `KEY=value`
shape as `.env`) — never in `wrangler.toml`.

### The app's own build variable

`VITE_CONTENT_URL` is a **build-time** variable, not a Worker one: Vite inlines
it, so changing it needs a rebuild, not a redeploy. Unset, the app falls back
to its bundled calendar — see `src/content/live.ts` and docs/11.

---

## Deploying, in order

```bash
cd worker
npm install

npx wrangler d1 list                     # ids for wrangler.toml
npm run inspect -- --remote              # LOOK FIRST — see below
npm run migrate                          # runs inspect again and refuses on a clash
npm run seed                             # optional: the bundled calendar as a start

npx wrangler secret put VAPID_PUBLIC     # client should own the private key
npx wrangler secret put VAPID_PRIVATE
npm run deploy
```

Rebuild the app whenever the Worker URL changes:

```bash
VITE_CONTENT_URL=https://…workers.dev npm run build
```

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

`worker/src/store.ts` is the whole interface and `store.d1.ts` is the only file
with SQL in it. Moving off D1 means writing one more implementation of `Store`
and changing the line in `index.ts` that constructs it — not auditing the
codebase for queries.
