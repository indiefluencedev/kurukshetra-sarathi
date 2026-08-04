// Live place lookup — hotels, dharamshalas, stations, bus stands — over
// OpenStreetMap. Both endpoints are free and need no key or billing account,
// which is why they're here instead of Google Places:
//   • Overpass  — "list every guest house near Kurukshetra" (browse, no typing)
//   • Nominatim — "find the one called Neelkanth" (free text)
// The curated index in places-index.json still wins: those coordinates are
// verified, they work offline, and they answer instantly. OSM only fills the
// long tail. Both services are community-run and rate-limited, so every call is
// debounced by the caller, cached here, and failure is silent — the curated
// list is always a working answer on its own.
import { city } from "@/app/state";
import type { PlaceKind } from "@/data/places-index";

export interface FoundPlace {
  id: string;
  kind: PlaceKind;
  name: string;
  detail?: string;
  lat: number;
  lng: number;
  osm: true;
}

// Kurukshetra district, as its actual administrative boundary: OSM relation
// 1942848 (Overpass area ids are 3600000000 + the relation id). A radius around
// the town centre is the wrong shape — 20km of it lands in Karnal, which is how
// Nilokheri station and a Karnal hotel ended up being offered for a Kurukshetra
// itinerary. The boundary can't make that mistake.
const AREA = 3601942848;
const DISTRICT = "Kurukshetra";
// Nominatim can't take a polygon, so it gets the bounding box and then every
// result is checked against the district name it reports.
//
// The district, not the town: this used to be derived from a single hardcoded
// centre, and once Pehowa became a town you could plan from, a box drawn round
// whichever town happened to be active cut off the other end of the district —
// Pehowa's box stops short of Pipli, and Kurukshetra's stops short of nothing
// only by luck. The district is fixed, so the box is a constant.
const BOX = [76.40, 30.25, 77.15, 29.60].map((n) => n.toFixed(4)).join(",");

/** OSM tags per kind — what "a hotel" or "a bus stand" actually is in OSM.
    Exact key=value only. A tag-value regex is slower and a bare `["name"~"…"]`
    is an unindexed scan of the whole area that times Overpass out at 47s, so
    names are Nominatim's job (below) and never Overpass's. */
const TAGS: Record<PlaceKind, string[]> = {
  // no `hostel` — around here that tag is university halls, not a place to stay
  hotel: ['"tourism"="hotel"', '"tourism"="motel"', '"tourism"="guest_house"'],
  // Dharamshalas are barely tagged at all; shelter is the closest indexed
  // signal, and the name search below finds the rest.
  dharamshala: ['"amenity"="shelter"', '"tourism"="guest_house"'],
  station: ['"railway"="station"'],
  busstand: ['"amenity"="bus_station"'],
};

/** What to ask Nominatim when the box is empty — Overpass alone is thin here. */
const SEED: Record<PlaceKind, string> = {
  hotel: "hotel",
  dharamshala: "dharamshala",
  station: "railway station",
  busstand: "bus stand",
};

const cache = new Map<string, FoundPlace[]>();

async function json(url: string, signal?: AbortSignal): Promise<any> {
  const r = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

/**
 * Everything of these kinds around Kurukshetra — the list you get before typing.
 * Both sources, because neither is enough on its own: Overpass has the reliable
 * category tags but thin coverage here, and Nominatim has the places people
 * actually named but only answers questions.
 */
export async function browseNearby(kinds: PlaceKind[], signal?: AbortSignal): Promise<FoundPlace[]> {
  const key = "browse:" + kinds.join(",");
  const hit = cache.get(key);
  if (hit) return hit;

  const both = await Promise.allSettled([
    overpass(kinds, signal),
    ...kinds.map((k) => searchNearby(SEED[k], signal, k)),
  ]);
  const all = both.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  if (both.every((r) => r.status === "rejected")) throw (both[0] as PromiseRejectedResult).reason;

  const seen = new Set<string>();
  const uniq = all.filter((p) => !seen.has(p.name) && seen.add(p.name));
  uniq.sort((a, b) => dist(a) - dist(b));
  cache.set(key, uniq);
  return uniq;
}

async function overpass(kinds: PlaceKind[], signal?: AbortSignal): Promise<FoundPlace[]> {
  const body = [...new Set(kinds.flatMap((k) => TAGS[k]))]
    .flatMap((tag) => [`node[${tag}](area.k);`, `way[${tag}](area.k);`])
    .join("");
  const q = `[out:json][timeout:60];area(${AREA})->.k;(${body});out center 60;`;
  const data = await json("https://overpass-api.de/api/interpreter?data=" + encodeURIComponent(q), signal);

  return ((data.elements || []) as any[])
    .map((el) => {
      const lat = el.lat ?? el.center?.lat,
        lng = el.lon ?? el.center?.lon;
      const name = el.tags?.name;
      if (!name || lat == null || lng == null) return null;
      const tg = el.tags;
      return {
        id: "osm:" + el.type + "/" + el.id,
        kind: kindOf(tg, kinds),
        name,
        // a station's code is what you book a ticket against; for anything else
        // the town is what tells you whether it's near or half an hour out
        detail: tg["railway:ref"] || tg.ref || tg["addr:city"] || tg["addr:suburb"] || tg["addr:street"],
        lat,
        lng,
        osm: true as const,
      };
    })
    .filter(Boolean) as FoundPlace[];
}

/** Free-text search, bounded to the Kurukshetra box so "Krishna" can't return Mathura. */
export async function searchNearby(q: string, signal?: AbortSignal, kind: PlaceKind = "hotel"): Promise<FoundPlace[]> {
  const needle = q.trim();
  if (needle.length < 3) return [];
  const key = "q:" + kind + ":" + needle.toLowerCase();
  const hit = cache.get(key);
  if (hit) return hit;

  const url =
    "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=12&bounded=1&addressdetails=1" +
    "&viewbox=" + BOX + "&q=" + encodeURIComponent(needle);
  const data = await json(url, signal);

  const out: FoundPlace[] = (data || [])
    // the box overlaps Karnal and Kaithal; the district each result reports is
    // what decides whether it belongs in a Kurukshetra itinerary
    .filter((r: any) => r.address?.state_district === DISTRICT || r.address?.county === DISTRICT)
    .map((r: any) => {
      const a = r.address || {};
      return {
        id: "osm:" + r.osm_type + "/" + r.osm_id,
        kind,
        name: (r.name as string) || String(r.display_name).split(",")[0],
        // the town is what a traveller needs — "Pehowa" tells them it's 25km out
        detail: [a.city || a.town || a.village || a.suburb, a.county].filter((x, i, l) => x && l.indexOf(x) === i).join(", "),
        lat: +r.lat,
        lng: +r.lon,
        osm: true as const,
      };
    });
  cache.set(key, out);
  return out;
}

function kindOf(tags: any, want: PlaceKind[]): PlaceKind {
  if (tags.railway === "station") return "station";
  if (tags.amenity === "bus_station") return "busstand";
  if (tags.tourism) return "hotel";
  return want.includes("dharamshala") ? "dharamshala" : want[0];
}

const dist = (p: FoundPlace) => (p.lat - city().centre.lat) ** 2 + (p.lng - city().centre.lng) ** 2;
