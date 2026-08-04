import data from "@/content/data/places-index.json";
import { register } from "@/content/live";
import type { Loc } from "@/shared/types";

// Curated start/end points for the planner (stations, bus stands, stays).
// Source of truth: src/content/data/places-index.json. See docs/04.
export type PlaceKind = "station" | "busstand" | "hotel" | "dharamshala";
export interface IndexPlace {
  id: string;
  kind: PlaceKind;
  /** which town it serves — see data/cities.ts. Absent means Kurukshetra. */
  city?: string;
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

/**
 * `let`, not `const`, for the same reason as D and EVENTS: a bus stand that
 * moves to a new site, or a yatri niwas that changes its phone number, should
 * not need a release. The bundled copy is the floor — it renders first and
 * stays in force if the network never answers. See content/live.ts.
 */
export let PLACES_INDEX = data as unknown as IndexPlace[];
register<IndexPlace>("startpoints", (items) => {
  // Same guard as the places feed: an endpoint answering with half the list is
  // a half-finished import, and quietly shrinking the start points a visitor
  // can pick from is worse than ignoring the update.
  if (items.length < (data as unknown as IndexPlace[]).length / 2) return;
  PLACES_INDEX = items;
});

export const byIndexId = (id?: string): IndexPlace | undefined =>
  id ? PLACES_INDEX.find((p) => p.id === id) : undefined;

/** Places of a given kind, filtered by a free-text query over either language. */
export function searchIndex(kind: PlaceKind, q: string): IndexPlace[] {
  const needle = q.trim().toLowerCase();
  return PLACES_INDEX.filter((p) => p.kind === kind).filter(
    (p) => !needle || (p.name.en + " " + p.name.hi).toLowerCase().includes(needle),
  );
}
