// @ts-nocheck — orchestrator with a loosely-typed options object. Owns no math:
// it wires the routing provider (routing/), the rule sets (rules/), and the
// algorithms (algorithms/) into an Itinerary. See docs/03. The public `Engine`
// facade is unchanged, so every caller (geo, place-actions, Saved, Journey,
// plan) keeps working.
import { D } from "@/data/destinations";
import { THEMES } from "@/data/config";
import { routing } from "./routing";
import { openAt } from "./rules/hours";
import { poiScore, timeFit } from "./rules/scoring";
import { computeBudget, PARKING } from "./rules/budget";
import { greedy } from "./algorithms/greedy";
import { reorder } from "./algorithms/twoOpt";
import { suggestNearby } from "./algorithms/suggest";
import { buildDays, DAY_MAX } from "./algorithms/multiday";
import { simulate, type RouteCtx } from "./algorithms/schedule";

/* How far behind an off-theme place starts. Big enough that it never beats
   a theme match at equal cost; small enough that "you are already parked
   sixty metres away" can still carry it. Tune with a real itinerary, not
   by reasoning about the number. */
const OFF_THEME = 18;

function build(o) {
  const mode = o.mode || "car",
    pace = o.pace || "balanced";
  const f = o.filters || {},
    interests = o.interests || [],
    wantAll = interests.length === 0;

  const budget = computeBudget(o.budgetMin, o.startClock, pace, { meal: f.meal, who: o.who });
  const spendable = budget.spendable;

  const ctx: RouteCtx = {
    start: o.start,
    end: o.end,
    mode,
    weekday: o.weekday,
    visitFactor: budget.visitFactor,
    startClock: o.startClock,
    parking: PARKING,
    breaks: budget.breaks,
  };

  // 1) candidates — hard filters only.
  //
  // The theme used to be a hard gate here, and that was the single biggest
  // cause of the planner ignoring what was in front of it: ask for Mahabharat
  // and the Krishna Museum never entered the running, even though the route
  // drives past its gate and you could walk there from the Panorama car park.
  // A theme is a strong preference, not a wall. It is worth a large score
  // bonus (see poiScore) and off-theme places stay in the pool where the
  // cost model can decide whether they are nearly free.
  const pool = D.filter((d) => {
    if (d.pending) return false; // coordinates not yet verified
    if (o.onlyIds && o.onlyIds.indexOf(d.id) < 0) return false;
    if (f.free && !d.free) return false;
    if (f.indoor && !d.indoor) return false;
    return true;
  });

  // 2) score each candidate
  const score = {};
  pool.forEach((d) => {
    const s = poiScore(d, interests, wantAll, o.bias);
    const off = !wantAll && !o.onlyIds && !d.themes.some((t) => interests.indexOf(t) >= 0);
    // Off-theme places start well behind and can only win on cheapness — a
    // few minutes' walk from a stop already chosen. They can never outrank a
    // theme match that costs the same, which is what keeps a Mahabharat day
    // recognisably a Mahabharat day.
    score[d.id] = off ? s * 0.35 - OFF_THEME : s;
  });

  // 3) construct greedily, then 4) improve order with 2-opt
  const g = greedy(pool, score, ctx, spendable);
  const imp = reorder(g.stops, ctx);
  const chosenStops = imp ? imp.stops : g.stops;
  const chosen = chosenStops.map((s) => ({ d: s.d, anchor: s.anchor }));

  // 5) one authoritative pass: greedy picks *which* places, simulate decides
  // *when* — so the clock, the opening-hours checks and the breaks are all
  // computed in exactly one place.
  const sim = simulate(chosen, ctx);
  const stops = sim.valid ? sim.stops : imp ? imp.stops : g.stops;
  const breaks = sim.valid ? sim.breaks : [];
  const cur = stops.length ? stops[stops.length - 1].d : o.start;

  const closeT = stops.length ? routing.travelMin(cur, o.end, mode) : 0;

  // 5) "left out" — the next-best unreached candidates, with a reason
  const dropped = [];
  g.left
    .slice()
    .sort((a, b) => score[b.id] - score[a.id])
    .slice(0, 4)
    .forEach((d) => {
      const noMatch = !wantAll && !d.themes.some((t) => interests.indexOf(t) >= 0);
      const shut = d.closed && d.closed.indexOf(o.weekday) >= 0;
      // theme is a preference now, so "theme" means outranked, not excluded
      dropped.push({ d, why: shut ? "closed" : noMatch ? "theme" : "time" });
    });

  // 6) totals
  const travel = stops.reduce((a, s) => a + s.travel, 0) + closeT;
  const visitT = stops.reduce((a, s) => a + s.visit, 0);
  const waitT = stops.reduce((a, s) => a + s.wait, 0);
  // one buffer per car park, not one per stop: a pocket you walk around
  // parks once. simulate() is the authority; the fallback matches the old
  // behaviour for the (invalid-sim) path that never sets anchors.
  const park = sim.valid ? sim.park : stops.length * PARKING;
  const km = +(stops.reduce((a, s) => a + s.km, 0) + (stops.length ? routing.roadKm(cur, o.end) : 0)).toFixed(1);
  // count the breaks actually taken, not the ones reserved — a short route that
  // finishes before lunch shouldn't report a lunch hour it never spent
  const mealU = breaks.reduce((a, b) => a + b.min, 0);
  const total = travel + visitT + waitT + park + mealU;

  // 7) nearby-fit suggestions from ALL valid places (not just the theme pool)
  const slack = spendable - (travel + visitT + waitT + park);
  const suggestPool = D.filter((d) => {
    if (d.pending) return false;
    if (f.free && !d.free) return false;
    if (f.indoor && !d.indoor) return false;
    return true;
  });
  const suggest = suggestNearby(stops, suggestPool, ctx, slack, score).map((x) => ({ id: x.d.id, addMin: x.addMin }));

  return {
    stops,
    breaks,
    dropped,
    suggest,
    totals: {
      travel,
      visit: visitT,
      wait: waitT,
      park,
      meal: mealU,
      buffer: park + waitT + mealU + (o.budgetMin - budget.usable),
      km,
      total,
      budget: o.budgetMin,
      finish: o.startClock + total,
    },
    meta: {
      mode,
      pace,
      start: o.start,
      end: o.end,
      startClock: o.startClock,
      weekday: o.weekday,
      interests,
      contingency: budget.contingency,
      at: Date.now(),
      liveTraffic: false,
    },
    warn: stops.length ? [] : ["nofit"],
  };
}

