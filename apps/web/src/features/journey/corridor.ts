// corridor.ts — what you pass on the way.
//
// Given the route's drawn polyline, work out which places sit beside it, how
// far along the drive each one appears, and whether it will be on the left or
// the right. That is the whole basis of the drive guide: the app can say "on
// your left is the Krishna Museum" only because it knows where the road goes
// and which side of it the museum is on.
//
// Pure geometry, no DOM and no clock, so it can be checked without a browser
// or a car. See scripts/check-corridor.mjs.
import type { LatLng } from "@/features/planner/routing/provider";
import type { Destination } from "@/shared/types";

/** How far off the road a place may sit and still be worth mentioning. */
export const CORRIDOR_M = 400;

/* Local flat-earth projection. Over a 12km town the error is centimetres, and
   it makes "which side of the road" a two-line cross product instead of a
   spherical bearing calculation that is harder to read and no more correct. */
const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;

interface XY {
  x: number;
  y: number;
}

/** Metres east/north of an origin. */
function project(p: LatLng, o: LatLng): XY {
  return {
    x: rad(p.lng - o.lng) * R * Math.cos(rad(o.lat)),
    y: rad(p.lat - o.lat) * R,
  };
}

export interface Passing {
  id: string;
  /** metres from the start of the route at the point of closest approach */
  along: number;
  /** metres from the road at that point */
  offset: number;
  /** which window to look out of */
  side: "left" | "right";
}

/**
 * Distance along the line to the closest point, the perpendicular offset, and
 * the side — for one point against one polyline.
 *
 * Returns null for a degenerate line (fewer than two distinct points), because
 * a route with no length has no left and no right.
 */
export function locate(point: LatLng, line: LatLng[]): Omit<Passing, "id"> | null {
  if (line.length < 2) return null;
  const o = line[0];
  const pts = line.map((p) => project(p, o));
  const q = project(point, o);

  let best = { along: 0, offset: Infinity, side: "left" as "left" | "right" };
  let travelled = 0;

  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i],
      b = pts[i + 1];
    const dx = b.x - a.x,
      dy = b.y - a.y;
    const segLen = Math.hypot(dx, dy);
    if (segLen < 0.5) continue; // duplicate points contribute nothing

    // how far along this segment the closest approach falls, clamped to it
    const tRaw = ((q.x - a.x) * dx + (q.y - a.y) * dy) / (segLen * segLen);
    const t = Math.max(0, Math.min(1, tRaw));
    const cx = a.x + dx * t,
      cy = a.y + dy * t;
    const offset = Math.hypot(q.x - cx, q.y - cy);

    if (offset < best.offset) {
      // Cross product of the direction of travel with the vector to the place.
      // Positive means the place is to the left of the way we are pointing —
      // the same convention as a driver's own left, since we take the heading
      // from the road rather than from the compass.
      const cross = dx * (q.y - a.y) - dy * (q.x - a.x);
      best = { along: travelled + segLen * t, offset, side: cross > 0 ? "left" : "right" };
    }
    travelled += segLen;
  }
  return best.offset === Infinity ? null : best;
}

/** Total length of a polyline in metres. */
export function lineLength(line: LatLng[]): number {
  if (line.length < 2) return 0;
  const o = line[0];
  const pts = line.map((p) => project(p, o));
  let n = 0;
  for (let i = 0; i < pts.length - 1; i++) n += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
  return n;
}

/**
 * Everything worth announcing along this route, in the order you meet it.
 *
 * `skip` is the itinerary itself — the guide never announces a place you are
 * on your way to, because the journey screen is already telling you about it
 * and hearing it twice is how a guide becomes a nag.
 */
export function passingPlaces(line: LatLng[], places: Destination[], skip: Set<string>): Passing[] {
  if (line.length < 2) return [];
  const out: Passing[] = [];
  for (const d of places) {
    if (skip.has(d.id) || d.pending || !d.lat || !d.lng) continue;
    const at = locate(d, line);
    if (!at || at.offset > CORRIDOR_M) continue;
    out.push({ id: d.id, ...at });
  }
  return out.sort((a, b) => a.along - b.along);
}

/** How far along the route a live position is — the driver's own progress. */
export const progressAlong = (fix: LatLng, line: LatLng[]): number => locate(fix, line)?.along ?? 0;
