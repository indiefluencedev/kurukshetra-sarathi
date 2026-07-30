import { S, store, bump, newPlan } from "@/app/state";
import { planWeekday } from "@/app/nav";
import { t } from "@/shared/i18n/i18n";
import { toast } from "@/shared/ui/overlays";
import { dur } from "@/shared/lib/format";
import { nowM } from "@/shared/lib/datetime";
import { byId } from "@/shared/lib/geo";
import { D } from "@/data/destinations";
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

/** four closest other places. */
export const near = (d: Destination): Destination[] =>
  D.filter((x) => x.id !== d.id)
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

/** Add a place to the current plan, creating a blank half-day plan if none. */
export function addTo(id: string) {
  const d = byId(id);
  if (!d) return;
  const plan = S.plan;
  if (!plan || !plan.res) {
    S.plan = newPlan();
    S.plan.mins = 240;
    S.plan.label = dur(240);
    S.plan.startClock = nowM();
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
  if (res.stops.some((s: any) => s.d.id === id)) {
    toast(t("inPlan"));
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
