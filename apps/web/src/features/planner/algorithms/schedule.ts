// schedule.ts — the single definition of "does this order work, and how long".
// Walks start → stops → end, computing arrival/wait/depart, and flags invalid
// the moment a stop would be shut on arrival or mid-visit. See docs/03.
//
// WALK POCKETS
// An entry carrying `anchor` was reached on foot from a stop the visitor has
// already parked at. Those legs are priced as walks, pay no parking buffer,
// and leave the car where it is: the next driving leg departs from the anchor,
// after a walk back to it. Without this the scheduler charged six minutes of
// parking and a car leg to cross sixty metres of the same embankment, which is
// how a museum on the route's own doorstep came to look unaffordable.
import { routing } from "../routing";
import { openAt, openMin, isClosedDay } from "../rules/hours";
import { walkMin } from "@/data/graph";
import { affects, type EventDef } from "@/data/events";
import { takeDueBreaks, type BreakDef, type TakenBreak } from "../rules/breaks";
import type { Destination, GeoPoint, Stop } from "@/shared/types";

const wrap = (m: number) => ((m % 1440) + 1440) % 1440;

export interface RouteCtx {
  start: GeoPoint;
  end: GeoPoint;
  mode: string;
  weekday: number;
  visitFactor: number;
  startClock: number;
  parking: number;
  /** meals and rests to place on the clock; their minutes are already budgeted */
  breaks?: BreakDef[];
  /** the event covering this plan's date, if any — see docs/10 §4.5 */
  ev?: EventDef | null;
}

/* ---- event factors ----
   The two knobs from events.json, applied in the only two places any cost is
   computed. Every algorithm goes through these, so a festival day is stricter
   arithmetic rather than a special case: fewer stops fit, and the crowded
   place drifts toward the morning on its own. See docs/10 §4.5. */

const idOf = (x: unknown): string =>
  (typeof x === "string" ? x : (x as { id?: string })?.id) || "";

const touched = (x: unknown, ev: EventDef | null | undefined) => affects(ev, idOf(x));

/** Slow a leg when the event touches either end. `a`/`b` may be ids or places. */
export function slow(min: number, a: unknown, b: unknown, ctx: RouteCtx): number {
  if (!ctx.ev) return min;
  return touched(a, ctx.ev) || touched(b, ctx.ev) ? Math.round(min * ctx.ev.travelFactor) : min;
}

/** Travel minutes a→b: the provider's figure, slowed by any event. */
export const legMin = (
  a: GeoPoint | Destination,
  b: GeoPoint | Destination,
  ctx: RouteCtx,
  mode = ctx.mode,
): number => slow(routing.travelMin(a, b, mode), a, b, ctx);

/** How long a visit takes here: the recommended stay, scaled by pace then crowds. */
export const visitMin = (d: Destination, ctx: RouteCtx): number =>
  Math.round(d.visit.rec * ctx.visitFactor * (affects(ctx.ev, d.id) ? ctx.ev!.visitFactor : 1));

/** One place in a proposed order; `anchor` marks it as walked-to from that stop. */
export interface Leg {
  d: Destination;
  anchor?: string;
}

export interface Sim {
  valid: boolean;
  stops: Stop[];
  breaks: TakenBreak[];
  travel: number; // minutes moving between stops (excludes the closing leg)
  walk: number; // of which, minutes on foot inside a pocket
  park: number; // parking buffers actually charged (one per pocket, not per stop)
  cur: GeoPoint | Destination;
  clock: number; // minute-of-day after the last stop's parking buffer
  used: number; // travel + wait + visit + parking — what the stops cost the budget
  // (breaks are excluded: they were reserved before any stop was picked)
}

/**
 * Minutes and km for the leg into `d`, given where we physically are.
 *
 * `from` is the previous place visited; `anchor` is set when `d` is walked to.
 * A walk uses the graph's own figure — the only number here measured rather
 * than inferred from a straight line.
 */
