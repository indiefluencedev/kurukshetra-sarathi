# 15 · Every variable, where it lives, and who sets it

One page, so nothing about configuration lives only in someone's head.

Three different mechanisms, and confusing them is the usual cause of "it works
locally":

| | Where | Visible? | Applied by |
|---|---|---|---|
| **Worker var** | `apps/api/wrangler.toml` `[vars]` | yes, in git and the dashboard | `npm run deploy` |
| **Worker secret** | Cloudflare, encrypted | never — names only | `wrangler secret put` |
| **App build var** | `apps/web/.env.production` | yes, in git | `npm run build`, **inlined into the JS** |

---

## The complete list

### Worker variables — `apps/api/wrangler.toml`

| Name | Value today | What breaks without it |
|---|---|---|
| `APP_URL` | `https://kuk-saarthi.pages.dev/` | notification click-through; the origin Better Auth trusts |
| `API_URL` | `https://kuk-saarthi-api.indiefluence-in-media.workers.dev` | Google's callback URL is built from it |
| `VAPID_SUBJECT` | ⚠️ `mailto:REPLACE@example.org` | push services may reject the token |
| `EMAIL_PROVIDER` | `cloudflare` | who carries the mail — see below |
| `EMAIL_FROM` | `noreply@brainybeans.space` | the From address |
| `EMAIL_NAME` | `Kurukshetra Saarthi` | the From display name |
| `ADMIN_EMAILS` | set at deploy | **nobody can reach `/admin`** |

### Worker secrets — `wrangler secret put`

| Name | Set? | Who owns it |
|---|---|---|
| `NEON_DB_URL` | — | **the database.** See its own section below |
| `RESEND_API_KEY` | ❌ | only when `EMAIL_PROVIDER = "resend"` |
| `AUTH_SECRET` | ✅ | generated at deploy; rotating it signs everyone out |
| `VAPID_PUBLIC` | ✅ | the client |
| `VAPID_PRIVATE` | ✅ | the client — we hold no copy |
| `GOOGLE_CLIENT_ID` | ❌ | the client, from Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | ❌ | the client |

```bash
npx wrangler secret list      # names, never values
```

### Secrets only travel one way

**A Cloudflare Worker secret cannot be read back.** No API, no CLI flag, no
dashboard button returns the plaintext — `wrangler secret list` gives names and
the dashboard says "Value encrypted". That is what a secret store is for, not a
permission anyone is missing.

So `.env` cannot be populated *from* production. A secret can only be
**replaced on both sides at once**:

```bash
openssl rand -base64 32                 # into .env AND:
npx wrangler secret put AUTH_SECRET     # the same value
```

The one exception is `VAPID_PUBLIC`, which is not secret at all — it is a
public key and the Worker serves it at `GET /vapid`. It was recovered that way
on 11 August 2026 and is in `.env`; the value there is genuinely production's.

What rotating costs today, if you want one copy of everything:

| | cost |
|---|---|
| `AUTH_SECRET` | 2 sessions signed out |
| VAPID pair | 2 push subscriptions invalidated — and **0 notifications have ever been sent** |

Both are near-free right now and will not stay that way. A subscription is
bound to the key it was created with, so a new pair silently strands existing
subscribers; new ones are fine, because the app reads `/vapid` when it
subscribes.

### What production is missing right now

Checked against the live Worker on 11 August 2026. The code has moved on and
the deployment has not — none of this is broken, it is undeployed.

| | Production has | Code needs |
|---|---|---|
| `NEON_DB_URL` | ❌ **absent** | the database. Without it the Worker throws on first request |
| `RESEND_API_KEY` | ❌ absent | only if `EMAIL_PROVIDER=resend`, which is the setting |
| `EMAIL_PROVIDER` / `EMAIL_FROM` / `EMAIL_NAME` | ❌ absent | they deploy with `wrangler.toml`, so `npm run deploy` carries them |
| `AUTH_SECRET`, `VAPID_PUBLIC`, `VAPID_PRIVATE` | ✅ set | unchanged |
| `ADMIN_EMAILS`, `APP_URL`, `API_URL` | ✅ set | unchanged |
| `VAPID_SUBJECT` | ⚠️ `mailto:REPLACE@example.org` | a real address |

So the deploy is:

