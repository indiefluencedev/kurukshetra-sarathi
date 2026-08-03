# 05 · Routing (Phase 2)

> **Phase 2 has shipped.** `CachedProvider` is the active provider and
> `src/content/data/matrix.json` is in the bundle. Two things below describe the
> plan rather than the result, and [10 §2.4](10-engine-events-and-data.md) is
> authoritative on both: the matrix is **one file, not one per mode** (the demo
> server serves car only, so per-mode files would be identical copies — the real
> road *distance* is kept and divided by the mode's speed instead), and an
> arbitrary start point falls through to `EstimateProvider` rather than making a
> lazy live call, because the plan path must never touch the network.

## Constraint

Google-grade accuracy is wanted, but **no paid service**. Google's Routes API
is billed, so it is **not** used for in-app computation. Instead:

- In-app map = **Leaflet + OSM** (free).
- Real "Navigate" = **Google Maps deep-link** (free, unlimited, accurate) —
  `navTo()` in `shared/lib/geo.ts`.
- In-app path-finding (ordering, matrices, drawn polylines) = a **free/open
  engine** (OSRM / OpenRouteService), used **at build time** to pre-cache the
  fixed points, so runtime needs no key and costs nothing.

## The abstraction

Everything that needs "how far / how long / what path" goes through one
interface (`features/planner/routing/provider.ts`):

```ts
interface RoutingProvider {
  travelMin(a, b, mode): number;                 // minutes
  roadKm(a, b): number;                           // km
  matrix(points, mode): { min[][]; km[][] };      // N×N (ordering)
  path(a, b, mode): Promise<LatLng[]>;            // polyline geometry (draw)
}
```

Implementations, swappable without touching the algorithms or UI:

- **`estimate.ts` — `EstimateProvider`** *(the fallback, always available)*:
  haversine × `roadFactor` (1.35) for distance, ÷ a per-mode speed table for
  time. Pure, offline, zero-cost. Straight-line — good enough to order, not to
  draw. Still carries every point that is not in the matrix.
- **`cached.ts` — `CachedProvider`** *(active)*: reads the build-time matrix for
  the fixed POIs + the curated start/end points. Runtime = zero live calls,
  works offline. Anything without a row falls through to `EstimateProvider`.

`routing/index.ts` picks the active provider — one line, and it is now
`CachedProvider`.

## Build-time cache

`npm run build-matrix`: one OSRM `/table` call over the fixed points returns the
**full N×N durations + distances** at once, written to
`src/content/data/matrix.json` as indexed arrays (`{ ids, min[][], km[][] }`).
Because the POIs are fixed, this is generated rarely — only when a place is
added, moved, or verified — and committed as data. No runtime cost, ToS-clean
(open engine, own map). 42×42 in 13 KB.

The script also warns about pins that snap more than 700 m to the nearest road
and about unroutable pairs, both of which are bad coordinates rather than bad
roads. `npm run check-matrix` is the gate; see
[10 §4.8](10-engine-events-and-data.md#48-content-checks) for why its bands are
where they are.

*Reason:* real road times fix the biggest weakness of Phase 1 (straight lines
under-count detours and one-ways), while the cache keeps the app free, fast,
and offline-capable.

> **The public OSRM demo serves the car profile only.** Probed 2026-08-01:
> `/route/v1/foot/` returns byte-identical figures to `/driving/` — it ignores
> the profile. **Do not generate a foot matrix from it**; those would be car
> times on footpaths. Walking uses `edges.json` (every walk in this app is a
> sub-300 m same-complex hop, where a hand-checked edge beats any engine).
> OpenRouteService — free key, 2k/day — is the upgrade path if a real foot
> profile is ever needed.

## Modes

- Provider modes: `drive` (car/taxi), `two_wheeler`, and `erickshaw` ≈ drive at
  a city speed with no parking buffer. `foot` is **not** an engine profile here
  — see the warning above.
- **Bus / transit** is not a routing-engine profile here — it comes from
  **curated data** in Phase 3 (`content/transport/*`), because Indian city-bus
  coverage in open engines is thin.

## Multi-modal (Phase 3 preview)

With `modes = [bus, walk]`: use a curated bus leg where a route connects the two
stops' nearest stands inside the time window, else walk; e-rickshaw as a
city-speed door-to-door leg with a fare estimate. Per-leg selection lives in
`algorithms/` and consumes the same `RoutingProvider` + the curated transport
data.
