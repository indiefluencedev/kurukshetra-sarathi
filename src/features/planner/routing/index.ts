// The active routing provider. Phase 1 = EstimateProvider (offline). Phase 2
// flips this to CachedProvider once build-time matrices exist. Import the
// provider from here so the swap is one line. See docs/05.
import { EstimateProvider } from "./estimate";
import type { RoutingProvider } from "./provider";

export const routing: RoutingProvider = EstimateProvider;
export * from "./provider";
