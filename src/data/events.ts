import eventData from "@/content/data/events.json";
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
export type EventKind = "festival" | "snan" | "show" | "mela";

export interface EventDef {
  id: string;
  kind: EventKind;
  name: Loc;
  /** inclusive ISO dates; a one-day event sets both the same */
  from: string;
  to: string;
  /** destination ids the event touches */
  places: string[];
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

export const EVENTS = eventData as unknown as EventDef[];

const covers = (e: EventDef, iso: string) => iso >= e.from && iso <= e.to;

/** The event covering that date, or null. First match wins — see check-content. */
export const activeEvent = (iso?: string): EventDef | null =>
  (iso && EVENTS.find((e) => covers(e, iso))) || null;

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