```bash
cd apps/api
npx wrangler secret put NEON_DB_URL
npx wrangler secret put RESEND_API_KEY
npm run deploy                        # carries the [vars] with it
```

Do the two secrets **first**. A deploy that lands before `NEON_DB_URL` exists is
a Worker that answers every request with an error, and the old D1 code is what
is serving until then.

### App build variable — `apps/web/.env.production`

| Name | Value |
|---|---|
| `VITE_CONTENT_URL` | `https://kuk-saarthi-api.indiefluence-in-media.workers.dev` |

**Not** a Pages dashboard variable. We upload a pre-built `dist`, so Cloudflare
never runs the build and a variable set there does nothing. Vite inlines this
at build time — changing it needs a rebuild, not a redeploy.

### Local development — `apps/api/.env`, and only that

**One file.** Gitignored, heavily commented, and read by both halves:

| | |
|---|---|
| the Worker | `wrangler dev --env-file=.env` — the `dev` script |
| the scripts | `node --env-file=.env …` — migrate, import, otp, email:status |

It was two until 11 August 2026 — `.dev.vars` for the Worker, `.env` for the
scripts — with the same secrets typed twice and drifting apart. Wrangler reads
a plain `.env` since 4.x, so `.dev.vars` is gone. Start from `.env.example`,
which lists every variable with what it is for.

`--env-file` is on `dev` only, deliberately, and **not** on `deploy`: a
deploy that swept this file up would push local values into production, which
is the one direction these must never travel.

Production secrets are `undefined` under `wrangler dev`; this file is the only
substitute.

```bash
npm run dev        # from the repo root — Worker + app together, see dev.mjs
```

That one command starts both halves, binds them to every interface so a phone
on the same wifi can open the app, and points the app at the local Worker by
this laptop's LAN address. `APP_URL` is overridden for the session to trust
both that address and `localhost`, because Better Auth refuses an Origin it was
not told about and the two devices use different ones.

### `NEON_DB_URL` — the database

The one variable that is the database. A Postgres connection string, carrying
its own password, so it is a **secret** and not a `[vars]` entry:

```bash
cd apps/api
npx wrangler secret put NEON_DB_URL      # production
# locally: one line in .env, which both the Worker and the scripts read
```

This is the one real difference from the D1 binding it replaced: a binding
could not leak, because it was not a value. This is a value, and it is the
whole database. It never goes in `wrangler.toml`.

### Outgoing mail — four variables, no code

| Name | Value today | What it does |
|---|---|---|
| `EMAIL_PROVIDER` | `resend` | `cloudflare` · `resend` · `log` |
| `EMAIL_FROM` | `noreply@kkr.indietribe.space` | the From address |
| `EMAIL_NAME` | `Kurukshetra Saarthi` | the From display name |
| `RESEND_API_KEY` | in `.env`; **not yet a production secret** | read only when provider is `resend` |

`deliver()` in `src/email.ts` is the only function that has heard of a
provider; the templates know nothing about who carries them. Switching is
these variables and nothing else:

```bash
npx wrangler secret put RESEND_API_KEY     # production
# EMAIL_PROVIDER / EMAIL_FROM live in wrangler.toml [vars]
```

### The sending domain — `kkr.indietribe.space`

Registered with Resend (region `ap-northeast-1`) and **pending** until three
DNS records exist. `indietribe.space` is **not on Cloudflare** — its
nameservers are `ns1/ns2.dns-parking.com`, which is Hostinger — so the records
go in Hostinger's DNS panel, and the Cloudflare API token here cannot write
them.

Names are relative to the `indietribe.space` zone:

| Type | Name | Value |
|---|---|---|
| TXT | `resend._domainkey.kkr` | the DKIM `p=…` public key |
| MX | `send.kkr` | `feedback-smtp.ap-northeast-1.amazonses.com`, priority 10 |
| TXT | `send.kkr` | `v=spf1 include:amazonses.com ~all` |

The existing `v=spf1 include:_spf.mail.hostinger.com ~all` at `kkr` does not
conflict — that is the domain's own mail, and these are on `send.kkr`.

```bash
cd apps/api
npm run email:status                     # the records, and what is still pending
npm run email:status -- --verify         # ask Resend to re-check DNS
npm run email:status -- you@example.org  # once verified, a real test send
```

