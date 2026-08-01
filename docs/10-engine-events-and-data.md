# 10 · The planning engine, events, and data management

The working spec for the next build. It supersedes the split between "current"
and "proposed" in [09](09-proposed-architecture-review.md) — this is the single
design, taking what already works and adding what is missing.

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
│  Home (EventRail ▸ new)  Planner  Route  Journey  Place  Map   │
├───────────────────────────────────────────────────────────────┤
│  Engine — synchronous, main thread, pure                      │
│  engine.ts orchestrates:                                      │
│    rules/      hours · scoring · budget · breaks · events ▸    │
│    algorithms/ greedy · twoOpt · schedule · suggest · multiday │
│    routing/    provider ▸ cached ▸ estimate ▸ osrm             │
├───────────────────────────────────────────────────────────────┤
│  Static content — imported at build, ships in the bundle      │
│  destinations.json  edges.json  themes.json  places-index.json │
│  events.json ▸new    routing/matrix.<mode>.json ▸new           │
├───────────────────────────────────────────────────────────────┤
│  IndexedDB — shared/lib/db.ts, zero dependencies              │
│  user data only: draft · saved plans · prefs ▸new              │
└───────────────────────────────────────────────────────────────┘
                                              ▸ = to build
```

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
| Routing matrix | 34 × 34 × 2 arrays | **~28 KB per mode** |
| Events | ~10–20 per year | ~8 KB |
| Places index (start/end points) | 6, growing | ~2 KB |

The matrix is stored as indexed arrays, not one row per pair:

```json
{ "ids": ["brahma-sarovar", "jyotisar", "…"],
  "min": [[0, 12, 18], [12, 0, 9], [18, 9, 0]],
  "km":  [[0, 5.2, 7.1], [5.2, 0, 2.3], [7.1, 2.3, 0]] }
