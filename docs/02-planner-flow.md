# 02 · Planner flow ("Plan my visit")

Five steps, then a built route. State lives in `S.plan` (`Plan` type in
`shared/types.ts`); each step mutates it and calls `bump()`. Files:
`features/planner/Planner.tsx` (UI), `plan.ts` (flow logic + helpers),
`LocationPicker.tsx` (search + pin).

## Step 1 — Time (date + start time)  ·  *most important input*

- Captures `plan.date`, `plan.startClock`, `plan.mins`.
- Entering from a Home duration pill still **lands here** (`quick()` sets
  `step:0`) so the user always confirms **day + start time**; the pill only
  prefills the duration.
- **Why it matters:** the day drives opening-hours & Monday-closure checks and
  best-time-of-day scoring; the start time + duration are the whole budget.

### The pickers (`DateTimeSheets.tsx`)

Two summary rows (`.when .pickrow`) each show the current value and open a real
picker in the bottom sheet:

| Row | Picker | Notes |
|-----|--------|-------|
| Day | **month calendar** — the `.cal` grid the stylesheet already carries | today dotted, chosen day filled, past days and anything >1 year disabled, month nav (prev disabled in the current month). Choosing a day commits and closes. |
| Start time | **clock dial** | 12 hour numerals placed by trig around the face, a hand to the chosen hour, quarter-hour minutes, AM/PM. Nothing commits until "Set time"; "Start now" clears to *now* when the day is today. |

**Why this and not chip rows:** an earlier pass offered the day as a horizontal
strip of chips and the time as named presets. That doesn't scale (a date is a
2-D thing — a month grid — not a scrolling list) and it hid precision behind an
extra affordance. Standard patterns win: a calendar for a date, a clock for a
time, each in a sheet, each summarised in the row that opens it. The dial also
suits an app whose timings turn on sunrise and the evening aarti, and it reuses
the `surya` idea already in the icon set.

Minutes are quarter-hour only: enough to plan a visit, and it keeps the dial to
one tap per field.

## Step 2 — Starting point  ·  *defines leg 0 and the default end*

| Option | Data captured | Source |
|--------|---------------|--------|
| Current location | `start={lat,lng}` | Geolocation (`askLoc`) |
| Hotel / dharamshala | `start={lat,lng,label,ref}` | search over `places-index` |
| Railway station | ″ | the **2** curated stations |
| Bus stand | ″ | the **2** curated bus stands |
| Somewhere else | `start={lat,lng,label:"Pinned"}` | **pin on a Leaflet map** |

**Why it matters:** a wrong start skews every leg — an exact, searchable/pinned
start is the biggest single accuracy win of Phase 1.

## Step 3 — Ending point  ·  *return leg, strong smart-defaults*

- Same place types + `Back where I started` / `Anywhere`.
- **Smart default (`setStartPoint` mirrors until the user overrides):** a
  *station* start ⇒ end defaults to that same station; a *stay* ⇒ the entered
  stay is prefilled. Both are shown ("Ending at: …") and changeable
  (`endManual` flips once the user picks an end).
- **Why:** removes a whole step for the two common trips — hotel→sights→hotel
  and station→sights→station.

## Step 4 — What for (themes)

- `plan.themes` (multi; `any` = no preference). Feeds scoring & candidate
  filtering.

## Step 5 — Getting around  ·  *multi-select ≥ 1*

- `plan.modes: string[]` (car, taxi, two-wheeler, **e-rickshaw**, bus/public,
  walk); `plan.mode = modes[0]` stays the primary for the engine.
- **Why multi:** real trips mix modes (bus to an area, then walk). Phase 1
  records the set; per-leg mode selection lands with Phase 3 transit data.

## Scenarios

- **A** Home "3h" → Time step, 3h prefilled, today+now; user switches to
  tomorrow 09:00.
- **B** Start = current location; End = a searched hotel → hotel is the last leg.
- **C** Start = Kurukshetra Junction → End auto-defaults to that station, shown.
- **D** Start = a bus stand; modes = [bus, walk] → (Phase 3) bus between areas,
  walk within a cluster.
- **E** Start = "somewhere else" → user pins a dharamshala; leg 0 from the pin.
- **F** 3h/4-stop route leaves 25 min slack → "Also fits: Sthaneshwar (+18 min)".

## After build

`buildRoute()` (plan.ts) assembles engine options from `S.plan` and calls the
engine (see [03](03-algorithms.md)). Result → `S.plan.res` (an `Itinerary`),
rendered by `features/route/RouteResult.tsx`; live tour in
`features/journey/Journey.tsx`; map in `features/map/MapView.tsx`.
