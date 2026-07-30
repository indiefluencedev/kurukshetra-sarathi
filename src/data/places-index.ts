import type { Loc } from "@/shared/types";

// Curated start/end points for the planner (Steps 2 & 3): the town's stations,
// bus stands, and notable stays. Searchable; not tourist POIs (those are in D).
//
// coords marked `verified:false` are best-estimate and should be snapped to the
// real point (Phase 2 build script can resolve them from Google Place IDs).
export type PlaceKind = "station" | "busstand" | "hotel" | "dharamshala";

export interface IndexPlace {
  id: string;
  kind: PlaceKind;
  name: Loc;
  lat: number;
  lng: number;
  verified?: boolean;
}

export const PLACES_INDEX: IndexPlace[] = [
  // ---- Railway stations (Kurukshetra has 2) ----
  { id: "stn-kkde", kind: "station", name: { en: "Kurukshetra Junction", hi: "कुरुक्षेत्र जंक्शन" }, lat: 29.9772, lng: 76.834, verified: false },
  { id: "stn-thc", kind: "station", name: { en: "Thanesar City", hi: "थानेसर सिटी" }, lat: 29.954, lng: 76.829, verified: false },

  // ---- Bus stands (2) ----
  { id: "bus-new", kind: "busstand", name: { en: "New Bus Stand (Sector 13)", hi: "नया बस अड्डा (सेक्टर 13)" }, lat: 29.976, lng: 76.842, verified: false },
  { id: "bus-pipli", kind: "busstand", name: { en: "Pipli Bus Stand", hi: "पिपली बस अड्डा" }, lat: 29.933, lng: 76.868, verified: false },

  // ---- Stays (seed; extend from the tourism board's list) ----
  { id: "stay-neelkanthi", kind: "hotel", name: { en: "Neelkanthi Krishna Dham Yatri Niwas", hi: "नीलकंठी कृष्ण धाम यात्री निवास" }, lat: 29.9625, lng: 76.8262, verified: false },
  { id: "stay-parashar", kind: "dharamshala", name: { en: "Parashar Tourist Complex", hi: "पराशर पर्यटक परिसर" }, lat: 29.9601, lng: 76.8305, verified: false },
];

export const byIndexId = (id?: string): IndexPlace | undefined =>
  id ? PLACES_INDEX.find((p) => p.id === id) : undefined;

/** Places of a given kind, filtered by a free-text query over either language. */
export function searchIndex(kind: PlaceKind, q: string): IndexPlace[] {
  const needle = q.trim().toLowerCase();
  return PLACES_INDEX.filter((p) => p.kind === kind).filter(
    (p) => !needle || (p.name.en + " " + p.name.hi).toLowerCase().includes(needle),
  );
}
