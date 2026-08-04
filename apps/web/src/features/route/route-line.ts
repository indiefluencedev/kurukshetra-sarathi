import type { GeoPoint, Plan } from "@/shared/types";

/**
 * The one definition of "the route", used by every map that draws it.
 *
 * There were two, and they disagreed. The route screen's map built
 * start → stops → **end**; the Map tab built start → stops and stopped there.
 * So the same plan produced two different lines: the Map tab's route simply
 * ended at the last temple and never came back, which read as a second, wrong
 * path rather than as a missing segment.
 *
 * They also asked OSRM for different waypoints, so the road geometry came back
 * different too — two network round trips, two answers, for one journey.
 *
 * One exported function, one shape. A map that wants to draw the plan calls
 * this; it cannot invent its own idea of the route without deleting this line
 * first, which is the point.
 */
export function routePoints(plan: Plan | null | undefined): GeoPoint[] {
  const stops = (plan?.res?.stops as { d: { lat: number; lng: number } }[] | undefined) || [];
  if (!plan || !stops.length) return [];

  const pts: GeoPoint[] = [];
  if (plan.start?.label) pts.push({ lat: plan.start.lat, lng: plan.start.lng } as GeoPoint);
  for (const s of stops) pts.push({ lat: s.d.lat, lng: s.d.lng } as GeoPoint);

  // The end point, which the Map tab used to drop. Skipped when it coincides
  // with the last stop — otherwise OSRM is asked to route from a place to
  // itself and the line gains a zero-length tail.
  const end = plan.end as GeoPoint | undefined;
  if (end && typeof end.lat === "number") {
    const last = pts[pts.length - 1];
    const same = last && Math.abs(end.lat - last.lat) < 1e-5 && Math.abs(end.lng - last.lng) < 1e-5;
    if (!same) pts.push({ lat: end.lat, lng: end.lng } as GeoPoint);
  }
  return pts;
}

/** A stable identity for a set of points — for effect keys and cache lookups. */
export const routeKey = (pts: GeoPoint[]): string =>
  pts.map((p) => p.lat.toFixed(4) + "," + p.lng.toFixed(4)).join("|");
