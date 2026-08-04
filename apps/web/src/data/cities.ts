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

export const cityById = (id?: string): City => CITIES.find((c) => c.id === id) || CITIES[0];

/** The town a place belongs to. Anything unlabelled is Kurukshetra, which is
 *  what every place was before Pehowa existed in the data. */
export const cityOf = (d: { city?: string }): string => d.city || CITIES[0].id;
