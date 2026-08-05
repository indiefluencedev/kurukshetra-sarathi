export type Lang = "en" | "hi";

/** A bilingual string. */
export interface Loc {
  en: string;
  hi: string;
}

export interface ThemeDef {
  id: string;
  en: string;
  hi: string;
  icon: string;
  img: string;
}

export interface InsideItem {
  n: Loc;
  d: Loc;
}
export interface NoticeItem {
  t: Loc;
  d: Loc;
}

export interface Destination {
  id: string;
  /** which town it is in — see data/cities.ts. Absent means Kurukshetra. */
  city?: string;
  img?: string;
  gallery?: string[];
  name: Loc;
  themes: string[];
  lat: number;
  lng: number;
  placeId?: string;
  short: Loc;
  why?: Loc;
  inside?: InsideItem[];
  notice?: NoticeItem[];
  visit: { rec: number; min: number; max: number };
  hours?: { o: string; c: string };
  closed?: number[];
  free?: boolean;
  fee?: Loc;
  best?: Loc;
  bestKey?: string;
  indoor?: boolean;
  child?: boolean;
  senior?: boolean;
  rank?: number;
  first?: number;
  parking?: Loc;
  facilities?: string[];
  pending?: boolean;
}

/**
 * Somewhere to stay.
 *
 * A deliberately small shape, and the smallness is the design. A destination
 * carries 28 fields because the app tells you why it matters; a stay only has
 * to answer four questions a traveller actually asks at 9pm — where is it, what
 * does it roughly cost, does it have a room type I need, and what is the phone
 * number. Everything a booking site would add (amenity checklists, star
 * ratings, review scores) is data nobody here can keep true, and a stale
 * amenity list is worse than none.
 *
 * `kind` matters more than price in this district: a dharamshala and a hotel
 * are different propositions for a pilgrim, not different price brackets.
 */
export interface Stay {
  id: string;
  /** which town — see data/cities.ts. Absent means Kurukshetra. */
  city?: string;
  name: Loc;
  kind: "hotel" | "dharamshala" | "guesthouse" | "homestay";
  /** locality in words, because a coordinate does not tell you "near the bus stand" */
  area?: Loc;
  lat: number;
  lng: number;
  /** indicative rupees per night. A range, because a tariff card is never one number. */
  price?: { min: number; max: number };
  phone?: string;
  /** free text, bilingual — what a local would tell you about the place */
  note?: Loc;
  img?: string;
  gallery?: string[];
  /** a handful of facts worth filtering on, from the same vocabulary places use */
  facilities?: string[];
  /** hidden from the app without being deleted — for a stay that has closed */
  pending?: boolean;
}

export interface HeroItem {
  id: string;
  /** which town it belongs to — see data/cities.ts. Absent means Kurukshetra. */
  city?: string;
  img: string;
  fact: Loc;
}

export interface ReelItem {
  id: string;
  place: string;
  url: string;
  by: string;
  cap: Loc;
}

/** A stop in a built itinerary. */
export interface Stop {
  d: Destination;
  arrive: number;
  depart: number;
  /**
   * Set when this stop was reached **on foot from a stop you already parked
   * at** — the id of that anchor. An annexed stop pays walking minutes and no
   * parking buffer, and the car stays at the anchor until the pocket is done.
   * See docs/10 §4.3 and `data/graph.ts`.
   */
  anchor?: string;
  [k: string]: unknown;
}

export interface Itinerary {
  stops: Stop[];
  totals: {
    travel: number;
    visit: number;
    wait: number;
    park: number;
    meal: number;
    km: number;
    total: number;
  };
  meta: Record<string, unknown>;
  /** unused POIs that still fit the spare time (nearby-fit suggestions) */
  suggest?: { id: string; addMin: number }[];
}

/** A location the trip can start/end at — coords plus optional human label and places-index ref. */
export interface GeoPoint {
  lat: number;
  lng: number;
  label?: string;
  ref?: string; // id into places-index, when chosen from the curated list
}

export interface Plan {
  step: number;
  mins: number | null;
  label: string | Loc;
  startType: string;
  start: GeoPoint;
  endType: string;
  end: GeoPoint;
  themes: string[];
  mode: string; // primary mode (back-compat with the engine)
  modes: string[]; // all selected modes (≥1); enables per-leg multi-modal later
  pace: string;
  who: string;
  opts: Record<string, boolean>;
  res: Itinerary | null;
  alts: { it: Itinerary; [k: string]: unknown }[];
  startClock: number | null;
  date: string;
  /** nights+1 — how many calendar days the visit spans (1 = a day trip). */
  days: number;
  endManual?: boolean; // true once the user sets the end themselves (stops start-mirroring)
  /** id of the saved record this plan is, once it has been built and kept */
  savedId?: string;
  multi?: { days: Itinerary[]; totals: Itinerary["totals"]; meta: Record<string, unknown> } | null;
  day?: number;
}

export interface Journey {
  stops: Stop[];
  i: number;
  _r?: unknown;
}
