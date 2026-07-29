import { S, bump, newPlan } from "@/app/state";
import { go, track, planWeekday } from "@/app/nav";
import { nm, t } from "@/shared/i18n/i18n";
import { fromISO, isoToday, isoDate, isToday, nowM } from "@/shared/lib/datetime";
import { toast } from "@/shared/ui/overlays";
import { CONFIG } from "@/data/config";
import { Engine } from "@/features/planner/engine";
import { askLoc } from "@/features/location/location";
import type { Loc, GeoPoint } from "@/shared/types";

export const WINDOWS: [string | Loc, number][] = [
  ["1h", 60], ["2h", 120], ["3h", 180], ["4h", 240], ["6h", 360],
  [{ en: "Half day", hi: "आधा दिन" }, 300],
  [{ en: "Full day", hi: "पूरा दिन" }, 480],
  [{ en: "2 days", hi: "2 दिन" }, 960],
  [{ en: "3 days", hi: "3 दिन" }, 1440],
];

export const DYS: Record<string, string[]> = {
  en: ["S", "M", "T", "W", "T", "F", "S"],
  hi: ["र", "सो", "मं", "बु", "गु", "शु", "श"],
};
export const MONS: Record<string, string[]> = {
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  hi: ["जनवरी", "फ़रवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अगस्त", "सितंबर", "अक्तूबर", "नवंबर", "दिसंबर"],
};

/** Quick-start a plan from a Home time pill. */
export const quick = (m: number, l: string | Loc) => {
  const keep = S.plan && S.plan.date;
  S.plan = newPlan();
  if (keep) S.plan.date = keep;
  S.plan.mins = m;
  S.plan.label = l;
  // Land on the Time step (0), not skip it — the user still confirms date + start
  // time before the route is built (the pill only prefills the duration).
  S.plan.step = 0;
  track("plan_start");
  go("/plan");
};

export const quickTheme = (id: string) => {
  S.plan = newPlan();
  S.plan.themes = [id];
  go("/plan");
};

export const homeDate = () => {
  if (!S.plan) S.plan = newPlan();
  return S.plan.date;
};

export function setDay(iso: string) {
  if (!iso) return;
  if (!S.plan) S.plan = newPlan();
  S.plan.date = iso;
  if (!isToday(iso) && S.plan.startClock == null) S.plan.startClock = 9 * 60;
  if (isToday(iso)) S.plan.startClock = null;
  bump();
}

export function dayLabel(iso: string): string {
  const d = fromISO(iso);
  if (isToday(iso)) return nm({ en: "Today", hi: "आज" });
  const tm = fromISO(isoToday());
  tm.setDate(tm.getDate() + 1);
  if (isoDate(tm) === iso) return nm({ en: "Tomorrow", hi: "कल" });
  return d.getDate() + " " + MONS[S.lang === "hi" ? "hi" : "en"][d.getMonth()].slice(0, 3);
}

/* ---- 5-step wizard flow ---- */
export const valid = (i: number): boolean =>
  i === 0 ? !!S.plan!.mins : i === 3 ? S.plan!.themes.length > 0 : true;

export function pNext() {
  const p = S.plan!;
  if (!valid(p.step)) {
    if (p.step === 3) toast(t("pickTheme"));
    return;
  }
  p.step = Math.min(p.step + 1, 4);
  bump();
  window.scrollTo(0, 0);
}
export function pBack() {
  const p = S.plan!;
  if (p.step === 0) {
    go("/home");
    return;
  }
  p.step--;
  bump();
  window.scrollTo(0, 0);
}

export const setWin = (m: number, l: string) => {
  S.plan!.mins = m;
  S.plan!.label = l;
  bump();
};

/** Set the exact start point (from the search list, a pin, or current location). */
export function setStartPoint(g: GeoPoint) {
  const p = S.plan!;
  p.start = g;
  // Mirror a sensible end default until the user sets the end themselves:
  // a station/bus start ⇒ return to the same point; a stay ⇒ prefill it.
  if (!p.endManual) {
    if (p.startType === "station") { p.endType = "station"; p.end = { ...g }; }
    else if (p.startType === "bus") { p.endType = "bus"; p.end = { ...g }; }
    else if (p.startType === "hotel") { p.endType = "hotel"; p.end = { ...g }; }
  }
  bump();
}

/** Set the exact end point; marks the end as user-chosen so it stops mirroring the start. */
export function setEndPoint(g: GeoPoint) {
  S.plan!.end = g;
  S.plan!.endManual = true;
  bump();
}

export function pickStart(ty: string) {
  const p = S.plan!;
  p.startType = ty;
  if (ty === "useLoc") {
    askLoc(() => {
      if (S.userLoc)
        setStartPoint({ lat: S.userLoc.lat, lng: S.userLoc.lng, label: nm({ en: "My location", hi: "मेरा स्थान" }) });
      else bump();
    });
  } else if (ty === "other") {
    bump(); // leave the pin-map to set the point
  } else {
    // station / bus / hotel — user picks from the searchable list; clear any prior label
    p.start = { lat: CONFIG.centre.lat, lng: CONFIG.centre.lng };
    bump();
  }
}

export function pickEnd(ty: string) {
  const p = S.plan!;
  p.endType = ty;
  p.endManual = true;
  if (ty === "backToStart") p.end = { lat: p.start.lat, lng: p.start.lng, label: p.start.label };
  else if (ty === "anywhere") p.end = { lat: CONFIG.centre.lat, lng: CONFIG.centre.lng };
  // station / bus / hotel: leave for the list pick
  bump();
}

export function flipTheme(id: string) {
  const p = S.plan!;
  if (id === "any") p.themes = p.themes.indexOf("any") >= 0 ? [] : ["any"];
  else {
    p.themes = p.themes.filter((x) => x !== "any");
    p.themes = p.themes.indexOf(id) >= 0 ? p.themes.filter((x) => x !== id) : p.themes.concat([id]);
  }
  bump();
}

export function buildRoute() {
  const p = S.plan!;
  const sc = p.startClock != null ? p.startClock : nowM() < 9 * 60 ? 9 * 60 : nowM();
  p.startClock = sc;
  const opts = {
    budgetMin: p.mins!,
    start: p.start,
    end: p.endType === "backToStart" ? { lat: p.start.lat, lng: p.start.lng } : p.end,
    interests: p.themes.indexOf("any") >= 0 ? [] : p.themes,
    mode: p.mode,
    pace: p.pace,
    startClock: sc,
    weekday: planWeekday(),
    filters: { free: !!p.opts.free, indoor: !!p.opts.indoor, meal: !!p.opts.meal },
  };
  const multi = p.mins! > Engine.DAY_MAX ? Engine.buildDays(opts) : null;
  if (multi) {
    p.multi = multi;
    p.res = multi.days[0];
    p.day = 0;
    p.alts = [];
  } else {
    const r = Engine.generate(opts);
    p.multi = null;
    p.day = 0;
    p.res = r.primary;
    p.alts = r.alts;
  }
  track("route_built", { n: p.res!.stops.length, days: multi ? multi.days.length : 1 });
  go("/route");
}
