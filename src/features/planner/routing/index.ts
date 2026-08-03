// The active routing provider — the one line the whole swap was designed to be.
//
// Phase 1 was EstimateProvider: haversine × 1.35. Phase 2 is CachedProvider:
// real road distances measured by OSRM at build time, shipped in the bundle,
// with EstimateProvider still underneath for any point that is not in the
// matrix (a hotel, a dropped pin, a live GPS fix). No algorithm and no
// component changed. See docs/05 and docs/10 §2.4.
import { CachedProvider } from "./cached";
import type { RoutingProvider } from "./provider";

export const routing: RoutingProvider = CachedProvider;
export * from "./provider";
