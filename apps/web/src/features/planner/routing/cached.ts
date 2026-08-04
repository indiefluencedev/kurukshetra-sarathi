// CachedProvider — real road distances, precomputed, offline, O(1).
//
// The matrix in src/content/data/matrix.json holds the actual road distance
// between every pair of fixed points in the app (the 36 destinations and the 6
// curated start/end points), measured once by OSRM at authoring time and
// shipped in the bundle. Nothing here touches the network, so a plan is still
// built without a single request. See docs/10 §2.4.
//
// What is real and what is estimated:
//
//   distance   measured. OSRM followed the actual road.
//   car time   measured. OSRM's driving profile.
//   other modes  the measured distance ÷ the mode's speed. The public OSRM
//                demo ignores the profile in the URL and serves car numbers
//                for /foot/ too, so a "walking matrix" would be a lie with
//                extra steps. Dividing the real distance is the honest form.
//   anything involving a hotel, a dropped pin or a live fix
//                falls through to the EstimateProvider, which is exactly what
//                it is for.
import matrixData from "@/content/data/matrix.json";
import { CONFIG } from "@/data/config";
import { EstimateProvider } from "./estimate";
import type { LatLng, RoutingProvider } from "./provider";

interface Matrix {
  built: string;
  source: string;
  ids: string[];
  /** driving minutes; null where OSRM found no route */
  min: (number | null)[][];
  /** road kilometres; null where OSRM found no route */
  km: (number | null)[][];
}

const M = matrixData as unknown as Matrix;
const pos = new Map(M.ids.map((id, i) => [id, i]));
const speeds = CONFIG.speed as Record<string, number>;
/** modes that are literally the car OSRM measured */
const DRIVEN = new Set(["car", "taxi"]);

/**
 * The matrix row for this point, or -1.
 *
 * A Destination carries `id`; a start/end point chosen from the curated list
 * carries `ref` into the same index. Anything else — a dropped pin, a GPS fix,
 * a hotel typed into OSM search — has neither, and belongs on the estimate
 * path. This is the whole dispatch.
 */
function idx(p: LatLng): number {
  const id = (p as { id?: string; ref?: string }).id || (p as { ref?: string }).ref;
  const i = id ? pos.get(id) : undefined;
  return i === undefined ? -1 : i;
}

/** The measured pair, or null when either end is off-matrix or unroutable. */
function pair(a: LatLng, b: LatLng): { min: number; km: number } | null {
  const i = idx(a),
    j = idx(b);
  if (i < 0 || j < 0) return null;
  const min = M.min[i][j],
    km = M.km[i][j];
  return min == null || km == null ? null : { min, km };
}

export const CachedProvider: RoutingProvider = {
  roadKm(a, b) {
    const p = pair(a, b);
    return p ? +p.km.toFixed(1) : EstimateProvider.roadKm(a, b);
  },

  travelMin(a, b, mode) {
    const p = pair(a, b);
    if (!p) return EstimateProvider.travelMin(a, b, mode);
    if (DRIVEN.has(mode)) return Math.max(2, p.min);
    // real distance, estimated speed. Short walks between linked places never
    // reach here — they use the hand-checked figure in edges.json.
    const sp = speeds[mode] || speeds.car;
    return Math.max(2, Math.round((p.km / sp) * 60));
  },

  matrix(points, mode) {
    const n = points.length;
    const min: number[][] = [],
      km: number[][] = [];
    for (let i = 0; i < n; i++) {
      min[i] = [];
      km[i] = [];
      for (let j = 0; j < n; j++) {
        min[i][j] = i === j ? 0 : this.travelMin(points[i], points[j], mode);
        km[i][j] = i === j ? 0 : this.roadKm(points[i], points[j]);
      }
    }
    return { min, km };
  },

  // drawing the road is a live, best-effort upgrade and always has been —
  // osrm.ts owns it, and the map falls back to straight segments
  path: EstimateProvider.path,
};
