import { useSyncExternalStore } from "react";
import { ALL, CITIES, cityById, isAll } from "@/data/cities";
import { isoToday } from "@/shared/lib/datetime";
import type { Plan, Journey, Lang } from "@/shared/types";

/* ================= PERSISTENT STORE (localStorage) =================
   Ported verbatim from the demo's `store` object. */
export const store = {
  get lang(): string {
    return localStorage.getItem("k_lang") || "";
  },
  set lang(v: string) {
    localStorage.setItem("k_lang", v);
  },
  get city(): string {
    return localStorage.getItem("k_city") || "";
  },
  set city(v: string) {
    localStorage.setItem("k_city", v);
  },
  get theme(): string {
    return localStorage.getItem("k_theme") || "system";
  },
  set theme(v: string) {
    localStorage.setItem("k_theme", v);
  },
  get ts(): number {
    return +(localStorage.getItem("k_ts") || 0);
  },
  set ts(v: number) {
    localStorage.setItem("k_ts", String(v));
  },
  get favs(): string[] {
    try {
      return JSON.parse(localStorage.getItem("k_favs") || "[]");
    } catch {
      return [];
    }
  },
  set favs(v: string[]) {
    localStorage.setItem("k_favs", JSON.stringify(v));
  },
  get routes(): any[] {
    try {
      return JSON.parse(localStorage.getItem("k_routes") || "[]");
    } catch {
      return [];
    }
  },
  set routes(v: any[]) {
    localStorage.setItem("k_routes", JSON.stringify(v));
  },
};

/* ================= VOLATILE APP STATE =================
   These were module-level `let`s in the demo. Kept in one object so React can
   subscribe to changes; mutate freely then call bump() (was render()). */
export interface WeatherState {
  temp: number;
  feels: number;
  code: number;
  wind: number;
  rh: number;
  day: boolean;
  hi: number;
  lo: number;
  pop: number;
  uv: number;
  sunset: string;
  live: boolean;
}

export const S = {
  lang: (store.lang || "en") as Lang,
  /** which town every list, route and forecast is scoped to — or ALL for both */
  city: isAll(store.city) ? ALL : cityById(store.city).id,
  plan: null as Plan | null,
  journey: null as Journey | null,
  /** the last fix, with the radius the device claims for it (metres) */
  userLoc: null as { lat: number; lng: number; acc?: number } | null,
  /** a fix is being asked for right now — the picker says so instead of lying */
  locBusy: false,
  /** why the last attempt produced nothing. "" once one succeeds. */
  locErr: "" as "" | "denied" | "unavailable" | "insecure",
  mapTheme: "all",
  sq: "",
  sf: {} as Record<string, boolean>,
  calBase: null as Date | null,
  wx: null as WeatherState | null,
  wxAt: 0,
  wxBusy: false,
};

/* ---- React subscription: bump() re-renders everything (like render()) ---- */
let version = 0;
const listeners = new Set<() => void>();

/* Every mutation in the app ends in bump(), so it is the one place a draft-save
   can hook without every caller having to remember to. Registered by the
   persistence layer at boot; a plain callback rather than an import, because
   state.ts must stay a dependency leaf. */
let afterBump: (() => void) | null = null;
export const onBump = (fn: () => void) => {
  afterBump = fn;
};

export function bump() {
  version++;
  listeners.forEach((l) => l());
  if (afterBump) afterBump();
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
const getSnapshot = () => version;

/** Subscribe a component to app-state changes. */
export function useApp() {
  return useSyncExternalStore(subscribe, getSnapshot);
}

/* ---- language ---- */
export const setLangStay = (l: Lang) => {
  S.lang = l;
  store.lang = l;
  bump();
};
export const flipLang = () => setLangStay(S.lang === "hi" ? "en" : "hi");

/* ---- the town ---- */
/**
 * The town anything with a coordinate should use — the map's opening view, the
 * forecast, a plan's default start. Never null: an unknown stored id, and the
 * "both towns" scope, both fall through to the first town. Browsing both is a
 * scope, not a location; the forecast has to be somewhere.
 */
export const city = () => cityById(S.city);

/** True when the visitor is browsing both towns at once. */
export const allTowns = () => isAll(S.city);

/**
 * Switch town. The forecast is dropped (it is a different place's weather) and
 * a half-built plan is restarted, because its start, end and candidate places
 * all belong to the town that was chosen when it began — carrying it over
 * would route someone from Pehowa's bus stand to a museum in Thanesar. The
 * date is the one answer that survives, since it is about the visitor.
 */
export function setCity(id: string) {
  if (!isAll(id) && !CITIES.some((c) => c.id === id)) return;
  if (id === S.city) return;
  S.city = id;
  store.city = id;
  S.wx = null;
  S.wxAt = 0;
  if (S.plan) {
    const keep = S.plan.date;
    S.plan = newPlan();
    S.plan.date = keep;
  }
  bump();
}

/** Follow a place into its own town, without the plan reset — used when a link
 *  or a search result opens a place that is not in the town on screen. */
export function setCityQuiet(id: string) {
  // Browsing both already includes wherever they have landed, so following a
  // place into its town would narrow the scope they deliberately widened.
  if (isAll(S.city)) return;
  if (!CITIES.some((c) => c.id === id) || id === S.city) return;
  S.city = id;
  store.city = id;
  S.wx = null;
  S.wxAt = 0;
  bump();
}

/* ---- answers carried over from the last plan ----
   Filled by the persistence layer at boot. It is pushed in rather than
   imported because state.ts has to stay a dependency leaf — the same reason
   onBump exists. See docs/10 §2.5. */
let carried: Partial<Plan> = {};
export const setCarried = (p: Partial<Plan>) => {
  carried = p;
};

/* ---- a fresh plan (was newPlan) ---- */
export const newPlan = (): Plan => ({
  // No start pre-selected: "my location" is permission-gated, so it must be an
  // explicit choice, not a default that implies a fix we don't have.
  startType: "",
  start: { lat: city().centre.lat, lng: city().centre.lng },
  endType: "backToStart",
  end: { lat: city().centre.lat, lng: city().centre.lng },
  themes: [],
  mode: "car",
  modes: ["car"],
  pace: "balanced",
  who: "family",
  opts: { meal: true },
  // Where they set off from last time, how they travel, who with, at what pace.
  // Answering the same four questions on every visit is the thing this app was
  // built to stop doing.
  ...carried,
  // Never carried, whatever ends up in the record — these sit after the spread
  // so a field added to Prefs by mistake still cannot resurrect them. The
  // length of *this* visit is the question the planner opens with, and a stale
  // date silently checks the route against the opening hours of a day that has
  // already gone.
  step: 0,
  mins: null,
  label: "",
  res: null,
  alts: [],
  startClock: null,
  date: isoToday(),
  days: 1,
});
