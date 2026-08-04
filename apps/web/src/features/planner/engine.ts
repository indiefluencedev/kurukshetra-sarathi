// @ts-nocheck — orchestrator with a loosely-typed options object. Owns no math:
// it wires the routing provider (routing/), the rule sets (rules/), and the
// algorithms (algorithms/) into an Itinerary. See docs/03. The public `Engine`
// facade is unchanged, so every caller (geo, place-actions, Saved, Journey,
// plan) keeps working.
import { DP } from "@/data/destinations";
import { THEMES } from "@/data/config";
import { activeEvent, affects } from "@/data/events";
import { addDays, fromISO } from "@/shared/lib/datetime";
import { routing } from "./routing";
import { openAt } from "./rules/hours";
import { poiScore, timeFit } from "./rules/scoring";
import { computeBudget, PARKING } from "./rules/budget";
import { greedy } from "./algorithms/greedy";
import { reorder } from "./algorithms/twoOpt";
import { suggestNearby } from "./algorithms/suggest";
import { buildDays, DAY_MAX } from "./algorithms/multiday";
import { simulate, legMin, type RouteCtx } from "./algorithms/schedule";

/* How far behind an off-theme place starts. Big enough that it never beats
   a theme match at equal cost; small enough that "you are already parked
   sixty metres away" can still carry it. Tune with a real itinerary, not
   by reasoning about the number. */
const OFF_THEME = 18;

/* Nobody sets off before six. */
const MIN_START = 6 * 60;

/**
 * When nothing fits, work out what would.
 *
 * "Nothing fits that window — try a longer window, fewer themes, or a brisker
 * pace" is true and useless: it is three guesses handed back to the person who
 * has the least information. The engine can simply try them. Each probe is one
 * more `build()` — a couple of thousand operations — and it turns the one
 * screen in the app a visitor cannot act on into a single tap.
 *
 * Ordered by how little it costs the visitor to accept: leaving earlier is
 * free, a longer day is a real concession, changing the date is the last
 * resort. First one that actually works wins. See docs/10 §5 step 6.
 */
function suggestFix(o) {
  const tries = [];

  const earlier = Math.max(MIN_START, (o.startClock || 9 * 60) - 60);
  if (earlier < o.startClock) tries.push({ key: "earlier", patch: { startClock: earlier } });

  tries.push({ key: "longer", patch: { budgetMin: Math.round(o.budgetMin * 1.5) } });

  if (o.date) {
    // If a festival is what made the day impossible, the useful alternative is
    // the day after it ends — not tomorrow, which is still the festival.
    const ev = activeEvent(o.date);
    const alt = ev ? addDays(ev.to, 1) : addDays(o.date, 1);
    tries.push({
      key: ev ? "afterEvent" : "otherDay",
      patch: { date: alt, weekday: fromISO(alt).getDay() },
    });
  }

  for (const t of tries) {
    // `probe` stops this recursing: a failed probe must not go looking for a
    // fix for the fix.
    const it = build(Object.assign({}, o, t.patch, { probe: true }));
    if (it.stops.length) return Object.assign({ stops: it.stops.length }, t);
  }
  return null;
}

function build(o) {
  const mode = o.mode || "car",
    pace = o.pace || "balanced";
  const f = o.filters || {},
    interests = o.interests || [],
    wantAll = interests.length === 0;

  const budget = computeBudget(o.budgetMin, o.startClock, pace, { meal: f.meal, who: o.who });
  const spendable = budget.spendable;

  // The event covering this date, if any. It bends the plan through the ordinary
  // cost model — longer visits, slower legs — plus a score nudge so the day
  // actually reaches it. Nothing about it is a special case. See docs/10 §4.5.
  const ev = activeEvent(o.date);
  const bias = ev?.bias ? { ...(o.bias || {}), ...ev.bias } : o.bias;

  const ctx: RouteCtx = {
    start: o.start,
    end: o.end,
    mode,
    weekday: o.weekday,
    visitFactor: budget.visitFactor,
    startClock: o.startClock,
    parking: PARKING,
    breaks: budget.breaks,
    ev,
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
  const pool = DP(o.start).filter((d) => {
    if (d.pending) return false; // coordinates not yet verified
    if (o.onlyIds && o.onlyIds.indexOf(d.id) < 0) return false;
    if (f.free && !d.free) return false;
    if (f.indoor && !d.indoor) return false;
    return true;
  });

  // 2) score each candidate
  const score = {};
  pool.forEach((d) => {
    const s = poiScore(d, interests, wantAll, bias);
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

  const closeT = stops.length ? legMin(cur, o.end, ctx) : 0;

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
  const suggestPool = DP(o.start).filter((d) => {
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
      date: o.date,
      // the id, not the object — meta is JSON-cloned into saved plans
      event: ev ? ev.id : null,
      /** which of these stops the event touches, so the UI can badge them */
      eventStops: ev ? stops.filter((s) => affects(ev, s.d.id)).map((s) => s.d.id) : [],
    },
    warn: stops.length ? [] : ["nofit"],
    // what would work instead — computed only on the real build, never inside
    // a probe, and only when there is nothing to show
    fix: stops.length || o.probe ? null : suggestFix(o),
  };
}

/**
 * The plan for a set of answers.
 *
 * This used to also build two alternatives — the same day at a relaxed pace,
 * and the same day biased towards a theme the visitor had not asked for — and
 * offer them at the bottom of the route screen under "Other ways".
 *
 * They are gone, and with them two extra full builds per plan. The visitor
 * asked four questions' worth of preferences; answering them and then
 * presenting two ways of ignoring one of the answers is not a choice, it is a
 * hedge. Everything the alternatives offered is still reachable and is now
 * honest about being a change of mind: pace and themes are one tap back in the
 * planner, and the no-fit fallback still proposes concrete remedies when a day
 * genuinely will not fit.
 */
function generate(o) {
  return { primary: build(o), alts: [] };
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
    date: m.date,
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
