// greedy.ts — prize-collecting construction. Repeatedly append the reachable,
// open, budget-fitting stop with the best (score + timeFit − travel − wait),
// advancing the clock. Deterministic and explainable; 2-opt tidies it after.
// See docs/03.
//
// After each driving stop it also opens a WALK POCKET: everything joined to
// that stop in the place graph is offered at its real cost — a few minutes on
// foot and no second parking buffer. This is the step that stops the planner
// driving a visitor past the Krishna Museum's front door on the way to Brahma
// Sarovar and never mentioning it. See docs/03 and docs/10 §3.3.
import { routing } from "../routing";
import { openAt, openMin, isClosedDay } from "../rules/hours";
import { timeFit } from "../rules/scoring";
import { linked, walkMin, sameComplex } from "@/data/graph";
import { takeDueBreaks, type TakenBreak } from "../rules/breaks";
import { slow, legMin, visitMin, type RouteCtx, type Leg } from "./schedule";
import type { Destination, GeoPoint, Stop } from "@/shared/types";

const wrap = (m: number) => ((m % 1440) + 1440) % 1440;

/* The most walking one car park may ask of a visitor, there and back, in
   minutes. The audience is in their sixties and seventies, outdoors, in
   Haryana heat: twenty minutes total is a real walk, not a stroll. This is a
   calibration knob — raise it only after watching someone actually do it. */
const POCKET_MAX = 20;

export interface GreedyResult {
  stops: Stop[];
  legs: Leg[]; // the same order, carrying which stops were walked to
  cur: GeoPoint | Destination;
  clock: number;
  used: number;
  left: Destination[]; // candidates not chosen (for the "left out" list)
}

/** Is this place open on arrival and still open when the visit ends? */
function openThrough(d: Destination, weekday: number, arrive: number, visit: number): boolean {
  return openAt(d, weekday, wrap(arrive)) && openAt(d, weekday, wrap(arrive + visit));
}

/** Minutes to wait if we arrive before the doors open. */
function waitFor(d: Destination, arrive: number): number {
  if (!d.hours) return 0;
  const op = openMin(d.hours.o),
    day = wrap(arrive);
  return day < op ? op - day : 0;
}

