# Kurukshetra Saarthi — internal docs

Design & working notes for the app. Tracked in git alongside the code — keep
them current as the code changes, in the same commit where possible.

## How these docs are layered

Read top-down; each layer assumes the one above it.

| Doc | Layer | What it answers |
|-----|-------|-----------------|
| [01-architecture.md](01-architecture.md) | System | How the app is built and wired (stack, state, folders, routing). |
| [02-planner-flow.md](02-planner-flow.md) | Feature | The "Plan my visit" flow — each step, its data, and why. |
| [03-algorithms.md](03-algorithms.md) | Algorithm | Path-finding & suggestion algorithms + the rule sets they use. |
| [04-content-and-i18n.md](04-content-and-i18n.md) | Data | How content and translations are stored, and how to add more. |
| [05-routing-phase2.md](05-routing-phase2.md) | Algorithm | The routing-provider abstraction and the road to real path-finding. |
| [06-design-system.md](06-design-system.md) | Visual | The "painted manuscript" direction, its tokens, and the product rethink. |
| [07-screen-specs.md](07-screen-specs.md) | Visual | Per-screen specifications. §5 covers the place graph and the drive guide. |
| [10-engine-events-and-data.md](10-engine-events-and-data.md) | **Spec** | **Start here for new work.** Key features, architecture, the pathfinding problem, and how places & events are managed. |

## What is authoritative

**[10](10-engine-events-and-data.md) is the current design.** Where an older doc
disagrees with it, 10 wins and the older doc is the one to correct.

01–07 remain as the layer-by-layer reference the code comments point at
(`see docs/03`, `docs/04`, `docs/05`) — they describe how each module works
today. 10 describes what is being built next and why.

## Status

- **Done:** planner flow rework, the algorithm suite, the place graph and walk
  pockets, real road geometry for drawing, and all six steps of
  [10 §5](10-engine-events-and-data.md#5--build-order) — the event calendar and
  its engine wiring, the home event rail, the precomputed road matrix, the prefs
  store, event surfaces on route/place/calendar, and the no-fit fallback.
- **Not built, on purpose:** [10 §6](10-engine-events-and-data.md#6--what-is-not-built).
- **Later:** curated bus / e-rickshaw datasets for true multi-modal ([05](05-routing-phase2.md)).

## Before you commit

```
npm run check-content && npm run check-graph && npm run check-planner \
  && npm run check-matrix && npm run check-corridor && npm run build
```

The checks are plain `assert`s in `scripts/` — no framework, no fixtures. Each
one exists because something was wrong once and the wrongness was invisible.
When a check fails, read what it is asserting before changing it: two of them
have been rewritten because they measured a proxy rather than the thing
([10 §4.8](10-engine-events-and-data.md#48-content-checks)), and that is a
judgement call, not a licence.
