import { S, store, bump, newPlan } from "@/app/state";
import { planWeekday } from "@/app/nav";
import { t } from "@/shared/i18n/i18n";
import { toast } from "@/shared/ui/overlays";
import { dur } from "@/shared/lib/format";
import { nowM, isToday } from "@/shared/lib/datetime";
import { byId } from "@/shared/lib/geo";
import { D } from "@/data/destinations";
import { cityOf } from "@/data/cities";
import { Engine } from "@/features/planner/engine";
import type { Destination, GeoPoint, Loc, Plan } from "@/shared/types";

export const FAC: Record<string, Loc> = {
  washroom: { en: "Washrooms", hi: "शौचालय" },
  water: { en: "Drinking water", hi: "पेयजल" },
  food: { en: "Food nearby", hi: "भोजन निकट" },
  parking: { en: "Parking", hi: "पार्किंग" },
};
export const DY: [string, string][] = [
  ["Sun", "रवि"], ["Mon", "सोम"], ["Tue", "मंगल"], ["Wed", "बुध"],
  ["Thu", "गुरु"], ["Fri", "शुक्र"], ["Sat", "शनि"],
];

/** Four closest other places, within the same town. Scoped to `d`'s own town
    rather than the one on screen: Pehowa is twenty-five kilometres west, so
    "nearby" across the two is a suggestion nobody can act on. */
export const near = (d: Destination): Destination[] =>
  D.filter((x) => x.id !== d.id && cityOf(x) === cityOf(d))
    .map((x) => ({ x, k: Engine.roadKm(d, x) }))
    .sort((a, b) => a.k - b.k)
    .slice(0, 4)
    .map((o) => o.x);

export function flipFav(id: string) {
  let f = store.favs;
  if (f.indexOf(id) >= 0) {
    f = f.filter((x) => x !== id);
    store.favs = f;
    toast(t("removedT"));
  } else {
    f = f.concat([id]);
    store.favs = f;
    toast(t("savedT"));
  }
  bump();
}

/** Is this place already a stop in the plan on screen? */
export const inPlan = (id: string): boolean =>
  !!S.plan?.res && (S.plan.res.stops as { d: Destination }[]).some((s) => s.d.id === id);

/** How many places the plan on screen holds. */
export const savedCount = (): number => (S.plan?.res ? S.plan.res.stops.length : 0);

/**
 * Time an ordered list of places from the plan's start point and hour.
 *
 * The one place arrival/departure arithmetic lives. Adding a stop, removing
 * one, and rebuilding a saved plan's stops all end here, so a day can never be
 * timed two different ways depending on which control the visitor touched.
 * (Adding used to append with its own arithmetic while removing re-timed the
 * whole list with a second copy of the same loop.)
 */
export function retime(p: Plan, dests: Destination[]) {
  const res = p.res as any;
  let clock = p.startClock ?? nowM();
  let prev: { lat: number; lng: number } = p.start;
  const stops: any[] = [];
  const T = { travel: 0, visit: 0, km: 0 };
  for (const d of dests) {
    const travel = Engine.travelMin(prev, d, p.mode || "car");
    const km = Engine.roadKm(prev, d);
    const arrive = clock + travel;
    const visit = d.visit.rec;
    stops.push({ d, travel, km, wait: 0, arrive, visit, depart: arrive + visit });
    clock = arrive + visit;
    prev = d;
    T.travel += travel;
    T.visit += visit;
    T.km += km;
  }
  res.stops = stops;
  res.totals.travel = T.travel;
  res.totals.visit = T.visit;
  res.totals.km = +T.km.toFixed(1);
  res.totals.total = T.travel + T.visit;
  res.totals.finish = (p.startClock ?? nowM()) + res.totals.total;
}

/** An empty result shell for a plan being built by hand rather than by the engine. */
export function emptyRes(p: Plan) {
  const budget = p.mins || 240;
  p.res = {
    stops: [],
    dropped: [],
    totals: {
      travel: 0, visit: 0, wait: 0, park: 0, meal: 0, buffer: 0, km: 0, total: 0,
      budget, finish: p.startClock ?? nowM(),
    },
    meta: {
      mode: p.mode || "car", pace: p.pace || "balanced", start: p.start, end: p.end,
      startClock: p.startClock, weekday: planWeekday(), interests: [], liveTraffic: false,
    },
    warn: [],
  } as any;
}

/** Append a place to a plan that already has a result, and re-time the day. */
export function pushStop(p: Plan, d: Destination) {
  const res = p.res as any;
  if (res.stops.some((s: any) => s.d.id === d.id)) return;
  retime(p, (res.stops as any[]).map((s) => s.d).concat([d]));
}

/**
 * Begin a day at `start` on `date`, with `d` as its first stop.
 *
 * The pure half of the add sheet — everything about starting a day that does
 * not involve asking. It lives here rather than in the sheet so the planner
 * checks can exercise it: `tools/check-planner.mjs` runs under node's type
 * stripper, which cannot load a .tsx file at all.
 *
 * How long the day is stays UNASKED. That is the planner's opening question,
 * and a visitor adding a place off a list has not decided to plan a day yet —
 * but the totals need some budget to be measured against, so half a day is
 * assumed and the planner is where it gets stated properly.
 */
export function startDayWith(d: Destination, date: string, start: GeoPoint, startType: string): Plan {
  const p = newPlan();
  p.date = date;
  // Mirrors setDay(): "now" only means anything today, and a future day needs a
  // stated hour or every arrival is computed off the wrong clock.
  p.startClock = isToday(date) ? nowM() : 9 * 60;
  p.startType = startType;
  p.start = start;
  p.end = { ...start };
  p.endType = "backToStart";
  p.mins = 240;
  p.label = dur(240);
  S.plan = p;
  emptyRes(p);
  pushStop(p, d);
  return p;
}

/**
 * Take a place back out and re-time what is left.
 *
 * The stops after it were timed from the one before, so removing a stop from
 * the middle without recomputing leaves every arrival after it wrong by that
 * stop's length — a day that silently claims to finish an hour later than it
 * does.
 */
export function dropFrom(id: string) {
  const p = S.plan;
  const res = p?.res as any;
  if (!p || !res) return;
  const kept = (res.stops as any[]).filter((s) => s.d.id !== id);
  if (kept.length === res.stops.length) return;
  retime(p, kept.map((s: any) => s.d));
  // An emptied day is no day. Leaving a plan with zero stops on screen puts
  // the route screen into a state it has no copy for.
  if (!kept.length) S.plan = null;
  toast(t("removedT"));
  bump();
}
