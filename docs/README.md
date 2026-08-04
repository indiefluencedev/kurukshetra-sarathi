# Kurukshetra Saarthi — internal docs

Design and working notes. Tracked in git alongside the code — keep them current
as the code changes, in the same commit where possible.

**Scope as of August 2026:** the app is no longer a static bundle. It is a PWA
on Cloudflare Pages, a Worker on D1 holding content and accounts, and a bundled
copy of everything that keeps working when neither answers.

---

## Start here

| If you want to… | Read |
|---|---|
| know what is finished and what is not | **[TASKS.md](TASKS.md)** — the only file that claims completion |
| understand the whole system | [01-architecture.md](01-architecture.md) |
| change the backend, deploy, or look at the data | [12](12-deploying-to-the-client-account.md), [13](13-content-in-d1.md) |
| work on the planner | [10](10-engine-events-and-data.md), then [02](02-planner-flow.md), [03](03-algorithms.md) |
| add content or a translation | [04](04-content-and-i18n.md), [11](11-events-authoring.md) |
| build UI | [06](06-design-system.md), [07](07-screen-specs.md) |

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
| [06-design-system.md](06-design-system.md) | Visual | The "painted manuscript" direction and its tokens. |
| [07-screen-specs.md](07-screen-specs.md) | Visual | Per-screen specifications. §5 covers the place graph and drive guide. |
| [10-engine-events-and-data.md](10-engine-events-and-data.md) | Spec | The planner engine, events, and how places and events are managed. |
| [11-events-authoring.md](11-events-authoring.md) | Data | Writing an event so the engine and the checks both accept it. |
| [12-deploying-to-the-client-account.md](12-deploying-to-the-client-account.md) | Ops | Access, secrets, deployment, rollback, and reading the live data. |
| [13-content-in-d1.md](13-content-in-d1.md) | Backend | Content in D1, conditional GET, and the offline contract. |
| [14-accounts-and-roles.md](14-accounts-and-roles.md) | Backend | Better Auth, bearer tokens, roles, and what is not built yet. |

---

## What is authoritative

**[TASKS.md](TASKS.md) decides what is built.** Every other doc describes how
something works, and several describe things that work but are not finished.
Where a doc implies completion and TASKS.md disagrees, TASKS.md wins.

**[10](10-engine-events-and-data.md) decides planner design.** Where an older
doc (01–07) disagrees about the engine, 10 wins and the older doc is the one to
correct.

01–07 remain the layer-by-layer reference that code comments point at (`see
docs/03`, `docs/04`). They describe how each module works today.

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
npm run inspect -- --remote    # never migrate without looking first
```
