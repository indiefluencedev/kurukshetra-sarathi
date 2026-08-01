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

- **Done:** planner flow rework, the algorithm suite on the estimate model, the
  place graph and walk pockets, real road geometry for drawing.
- **Next:** the six steps in [10 §5](10-engine-events-and-data.md#5--build-order)
  — events + engine wiring, the home event slider, the routing matrix, the prefs
  store, event surfaces, the no-fit fallback.
- **Later:** curated bus / e-rickshaw datasets for true multi-modal ([05](05-routing-phase2.md)).