Until it verifies, every send fails with a Resend 403 naming the domain. That
is logged and does not fail the sign-up behind it (docs/14) — sign-up returns
200 and no mail arrives — so `npm run otp` is how the flow is tested meanwhile.

`log` sends nothing and prints the message. It is the right setting for a
machine with no mail credentials — sign-up still works, and the code is on
screen.

**Under `cloudflare`** — not the current setting — the `EMAIL` binding is used:
same account as the Worker, no API key, nothing to rotate. It stayed unused
because `wrangler email sending enable` answered `2036 Unauthorized` on every
credential available, which is why Resend won.

```toml
[[send_email]]
name = "EMAIL"
allowed_sender_addresses = ["noreply@brainybeans.space"]
```

That restriction is the point — the binding can send as that one address and no
other, so a bug in `email.ts` cannot start sending as someone at another domain
in the same account. It must agree with `EMAIL_FROM`; nothing checks that for
you and the failure is a refused send at runtime.

**The domain has to be onboarded once, by hand:**

```bash
npx wrangler email sending enable brainybeans.space
```

Until that is done every send fails with `E_SENDER_NOT_VERIFIED`. That is
logged and survivable by design — a failed email must not fail the sign-up
behind it (docs/14) — so the symptom is silent: accounts get created and no
mail arrives. Check the Worker log if anyone reports a missing code.

In `wrangler dev` under `cloudflare`, nothing is actually sent: the message is
written to `.wrangler/tmp/email/` as a `.txt` and a `.html` and the path is
printed.

### Reading a confirmation code without a mailbox

```bash
cd apps/api
npm run otp                       # the most recent code
npm run otp -- you@example.org    # for one address
```

Sign-up sends a six-digit code (docs/14). While mail is not being delivered,
this reads it out of the `verification` table so the flow can be tested
end to end. Codes last ten minutes, survive three wrong guesses, and are
deleted once used.

### Looking at the rows

**The Neon console.** Tables, a SQL editor and query history, already
authenticated, nothing to install. Drizzle Studio and its `db`/`db:remote`/
`db:prod`/`db:pull` scripts were removed on 11 August 2026 — they existed
because looking at D1 was awkward, and that is no longer the problem they were
solving.

**There is no local copy any more.** Under D1 the default was a database on
your laptop and reaching production took an extra flag; now `npm run dev` and
`npm run import` both point at the same Neon branch the Worker uses. A row you
edit while poking about is a row the Board will see. Create a Neon branch if
you want somewhere to experiment — branching is instant and that is what they
are for.

---

## Who is an administrator

`ADMIN_EMAILS`, and nothing else.

```toml
ADMIN_EMAILS = "someone@example.org,another@example.org"
```

The `admin()` guard in `index.ts` requires a valid session **and** that the
signed-in email is on this list. The database is not consulted.

This replaced a `role` column in the database, for two reasons:

1. **A column is too easy to write.** Anyone who can write one row — a leaked
   connection string, a mis-scoped script, a restored backup — could grant themselves
   the dashboard. Changing a Worker variable takes a deploy by someone with
   account access, which is a far higher bar.
2. **The old way needed a password to be handed over.** Creating an admin meant
   someone signing up and someone else running an `UPDATE`, which in practice
   meant a password being typed into a chat window. Now: put the address in the
   variable, sign up with it yourself, done. Nobody ever learns anyone's
   password.

An empty list means **nobody** is an admin. That is deliberate — a missing
variable is a misconfiguration, and the safe reading of a misconfiguration is
to refuse rather than to open up.

### Adding or removing an administrator

```bash
# edit ADMIN_EMAILS in apps/api/wrangler.toml
cd apps/api && npm run deploy
```

Removal takes effect on the next request. There is no "revoke" to remember and
no row to clean up.

### Forgotten password, until reset-by-email exists

There is no reset yet (TASKS.md). The recovery is to delete the account and
sign up again — admin status comes back automatically, because it comes from
the list, not from the row.

Deleting the user row is enough on its own: `session` and `account` both
reference it `on delete cascade`, which Postgres actually enforces. Under D1
this took three statements in the right order.

```sql
-- the Neon console, or any Postgres client on NEON_DB_URL
DELETE FROM "user" WHERE email = 'you@example.org';
```

Saved plans are not attached to accounts yet, so nothing is lost by this.
