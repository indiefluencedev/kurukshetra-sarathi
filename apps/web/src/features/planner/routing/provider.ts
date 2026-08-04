// The single contract for "how far / how long / what path". Algorithms and UI
// depend only on this, so the underlying engine (estimate now, cached OSRM/ORS
// later) can be swapped without touching anything else. See docs/05.

export interface LatLng {
  lat: number;
  lng: number;
}

/** Travel modes the providers understand. Bus/transit is curated data (Phase 3), not here. */
export type TravelMode = "car" | "taxi" | "twowheeler" | "erickshaw" | "public" | "walking";

export interface RoutingProvider {
  /** minutes from a→b by mode (never less than a small floor). */
  travelMin(a: LatLng, b: LatLng, mode: string): number;
  /** road distance a→b in km (1-dp). */
  roadKm(a: LatLng, b: LatLng): number;
  /** N×N travel-time (min) and distance (km) matrices over the given points. */
  matrix(points: LatLng[], mode: string): { min: number[][]; km: number[][] };
  /** polyline geometry a→b for drawing (estimate returns the straight segment). */
  path(a: LatLng, b: LatLng, mode: string): Promise<LatLng[]>;
}