```

Same data as 1,156 `{fromId, toId, mode, durationMin, distanceKm}` records, at
a fraction of the bytes, with O(1) lookup and no query engine.

### 2.4 The routing stack

Everything that needs "how far / how long / what path" goes through the existing
`RoutingProvider` interface. Swapping the implementation is one line in
`routing/index.ts`; no algorithm and no component changes.

| Case | Source | Cost |
|---|---|---|
| Fixed place → fixed place | `matrix.<mode>.json` lookup | O(1), offline |
| Arbitrary point (hotel, dropped pin) → anything | Live OSRM `/route`, memoised for the session | one call, cached |
| Offline, or the call failed | `EstimateProvider` — haversine × 1.35 ÷ mode speed | always available |
| Walking between linked places | `edges.json` — the hand-verifiable figure | O(1), offline |
| Drawing the road on the map | Live OSRM `/route` geometry, already built (`osrm.ts`) | best-effort, falls back to straight segments |

**Per-mode reality.** The public OSRM demo was probed: `/route/v1/foot/` returns
byte-identical numbers to `/driving/` — it ignores the profile and serves car
only. So the drive matrix is real road data; walking uses `edges.json` (every
walk in this app is a sub-300 m same-complex hop, where a hand-checked edge
beats any engine); `public` transit stays estimated until curated bus data
lands. OpenRouteService (free key, 2k/day) is the upgrade path for a real foot
profile if walking ever needs it.

### 2.5 Preferences — the "don't make me answer twice" store

New IndexedDB record, `id: "prefs"`, written whenever a plan is built:

```ts
interface Prefs {
  id: "prefs";
  startType: string;  start: GeoPoint;   // where they set off from last time
  endType: string;    end: GeoPoint;
  mode: string; modes: string[];
  pace: string; who: string;
  themes: string[];
  opts: Record<string, boolean>;         // meal, free-only, indoor-only
}
```

`newPlan()` seeds from `prefs` instead of from constants. The date always
resets to today — a stale date is the one field that must never carry over,
because it silently checks the route against the opening hours of a day that
has passed.

This is a ~30-line change and it removes four taps from every plan after the
first.

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

**Events** ▸ new

| Factor | Effect | Where |
|---|---|---|
| `visitFactor` | Crowds make the visit longer (Gita Mahotsav at Brahma Sarovar: ×1.8) | `rules/events.ts` ▸ |
| `travelFactor` | Congestion and diversions slow every leg touching an affected place | `rules/events.ts` ▸ |
| `bias` | Weights the event's places up so the plan reaches them | folds into the existing bias map |
| Date match | An event applies only when the plan's date falls in its window | `rules/events.ts` ▸ |

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
1. Append an object to  src/content/data/destinations.json
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

`src/content/data/events.json` — board-authored, bilingual, same shape rules as
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

**Authoring rule:** the two factors are calibration knobs, tuned against a real
festival day, not reasoned about. Start at `1.5` / `1.3` and correct after
watching one.

`rules/events.ts` (~25 lines) is the whole reader:

```ts
activeEvent(isoDate)              // the event covering that date, or null
ongoing(today)                    // events happening now
upcoming(today, withinDays = 120) // events soon, nearest first
affects(event, placeId)           // is this place touched
```

### 4.5 Wiring events into the engine

Four small edits. No new architecture — the mechanisms all exist.

| Where | Change |
|---|---|
| `rules/budget.ts` | Multiply `visitFactor` by the event's for affected places |
| `algorithms/schedule.ts`, `greedy.ts` | Multiply travel by `travelFactor` when either end is affected |
| `engine.ts` | Fold `event.bias` into the existing bias map — already how alternatives work |
| `engine.ts` meta | Carry the active event through so the UI can badge stops |

**The good behaviour is emergent.** Longer visits and slower travel make the
feasibility arithmetic stricter, so the engine proposes fewer stops on a
festival day *by itself*; and `timeFit` pulls the crowded place toward the
morning *by itself*. No special-case code — the existing cost model does the
right thing once the numbers are honest.

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

Built on the same swipe/auto-advance/dots pattern `HeroRail` already
implements — same interaction, same CSS family, no new mechanism.

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
| Plan / route screen | Affected stops carry an event badge; the notice shows once, above the stop list |
| Place page | An ongoing or upcoming event at that place shows as a card near the top |
| Date picker | Festival dates marked, so choosing a date is an informed choice |
| No-fit fallback | "The Mahotsav makes this window tight — start 40 minutes earlier, or plan for the 8th" |

### 4.8 Content checks

Every new data file gets an assertion, in the existing style — one runnable
check that fails if the logic breaks, no framework:

| Check | Adds |
|---|---|
| `check-content` | events.json in the walk list → `{en,hi}` parity enforced free |
| `check-content` | `places[]` ids exist in destinations; `from ≤ to`; factors within 1.0–3.0; no two events claim the same place on the same day |
| `check-planner` | A festival-date plan takes longer per stop and returns fewer stops than the same plan a week earlier |
| `check-graph` | Unchanged — already asserts the graph's invariants |
| `check-matrix` ▸ | Matrix ids match destinations; every road time within a sane band of the haversine estimate (catches a swapped lat/lng) |

---

## 5 · Build order

| # | Work | Files | Size | Why first |
|---|---|---|---|---|
| 1 | **Event data + engine wiring** | `events.json`, `rules/events.ts`, 4 edits | ~90 lines | The only missing capability, and the Mahotsav is *the* Kurukshetra event |
| 2 | **Home event slider** | `EventRail.tsx`, `Home.tsx`, CSS, i18n | ~120 lines | The feature the visitor actually sees |
| 3 | **Routing matrix** | `build-matrix.mjs`, `routing/cached.ts`, `index.ts` | ~80 lines | Real road times; closes Phase 2; makes the plan instant |
| 4 | **Prefs store** | `persist.ts`, `state.ts` | ~30 lines | Removes four taps from every plan after the first |
| 5 | **Event surfaces** | Route, Place, date picker badges | ~60 lines | Completes the loop |
| 6 | **No-fit fallback** | `engine.ts` | ~20 lines | Turns a dead end into a re-plan |

Each step lands with its check (§4.8) and leaves the app shippable.
