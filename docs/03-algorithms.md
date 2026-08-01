# 03 · Algorithms & rule sets

The planner is split so each algorithm and each rule set lives in its own file
and can be read, tested, and debugged in isolation. `engine.ts` is only an
**orchestrator** — it wires the pieces together and owns no math of its own.

```
features/planner/
├── routing/      distances & times & (later) real paths   → see 05
│   ├── provider.ts   RoutingProvider interface + LatLng
│   └── estimate.ts   haversine × roadFactor + speed table (offline default)
├── rules/        the tunable "policy" — numbers & predicates, no control flow
│   ├── hours.ts      opening-hours: openMin(), openAt(), isClosedDay()
│   ├── scoring.ts    poiScore() + timeFit() (best time of day)
│   └── budget.ts     usable/spendable minutes, meal & parking reserves
└── algorithms/   the "mechanism" — pure functions over a context
    ├── schedule.ts   simulate(order) → per-stop arrive/wait/depart + validity
    ├── greedy.ts     prize-collecting construction under the time budget
    ├── twoOpt.ts     constrained 2-opt local search
    ├── suggest.ts    slack-based nearby-fit suggestions
    └── multiday.ts   split a long window into sensible days
```

Everything takes a small **context** object (start, end, mode, weekday, pace
factor, and the injected `travelMin`/`roadKm`/`openAt`) so there is no import
cycle and no duplicated distance math — the routing provider is the single
source of "how far / how long".

## The problem

Choosing which tirthas to visit and in what order, under a time budget, is the
**Orienteering Problem** (a prize-collecting TSP): maximise total "value" of
visited stops subject to `Σ travel + visit + waits + buffers ≤ budget`, while
respecting opening hours and closures. It is NP-hard, so we use fast
heuristics — fine because N ≈ 36 and routes are short.

## Rule sets (`rules/`)

- **budget.ts** — `usable = budget × (1 − contingency[pace])`; a meal reserve is
  carved out up front if the window spans midday so it can never overflow;
  `spendable = usable − meal`. Per-stop we also add a **parking buffer**. Pace
  also scales visit durations (`paceVisitFactor`). *Reason:* keep timings honest
  and never promise a route that can't finish inside the window.
- **hours.ts** — `openAt(d, weekday, minuteOfDay)`: closed on listed days, else
  within `[open, close]`. A stop reached before opening **waits** rather than
  being dropped. *Reason:* many tirthas have fixed darshan/aarti windows.
- **scoring.ts** — `poiScore = rank·0.4 + first·0.3 + themeHits·34 (+ bias)` and
  `timeFit` nudges a stop toward the hour it's best seen (e.g. `evening +26`
  after 16:00, `morning +22` before 11:00). *Reason:* rank/first encode
  editorial priority; theme match honours the user's interests; timeFit puts the
  aarti at dusk and the quiet ghat in the morning.

## Algorithms (`algorithms/`)

### schedule.ts — the honest clock
`simulate(order, ctx)` walks start → stops → end, computing each stop's travel,
arrival, wait (if early), visit, and departure, and returns `valid:false` the
moment a stop would be shut on arrival or shut mid-visit. Every other algorithm
uses this as the single definition of "does this order actually work and how
long does it take". *Debugging:* log the returned `stops[]` to see the exact
minute-by-minute plan.

### greedy.ts — construction
Repeatedly pick the reachable, open, budget-fitting stop with the best
`poiScore + timeFit − travel·1.6 − wait·1.3`, append it, advance the clock.
Greedy gives a good, explainable starting tour. *Reason:* deterministic and easy
to reason about; the travel/wait penalties keep it from wandering.

**Walk pockets.** After each *driving* stop, greedy opens a pocket anchored at
the car: everything joined to that anchor in the place graph (`data/graph.ts`,
from `edges.json`) is offered at its real cost — a short walk, no second parking
buffer — worth `+40` for a same-complex sibling and `+22` for a walkable
neighbour, bounded by `POCKET_MAX = 20` minutes on foot there and back. The
bound is measured to the **car**, not along the chain; without that test the
pocket walks itself across town one short hop at a time. This is the step that
stops a themed day driving past the Krishna Museum's front door. `twoOpt`
therefore reorders **pockets, not stops**. See [10 §3.3](10-engine-events-and-data.md).

### twoOpt.ts — improvement
Constrained **2-opt**: repeatedly reverse a segment of the built order; keep the
reversal only if `simulate` says it's still valid **and** total travel drops.
Runs until no improvement. *Guarantee:* output travel ≤ input travel, and hours
are never violated. *Reason:* greedy can leave crossovers; 2-opt straightens
them cheaply at this N.

### suggest.ts — nearby-fit ("Also fits your time")
After the route is built, `slack = spendable − used`. For every unused nearby
place, compute its **marginal insertion cost** — the cheapest
`travel(a→x)+travel(x→b) − travel(a→b) + visit + parking` across all gaps
(including start→first and last→end). Return those with `cost ≤ slack`, ranked
by value then cost. Drawn from **all** valid places (not just the chosen theme)
so a themed route can still surface a close-by extra. *Reason:* directly answers
"what else can I fit near where I already am, in the time I have left".

### multiday.ts — long windows
Windows longer than one sensible day (`DAY_MAX = 9 h`) are split into
morning-started days; places used on an earlier day aren't repeated.

## Orchestration (`engine.ts`)

```
build(opts):
  candidates = filter D by pending + hard filters only         (rules)
               — the theme is NOT a filter, see below
  score      = poiScore per candidate                          (rules/scoring)
               off-theme: score × 0.35 − 18 (demoted, not excluded)
  order      = greedy(candidates, ctx)                         (algorithms/greedy)
  order      = twoOpt(order, ctx)                              (algorithms/twoOpt)
  stops      = simulate(order, ctx).stops                      (algorithms/schedule)
  suggest    = suggestNearby(stops, allValid, ctx, slack)      (algorithms/suggest)
  → Itinerary { stops, dropped, suggest, totals, meta }
generate(): build() + a couple of alternatives (relaxed pace, another theme)
recalc():   rebuild the remainder from the current point (used by live journey)
```

The public `Itinerary` shape is unchanged, so `RouteResult`, `Journey`, `Map`,
save/share/ICS all keep working when internals move.

## Debugging tips

- Wrong timings → `rules/budget.ts` + `algorithms/schedule.ts`.
- Wrong *which* places → `rules/scoring.ts`.
- Wrong *order* → `algorithms/greedy.ts` then `twoOpt.ts`.
- "Also fits" odd → `algorithms/suggest.ts` (check `slack` and marginal cost).
- Distances/times off → `routing/estimate.ts` (Phase 2 swaps this out).
