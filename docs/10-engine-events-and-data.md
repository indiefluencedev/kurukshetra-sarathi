# 10 · The planning engine, events, and data management

The design of the engine as it now stands. All six steps of the build order in
[§5](#5--build-order) have shipped; this document describes what was built and
why, and is the place to start before changing any of it.

Where an implementation detail differs from the plan this file originally set
out, the difference is called out inline and the reason given — those are the
paragraphs worth reading first.

Four parts, in the order decisions have to be made:

1. **[Key features](#1--key-features)** — what the app must do
2. **[Architecture](#2--architecture)** — where each thing lives and why
3. **[The pathfinding problem](#3--the-pathfinding-problem)** — what it is, every
   factor that bends it, how we solve it, and what it costs
4. **[Data management](#4--data-management)** — how places and events are
   authored, ranked by the board, and added to over time

---

## 1 · Key features

### 1.1 The plan builds instantly and remembers everything

The visitor is sixty-eight, on a phone, on rural data, standing at a bus stand.
Every second of waiting and every re-answered question is a failure.

| Feature | What it means |
|---|---|
| **Instant build** | No network call on the plan path. Travel times come from a matrix that ships in the bundle. Target: plan on screen in **under 100 ms** from tapping "Build". |
| **Nothing re-answered** | The draft survives a reload (already built). New: the *answers* survive across plans — start point, mode, who you travel with, pace — so the second plan starts pre-filled. |
| **Works offline** | Every input to a plan is local. The network is only ever an upgrade (live road geometry to draw, weather, OSM place search). |
| **Reopen means reopen** | A saved plan restores its date, start, end, people and preferences, and rebuilds. |

### 1.2 The event manager

The single missing capability. Kurukshetra's calendar *is* the reason to come:
the International Gita Mahotsav, Somvati Amavasya, a solar eclipse snan at
Brahma Sarovar, the daily evening aarti.

| Feature | Behaviour |
|---|---|
| **Event table** | A board-authored content file listing ongoing and upcoming events, bilingual, with the places each one touches. |
| **Home page slider** | A rail on the home screen: **ongoing events first**, then upcoming with a countdown. Tap → plan around it. |
| **Events in the plan** | A stop affected by an event on the plan's date carries a badge and the event's notice. |
| **The plan bends around the event** | Affected places take longer to visit and are slower to reach; the engine proposes fewer stops and shifts crowded places earlier. |
| **Plan *for* an event** | Tapping an event opens the planner with its date pre-filled and its places weighted up — one tap from "there is a festival" to "here is my day at it". |
| **Honest when it hurts** | If the Mahotsav makes the requested day impossible, say so and show what would fit, rather than silently dropping stops. |

### 1.3 Real road distances

Times and distances come from the actual road network (OSRM), precomputed at
build time for every pair of fixed places. Straight-line estimates remain only
as the offline fallback and for arbitrary start points.

### 1.4 The plan explains itself

Already partly built, and non-negotiable going forward: every itinerary reports
what was **left out and why**, what **also fits** in the remaining slack, and
where the time went (travel / visiting / waiting / parking / meals).

---

## 2 · Architecture

### 2.1 The layers

```
┌───────────────────────────────────────────────────────────────┐
│  UI — React + TypeScript                                      │
│  Home (EventRail)  Planner  Route  Journey  Place  Map         │
├───────────────────────────────────────────────────────────────┤
│  Engine — synchronous, main thread, pure                      │
│  engine.ts orchestrates:                                      │
│    rules/      hours · scoring · budget · breaks               │
│    algorithms/ greedy · twoOpt · schedule · suggest · multiday │
│    routing/    provider · cached · estimate · osrm             │
├───────────────────────────────────────────────────────────────┤
│  Static content — imported at build, ships in the bundle      │
│  destinations.json  edges.json  themes.json  places-index.json │
│  events.json        matrix.json                                │
├───────────────────────────────────────────────────────────────┤
│  IndexedDB — shared/lib/db.ts, zero dependencies              │
│  user data only: draft · saved plans · prefs                   │
└───────────────────────────────────────────────────────────────┘
```

**Where the event reader actually lives.** This file first proposed
`planner/rules/events.ts`. It shipped as **`apps/web/src/data/events.ts`**, because both
the engine *and* the home rail read it, and a home-screen component importing
out of `features/planner/rules/` is a dependency nobody would defend. It sits
beside `data/graph.ts`, which is the same shape of thing for the same reason:
static content plus the handful of queries everything asks of it.

### 2.2 The one rule that decides where data goes

> **Static content is imported. User data is stored.**

**Static content** (places, edges, events, matrices) is git-tracked, versioned
with the code, present at first paint with no async, and can never go stale
against the app reading it. It is imported as JSON and tree-shaken into the
bundle.

**User data** (draft, saved plans, preferences) is per-device, genuinely
dynamic, and must outlive the tab. It lives in IndexedDB via the existing
62-line `shared/lib/db.ts` — `put` / `get` / `all` / `del`, no dependency.

*Why not a database for the places:* the planning pool is **34 places**. An
`Array.filter` over 34 objects is measured in microseconds. Moving them into
IndexedDB would add a seeding step, a schema version, a migration path, and a
first-run async race — to make a fast thing slower. Revisit if the pool passes
~500 places, or if content ever needs to update without an app deploy.

### 2.3 Sizes — why nothing here needs infrastructure

| Data | Count | Size |
|---|---|---|
| Destinations | 36 (34 plannable, 2 `pending`) | ~180 KB with bilingual prose |
| Place graph edges | 84 | ~14 KB |
| Routing matrix | 42 × 42 × 2 arrays | **13 KB, all modes** |
| Events | ~10–20 per year | ~4 KB |
| Places index (start/end points) | 6, growing | ~2 KB |

The matrix is stored as indexed arrays, not one row per pair:

```json
{ "built": "2026-08-03",
  "source": "OSRM public demo, driving profile",
  "ids": ["brahma-sarovar", "jyotisar", "…", "stn-thc"],
  "min": [[0, 12, 18], [12, 0, 9], [18, 9, 0]],
  "km":  [[0, 5.2, 7.1], [5.2, 0, 2.3], [7.1, 2.3, 0]] }
```

Same data as 1,764 `{fromId, toId, mode, durationMin, distanceKm}` records, at
a fraction of the bytes, with O(1) lookup and no query engine.

**One file, not one per mode.** This section first said "~28 KB per mode". It
shipped as a single 13 KB file, because §2.4's probe is decisive: the public
OSRM demo ignores the profile in the URL, so six per-mode files would be six
byte-identical copies of the car's. What is kept instead is the road
**distance**, which is mode-independent and genuinely measured; `CachedProvider`
divides it by the mode's speed. Measured distance, estimated speed — the honest
split, and it is why `travelMin` still answers for an e-rickshaw.

**The index covers the start points too.** The matrix runs over the 36
destinations *and* the 6 curated places-index entries, so "I am at Thanesar
station" is an O(1) offline lookup rather than a haversine. A start point
chosen from the list is matched by its `ref`, not its coordinates.

### 2.4 The routing stack

Everything that needs "how far / how long / what path" goes through the existing
`RoutingProvider` interface. Swapping the implementation is one line in
`routing/index.ts`; no algorithm and no component changes.

| Case | Source | Cost |
|---|---|---|
| Fixed place → fixed place, by car | `matrix.json` `min` lookup | O(1), offline |
| Fixed place → fixed place, any other mode | `matrix.json` `km` ÷ mode speed | O(1), offline |
| Arbitrary point (hotel, dropped pin, GPS fix) → anything | `EstimateProvider` — haversine × 1.35 ÷ mode speed | always available |
| Walking between linked places | `edges.json` — the hand-verifiable figure | O(1), offline |
| Drawing the road on the map | Live OSRM `/route` geometry (`osrm.ts`) | best-effort, falls back to straight segments |

The arbitrary-point row was going to be a live, memoised OSRM `/route` call.
It is not, and deliberately: the plan path must never touch the network, a
pilgrim on rural data is the whole audience, and the estimate's 1.35 road
factor turns out to be well chosen — measured against the real matrix, the
median detour over 2 km is **1.32**. Spending a network round-trip to correct
a 2% error on one leg is not a trade worth making. Revisit only if start
points routinely sit outside the district.

**Per-mode reality.** The public OSRM demo was probed: `/route/v1/foot/` returns
byte-identical numbers to `/driving/` — it ignores the profile and serves car
only. So the drive matrix is real road data; walking uses `edges.json` (every
walk in this app is a sub-300 m same-complex hop, where a hand-checked edge
beats any engine); `public` transit stays estimated until curated bus data
lands. OpenRouteService (free key, 2k/day) is the upgrade path for a real foot
profile if walking ever needs it.

### 2.5 Preferences — the "don't make me answer twice" store

IndexedDB record, `id: "prefs"`, written by `rememberAnswers()` whenever a plan
is built. The fields that carry over are an **explicit list** in `persist.ts`,
never a spread of the whole plan — adding a field to `Plan` must never start
silently persisting it:

```ts
const CARRY = ["startType", "start", "endType", "end", "endManual",
               "mode", "modes", "pace", "who", "themes", "opts"];
```

`newPlan()` spreads those over its constants. Everything describing *one visit*
— `mins`, `label`, `date`, `startClock`, `days`, `step`, `res` — is assigned
**after** the spread, so a mistake in `CARRY` still cannot resurrect it. The
date is the one that matters most: a stale date silently checks the route
against the opening hours of a day that has passed.

Two things this touches that are easy to miss:

- `state.ts` stays a dependency leaf. The seed is pushed in via `setCarried()`,
  the same pattern `onBump` uses, rather than imported.
- `listPlans()` filters out `prefs` as well as `draft`. Three kinds of record
  share one table, and only one of them is a plan.

~40 lines, and it removes four taps from every plan after the first.

### 2.6 Still on the main thread, deliberately

No Web Worker. Section 3.5 works out the operation count: a few thousand, well
under one frame. A worker would add a serialisation boundary, a build config,
and async plumbing through every caller, for no measurable gain. Revisit when a
profile shows a dropped frame — measure first.

### 2.7 Rejected, and why

A fuller architecture was proposed — Dexie as the runtime store, a row-per-pair
matrix, a worker, exact DP, review-derived ranking. It was scoped for 50–100
POIs; the real pool is 34. Recorded here so none of it gets re-litigated:

| Rejected | Reason | Reconsider when |
|---|---|---|
| **Dexie.js** | A new dependency to query 34 objects that `Array.filter` handles in microseconds | Saved plans need real queries — search across stops, stats over months |
| **Places/matrix in IndexedDB** | Adds a seed step, schema version, migration path and first-run race to static, git-tracked content | The pool passes ~500 places, or content must update without an app deploy |
| **Web Worker** | ~2,500 ops per build; the serialisation boundary costs more than the work | A profile shows a dropped frame |
| **Exact DP (Held–Karp)** | Needs a second complete cost model — pockets, parking, breaks, events — kept bit-identical to `simulate()` forever | Never, unless that duplication can be avoided |
| **Row-per-pair matrix** (`{fromId, toId, mode, …}` × 3,500) | Indexed arrays hold the same data in a fraction of the bytes, with O(1) lookup | Never |
| **`theme` as a single string** | Data regression — Brahma Sarovar is four themes at once | Never |
| **`where({theme})` hard filter** | Reintroduces a fixed bug: it is what routed a Mahabharata day past the Krishna Museum's front door. See §3.3 stage 1 | Never |
| **Flat one-leg-per-POI costing** | Discards walk pockets and parking clusters — charges a full car leg and a 6-min buffer to cross sixty metres | Never |
| **`rating × 15 + log10(reviews) × 10`** | Measures footfall, so it ranks the zoo above a `kund`. See §4.1 | As an input the board weighs when setting `rank` — never as a runtime term |

---

## 3 · The pathfinding problem

### 3.1 What it actually is

> Given a start, an end, a time window, a travel mode and a set of interests,
> choose **which** places to visit and **in what order**, maximising total value
> subject to the day fitting.

This is the **Orienteering Problem with Time Windows** (OPTW) — a
prize-collecting TSP. You are not required to visit every node; you pick a
profitable subset. Formally:

```
maximise   Σ value(i) for i in chosen
subject to Σ travel + visit + wait + parking + breaks ≤ budget
           open(i) ≤ arrive(i)  and  arrive(i) + visit(i) ≤ close(i)   ∀i
           weekday ∉ closed(i)                                          ∀i
```

It is **NP-hard**. Multi-day is worse — the Team Orienteering Problem, one
route per day with no place repeated.

Exhaustive search is not on the table: even at 34 places, subsets alone are
2³⁴ ≈ 1.7 × 10¹⁰, before ordering any of them.

### 3.2 Every factor that bends the plan

This is the complete list. Anything that changes an itinerary is here.

**Time and budget**

| Factor | Effect | Where |
|---|---|---|
| Window length (`mins`) | The hard ceiling | `rules/budget.ts` |
| Start clock | Sets the whole timeline; decides what is open | `budget.ts`, `schedule.ts` |
| Pace contingency | fast 5% · balanced 10% · relaxed 15% held back unspent | `budget.ts` |
| Visit factor | fast ×0.8 · balanced ×1.0 · relaxed ×1.25 on every visit | `budget.ts` |
| Meal & rest breaks | Reserved **up front** so they can never overflow the window | `rules/breaks.ts` |
| Who is travelling | Family/senior groups earn more and longer rests | `breaks.ts` |

**Place constraints**

| Factor | Effect | Where |
|---|---|---|
| Opening hours (`hours.o`/`hours.c`) | Arrive early → **wait**, not dropped. Shut mid-visit → invalid | `rules/hours.ts` |
| Weekday closures (`closed[]`) | Hard exclusion for that day | `hours.ts` |
| Recommended visit (`visit.rec`) | Base minutes, scaled by pace | `destinations.json` |
| `pending` | Unverified coordinates — never planned | `engine.ts:55` |

**Movement**

| Factor | Effect | Where |
|---|---|---|
| Travel mode | Speed table: car 24 · twowheeler 26 · erickshaw 18 · public 15 · walking 4.5 km/h | `config.ts` |
| Road factor 1.35 | Straight line → road distance (estimate fallback only) | `config.ts` |
| Real road matrix | Replaces the above for fixed-place pairs | `routing/cached.ts` ▸ |
| Parking buffer (6 min) | Charged **once per car park**, not per stop | `schedule.ts` |
| **Walk pockets** | After parking, everything linked in the graph is offered at its real cost — a short walk, no second parking buffer | `greedy.ts` |
| `POCKET_MAX` = 20 min | The most walking one car park may ask, there and back | `greedy.ts` |
| `same-complex` vs `walkable` | One gate/one car park, vs leave-the-car-and-walk. **Not transitive** | `data/graph.ts` |

**Preference and value**

| Factor | Effect | Where |
|---|---|---|
| Editorial rank | `rank × 0.4 + first × 0.3` — the board's own ordering | `rules/scoring.ts` |
| Theme match | `+34` per matching theme — a strong preference, **never a filter** | `scoring.ts` |
| Off-theme demotion | `score × 0.35 − 18` — stays in the pool, wins only on cheapness | `engine.ts:71` |
| Time-of-day fit | evening `+26` after 16:00 · morning `+22` before 11:00 · midday `+18` | `scoring.ts` |
| Pocket worth | same-complex `+40` · walkable `+22` — being already parked there is worth points | `greedy.ts` |
| Bias map | Per-place nudge, used by alternatives and now by events | `scoring.ts` |
| Filters | free-only, indoor-only — hard | `engine.ts` |

**Events**

| Factor | Effect | Where |
|---|---|---|
| `visitFactor` | Crowds make the visit longer (Gita Mahotsav at Brahma Sarovar: ×1.8) | `schedule.ts` `visitMin()` |
| `travelFactor` | Congestion and diversions slow every leg touching an affected place, on foot as well as by road | `schedule.ts` `slow()` / `legMin()` |
| `bias` | Weights the event's places up so the plan reaches them | folds into the existing bias map, `engine.ts` |
| Date match | An event applies only when the plan's date falls in its window | `data/events.ts` `activeEvent()` |

Both factors are applied in exactly two functions, and **every** algorithm goes
through them — `greedy`, `schedule`, `suggest`. That is not tidiness, it is the
correctness condition from §3.3: greedy must advance the clock exactly the way
`simulate` will, or it picks a set the authoritative pass then throws away.

**Shape of the trip**

| Factor | Effect | Where |
|---|---|---|
| Start / end points | Anchor both ends; end may mirror start or be a station with a hard deadline | `Plan.start/end` |
| Days | > 9 active hours splits into days at 09:00, no place repeated | `multiday.ts` |

### 3.3 The solution — four stages

Not one algorithm. Four, each doing one job, each debuggable alone.

```
   candidates  ─▶  greedy construction  ─▶  2-opt improvement  ─▶  simulate
   (filter +        (which places,            (better order,        (the one
    score)           incremental clock)        travel-monotone)      true clock)
```

**Stage 1 — candidates and scores.** Hard filters only: `pending`, free-only,
indoor-only. **The theme is not a filter.** It is worth a large score bonus, and
off-theme places stay in the pool where the cost model can decide that one you
are already parked beside is nearly free. This is deliberate and load-bearing:
a hard theme gate is what used to route a Mahabharata day past the Krishna
Museum's front door without mentioning it.

**Stage 2 — greedy construction.** Repeatedly append the best reachable, open,
budget-fitting stop:

```
value = score + timeFit(arrival) − travel × 1.6 − wait × 1.3
```

After each *driving* stop it opens a **walk pocket** anchored at the car:
everything linked to that anchor is offered at its real cost, with `+40` for a
same-complex sibling, `+22` for a walkable neighbour, and no second parking
buffer. The pocket is bounded by the car, not by the chain — without that test
it walks itself across town one short hop at a time.

Greedy advances the clock **exactly the way `simulate` will**, breaks included.
If it did not, it would pick a set that only fits without lunch, and the
authoritative pass would then throw the whole schedule away.

**Stage 3 — 2-opt improvement.** Reverse segments of the order; keep a reversal
only if it stays valid *and* shortens travel. Guarantee: output travel ≤ input
travel, hours never violated.

It reorders **pockets, not stops** — an anchor and everything walked to from it
move as one unit. Otherwise a walked-to place gets dropped elsewhere in the tour
still claiming a walk from a car park now several kilometres away.

**Stage 4 — one authoritative simulate.** Greedy picks *which*; `simulate`
decides *when*. The clock, the opening-hours checks, the waits, the parking and
the breaks are computed in exactly one place. Everything the UI shows comes from
this pass.

**Then:** alternatives (three `build()` calls with different options,
deduplicated by stop signature), `dropped[]` with a reason per place, and
`suggest[]` — what else fits in the leftover slack.

### 3.4 Why not the exact optimum

Exact dynamic programming (Held–Karp with time windows) is tractable at ≤15
candidates: 2¹⁵ × 15² ≈ 7.4 M states. We are not building it, for one reason:
it requires a **second complete implementation of the cost model** — pockets,
parking clusters, breaks, waits, event factors — that must stay bit-identical to
`simulate()` forever, or the two paths quietly disagree and the app shows a
schedule it cannot honour.

The gap being bought is small. On 8–12 stops after pocket-aware 2-opt, greedy
lands within a few percent of optimal, which is minutes on a day out — below the
noise of one slow queue at a ticket window. Half the maintenance for an
improvement no visitor can perceive.

### 3.5 Complexity, in real numbers

`n` = candidates (≤ 34) · `k` = chosen stops (typically 6–12) · `p` = pockets
(≤ k, typically 5–8)

| Stage | Complexity | Real cost |
|---|---|---|
| Filter + score | O(n) | 34 evaluations |
| Greedy: per stop, scan candidates + pocket | O(k · n) | ~10 × 34 = **340** |
| Each scan does an O(1) matrix lookup | O(1) | vs a haversine — free either way |
| `simulate` one order | O(k) | ~10 |
| 2-opt: passes × reversals × simulate | O(passes · p² · k) | 3 × 64 × 10 ≈ **2,000** |
| One `build()` | — | **~2,500 operations** |
| Three alternatives | ×3 | ~7,500 |
| Multi-day (up to 7) | ×days | ~50,000 worst case |

Under 5 ms for the common path, and worst case still inside a frame. That is the
whole argument against the Web Worker: the boundary would cost more than the
work crossing it.

**Memory:** matrix 28 KB/mode, edges 14 KB, destinations ~180 KB. Everything
resident, nothing paged, no query engine.

**Where it would stop scaling:** greedy is fine to thousands of places; 2-opt's
p² is fine to hundreds of stops. The real ceiling is the **matrix** — 500 places
is 250,000 pairs (~2 MB/mode), the point at which it should move out of the
bundle and into a fetched, cached asset. That is a long way from 34.

---

## 4 · Data management

The board decides which places matter. The data structure has to make that easy
and hard to get wrong, because they will be editing it for years and they know
what carries Kurukshetra's identity better than any algorithm does.

### 4.1 The split: which fields belong to whom

Every destination has three kinds of field. Keeping them mentally separate is
what makes the file editable by a non-programmer.

**A · The board's dials** — editorial judgement, changed freely, no code
knowledge needed:

| Field | Range | Meaning |
|---|---|---|
| `rank` | 0–100 | **How important is this place to Kurukshetra?** Brahma Sarovar 100, Jyotisar 98, Pipli Zoo 60. Drives selection. |
| `first` | 0–100 | **Should a first-time visitor be sent here?** Usually near `rank`, deliberately lower for specialist places. `first ≥ 84` is the "must-see" set. |
| `themes` | array | Which interests it belongs to — a place can be several at once (Brahma Sarovar is `aarti`, `heritage`, `spiritual`, `sarovar`). |
| `visit.rec` | minutes | How long a visit really takes. |
| `hours` | `{o, c}` | Opening and closing, `"HH:MM"`. |
| `closed` | `[0–6]` | Weekdays shut. `0` = Sunday. |
| `bestKey` | `morning`/`midday`/`evening` | When it is best seen. Puts the aarti at dusk. |
| `free` / `fee` | bool / text | Entry cost. |
| `indoor` / `child` / `senior` | bool | Suitability filters. |

**B · Facts** — verifiable, changed when the world changes: `lat`, `lng`,
`name`, `short`, `why`, `inside`, `notice`, `parking`, `facilities`, `placeId`.

**C · Machinery** — derived or developer-owned: `id`, `img`, `gallery`,
`pending`.

> **`rank` and `first` are the whole editorial control surface.** They are
> hand-set 0–100 dials, not computed from ratings. This is deliberate. Google
> review counts measure footfall, so a zoo and a planetarium out-review a
> `kund` — a defensible ranking for a tourist app and the wrong one for a
> 48-kos tirtha guide. If review data is ever gathered, it belongs as a signal
> the board *weighs when setting `rank`*, never as a runtime term. One ranking
> authority, not two that argue.

### 4.2 Adding a new place — the checklist

```
1. Append an object to  apps/web/src/content/data/destinations.json
     required: id, name{en,hi}, themes[], lat, lng, visit{rec,min,max},
               rank, first, short{en,hi}, why{en,hi}, hours{o,c}, closed[]
     set  "pending": true  until someone has stood at the coordinates
2. Add images to public/ and reference them by `img` / `gallery`
3. npm run build-graph     → regenerates edges.json (walkable / same-complex)
4. npm run build-matrix  ▸ → regenerates the routing matrices
5. npm run check-content   → enforces {en,hi} parity on every string
6. npm run check-graph     → asserts the graph's own invariants
7. Remove "pending" once the pin is verified on the ground
```

`pending` is the safety catch: a new place is in the data, visible, and
searchable, but never planned into a route until a human has confirmed where it
actually is. Two places sit at `pending` today.

**Nothing else needs touching.** No migration, no schema version, no seed step —
the file *is* the database, and the app ships with it.

### 4.3 The place graph

`edges.json` is generated from coordinates and then **corrected by hand**. The
generator is a starting point, not an answer: it can measure ninety metres, but
only a person knows the ninety metres crosses a railway line with no footbridge,
or that two pins forty metres apart are on opposite banks of a sarovar.

- `same-complex` (≤150 m) — one gate, one car park, one boundary wall. A cluster
  pays for parking once.
- `walkable` — far enough to need the decision, near enough to make it.
- `verified: false` — nobody has walked it yet. Safe to use, worth correcting.

**Not transitive**, and the file says so: 126 of the 630 destination pairs are
within 900 m of each other, and transitive closure over those makes central
Kurukshetra one 3 km "walk".

### 4.4 The events file

`apps/web/src/content/data/events.json` — board-authored, bilingual, same shape rules as
every other content file, so `check-content.mjs` enforces `{en, hi}` parity
automatically.

```json
[
  {
    "id": "gita-mahotsav-2026",
    "kind": "festival",
    "name": { "en": "International Gita Mahotsav",
              "hi": "अंतर्राष्ट्रीय गीता महोत्सव" },
    "from": "2026-11-25",
    "to":   "2026-12-05",
    "img": "e-gita-mahotsav",
    "places": ["brahma-sarovar", "sannihit-sarovar", "jyotisar"],
    "visitFactor": 1.8,
    "travelFactor": 1.4,
    "bias": { "brahma-sarovar": 60 },
    "blurb": { "en": "Eleven days of aarti, shobha yatra and shilp mela on the ghats.",
               "hi": "घाटों पर ग्यारह दिन की आरती, शोभायात्रा और शिल्प मेला।" },
    "notice": { "en": "Expect heavy crowds and road diversions around Brahma Sarovar.",
                "hi": "ब्रह्म सरोवर के आसपास भारी भीड़ और मार्ग परिवर्तन की संभावना।" }
  }
]
```

| Field | Purpose |
|---|---|
| `kind` | `festival` · `snan` (bathing day) · `show` · `mela` — drives the icon and the kicker text |
| `from` / `to` | Inclusive ISO dates. A one-day event sets both the same. |
| `places` | Which destinations it touches, by id |
| `visitFactor` | Multiplies the visit duration at those places | 
| `travelFactor` | Multiplies travel on any leg touching them |
| `bias` | Score nudge, so the plan actually reaches the event |
| `blurb` | The slider card's line |
| `notice` | The warning shown on the plan and the place page |

**Authoring rules.**

1. The two factors are calibration knobs, tuned against a real festival day,
   not reasoned about. Start at `1.5` / `1.3` and correct after watching one.
2. **The dates are lunar, and nothing in the code computes them.** Gita
   Jayanti moves with Mokshada Ekadashi; Somvati Amavasya is a new moon that
   happens to fall on a Monday. They are re-entered from the panchang each
   year, and the dates currently in the file are *placeholders that have not
   been confirmed against the Board's calendar*. Confirm them before a release
   that anyone plans a trip on.
3. Event photos are optional. With no `img`, the rail wears the picture of
   `places[0]` — the ghat the visitor will actually be standing on.

`data/events.ts` is the whole reader:

```ts
activeEvent(isoDate)              // the event covering that date, or null
eventById(id)                     // back from the id an itinerary carries
ongoing(today)                    // events happening now
upcoming(today, withinDays = 120) // events soon, nearest first
eventsBetween(from, to)           // everything overlapping a range — the calendar
eventsAt(placeId, today)          // everything at one place — the place page
affects(event, placeId)           // is this place touched
```

### 4.5 Wiring events into the engine

No new architecture — the mechanisms all existed.

| Where | Change |
|---|---|
| `algorithms/schedule.ts` | `visitMin()` and `slow()`/`legMin()` — the two places any cost is computed, now event-aware |
| `algorithms/greedy.ts`, `suggest.ts` | Call those instead of doing the arithmetic themselves |
| `engine.ts` | Fold `event.bias` into the existing bias map — already how alternatives work |
| `engine.ts` meta | Carry `event` (the id) and `eventStops` (which stops it touches) so the UI can badge them |
| `algorithms/multiday.ts` | Each day gets its own date, so a stay running into the Mahotsav gets the crowds only on the days that have them |

**The good behaviour is emergent.** Longer visits and slower travel make the
feasibility arithmetic stricter, so the engine proposes fewer stops on a
festival day *by itself*; and `timeFit` pulls the crowded place toward the
morning *by itself*. No special-case code — the existing cost model does the
right thing once the numbers are honest.

Measured on a full day from the town centre, balanced pace, no theme:

| Day | Event | Stops | Visiting |
|---|---|---|---|
| 26 Nov 2026 | — | 14 | 270 min |
| 10 Dec 2026 | Gita Mahotsav | **7** | **327 min** |
| 12 Oct 2026 | — | 13 | 245 min |
| 19 Oct 2026 | Somvati Amavasya | **10** | 265 min |

Half the stops, more time at each, and the plan still reaches the ghats the
festival is happening on. `check-planner` asserts exactly this, so the day the
wiring comes undone the assertion fails rather than the itinerary quietly
getting optimistic.

### 4.6 The home page event slider

A new `EventRail`, sitting **above `HeroRail`** — an event happening this week
outranks the evergreen must-see carousel — and rendering nothing at all when
there are no ongoing or upcoming events.

```
Home
├── TimeBlock
├── search + weather row
├── EventRail  ▸new   ← ongoing first, then upcoming
├── HeroRail          ← must-see carousel
├── themes grid
└── HowToCard
```

The swipe/auto-advance/dots mechanism was **lifted out of `HeroRail` into
`useRail()`** rather than copied. Two rails, one implementation: a second copy
is a second place for the auto-advance to keep running after the visitor has
taken hold of the rail, which is the bug this interaction is actually about.
The hook also measures its step from the distance between the first two cards
instead of a width plus a hard-coded gap, so either rail can change its card
size in CSS without the dots falling out of step.

The event card is **16/10, not the hero's 4/5**. Two full-bleed 4/5 carousels
stacked would push the themes grid — the thing a first-time visitor came for —
below the fold on every phone.

| Card state | Kicker | Action |
|---|---|---|
| Ongoing | "Happening now · until 5 Dec" | Plan for today, event places weighted up |
| Upcoming | "In 12 days · 25 Nov" | Plan for the start date, pre-filled |

Tapping a card opens the planner with `date` set and the event's bias applied —
the one tap from *"there is a festival"* to *"here is my day at it"*.

Accessibility carries over from the existing rails and is not optional: real
`<button>` elements, `aria-label` with the full event name, auto-advance stops
on first touch, and the whole rail is reachable by swipe or by tapping the dots.

### 4.7 Events elsewhere in the app

| Surface | Treatment |
|---|---|
| Route screen | Affected stops carry an event badge; the notice shows once, above the timeline |
| Place page | An ongoing or upcoming event at that place is a tappable card near the top — tapping it plans around the event |
| Date picker | A dot on festival days, **and the event named in words** under the grid for whatever the chosen range lands on |
| No-fit fallback | See §4.9 |

**The badge and the notice are brass, not saffron.** Saffron is this app's
action colour and nothing else (`--accent` in `global.css`); a badge explaining
why a visit takes longer is not something you tap. The place-page card *is*
tappable and earns an indigo arrow for it, not a louder background.

**The calendar dot is never the only signal.** Colour alone carries no meaning
in this app, so `eventsBetween(from, to)` names whatever the range overlaps, in
words, in a note under the grid — and the dot sits at the *top* of the cell
because the bottom already belongs to the "today" marker and a day can be both.

### 4.9 The no-fit fallback

"Nothing fits that window — try a longer window, fewer themes, or a brisker
pace" is true and useless: three guesses handed back to the person with the
least information. The engine can simply try them.

When a build returns no stops, `suggestFix()` re-runs `build()` against a small
set of remedies and returns the first that works, with the number of stops it
would reach. The probes carry `probe: true`, which stops a failed probe going
looking for a fix for the fix.

Ordered by **how little it costs the visitor to accept**:

| # | Remedy | Why in this position |
|---|---|---|
| 1 | Set off an hour earlier (never before 06:00) | Free. Costs a lie-in, nothing else |
| 2 | Allow 50% longer | A real concession — this is time they said they did not have |
| 3 | A different date — the day after the event ends if one is in the way, else tomorrow | Last resort: it moves the whole trip |

The route screen then says the specific thing — *"Set off at 6:30pm instead —
that fits 1 stop"* — with one button that applies it. `check-planner` asserts
the promise holds: rebuilding with the patch must produce the number of stops
the fix advertised. A button that apologises twice is worse than no button.

### 4.8 Content checks

Every new data file gets an assertion, in the existing style — one runnable
check that fails if the logic breaks, no framework:

| Check | Asserts |
|---|---|
| `check-content` | events.json in the walk list → `{en,hi}` parity enforced free |
| `check-content` | `places[]` and `bias` ids exist in destinations; `kind` known; dates are ISO and `from ≤ to`; factors within 1.0–3.0; no two events claim the same place on the same day |
| `check-planner` | A festival plan fits fewer stops and spends longer at each than the same weekday a fortnight earlier, still reaches the festival's own places, and carries `event`/`eventStops` for the UI |
| `check-planner` | An impossible window returns a fix; the fix delivers the stops it promised; a working plan carries none; a probe never recurses |
| `check-graph` | The graph's invariants, and that a themed day is **driven** by its theme (see below) |
| `check-matrix` | Every pin inside the Kurukshetra box; no pair over 60 km; detour ratios and implied speeds believable; and the provider actually reads the file, including by `ref` |

Two of these were rewritten rather than added, and both for the same reason —
they were measuring a proxy that stopped tracking the thing it stood for:

**`check-graph`'s theme test.** It asserted that at least half the stops on a
Mahabharata day were on-theme. Once real road distances landed, a day came back
with 5 on and 6 off and "failed" — but all four *driven* stops were on-theme,
and the six off-theme ones were 1–7 minute walks from a car park already paid
for. Counting every stop equally scored the museum sixty metres away the same
as a sixteen-minute drive to Jyotisar. A pocket stop is nearly free *by
construction* (§3.3 stage 2); that is the entire point of pockets. The test now
asserts on driven stops, which is the thing that must never go wrong.

**`check-matrix`'s ratio band.** A ×3.2 ceiling on road-versus-straight-line
rejected 59 pairs on the first run. They were all real: Rantuk Yaksh to Pipli
Zoo is 0.9 km apart, 9.4 km by road one way and 3.0 km back, because NH-44 runs
between them and you cannot turn across it; and below ~1 km the figure is
dominated by OSRM snapping each pin to the nearest way — some road distances
come out *shorter* than the great circle. Measured over this data the ratio only
settles above 2 km (1.05–2.94), so the band applies there and nowhere else. The
check that actually catches a swapped lat/lng is the **bounding box**, which
catches it exactly rather than statistically: transpose 29.96/76.83 and the
place lands in the Indian Ocean.

---

## 5 · Build order

All six shipped, each with its check (§4.8), each leaving the app buildable.

| # | Work | Files | Status |
|---|---|---|---|
| 1 | **Event data + engine wiring** | `events.json`, `data/events.ts`, `schedule.ts`, `greedy.ts`, `suggest.ts`, `engine.ts`, `multiday.ts` | done |
| 2 | **Home event slider** | `EventRail.tsx`, `useRail.ts`, `HeroRail.tsx`, `Home.tsx`, CSS | done |
| 3 | **Routing matrix** | `build-matrix.mjs`, `check-matrix.mjs`, `routing/cached.ts`, `routing/index.ts` | done |
| 4 | **Prefs store** | `persist.ts`, `state.ts`, `plan.ts` | done |
| 5 | **Event surfaces** | `RouteResult.tsx`, `Place.tsx`, `DateTimeSheets.tsx`, CSS | done |
| 6 | **No-fit fallback** | `engine.ts`, `plan.ts`, `RouteResult.tsx` | done |

Run before committing anything that touches the engine or the content:

```
npm run check-content    # {en,hi} parity, events, the places index
npm run check-graph      # walk pockets, parking, the themed-day rule
npm run check-planner    # breaks, event effects, the no-fit fallback
npm run check-matrix     # the road matrix and the provider reading it
npm run check-corridor
```

`npm run build-matrix` is the only thing here that needs the network, and it is
only run when a place is added, moved, or verified.

## 6 · What is not built

Recorded so nobody goes looking for it:

| Not built | Why | Reconsider when |
|---|---|---|
| Real foot routing | The OSRM demo has no foot profile; every walk in this app is a sub-300 m hop priced from the hand-checked `edges.json` | Walking between distant places becomes a real mode. OpenRouteService (free key, 2k/day) is the path |
| Curated bus / e-rickshaw data | `public` is still distance ÷ 15 km/h | Someone gathers the routes — see [05](05-routing-phase2.md) |
| Live OSRM for arbitrary start points | §2.4: the plan path must never touch the network, and the estimate's error is ~2% | Start points routinely sit outside the district |
| Recurring events (the daily evening aarti) | `from`/`to` describe one span. The aarti is already carried by `bestKey: "evening"`, which is the right mechanism for a thing that happens every day | A genuinely recurring *dated* event appears |
| Event images | The rail falls back to `places[0]`'s photo | The Board supplies them; set `img` and nothing else changes |
