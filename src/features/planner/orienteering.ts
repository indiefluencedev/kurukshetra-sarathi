// Orienteering-problem helpers layered on top of the greedy engine:
//  • reorder(): constrained 2-opt that shortens travel without breaking opening
//    hours (rejects any order where a stop would be shut on arrival / mid-visit).
//  • suggestNearby(): slack-aware "you could also fit X (+N min)" — the marginal
//    cost of inserting an unused POI into the cheapest gap, ≤ the spare time.
//
// Pure: the engine injects its own travelMin/roadKm/openAt so there's no import
// cycle and no duplicated distance math.

export interface RCtx {
  start: { lat: number; lng: number };
  end: { lat: number; lng: number };
  mode: string;
  wd: number;
  vf: number;
  startClock: number;
  parking: number;
  travelMin: (a: any, b: any, mode: string) => number;
  roadKm: (a: any, b: any) => number;
  openAt: (d: any, wd: number, m: number) => boolean;
}

const wrap = (m: number) => ((m % 1440) + 1440) % 1440;
const openMinOf = (d: any) => {
  const p = String(d.hours.o).split(":");
  return +p[0] * 60 + +p[1];
};

interface Sim {
  valid: boolean;
  stops: any[];
  travel: number;
  cur: { lat: number; lng: number };
  clock: number;
  used: number;
}

/** Walk an order start→…→end, computing arrival/wait/depart and validity. */
function simulate(order: any[], ctx: RCtx): Sim {
  let cur: any = ctx.start,
    clock = ctx.startClock,
    travel = 0,
    used = 0;
  const stops: any[] = [];
  for (const d of order) {
    if (d.closed && d.closed.indexOf(ctx.wd) >= 0) return bad();
    const t = ctx.travelMin(cur, d, ctx.mode);
    const visit = Math.round(d.visit.rec * ctx.vf);
    let arrive = clock + t,
      wait = 0;
    if (d.hours) {
      const op = openMinOf(d);
      const day = wrap(arrive);
      if (day < op) {
        wait = op - day;
        arrive += wait;
      }
    }
    if (!ctx.openAt(d, ctx.wd, wrap(arrive))) return bad();
    if (!ctx.openAt(d, ctx.wd, wrap(arrive + visit))) return bad();
    stops.push({ d, travel: t, km: ctx.roadKm(cur, d), wait, arrive, visit, depart: arrive + visit });
    travel += t;
    used += t + wait + visit + ctx.parking;
    clock = arrive + visit + ctx.parking;
    cur = d;
  }
  return { valid: true, stops, travel, cur, clock, used };
  function bad(): Sim {
    return { valid: false, stops: [], travel: Infinity, cur, clock, used };
  }
}

/** 2-opt: reverse segments to cut travel, keeping only valid (hours-respecting) orders. */
function twoOpt(order: any[], ctx: RCtx): any[] {
  let best = order.slice();
  let bestSim = simulate(best, ctx);
  if (!bestSim.valid) return order;
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const cand = best.slice(0, i).concat(best.slice(i, j + 1).reverse(), best.slice(j + 1));
        const sim = simulate(cand, ctx);
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
 * Improve a built stop list's ordering. Returns recomputed {stops, cur, clock,
 * used} when 2-opt finds a shorter valid tour, else null (keep the original).
 */
export function reorder(stops: any[], ctx: RCtx): Sim | null {
  if (stops.length < 3) return null; // nothing to gain below 3 stops
  const order = stops.map((s) => s.d);
  const before = simulate(order, ctx);
  const best = twoOpt(order, ctx);
  const after = simulate(best, ctx);
  if (after.valid && after.travel < before.travel - 0.01) return after;
  return null;
}

export interface Suggestion {
  d: any;
  addMin: number;
}

/**
 * Unused POIs that would still fit the spare time, cheapest-insertion first.
 * `slack` = spendable − time already used (incl. the return leg).
 */
export function suggestNearby(stops: any[], pool: any[], ctx: RCtx, slack: number, score: Record<string, number>): Suggestion[] {
  if (slack <= 0 || !stops.length) return [];
  const seq = [{ lat: ctx.start.lat, lng: ctx.start.lng }, ...stops.map((s) => s.d), { lat: ctx.end.lat, lng: ctx.end.lng }];
  const chosen = new Set(stops.map((s) => s.d.id));
  const out: Suggestion[] = [];
  for (const d of pool) {
    if (chosen.has(d.id)) continue;
    if (d.closed && d.closed.indexOf(ctx.wd) >= 0) continue;
    const visit = Math.round(d.visit.rec * ctx.vf);
    let bestExtra = Infinity;
    for (let g = 0; g < seq.length - 1; g++) {
      const a = seq[g],
        b = seq[g + 1];
      const detour = ctx.travelMin(a, d, ctx.mode) + ctx.travelMin(d, b, ctx.mode) - ctx.travelMin(a, b, ctx.mode);
      const extra = detour + visit + ctx.parking;
      if (extra < bestExtra) bestExtra = extra;
    }
    if (bestExtra <= slack) out.push({ d, addMin: Math.round(bestExtra) });
  }
  // best value per added minute first, then cheapest
  out.sort((x, y) => (score[y.d.id] || 0) - (score[x.d.id] || 0) || x.addMin - y.addMin);
  return out.slice(0, 4);
}
