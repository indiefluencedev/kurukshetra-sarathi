// suggest.ts — "Also fits your time". After a route is built, find unused
// nearby places whose cheapest insertion cost fits the leftover time. Drawn
// from ALL valid places (not just the chosen theme) so a themed route can still
// surface a close-by extra. See docs/03.
import { routing } from "../routing";
import { isClosedDay } from "../rules/hours";
import type { RouteCtx } from "./schedule";
import type { Destination, Stop } from "@/shared/types";

export interface Suggestion {
  d: Destination;
  addMin: number;
}

/**
 * @param slack spendable minutes still free (spendable − used).
 * @param score base scores (may be undefined for off-theme places → treated 0).
 */
export function suggestNearby(
  stops: Stop[],
  pool: Destination[],
  ctx: RouteCtx,
  slack: number,
  score: Record<string, number>,
): Suggestion[] {
  if (slack <= 0 || !stops.length) return [];
  const seq = [ctx.start, ...stops.map((s) => s.d), ctx.end];
  const chosen = new Set(stops.map((s) => s.d.id));
  const out: Suggestion[] = [];
  for (const d of pool) {
    if (chosen.has(d.id)) continue;
    if (isClosedDay(d, ctx.weekday)) continue;
    const visit = Math.round(d.visit.rec * ctx.visitFactor);
    let bestExtra = Infinity;
    for (let g = 0; g < seq.length - 1; g++) {
      const a = seq[g],
        b = seq[g + 1];
      const detour = routing.travelMin(a, d, ctx.mode) + routing.travelMin(d, b, ctx.mode) - routing.travelMin(a, b, ctx.mode);
      const extra = detour + visit + ctx.parking;
      if (extra < bestExtra) bestExtra = extra;
    }
    if (bestExtra <= slack) out.push({ d, addMin: Math.round(bestExtra) });
  }
  out.sort((x, y) => (score[y.d.id] || 0) - (score[x.d.id] || 0) || x.addMin - y.addMin);
  return out.slice(0, 4);
}
