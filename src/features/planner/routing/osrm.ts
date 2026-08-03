// Real road geometry for drawing. OSRM's public demo server is free and needs
// no key; it is also best-effort, so every failure falls back to the straight
// segments the EstimateProvider already gives us — a route that draws as
// straight lines is still a usable route, a blank map is not.
import type { LatLng } from "./provider";

const BASE = "https://router.project-osrm.org/route/v1/driving/";
const cache = new Map<string, [number, number][]>();

/** Road polyline through the given waypoints, in Leaflet [lat,lng] order. */
export async function roadGeometry(points: LatLng[], signal?: AbortSignal): Promise<[number, number][]> {
  const straight = points.map((p) => [p.lat, p.lng] as [number, number]);
  if (points.length < 2) return straight;

  const coords = points.map((p) => p.lng.toFixed(5) + "," + p.lat.toFixed(5)).join(";");
  const hit = cache.get(coords);
  if (hit) return hit;

  try {
    const r = await fetch(BASE + coords + "?overview=full&geometries=geojson", { signal });
    if (!r.ok) return straight;
    const j = await r.json();
    const line = j?.routes?.[0]?.geometry?.coordinates;
    if (!Array.isArray(line) || !line.length) return straight;
    const out = line.map((c: [number, number]) => [c[1], c[0]] as [number, number]);
    cache.set(coords, out);
    return out;
  } catch {
    return straight;
  }
}
