import { S, store, bump, newPlan } from "@/app/state";
import { planWeekday } from "@/app/nav";
import { t } from "@/shared/i18n/i18n";
import { toast } from "@/shared/ui/overlays";
import { dur } from "@/shared/lib/format";
import { nowM } from "@/shared/lib/datetime";
import { byId } from "@/shared/lib/geo";
import { D } from "@/data/destinations";
import { cityOf } from "@/data/cities";
import { Engine } from "@/features/planner/engine";
import type { Destination, Loc } from "@/shared/types";

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
 * Put a place in the day, wherever the visitor is standing in the app.
 *
 * The plus on a card has to work with no plan, a half-answered plan, or a
 * finished route on screen, because it is offered on every list and the
 * visitor has no idea which of those they are in. So there is one rule: add it
 * to the day if there is one, and start a day if there is not.
 *
 * A day started this way begins HERE — at the visitor's own position if they
 * have allowed it, otherwise at the centre of the town. That matters more than
 * it sounds: the first leg of a route is the one they have to walk out of the
 * door and do, and a route that opens by driving them back to a town centre
 * they are standing two streets from is a route they will not trust again.
 */
export function addTo(id: string) {
  const d = byId(id);
  if (!d) return;
  const plan = S.plan;
  if (!plan || !plan.res) {
    S.plan = newPlan();
    S.plan.mins = 240;
    S.plan.label = dur(240);
    S.plan.startClock = nowM();
    if (S.userLoc) {
      S.plan.startType = "useLoc";
      S.plan.start = { ...S.userLoc };
      S.plan.end = { ...S.userLoc };
    }
    S.plan.res = {
      stops: [],
      dropped: [],
      totals: {
        travel: 0, visit: 0, wait: 0, park: 0, meal: 0, buffer: 0, km: 0, total: 0,
        budget: 240, finish: nowM(),
      },
      meta: {
        mode: "car", pace: "balanced", start: S.plan.start, end: S.plan.end,
        startClock: S.plan.startClock, weekday: planWeekday(), interests: [], liveTraffic: false,
      },
      warn: [],
    } as any;
  }
  const p = S.plan!;
  const res = p.res as any;
  // Tapping it again takes it out. The plus is the only control on the card,
  // so it has to be the undo as well — otherwise a mis-tap on a list of
  // thirty-six is a trip to another screen to correct.
  if (res.stops.some((s: any) => s.d.id === id)) {
    dropFrom(id);
    return;
  }
  const st = res.stops;
  const prev = st.length ? st[st.length - 1].d : p.start;
  const last = st.length ? st[st.length - 1].depart : p.startClock || nowM();
  const tm = Engine.travelMin(prev, d, p.mode || "car"),
    km = Engine.roadKm(prev, d);
  st.push({ d, travel: tm, km, wait: 0, arrive: last + tm, visit: d.visit.rec, depart: last + tm + d.visit.rec });
  const T = res.totals;
  T.travel += tm;
  T.visit += d.visit.rec;
  T.km = +(T.km + km).toFixed(1);
  T.total += tm + d.visit.rec;
  T.finish = (p.startClock || nowM()) + T.total;
  toast(t("addedT"));
  bump();
}

/**
 * Take a place back out and re-time what is left.
 *
 * The stops after it were timed from the one before, so removing a stop from
 * the middle without recomputing leaves every arrival after it wrong by that
 * stop's length — a day that silently claims to finish an hour later than it
 * does. This walks the remaining stops once and re-times them from the start.
 */
export function dropFrom(id: string) {
  const p = S.plan;
  const res = p?.res as any;
  if (!p || !res) return;
  const kept = (res.stops as any[]).filter((s) => s.d.id !== id);
  if (kept.length === res.stops.length) return;

  let clock = p.startClock ?? nowM();
  let prev: { lat: number; lng: number } = p.start;
  const T = { travel: 0, visit: 0, km: 0 };
  for (const s of kept) {
    s.travel = Engine.travelMin(prev, s.d, p.mode || "car");
    s.km = Engine.roadKm(prev, s.d);
    s.arrive = clock + s.travel;
    s.visit = s.d.visit.rec;
    s.depart = s.arrive + s.visit;
    clock = s.depart;
    prev = s.d;
    T.travel += s.travel;
    T.visit += s.visit;
    T.km += s.km;
  }
  res.stops = kept;
  res.totals.travel = T.travel;
  res.totals.visit = T.visit;
  res.totals.km = +T.km.toFixed(1);
  res.totals.total = T.travel + T.visit;
  res.totals.finish = (p.startClock ?? nowM()) + res.totals.total;
  // An emptied day is no day. Leaving a plan with zero stops on screen puts
  // the route screen into a state it has no copy for.
  if (!kept.length) S.plan = null;
  toast(t("removedT"));
  bump();
}
