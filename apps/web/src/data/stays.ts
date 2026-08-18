import data from "@/content/data/hotels.json";
import { register } from "@/content/live";
import type { Stay } from "@/shared/types";

/**
 * Somewhere to sleep — hotels, dharamshalas, yatri niwas, guest houses.
 *
 * One catalogue, and that is the point. A hotel used to exist twice: once here
 * and once in the start-point index, because the planner needed something to
 * offer at "where are you starting from?". Two records of one building means
 * two phone numbers to keep true, and the one the planner showed was the one
 * with no tariff on it. The index now holds terminals only — a station or a bus
 * stand, which is a piece of transport infrastructure and not a place to stay —
 * and every question about lodging is answered from this file.
 *
 * `let`, and registered, for the same reason as the places index: a dharamshala
 * changes its phone number and that must not be a release. See content/live.ts.
 */
export let STAYS = data as unknown as Stay[];
register<Stay>("hotels", (items) => {
  // Same guard as the other feeds — an endpoint answering with half the list is
  // a half-finished import, and quietly shrinking what a visitor can choose
  // from is worse than ignoring the update.
  if (items.length < (data as unknown as Stay[]).length / 2) return;
  STAYS = items;
});

/**
 * The ones the app may offer: not hidden, and on the map.
 *
 * `pending` covers both a stay that has closed and one nobody has pinned yet,
 * and the coordinate check is not redundant — the planner routes to this point,
 * and a record that reaches the picker without one would plan a day from
 * `undefined, undefined`.
 */
export type PinnedStay = Stay & { lat: number; lng: number };
export const openStays = (): PinnedStay[] =>
  STAYS.filter((s): s is PinnedStay => !s.pending && s.lat != null && s.lng != null);
