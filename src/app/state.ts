import { useSyncExternalStore } from "react";
import { CONFIG } from "@/data/config";
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
  plan: null as Plan | null,
  journey: null as Journey | null,
  userLoc: null as { lat: number; lng: number } | null,
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

/* ---- a fresh plan (was newPlan) ---- */
export const newPlan = (): Plan => ({
  step: 0,
  mins: null,
  label: "",
  // No start pre-selected: "my location" is permission-gated, so it must be an
  // explicit choice, not a default that implies a fix we don't have.
  startType: "",
  start: { lat: CONFIG.centre.lat, lng: CONFIG.centre.lng },
  endType: "backToStart",
  end: { lat: CONFIG.centre.lat, lng: CONFIG.centre.lng },
  themes: [],
  mode: "car",
  modes: ["car"],
  pace: "balanced",
  who: "family",
  opts: { meal: true },
  res: null,
  alts: [],
  startClock: null,
  date: isoToday(),
  days: 1,
});
