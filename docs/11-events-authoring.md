# 11 · Keeping the event calendar

The calendar is the reason someone who lives here opens this app on a Tuesday.
It is also the only content that goes stale on its own, so this is the file to
read before touching `apps/web/src/content/data/events.json`.

## Where it lives

| | |
|---|---|
| Data | `apps/web/src/content/data/events.json` — the single source of truth |
| Reader | `apps/web/src/data/events.ts` — every query the app asks of it |
| Gate | `npm run check-content` — refuses a malformed or ambiguous entry |
| Surfaces | Home alert + rail, route badges, place cards, the date picker |

Nothing computes a date. **Lunar dates are re-entered from the panchang every
year** — Gita Jayanti moves with Mokshada Ekadashi, Somvati Amavasya is a new
moon that happens to fall on a Monday. Confirm each against the Board's
calendar before a release anyone plans a trip on.

## The two shapes of event

The model started tourism-shaped: a festival **at places you visit**. A
district app needs the other half — a thing happening at an **hour**, on a
**road**, that a resident may want to reach or keep away from.

**A destination event** — `festival`, `snan`, `show`, `mela`.
It defines a day at the places it names. `activeEvent()` returns it, and the
engine charges its `visitFactor` and `travelFactor` against every affected
stop. **One per place per day** — two events claiming the same place on the
same date is an ambiguity `activeEvent()` would resolve silently and wrongly,
so the check rejects it.

**An overlay event** — `yatra`, `closure`.
A procession or a road closure. It runs for two hours along a road and can
perfectly well happen *during* a mela; the Gita Shobha Yatra falls inside the
Gita Mahotsav every year. So an overlay:

- is **exempt** from the one-per-place-per-day rule;
- is **skipped by `activeEvent()`**, so the engine keeps one unambiguous set of
  factors from the festival rather than letting a two-hour closure govern a
  ten-day arithmetic;
- **must** carry `window`, `corridor` (≥2 points) and `advice` — enforced. "A
  procession somewhere today" is not something anyone can act on.

## Fields

```jsonc
{
  "id": "gita-shobha-yatra-2026",     // stable, year-suffixed
  "kind": "yatra",
  "name":   { "en": "…", "hi": "…" },
  "from": "2026-12-14", "to": "2026-12-14",   // inclusive; same day = one day
  "window": { "from": "16:00", "to": "18:30" },  // overlays: required
  "places": ["brahma-sarovar", "sthaneshwar"],   // ids from destinations.json
  "corridor": [ {"lat": 29.9695, "lng": 76.8181}, … ],  // overlays: the road
  "advice": "avoid",                  // "avoid" | "join"
  "visitFactor": 1.4,                 // 1.0–3.0
  "travelFactor": 1.6,                // 1.0–3.0
  "bias": { "brahma-sarovar": 40 },   // score nudge so the plan reaches it
  "blurb":  { "en": "…", "hi": "…" }, // the banner's line
  "notice": { "en": "…", "hi": "…" }  // the warning on plan and place
}
```

**The two factors are calibration knobs, not physics.** Tune them against a
real festival day; do not reason them out. Start at `1.5` / `1.3` and correct
after watching one.

**Both languages, always.** `check-content` fails on a missing `hi`, and half
this app's users reach for Hindi before anything else.

## Adding one

1. Edit `apps/web/src/content/data/events.json`.
2. `npm run check-content` — it names the exact field and entry that is wrong.
3. `npm run check-planner` — proves a festival day still fits fewer stops and
   spends longer at each, i.e. that the wiring is live rather than declared.
4. Look at Home. An overlay live today, or starting within 90 minutes, shows as
   an alert above the rail; everything else within 90 days shows in the rail.

Getting the corridor points: trace the procession route on
`openstreetmap.org`, right-click → "show address" at each turn, and copy the
lat/lng. Four or five points is plenty — the corridor is matched with a
perpendicular-distance test, not driven along.

## Where the data comes from at runtime

`apps/web/apps/web/src/content/live.ts` makes any content file updatable without a release. Three
rules, in this order, and the order is the design:

1. The **bundled** copy renders first. The app opens on a rural signal and must
   never wait for a network to draw.
2. The **last-fetched** copy is applied from IndexedDB at boot — already on the
   device, so effectively instant.
3. The **network** is asked afterwards, in the background. A different `rev` is
   stored and applied; no answer at all changes nothing and nobody notices.

So the network is an optimisation, never a dependency. With `VITE_CONTENT_URL`
unset, `BASE` is `""` and `fromNetwork` returns before it ever calls `fetch` —
the app behaves exactly as the static bundle it was before. (The access is
written `import.meta.env?.VITE_CONTENT_URL`. The `?.` costs the dead-code
elimination Vite would otherwise do, and it is not optional: the check scripts
import this module under plain node, where `import.meta.env` is undefined and
the unguarded form throws at module load.)

Endpoint shape:

```jsonc
GET {VITE_CONTENT_URL}/content/events.json
{ "rev": "2026-08-03T14:02Z",   // opaque; any change wins
  "items": [ /* the same objects as events.json */ ] }
```

An empty or malformed `items` is **ignored**, deliberately: "no events" and
"the request went wrong" look identical from the client, and one of them must
not be allowed to blank the calendar.

Verified against a local server: online takes the remote copy, offline serves
the cached one, and a device that has never reached the server falls back to
the bundle.

**Serve it same-origin if you can.** A different origin needs
`Access-Control-Allow-Origin` or the fetch is blocked and the app silently
stays on the bundled copy — which is exactly what happened the first time this
was tested. Hosting the app on Cloudflare Pages with the Worker on the same
domain avoids the problem entirely.

`register()` is content-agnostic. Places and hotels are the same shape of
problem and are meant to arrive through this path, not a second mechanism:

```ts
export let PLACES = bundled;
register<Place>("places", (items) => { PLACES = items; });
```

## What is deliberately not built

**Push notifications.** A real "a yatra starts in forty minutes on your road"
push needs a server: Web Push requires VAPID keys and something awake to send
the message when the app is closed. This app has no backend by design — it is
a static PWA that works without a signal.

What exists instead is the honest subset: the alert on Home reads
`liveToday()` / `startingSoon()` and, if location has been granted, says
whether the corridor is near you. It fires when the app is opened, not while it
is shut.

Making it a true notification is a small, well-bounded piece of work, and it
needs a decision that is not a coding one: **where the sender runs**. Cheapest
credible options are a Cloudflare Worker on a cron trigger, or the Board's
existing site posting to a Web Push endpoint. `events.json` already carries
everything such a sender would need — the id, the window, the corridor and both
languages — so nothing here has to change when that decision is made.
