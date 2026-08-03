// EstimateProvider — the offline, zero-cost default (Phase 1).
// Distance = great-circle × roadFactor; time = distance ÷ a per-mode speed.
// Straight-line: good enough to ORDER stops, not to draw exact roads (Phase 2
// CachedProvider replaces this with real geometry). See docs/05.
import { CONFIG } from "@/data/config";
import type { LatLng, RoutingProvider } from "./provider";

const R = 6371;
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance (km). */
export function haversine(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat),
    dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

const speeds = CONFIG.speed as Record<string, number>;

export const EstimateProvider: RoutingProvider = {
  roadKm(a, b) {
    return +(haversine(a, b) * CONFIG.roadFactor).toFixed(1);
  },
  travelMin(a, b, mode) {
    const km = haversine(a, b) * CONFIG.roadFactor;
    const sp = speeds[mode] || speeds.car;
    return Math.max(2, Math.round((km / sp) * 60));
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
  async path(a, b) {
    return [a, b]; // straight segment; CachedProvider returns the real polyline
  },
};
