# Kurukshetra Saarthi — internal docs

Design and working notes. Tracked in git alongside the code — keep them current
as the code changes, in the same commit where possible.

**Scope as of August 2026:** the app is no longer a static bundle. It is a PWA
on Cloudflare Pages, a Worker on Neon Postgres holding content and accounts, and a bundled
copy of everything that keeps working when neither answers.

---

## Start here

| If you want to… | Read |
|---|---|
| know what is finished and what is not | **[TASKS.md](TASKS.md)** — the only file that claims completion |
| know what changed on a given day, and why | **[tasks/](tasks/)** — one file per date, `YYYY-MM-DD.md` |
| find a config value, or grant admin access | **[15](15-environment.md)** |
| understand the whole system | [01-architecture.md](01-architecture.md) |
| **deploy the Neon cut-over** | **[16](16-the-neon-cutover.md)** — step by step, in order, with the rollback |
| change the backend, deploy, or look at the data | [12](12-deploying-to-the-client-account.md), [13](13-content-in-the-database.md) |
| work on the planner | [10](10-engine-events-and-data.md), then [02](02-planner-flow.md), [03](03-algorithms.md) |
| add content or a translation | [04](04-content-and-i18n.md), [11](11-events-authoring.md) |
| build UI | `apps/web/src/styles/global.css` — the tokens are the design system |

---

## The layers

Each assumes the one above it.

| Doc | Layer | What it answers |
|-----|-------|-----------------|
| [TASKS.md](TASKS.md) | **Status** | **What is done, what blocks production, what we decided not to do.** |
| [01-architecture.md](01-architecture.md) | System | Stack, workspace layout, state model, routing. |
| [02-planner-flow.md](02-planner-flow.md) | Feature | The "Plan my visit" flow — each step, its data, and why. |
| [03-algorithms.md](03-algorithms.md) | Algorithm | Path-finding and suggestion algorithms, and the rule sets they use. |
| [04-content-and-i18n.md](04-content-and-i18n.md) | Data | How content and translations are stored, and how to add more. |
| [05-routing-phase2.md](05-routing-phase2.md) | Algorithm | The routing-provider abstraction and the road to real path-finding. |
| [10-engine-events-and-data.md](10-engine-events-and-data.md) | Spec | The planner engine, events, and how places and events are managed. |
| [11-events-authoring.md](11-events-authoring.md) | Data | Writing an event so the engine and the checks both accept it. |
| [12-deploying-to-the-client-account.md](12-deploying-to-the-client-account.md) | Ops | Access, secrets, deployment, rollback, and reading the live data. |
| [13-content-in-the-database.md](13-content-in-the-database.md) | Backend | Content in the database, conditional GET, and the offline contract. |
| [14-accounts-and-roles.md](14-accounts-and-roles.md) | Backend | Better Auth, bearer tokens, roles, and what is not built yet. |
| [15-environment.md](15-environment.md) | Ops | **Every variable, where it lives, who sets it, and who is an admin.** |
| [16-the-neon-cutover.md](16-the-neon-cutover.md) | Ops | The one deployment that is not routine. Delete once it has happened. |

---

## What is authoritative

**[TASKS.md](TASKS.md) decides what is built.** Every other doc describes how
something works, and several describe things that work but are not finished.
Where a doc implies completion and TASKS.md disagrees, TASKS.md wins.

**[10](10-engine-events-and-data.md) decides planner design.** Where an older
doc (01–05) disagrees about the engine, 10 wins and the older doc is the one to
correct.

01–05 remain the layer-by-layer reference that code comments point at (`see
docs/03`, `docs/04`). They describe how each module works today.

**The code decides visual design.** `apps/web/src/styles/global.css` is the
only palette — the tokens there are the system. The two prose design docs that
used to sit at 06 and 07 described a different palette and a branch that no
longer exists; they were deleted on 11 August 2026 rather than corrected,
because a stale spec is read as a requirement. `git log -- docs/06-design-system.md`
if you ever need what they said.

---

## Before you commit

```bash
npm run check      # all five self-checks
npm run build
```

Or individually from `apps/web`: `check-content`, `check-graph`,
`check-planner`, `check-matrix`, `check-corridor`.

The checks are plain `assert`s in `apps/web/tools/` — no framework, no
fixtures. Each exists because something was wrong once and the wrongness was
invisible. When one fails, read what it asserts before changing it: two have
been rewritten because they measured a proxy rather than the thing
([10 §4.8](10-engine-events-and-data.md#48-content-checks)), and that is a
judgement call, not a licence.

Backend changes additionally want, from `apps/api`:

```bash
npm run check                  # the admin forms
npm test                       # push encryption against the RFC 8291 vector
```

`npm run inspect` is gone with D1. It existed because `discover_kurukshetra`
was a pre-existing database that might have held someone else's tables, and
because a D1 migration that failed halfway could not roll back. The Neon runner
records what it has applied and wraps each file in a transaction, which is the
same guarantee obtained honestly.