function generate(o) {
  const primary = build(o),
    alts = [];
  if (o.pace !== "relaxed") alts.push({ tag: "relaxed", it: build(Object.assign({}, o, { pace: "relaxed" })) });
  const other = THEMES.find((t) => (o.interests || []).indexOf(t.id) < 0);
  if (other) {
    const b = {};
    D.forEach((d) => {
      if (d.themes.indexOf(other.id) >= 0) b[d.id] = 42;
    });
    alts.push({ tag: other.id, it: build(Object.assign({}, o, { bias: b })) });
  }
  const key = (it) => it.stops.map((s) => s.d.id).join(">");
  const seen = {};
  seen[key(primary)] = 1;
  const uniq = [];
  alts.forEach((a) => {
    const k = key(a.it);
    if (!seen[k] && a.it.stops.length) {
      seen[k] = 1;
      uniq.push(a);
    }
  });
  return { primary, alts: uniq.slice(0, 2) };
}

function recalc(it, from, fromClock, ids) {
  const m = it.meta;
  return build({
    budgetMin: Math.max(30, m.startClock + it.totals.total - fromClock),
    start: from,
    end: m.end,
    interests: m.interests,
    mode: m.mode,
    pace: m.pace,
    startClock: fromClock,
    weekday: m.weekday,
    filters: {},
    onlyIds: ids,
  });
}

export const Engine = {
  build,
  generate,
  recalc,
  buildDays: (o) => buildDays(o, build),
  travelMin: (a, b, mode) => routing.travelMin(a, b, mode),
  roadKm: (a, b) => routing.roadKm(a, b),
  openAt,
  timeFit,
  DAY_MAX,
};
