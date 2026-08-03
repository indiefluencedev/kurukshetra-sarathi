# 01 · Architecture

## Stack

- **React 18 + TypeScript + Vite**, PWA via `vite-plugin-pwa`.
- **Leaflet + OpenStreetMap** tiles for the in-app map (free; no key).
- **Google Maps deep-links** for the actual "Navigate" hand-off (free, accurate).
- No backend. Everything runs client-side; routing data is pre-cached at build.

## Why this shape

The original was a single 1.8 MB HTML/CSS/JS file (`demo/`, kept frozen as the
reference). It was ported 1:1 into a feature-divided React app so the team can
extend it without touching one giant file. Behaviour was preserved exactly;
only structure changed.

## Folder map

```
src/
├── main.tsx / App.tsx        entry + HashRouter route table
├── app/          state.ts (store + volatile app state + bump/useApp), nav.ts
├── content/      JSON: UI strings (i18n) + domain content (destinations, …)
├── data/         typed loaders that read content/ and expose config/THEMES/D/…
├── shared/       i18n (t/nm), icons, ui primitives, lib (datetime/format/geo), types
└── features/
    ├── onboarding, home, explore, place, journey, map, saved, search, settings, weather, location
    └── planner/  the flow + the routing/rules/algorithms modules (see 03 & 05)
```

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
