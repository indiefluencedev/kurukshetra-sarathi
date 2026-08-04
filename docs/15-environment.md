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
| `ADMIN_EMAILS` | set at deploy | **nobody can reach `/admin`** |

### Worker secrets — `wrangler secret put`

| Name | Set? | Who owns it |
|---|---|---|
| `AUTH_SECRET` | ✅ | generated at deploy; rotating it signs everyone out |
| `VAPID_PUBLIC` | ✅ | the client |
| `VAPID_PRIVATE` | ✅ | the client — we hold no copy |
| `GOOGLE_CLIENT_ID` | ❌ | the client, from Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | ❌ | the client |

```bash
npx wrangler secret list      # names, never values
```

### App build variable — `apps/web/.env.production`

| Name | Value |
|---|---|
| `VITE_CONTENT_URL` | `https://kuk-saarthi-api.indiefluence-in-media.workers.dev` |

**Not** a Pages dashboard variable. We upload a pre-built `dist`, so Cloudflare
never runs the build and a variable set there does nothing. Vite inlines this
at build time — changing it needs a rebuild, not a redeploy.

### Local development — `apps/api/.dev.vars`

Gitignored. `cp .dev.vars.example .dev.vars` and fill in. Production secrets
are `undefined` under `wrangler dev`; this is the only substitute.

### Not a Worker variable at all — Drizzle Studio

Read from your shell, only by `drizzle-kit`, only for `npm run db:remote`:

| Name | Where you get it |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | `4768790aa47814f60dd70c187c7a7bd9` — in `wrangler.toml`, not a secret |
| `CLOUDFLARE_D1_TOKEN` | **you create it**: dashboard → My Profile → API Tokens → Custom → Account → D1 → Edit |

`npm run db` (local) needs neither. Nor does `npm run db:prod`, below.

### Seeing production rows without creating a token

```bash
cd apps/api
npm run db:prod        # export production → .prod.sqlite → Studio on port 4984
```

`wrangler d1 export` runs over the wrangler login you already have, so this
needs no new credential at all. The file is rebuilt each time.

It is a **snapshot, not a connection**: read it, do not edit it — changes go
nowhere and are overwritten by the next run. Ports differ on purpose (local
`4983`, production snapshot `4984`) so two Studio tabs cannot be confused for
each other.

For live, editable production rows, `db:remote` and the token above.

---

## Who is an administrator

`ADMIN_EMAILS`, and nothing else.

```toml
ADMIN_EMAILS = "someone@example.org,another@example.org"
```

The `admin()` guard in `index.ts` requires a valid session **and** that the
signed-in email is on this list. The database is not consulted.

This replaced a `role` column in D1, for two reasons:

1. **A column is too easy to write.** Anyone who can write one row — a leaked
   D1 token, a mis-scoped script, a restored backup — could grant themselves
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
the list, not from the row:

```bash
npx wrangler d1 execute discover_kurukshetra --remote --command \
  "delete from session where userId in (select id from user where email='you@example.org'); \
   delete from account where userId in (select id from user where email='you@example.org'); \
   delete from user where email='you@example.org'"
```

Saved plans are not attached to accounts yet, so nothing is lost by this.
