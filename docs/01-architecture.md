# 01 · Architecture

## Stack

- **React 18 + TypeScript + Vite**, PWA via `vite-plugin-pwa`.
- **Leaflet + OpenStreetMap** tiles for the in-app map (free; no key).
- **Google Maps deep-links** for the actual "Navigate" hand-off (free, accurate).
- **Cloudflare Workers + Neon Postgres** for content, accounts and push
  (`apps/api`). D1 until 11 August 2026 — see docs/13.
  The app still runs entirely client-side and still ships a complete bundled
  copy of its data — the backend is what lets that data change without a
  release, never what the app waits on to draw. See [12](12-deploying-to-the-client-account.md).

## Why this shape

The original was a single 1.8 MB HTML/CSS/JS file (`demo/`, kept frozen as the
reference). It was ported 1:1 into a feature-divided React app so the team can
extend it without touching one giant file. Behaviour was preserved exactly;
only structure changed.

## Folder map

The repository is an npm workspace. The top level answers one question —
*which side of the wire is this?* — before you open anything.

```
docs/                  this documentation. Outside the code, deliberately.
demo/                  the frozen 1.8 MB original, kept as the reference.
apps/
├── web/               FRONTEND ONLY. No SQL, no secrets, no server code.
│   ├── index.html · vite.config.ts · .env.production
│   ├── tools/         build + self-check scripts (was scripts/)
│   └── src/
│       ├── main.tsx / App.tsx    entry + HashRouter route table
│       ├── app/       state.ts (store + volatile state + bump/useApp), nav.ts
│       ├── content/   JSON: UI strings (i18n) + domain content, and live.ts
│       ├── data/      typed loaders that read content/ and expose config/THEMES/D/…
│       ├── shared/    i18n (t/nm), icons, ui primitives, lib, types
│       └── features/  onboarding, home, explore, place, journey, map, saved,
│                      search, settings, weather, location, planner/
└── api/               THE BACKEND. The only place with SQL or secrets in it.
    ├── wrangler.toml  bindings, vars, cron
    ├── db/            migrations/ (the schema) + migrate.mjs (the runner)
    └── src/           index.ts (routes), store.neon.ts (all SQL), admin.ts, push.ts
packages/
└── shared/            rules BOTH sides must agree on. Imports from neither.
```

The rule that keeps this honest: `apps/web` may not import from `apps/api`
and vice versa. Anything they both need moves to `packages/shared`, which is
why `event-rules.mjs` lives there — the build-time check and the Worker's
`PUT /admin/events` validate with the same code rather than two copies that
drift.

## State model

The demo used mutable module globals and a `render()` that rebuilt `innerHTML`.
Ported faithfully:

- **`src/app/state.ts`** holds `S` (volatile app state: `lang`, `plan`,
  `journey`, `userLoc`, weather) and a `store` object backed by `localStorage`
  (persisted `lang`, text-size, favourites, saved routes).
- Every place the demo called `render()`, the app calls **`bump()`**, which
  ticks a version that **`useApp()`** (a `useSyncExternalStore` hook) subscribes
  to — so any component re-renders on state change. This keeps the imperative
  logic intact while making it React-driven.

## Routing (hash)

`react-router` `HashRouter`. The demo's `go(r)` still just sets
`location.hash`, which the router observes. Route table is in `App.tsx`; the
chrome (header, tab bar, sheet, toast) lives in `shared/ui/Shell.tsx`.

## Conventions

- Bilingual strings are `{ en, hi }` (`Loc` type); `nm(loc)` picks the current
  language, `t(key)` looks up a UI string. See [04](04-content-and-i18n.md).
- Overlays (bottom sheet, toast) are React state via `shared/ui/overlays.ts`,
  not DOM pokes.
