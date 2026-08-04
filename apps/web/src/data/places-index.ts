import data from "@/content/data/places-index.json";
import type { Loc } from "@/shared/types";

// Curated start/end points for the planner (stations, bus stands, stays).
// Source of truth: src/content/data/places-index.json. See docs/04.
export type PlaceKind = "station" | "busstand" | "hotel" | "dharamshala";
export interface IndexPlace {
  id: string;
  kind: PlaceKind;
  name: Loc;
  lat: number;
  lng: number;
  /** the locality — "Sector 13" / "Pehowa". What tells a visitor how far out it is. */
  area?: Loc;
  /** station code for a railway station (KKDE, SHDM) — what a ticket is booked against */
  code?: string;
  phone?: string;
  /** ISO date the coordinates were last checked against a map by a human */
  checked?: string;
  /** true once a person has confirmed the pin lands on the actual gate */
  verified?: boolean;
}

export const PLACES_INDEX = data as unknown as IndexPlace[];

export const byIndexId = (id?: string): IndexPlace | undefined =>
  id ? PLACES_INDEX.find((p) => p.id === id) : undefined;

/** Places of a given kind, filtered by a free-text query over either language. */
export function searchIndex(kind: PlaceKind, q: string): IndexPlace[] {
  const needle = q.trim().toLowerCase();
  return PLACES_INDEX.filter((p) => p.kind === kind).filter(
    (p) => !needle || (p.name.en + " " + p.name.hi).toLowerCase().includes(needle),
  );
}
