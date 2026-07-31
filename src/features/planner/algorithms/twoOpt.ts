// twoOpt.ts — constrained 2-opt local search. Reverses segments of the order,
// keeping a reversal only if it stays valid (opening hours) AND shortens travel.
// Guarantee: output travel ≤ input travel, hours never violated. See docs/03.
//
// It reorders POCKETS, not stops. A stop you walked to belongs to the stop you
// parked at; pulling it out and dropping it elsewhere in the tour would leave
// it claiming a walk from a place now several kilometres away. So an anchor and
// everything walked to from it move as one unit, in their own order.
import { simulate, type RouteCtx, type Sim, type Leg } from "./schedule";
import type { Stop } from "@/shared/types";

/** An anchor plus everything reached on foot from it — one indivisible unit. */
type Pocket = Leg[];

function toPockets(legs: Leg[]): Pocket[] {
  const out: Pocket[] = [];
  for (const l of legs) {
    if (l.anchor && out.length) out[out.length - 1].push(l);
    else out.push([l]);
  }
  return out;
}

const flatten = (ps: Pocket[]): Leg[] => ps.flat();

function twoOptOrder(pockets: Pocket[], ctx: RouteCtx): Pocket[] {
  let best = pockets.slice();
  let bestSim = simulate(flatten(best), ctx);
  if (!bestSim.valid) return pockets;
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const cand = best.slice(0, i).concat(best.slice(i, j + 1).reverse(), best.slice(j + 1));
        const sim = simulate(flatten(cand), ctx);
        if (sim.valid && sim.travel < bestSim.travel - 0.01) {
          best = cand;
          bestSim = sim;
          improved = true;
        }
      }
    }
  }
  return best;
}

/**
 * Improve a built stop list's order. Returns a recomputed Sim when 2-opt finds
 * a shorter valid tour, else null (keep the original order).
 */
export function reorder(stops: Stop[], ctx: RouteCtx): Sim | null {
  const legs: Leg[] = stops.map((s) => ({ d: s.d, anchor: s.anchor as string | undefined }));
  const pockets = toPockets(legs);
  if (pockets.length < 3) return null; // nothing to gain below 3 movable units
  const before = simulate(flatten(pockets), ctx);
  const best = twoOptOrder(pockets, ctx);
  const after = simulate(flatten(best), ctx);
  if (after.valid && after.travel < before.travel - 0.01) return after;
  return null;
}
