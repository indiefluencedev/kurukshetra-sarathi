import data from "@/content/data/cities.json";
import type { Loc } from "@/shared/types";

/**
 * The towns the app covers. The 48 Kos tirtha land is not one settlement —
 * Pehowa is fifty minutes west of Thanesar with its own tirthas, its own
 * weather and its own bus stand — so every list, route and forecast is scoped
 * to the town currently chosen rather than to a single hardcoded centre.
 *
 * This module is a dependency leaf on purpose: `app/state.ts` holds which town
 * is active, and state.ts must not import anything that imports it back.
 */
export interface City {
  id: string;
  en: string;
  hi: string;
  /** map default view and the "town centre" start/end point */
  centre: { lat: number; lng: number };
  /** where the forecast is taken — the built-up part, not the map centroid */
  wx: { lat: number; lng: number };
  wxPlace: Loc;
  pin: string;
  region: Loc;
}

export const CITIES = data as City[];

/**
 * "Both towns" — a browsing scope, not a place.
 *
 * Someone who wants to see everything the 48 Kos land holds should not have to
 * pick a town first, so `S.city` may hold this instead of a town id and every
 * list widens to the full catalogue. It is deliberately NOT a row in
 * cities.json: it has no centre, no forecast and no pin code, and a fake one
 * would be a made-up coordinate sitting in the file that says none of these
 * are made up. Anything that needs a real location resolves through
 * `cityById`, which falls through to the first town.
 */
export const ALL = "all";

export const isAll = (id?: string): boolean => id === ALL;

export const cityById = (id?: string): City => CITIES.find((c) => c.id === id) || CITIES[0];

/** The town a place belongs to. Anything unlabelled is Kurukshetra, which is
 *  what every place was before Pehowa existed in the data. */
export const cityOf = (d: { city?: string }): string => d.city || CITIES[0].id;

/**
 * The town a coordinate belongs to.
 *
 * This is what decides which town a ROUTE is about when the visitor is
 * browsing both: a day is built around where it starts, so a plan setting off
 * from Pehowa's Saraswati ghat is a Pehowa day and one from Kurukshetra
 * Junction is not. The two centres are 25 km apart and everything in the
 * district is nearer one than the other by a wide margin, so plain degrees
 * decide it — a great-circle refinement would change no answer.
 */
export const nearestCityTo = (p: { lat: number; lng: number }): City =>
  CITIES.reduce((best, c) => {
    const d = (c.centre.lat - p.lat) ** 2 + (c.centre.lng - p.lng) ** 2;
    const b = (best.centre.lat - p.lat) ** 2 + (best.centre.lng - p.lng) ** 2;
    return d < b ? c : best;
  }, CITIES[0]);
