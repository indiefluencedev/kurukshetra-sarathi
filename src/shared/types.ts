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

export interface HeroItem {
  id: string;
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
  endManual?: boolean; // true once the user sets the end themselves (stops start-mirroring)
  multi?: { days: Itinerary[]; totals: Itinerary["totals"]; meta: Record<string, unknown> } | null;
  day?: number;
}

export interface Journey {
  stops: Stop[];
  i: number;
  _r?: unknown;
}
