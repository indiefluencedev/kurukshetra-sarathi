# 16 · Deploying the Neon cut-over, step by step

The one deployment that is not routine. Everything else in this project can be
redeployed at will; this one swaps the database underneath a live Worker, so
the order matters and the rollback is worth reading **before** you start.

Written 11 August 2026, for the deploy that has not happened yet. Once it has,
this file is history — fold what is still true into docs/12 and delete the rest.

---

## What is true before you start

| | |
|---|---|
| Production Worker | the **D1** build, deployed 7 August. Serving fine. |
| Production secrets | `AUTH_SECRET`, `VAPID_PUBLIC`, `VAPID_PRIVATE`. **No `NEON_DB_URL`.** |
| Neon | holds everything — 87 content rows, 4 events, 2 accounts, verified |
| D1 | still holds the same data, untouched since the copy |
| Rollback | `apps/api/.prod.sqlite`, plus D1 itself, which is not being deleted today |

Nothing here is urgent. D1 keeps serving until the moment you deploy, so a
step you are unsure of can wait until tomorrow.

---

## Step 0 — the values in `.env` have to be real

```bash
cd apps/api
npm run secrets:push          # a dry run; changes nothing
```

It prints what it would send and refuses placeholders. `.env` ships with
`AUTH_SECRET=local-dev-only-replace-me`, and that string is in git — uploaded
to production it is not a weak secret, it is a **published** one, and anyone
could mint a session. The script will not send it.

Generate whatever it refuses:

```bash
openssl rand -base64 32               # AUTH_SECRET
npx web-push generate-vapid-keys      # VAPID_PUBLIC and VAPID_PRIVATE, together
```

Paste them into `.env`. **`.env` becomes the only copy** — Cloudflare will not
give a secret back (docs/15). Put it somewhere you trust as well.

Two costs, both near-zero today and neither reversible:

- a new `AUTH_SECRET` signs out every session — **2 today**
- a new VAPID pair strands every push subscription — **2 today, and 0
  notifications have ever been sent**

---

## Step 1 — secrets, before the code that needs them

```bash
cd apps/api
npm run secrets:push -- --go
npx wrangler secret list          # names only; confirm NEON_DB_URL is there
```

Uploads only the five real secrets. It deliberately does **not** upload
`CLOUDFLARE_API_TOKEN` — that is a deploy credential, and giving it to the
Worker it deploys turns a bug in the Worker into account access — nor
`ADMIN_EMAILS` / `EMAIL_*` / `VAPID_SUBJECT`, which belong in `wrangler.toml`
`[vars]` where they stay visible and reviewable in git. A secret **shadows** a
`[vars]` entry of the same name, so uploading those would make editing
`wrangler.toml` silently stop working.

**Do this before Step 2.** A Worker deployed without `NEON_DB_URL` throws on
every request — `NeonStore` refuses to construct without it, which is the
correct behaviour and an unpleasant way to find out.

---

## Step 2 — the Worker

```bash
cd apps/api
npm run check                     # the admin forms still parse
npm test                          # push encryption against the RFC vector
npm run deploy
```

`[vars]` in `wrangler.toml` — `EMAIL_PROVIDER`, `EMAIL_FROM`, `EMAIL_NAME`,
`ADMIN_EMAILS`, `APP_URL`, `API_URL`, `VAPID_SUBJECT` — ride along with this.
No separate step.

**Verify immediately**, in this order. The first two are the whole migration:

```bash
API=https://kuk-saarthi-api.indiefluence-in-media.workers.dev

curl -s $API/content/places.json | head -c 120     # expect rev + items
curl -s -o /dev/null -w '%{http_code}\n' $API/config
curl -s -D - -o /dev/null $API/content/places.json | grep -i etag
curl -s -o /dev/null -w '%{http_code}\n' -H 'If-None-Match: "<that etag>"' \
  $API/content/places.json                          # expect 304
curl -s -o /dev/null -w '%{http_code}\n' $API/img/brahma-sarovar   # expect 200
curl -s -o /dev/null -w '%{http_code}\n' $API/admin/events         # expect 403
```

Then sign in on the app. **You will be signed out first** — sessions did not
come across, and a new `AUTH_SECRET` would have ended them anyway.

### If it goes wrong

```bash
npx wrangler rollback             # back to the D1 build, in seconds
```

D1 still holds every row. This is why it is not being deleted in the same
session as the deploy.

---

## Step 3 — the app

Only needed if the app changed, which it has: the account screen grew the
confirmation-code and password-reset states.

```bash
cd /Volumes/projects/kuk-sarathi
npm run check                     # the five content self-checks
npm run deploy                    # builds, then wrangler pages deploy
```

`apps/web/.env.production` supplies `VITE_CONTENT_URL`, inlined at build time —
so this is a **rebuild**, not just an upload, and changing that URL means
building again rather than redeploying.

---

## Step 4 — mail, when the DNS lands

Independent of everything above; do it whenever.

```bash
cd apps/api
npm run email:status              # the three records, and what is pending
# add them at Hostinger — indietribe.space is NOT on Cloudflare
npm run email:status -- --verify
npm run email:status -- you@example.org    # a real send, once verified
```

Until it verifies, sign-up works and no mail arrives — deliberately, because a
failed email must not fail the account behind it. `npm run otp` reads the
confirmation code out of the database meanwhile.

**When mail works, change one thing:** `storeOTP: "plain"` in `src/auth.ts`
becomes `"hashed"`. Plain is what lets `npm run otp` read a live credential out
of a row, which is right while testing and wrong in public.

---

## Step 5 — D1 off, and not before

Leave a few days. D1 costs nothing to keep — 456 KB against a 5 GB free tier —
and it is the rollback that does not depend on a file on one laptop.

```bash
npx wrangler d1 export discover_kurukshetra --remote --output final-d1-backup.sql
npx wrangler d1 delete discover_kurukshetra
```

Then remove `snapshot-prod.mjs` and the `db:snapshot` script, which exist only
to talk to it.

---

## The thing most likely to bite you

`wrangler` **auto-loads `apps/api/.env`** from the working directory, so
`CLOUDFLARE_API_TOKEN` in that file overrides your browser login for every
wrangler command run from there. It is the narrower credential. It can deploy
Workers — checked — but it cannot touch DNS, and that shadowing is what made
`wrangler email sending` look like a permissions problem for an afternoon.

If a wrangler command fails with a permission error that makes no sense,
that is the first thing to test:

```bash
cd /Volumes/projects/kuk-sarathi        # away from apps/api/.env
env -u CLOUDFLARE_API_TOKEN npx wrangler <whatever>
```
