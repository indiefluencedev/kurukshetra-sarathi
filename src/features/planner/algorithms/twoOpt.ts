// twoOpt.ts — constrained 2-opt local search. Reverses segments of the order,
// keeping a reversal only if it stays valid (opening hours) AND shortens travel.
// Guarantee: output travel ≤ input travel, hours never violated. See docs/03.
//
// It reorders POCKETS, not stops. A stop you walked to belongs to the stop you
// parked at; pulling it out and dropping it elsewhere in the tour would leave
// it claiming a walk from a place now several kilometres away. So an anchor and
// everything walked to from it move as one unit, in their own order.
import { simulate, type RouteCtx, type Sim, type Leg } from "./schedule";
import { haversine } from "../routing/estimate";
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

/** Ground actually covered, in km, straight-line between consecutive stops. */
function spread(sim: Sim): number {
  let n = 0;
  for (let i = 1; i < sim.stops.length; i++) n += haversine(sim.stops[i - 1].d, sim.stops[i].d);
  return n;
}

/**
 * Is `a` a better order than `b`?
 *
 * Minutes first, and then — this is the part that was missing — DISTANCE when
 * the minutes tie. Legs are costed in whole minutes, and inside a cluster of
 * places a few hundred metres apart that rounds almost everything to the same
 * number: walking Sannihit → Gurudwara → Laxmi → Panorama → Krishna → Nabha
 * and → Laxmi → Nabha → Panorama → Krishna both come to 17 minutes, though one
 * covers 250 m less ground. With nothing to separate them the search kept
 * whichever order `greedy` produced, and greedy orders by popularity — so the
 * sequence on the map followed fame rather than geography and read as random.
 *
 * Breaking the tie on metres costs no time by construction: these orders are
 * already equal on the thing the budget cares about.
 */
function better(a: Sim, b: Sim, bSpread: number): { yes: boolean; spread: number } {
  const aSpread = spread(a);
  if (a.travel < b.travel - 0.01) return { yes: true, spread: aSpread };
  if (a.travel <= b.travel + 0.01 && aSpread < bSpread - 0.005) return { yes: true, spread: aSpread };
  return { yes: false, spread: aSpread };
}

function twoOptOrder(pockets: Pocket[], ctx: RouteCtx): Pocket[] {
  let best = pockets.slice();
  let bestSim = simulate(flatten(best), ctx);
  if (!bestSim.valid) return pockets;
  let bestSpread = spread(bestSim);
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const cand = best.slice(0, i).concat(best.slice(i, j + 1).reverse(), best.slice(j + 1));
        const sim = simulate(flatten(cand), ctx);
        if (!sim.valid) continue;
        const v = better(sim, bestSim, bestSpread);
        if (v.yes) {
          best = cand;
          bestSim = sim;
          bestSpread = v.spread;
          improved = true;
        }
      }
    }
  }
  return best;
}

/**
 * Order the stops INSIDE each pocket — the walk itself.
 *
 * `twoOptOrder` above moves pockets around as indivisible units, which is
 * right, but it meant the sequence *within* a pocket was never touched: it
 * stayed in whatever order `greedy` picked the places, and greedy picks by
 * score. So the walking tour of a cluster followed popularity rather than
 * geography, and on the ground it read as random — stop 6 back past stop 4 to
 * reach stop 7. Measured across four themed days it was 17% more walking than
 * needed, and 254 m extra in the worst single pocket. On foot, for the
 * audience this app is built for, that is the whole complaint.
 *
 * The anchor stays first — it is where the car is parked and the pocket is
 * defined by it. Only the walked tail is reordered. `simulate` scores it, so
 * the objective is the same cost model everything else uses, opening hours
 * included, and a reversal that would make a stop arrive after closing is
 * rejected exactly as it is at the pocket level.
 */
function twoOptWithin(pockets: Pocket[], ctx: RouteCtx): Pocket[] {
  let best = pockets.map((p) => p.slice());
  let bestSim = simulate(flatten(best), ctx);
  if (!bestSim.valid) return pockets;
  let bestSpread = spread(bestSim);

  for (let p = 0; p < best.length; p++) {
    if (best[p].length < 3) continue; // anchor + one walk: nothing to reorder
    let improved = true;
    while (improved) {
      improved = false;

      /** Try a candidate ordering of pocket p; adopt it if it is shorter. */
      const tryPocket = (cand: Pocket): boolean => {
        const trial = best.slice();
        trial[p] = cand;
        const sim = simulate(flatten(trial), ctx);
        if (!sim.valid) return false;
        const v = better(sim, bestSim, bestSpread);
        if (v.yes) {
          best = trial;
          bestSim = sim;
          bestSpread = v.spread;
          return true;
        }
        return false;
      };

      // reversals — from 1, never 0: the anchor is where the car is parked
      for (let i = 1; i < best[p].length - 1; i++)
        for (let j = i + 1; j < best[p].length; j++) {
          const pk = best[p];
          if (tryPocket(pk.slice(0, i).concat(pk.slice(i, j + 1).reverse(), pk.slice(j + 1)))) improved = true;
        }

      // Relocations. 2-opt reverses a run, and there are better orders it
      // structurally cannot reach: the fix for the Sannihit pocket was to move
      // Nabha House from fifth to third, leaving everything else as it was. No
      // reversal produces that. Or-opt does, and it is the move that closes
      // most of the remaining gap.
      for (let i = 1; i < best[p].length; i++)
        for (let j = 1; j < best[p].length; j++) {
          if (i === j) continue;
          const pk = best[p];
          const rest = pk.slice(0, i).concat(pk.slice(i + 1));
          if (tryPocket(rest.slice(0, j).concat([pk[i]], rest.slice(j)))) improved = true;
        }
    }
  }
  return best;
}

/**
 * Improve a built stop list's order. Returns a recomputed Sim when the search
 * finds a shorter valid tour, else null (keep the original order).
 *
 * Two passes, and both are needed: pockets are moved around each other, then
 * the walk inside each pocket is straightened. Running the second first would
 * optimise walks that are about to be picked up and dropped somewhere else.
 */
export function reorder(stops: Stop[], ctx: RouteCtx): Sim | null {
  const legs: Leg[] = stops.map((s) => ({ d: s.d, anchor: s.anchor as string | undefined }));
  const pockets = toPockets(legs);
  const before = simulate(flatten(pockets), ctx);
  // A single pocket cannot be reordered as a unit, but the walk inside it can
  // still be straightened — which is exactly the case the old `< 3` guard threw
  // away, and the commonest shape a day around Brahma Sarovar takes.
  const moved = pockets.length >= 3 ? twoOptOrder(pockets, ctx) : pockets;
  const best = twoOptWithin(moved, ctx);
  const after = simulate(flatten(best), ctx);
  if (!after.valid) return null;
  return better(after, before, spread(before)).yes ? after : null;
}