function leg(from: GeoPoint | Destination, d: Destination, anchor: string | undefined, ctx: RouteCtx) {
  if (anchor) {
    const fromId = (from as Destination).id;
    const w = fromId ? walkMin(fromId, d.id) : undefined;
    // A pocket can chain (A→B→C on foot). If B and C have no edge of their own
    // we fall back to the anchor's, and failing that to the walking estimate —
    // never to the driving mode, because the car is parked.
    const raw = w ?? walkMin(anchor, d.id) ?? routing.travelMin(from, d, "walking");
    // a crowd slows feet too — crossing a mela ground is not a stroll
    const m = slow(raw, from, d, ctx);
    return { t: m, km: routing.roadKm(from, d), walk: m };
  }
  return { t: legMin(from, d, ctx), km: routing.roadKm(from, d), walk: 0 };
}

/** Simulate visiting `order` in sequence from ctx.start. */
export function simulate(order: (Destination | Leg)[], ctx: RouteCtx): Sim {
  const legs: Leg[] = order.map((x) => ("d" in x ? (x as Leg) : { d: x as Destination }));

  let cur: GeoPoint | Destination = ctx.start,
    clock = ctx.startClock,
    travel = 0,
    walk = 0,
    park = 0,
    used = 0;
  /** where the car actually is — an anchored stop does not move it */
  let carAt: GeoPoint | Destination = ctx.start;
  const stops: Stop[] = [];
  const taken: TakenBreak[] = [];
  const due = (ctx.breaks || []).slice();

  for (let i = 0; i < legs.length; i++) {
    const { d, anchor } = legs[i];
    if (isClosedDay(d, ctx.weekday)) return invalid(cur, clock, used);

    // Leaving a pocket: walk back to the car before driving on.
    let back = 0;
    if (!anchor && legs[i - 1]?.anchor) {
      const prev = legs[i - 1].d;
      back = slow(walkMin(prev.id, (carAt as Destination).id || "") ?? routing.travelMin(prev, carAt, "walking"), prev, carAt, ctx);
      clock += back;
      used += back;
      travel += back;
      walk += back;
      cur = carAt;
    }

    const { t, km, walk: w } = leg(cur, d, anchor, ctx);
    const visit = visitMin(d, ctx);
    let arrive = clock + t,
      wait = 0;
    if (d.hours) {
      const op = openMin(d.hours.o);
      const day = wrap(arrive);
      if (day < op) {
        wait = op - day;
        arrive += wait;
      }
    }
    if (!openAt(d, ctx.weekday, wrap(arrive))) return invalid(cur, clock, used);
    if (!openAt(d, ctx.weekday, wrap(arrive + visit))) return invalid(cur, clock, used);

    // Parking is a property of the car, so only a driving leg pays for it.
    const parking = anchor ? 0 : ctx.parking;
    stops.push({ d, travel: t + back, km, wait, arrive, visit, depart: arrive + visit, anchor, walk: w } as Stop);
    travel += t;
    walk += w;
    park += parking;
    used += t + wait + visit + parking;
    clock = arrive + visit + parking;
    cur = d;
    if (!anchor) carAt = d;

    // the clock moves, but `used` doesn't — break minutes are reserved out of
    // the budget up front, so charging them here would count them twice
    clock = takeDueBreaks(clock, due, stops.length - 1, taken);
  }

  // finishing inside a pocket still means walking back to the car
  if (legs.length && legs[legs.length - 1].anchor) {
    const last = legs[legs.length - 1].d;
    const b = slow(walkMin(last.id, (carAt as Destination).id || "") ?? routing.travelMin(last, carAt, "walking"), last, carAt, ctx);
    clock += b;
    used += b;
    travel += b;
    walk += b;
    cur = carAt;
  }

  return { valid: true, stops, breaks: taken, travel, walk, park, cur, clock, used };
}

function invalid(cur: GeoPoint | Destination, clock: number, used: number): Sim {
  return { valid: false, stops: [], breaks: [], travel: Infinity, walk: 0, park: 0, cur, clock, used };
}