export function greedy(pool: Destination[], score: Record<string, number>, ctx: RouteCtx, spendable: number): GreedyResult {
  const stops: Stop[] = [];
  const legs: Leg[] = [];
  let cur: GeoPoint | Destination = { lat: ctx.start.lat, lng: ctx.start.lng },
    clock = ctx.startClock,
    used = 0;
  const left = pool.slice();
  // Greedy has to advance the clock exactly the way simulate() will, breaks
  // included — otherwise it picks a set that only fits without lunch, and the
  // authoritative pass then finds a stop shut on arrival and throws the whole
  // schedule away.
  const due = (ctx.breaks || []).slice();
  const taken: TakenBreak[] = [];

  /* The open pocket, if we are standing in one: where the car is, where our
     feet are, and the walk back we still owe. `owed` is already inside `used`,
     so leaving the pocket costs nothing extra — it was reserved on arrival. */
  let anchorId = "",
    footId = "",
    owed = 0,
    walked = 0; // minutes on foot spent in the open pocket so far

  const closePocket = () => {
    anchorId = "";
    footId = "";
    owed = 0;
    walked = 0;
  };

  while (left.length) {
    /* ---- 1) anything we can reach on foot from where we already parked ---- */
    if (anchorId) {
      let bestI = -1,
        bestV = -1e9,
        bestOut = 0,
        bestBack = 0,
        bestWait = 0;
      for (let i = 0; i < left.length; i++) {
        const d = left[i];
        if (isClosedDay(d, ctx.weekday)) continue;
        // A pocket is bounded by the CAR, not by the chain. Eligibility is an
        // edge to the anchor; without that test the pocket walks itself across
        // town one short hop at a time — Sannihit → Nabha House → Panorama →
        // … → Brahma Sarovar, eleven stops and two kilometres on foot, every
        // hop individually short and the whole thing absurd.
        const rawBack = walkMin(d.id, anchorId);
        if (rawBack == null) continue; // not within walking distance of the car
        const back = slow(rawBack, d.id, anchorId, ctx);
        // the walk out may chain from where we are standing; that part is real
        const out = slow(walkMin(footId, d.id) ?? rawBack, footId, d.id, ctx);
        if (walked + out + back > POCKET_MAX) continue;
        const visit = visitMin(d, ctx);
        const wait = waitFor(d, clock + out);
        const arrive = clock + out + wait;
        if (!openThrough(d, ctx.weekday, arrive, visit)) continue;
        // marginal cost: the extra walk out, the visit, and the longer way back
        const extra = out + wait + visit + (back - owed);
        const backToEnd = legMin(d, ctx.end, ctx);
        if (used + extra + ctx.parking + backToEnd > spendable) continue;
        // Walking to something you are already parked beside is the cheapest
        // minute in the app, so being there at all is worth real points. A
        // same-complex sibling is part of the same visit and nearly always
        // qualifies; a walkable neighbour has to be worth the walk, but not by
        // much — this is the term that decides whether a visitor is told about
        // the museum whose gate they are standing at.
        const worth = sameComplex(anchorId, d.id) ? 40 : 22;
        const v = score[d.id] + worth + timeFit(d, arrive) - out * 0.8 - wait * 1.3;
        if (v > bestV) {
          bestV = v;
          bestI = i;
          bestOut = out;
          bestBack = back;
          bestWait = wait;
        }
      }
      if (bestI >= 0 && bestV > 0) {
        const d = left[bestI];
        const visit = visitMin(d, ctx);
        const arrive = clock + bestOut + bestWait;
        stops.push({
          d, travel: bestOut, km: routing.roadKm(cur, d), wait: bestWait,
          arrive, visit, depart: arrive + visit, anchor: anchorId, walk: bestOut,
        } as Stop);
        legs.push({ d, anchor: anchorId });
        used += bestOut + bestWait + visit + (bestBack - owed);
        walked += bestOut;
        owed = bestBack;
        clock = arrive + visit;
        clock = takeDueBreaks(clock, due, stops.length - 1, taken);
        cur = d;
        footId = d.id;
        left.splice(bestI, 1);
        continue; // stay on foot while the pocket still pays
      }
    }

    /* ---- 2) otherwise drive to the best next stop ---- */
    // The car is at the anchor, not at our feet, so a driving leg is measured
    // from there. The walk back was already paid for on arrival.
    const from: GeoPoint | Destination = anchorId ? stops.find((s) => s.d.id === anchorId)!.d : cur;

    let best: Destination | null = null,
      bv = -1e9,
      bi = -1,
      bt = 0,
      bw = 0;
    for (let i = 0; i < left.length; i++) {
      const d = left[i];
      if (isClosedDay(d, ctx.weekday)) continue;
      const t = legMin(from, d, ctx);
      const visit = visitMin(d, ctx);
      const wait = waitFor(d, clock + t);
      const arrive = clock + t + wait;
      if (!openThrough(d, ctx.weekday, arrive, visit)) continue;
      const back = legMin(d, ctx.end, ctx);
      if (used + t + wait + visit + ctx.parking + back > spendable) continue;
      const v = score[d.id] + timeFit(d, arrive) - t * 1.6 - wait * 1.3;
      if (v > bv) {
        bv = v;
        best = d;
        bi = i;
        bt = t;
        bw = wait;
      }
    }
    if (!best) break;

    const visit = visitMin(best, ctx),
      arrive = clock + bt + bw;
    stops.push({ d: best, travel: bt, km: routing.roadKm(from, best), wait: bw, arrive, visit, depart: arrive + visit } as Stop);
    legs.push({ d: best });
    used += bt + bw + visit + ctx.parking;
    clock = arrive + visit + ctx.parking;
    clock = takeDueBreaks(clock, due, stops.length - 1, taken);
    cur = best;
    left.splice(bi, 1);

    // a new stop is a new car park, so a new pocket — but only if the graph
    // says there is anything to walk to
    closePocket();
    if (linked(best.id).length) {
      anchorId = best.id;
      footId = best.id;
      owed = 0;
      walked = 0;
    }
  }

  return { stops, legs, cur, clock, used, left };
}
