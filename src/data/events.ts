import eventData from "@/content/data/events.json";
import { register } from "@/content/live";
import { daysBetween } from "@/shared/lib/datetime";
import type { Loc } from "@/shared/types";

/**
 * The calendar — the reason most people come to Kurukshetra on the day they do.
 *
 * Source of truth: src/content/data/events.json, board-authored and bilingual.
 * Dates are lunar and are re-set from the panchang every year; nothing here
 * computes them. See docs/10 §4.4.
 *
 * The two factors are calibration knobs, not physics. `visitFactor` says a
 * darshan that normally takes twenty minutes takes thirty-six in the Mahotsav
 * queue; `travelFactor` says the two kilometres to the ghat now take longer
 * because half the road is a shobha yatra. Feed them into the ordinary cost
 * model and the good behaviour falls out: the day fits fewer stops, and
 * `timeFit` pulls the crowded one toward the morning. No special cases.
 *
 * This lives in data/ rather than planner/rules/ because both the engine and
 * the home rail read it, exactly like data/graph.ts.
 */
export type EventKind = "festival" | "snan" | "show" | "mela" | "yatra" | "closure";

export interface EventDef {
  id: string;
  kind: EventKind;
  name: Loc;
  /** inclusive ISO dates; a one-day event sets both the same */
  from: string;
  to: string;
  /** destination ids the event touches */
  places: string[];

  /* ---- district-level fields, all optional ----
     The model above describes a festival AT PLACES YOU VISIT, which is what a
     visitor needs. Someone who lives here needs the other half: a thing
     happening at an HOUR, on a ROAD, that they may want to reach or keep away
     from. A rath yatra down the GT Road at 4pm is not a destination — it is
     forty minutes of closed carriageway, and knowing about it is the whole
     value of the app on an ordinary Tuesday. */

  /** Minute-of-day window, when the event is not an all-day affair. */
  window?: { from: string; to: string };
  /**
   * The road it runs along — a procession, a route closure, a parade.
   * Points in order; the app treats it as a corridor exactly the way the drive
   * guide treats the route, so "is this on my way" is the same calculation.
   */
  corridor?: { lat: number; lng: number }[];
  /** What a resident should do about it. Absent means "nothing in particular". */
  advice?: "join" | "avoid";
  /** crowd multiplier on the visit duration at those places */
  visitFactor: number;
  /** congestion multiplier on any leg with an affected place at either end */
  travelFactor: number;
  /** score nudge, so the plan actually reaches the event */
  bias?: Record<string, number>;
  blurb: Loc;
  notice: Loc;
  /** optional board photo; the rail falls back to the first place's picture */
  img?: string;
}

/**
 * The calendar. `let`, not `const`, because the Board maintains it and a
 * corrected date should not need a release — see content/live.ts.
 *
 * Every query below reads EVENTS at call time and ES module exports are live
 * bindings, so replacing the array is enough: nothing captures it, and the
 * build-time copy remains the floor if the network never answers.
 */
export let EVENTS = eventData as unknown as EventDef[];
register<EventDef>("events", (items) => {
  EVENTS = items;
});

const covers = (e: EventDef, iso: string) => iso >= e.from && iso <= e.to;

/** Kinds that overlay a day rather than defining it — see check-content. */
const OVERLAY: EventKind[] = ["yatra", "closure"];
export const isOverlay = (e: EventDef) => OVERLAY.indexOf(e.kind) >= 0;

/**
 * The event covering that date, or null. First match wins — see check-content.
 *
 * Overlays are skipped on purpose. A procession can run during a mela, and the
 * engine can only apply one set of visit/travel factors; letting a two-hour
 * road closure outrank a ten-day festival for the whole day's arithmetic would
 * be wrong. Overlays reach the visitor through the notice and alert layer.
 */
export const activeEvent = (iso?: string): EventDef | null =>
  (iso && EVENTS.find((e) => covers(e, iso) && !isOverlay(e))) || null;

/** Look an event back up from the id an itinerary carries in its meta. */
export const eventById = (id?: string | null): EventDef | null =>
  (id && EVENTS.find((e) => e.id === id)) || null;

/** Events happening today. */
export const ongoing = (today: string): EventDef[] => EVENTS.filter((e) => covers(e, today));

/** Events starting soon, nearest first. */
export const upcoming = (today: string, withinDays = 120): EventDef[] =>
  EVENTS.filter((e) => e.from > today && daysBetween(today, e.from) <= withinDays).sort((a, b) =>
    a.from < b.from ? -1 : 1,
  );

/** Every event overlapping an inclusive date range — for the calendar. */
export const eventsBetween = (from: string, to: string): EventDef[] =>
  EVENTS.filter((e) => e.from <= to && e.to >= from);

/** Is this place touched by the event? */
export const affects = (e: EventDef | null | undefined, placeId: string): boolean =>
  !!e && e.places.indexOf(placeId) >= 0;

/** Every event at this place, ongoing or upcoming — for the place page. */
export const eventsAt = (placeId: string, today: string): EventDef[] =>
  [...ongoing(today), ...upcoming(today)].filter((e) => affects(e, placeId));

/* ────────────────────────────────────────────────────────────────────────────
   The resident's questions.

   Everything above answers a visitor's: what is on at the places I am going
   to. Below answers the other two — is it in my way, and is it near me —
   which are the questions that make this worth opening on a day nobody is
   sightseeing.
   ──────────────────────────────────────────────────────────────────────────── */

/** Where an event physically is: its own corridor, else the places it touches. */
export function eventPoints(e: EventDef, place: (id: string) => { lat: number; lng: number } | undefined) {
  if (e.corridor?.length) return e.corridor;
  return e.places.map(place).filter(Boolean) as { lat: number; lng: number }[];
}

/** Minutes from midnight, from "HH:MM". */
const hm = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + (m || 0);
};

/**
 * Is the event live at this moment — the date AND the hour?
 *
 * An all-day event (no window) is live all day. A rath yatra with a
 * 16:00–18:30 window is not something to warn anyone about at breakfast, and a
 * notice that fires at breakfast is a notice people turn off.
 */
export function liveAt(e: EventDef, iso: string, minuteOfDay: number): boolean {
  if (!covers(e, iso)) return false;
  if (!e.window) return true;
  return minuteOfDay >= hm(e.window.from) && minuteOfDay <= hm(e.window.to);
}

/** Events live today, soonest window first — what a notice would be about. */
export const liveToday = (iso: string, minuteOfDay: number): EventDef[] =>
  ongoing(iso)
    .filter((e) => liveAt(e, iso, minuteOfDay))
    .sort((a, b) => hm(a.window?.from ?? "00:00") - hm(b.window?.from ?? "00:00"));

/**
 * Events starting within the next `mins` minutes today — the lead time that
 * makes a warning actionable rather than a report of something already begun.
 */
export const startingSoon = (iso: string, minuteOfDay: number, mins = 90): EventDef[] =>
  ongoing(iso).filter((e) => {
    if (!e.window) return false;
    const start = hm(e.window.from);
    return start > minuteOfDay && start - minuteOfDay <= mins;
  });
