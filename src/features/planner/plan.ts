import { S, bump, newPlan } from "@/app/state";
import { go, track, planWeekday } from "@/app/nav";
import { nm, t } from "@/shared/i18n/i18n";
import { fromISO, isoToday, isoDate, isToday, nowM, addDays } from "@/shared/lib/datetime";
import { toast } from "@/shared/ui/overlays";
import { CONFIG } from "@/data/config";
import { Engine } from "@/features/planner/engine";
import { askLoc } from "@/features/location/location";
import { savePlan } from "./persist";
import type { Loc, GeoPoint } from "@/shared/types";

/** One active day of sightseeing. A multi-day stay is this × the number of days. */
export const DAY_MINS = 480;

/**
 * Five lengths and nothing more.
 *
 * There used to be nine, which filled a third of the step with near-synonyms
 * ("4h" and "Half day" are twenty minutes apart) and pushed the answer the
 * visitor had actually come to give below the fold. Five covers the real
 * shapes of a visit; anything between them is the Custom stepper, and anything
 * longer than a day is a date *range* on the calendar above — which is the
 * only place a multi-day stay can be stated without ambiguity anyway, since
 * "2 days" never said which two.
 */
export const WINDOWS: { lb: string | Loc; mins: number; days: number }[] = [
  { lb: "1h", mins: 60, days: 1 },
  { lb: "2h", mins: 120, days: 1 },
  { lb: "3h", mins: 180, days: 1 },
  { lb: "6h", mins: 360, days: 1 },
  { lb: { en: "Full day", hi: "पूरा दिन" }, mins: DAY_MINS, days: 1 },
];

/** Bounds for the Custom stepper: half an hour to twelve, in half hours. */
export const CUSTOM = { min: 30, max: 720, step: 30 };

export const DYS: Record<string, string[]> = {
  en: ["S", "M", "T", "W", "T", "F", "S"],
  hi: ["र", "सो", "मं", "बु", "गु", "शु", "श"],
};
export const DAYNAMES: Record<string, string[]> = {
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  hi: ["रविवार", "सोमवार", "मंगलवार", "बुधवार", "गुरुवार", "शुक्रवार", "शनिवार"],
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

/** Open the planner at step 1 without pre-answering the length. */
export const go2plan = () => {
  if (!S.plan) S.plan = newPlan();
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

export function setDay(iso: string, days = 1) {
  if (!iso) return;
  if (!S.plan) S.plan = newPlan();
  const p = S.plan;
  p.date = iso;
  p.days = Math.max(1, Math.min(7, days));
  // A stay longer than a day *is* the answer to "how long do you have" — keep
  // the two in step so the calendar and the length chips can never disagree.
  if (p.days > 1) {
    p.mins = p.days * DAY_MINS;
    p.label = { en: p.days + " days", hi: p.days + " दिन" };
  } else if (p.mins != null && p.mins > DAY_MINS) {
    p.mins = DAY_MINS;
    p.label = { en: "Full day", hi: "पूरा दिन" };
  }
  if (!isToday(iso) && p.startClock == null) p.startClock = 9 * 60;
  if (isToday(iso)) p.startClock = null;
  bump();
}

/** Last calendar day of the visit (same as the start for a day trip). */
export const lastDay = (p = S.plan!): string => addDays(p.date, Math.max(1, p.days) - 1);

/** "Fri, 7 Aug 2026" — the long, unambiguous form the pick-rows show. */
export function longDate(iso: string): string {
  const d = fromISO(iso);
  const lang = S.lang === "hi" ? "hi" : "en";
  return DAYNAMES[lang][d.getDay()] + ", " + d.getDate() + " " + MONS[lang][d.getMonth()] + " " + d.getFullYear();
}

/** "7 Aug" — the short form used inside a range. */
export function shortDate(iso: string): string {
  const d = fromISO(iso);
  return d.getDate() + " " + MONS[S.lang === "hi" ? "hi" : "en"][d.getMonth()].slice(0, 3);
}

/** Set the start time in minutes-of-day, or null = "now" (today only). */
export function setStartClock(m: number | null) {
  if (!S.plan) S.plan = newPlan();
  S.plan.startClock = m;
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

/* ---- 4-step wizard flow: when → from → to → what & how ----
   Each step must actually be answered before Continue enables. A point counts
   as answered only once it carries a real label (a granted fix, a pinned spot,
   or a place chosen from the list) — never just a silent town-centre default. */
export const LAST_STEP = 3;

export const valid = (i: number): boolean => {
  const p = S.plan!;
  switch (i) {
    case 0:
      return !!p.mins;
    case 1:
      return !!p.startType && !!p.start.label;
    case 2:
      return p.endType === "backToStart" || p.endType === "anywhere" ? !!p.endType : !!p.end.label;
    case 3:
      return p.themes.length > 0;
    default:
      return true;
  }
};

/**
 * What is still missing on this step, in words, or "" when it is answered.
 *
 * Continue used to be `disabled` while a step was unanswered, which meant the
 * explanation below could never be reached — the button refused the tap that
 * would have triggered it. The screen says this up front now, and Continue
 * stays tappable so the toast is a real fallback rather than dead code.
 */
export const missing = (i: number): string => {
  if (valid(i)) return "";
  if (i === 0) return nm({ en: "Choose how long you have.", hi: "आपके पास कितना समय है, चुनें।" });
  if (i === 1) return nm({ en: "Choose where you're starting from.", hi: "आरंभ स्थान चुनें।" });
  if (i === 2) return nm({ en: "Choose where the visit ends.", hi: "समाप्ति स्थान चुनें।" });
  return t("pickTheme");
};

export function pNext() {
  const p = S.plan!;
  if (!valid(p.step)) {
    toast(missing(p.step));
    return;
  }
  p.step = Math.min(p.step + 1, LAST_STEP);
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

export const setWin = (m: number, l: string | Loc, days = 1) => {
  const p = S.plan!;
  p.mins = m;
  p.label = l;
  p.days = days;
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
      // Say plainly what we ended up with: a real fix, or the town centre.
      setStartPoint(
        S.userLoc
          ? { lat: S.userLoc.lat, lng: S.userLoc.lng, label: nm({ en: "My location", hi: "मेरा स्थान" }) }
          : { lat: CONFIG.centre.lat, lng: CONFIG.centre.lng, label: nm({ en: "Town centre", hi: "नगर केंद्र" }) },
      );
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
    who: p.who,
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
  // A built plan is kept without being asked for. Answering four steps is the
  // expensive part of this app, and losing that to a closed tab — or to tapping
  // Plan again and being handed a blank form — is the one failure the visitor
  // cannot undo. Save is still on the route screen, but it now confirms
  // something that has already happened rather than being the only chance.
  savePlan(p).catch(() => {
    /* private mode / no quota — the route still works, it just won't come back */
  });
  go("/route");
}
