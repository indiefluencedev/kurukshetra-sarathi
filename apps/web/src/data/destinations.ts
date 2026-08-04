import data from "@/content/data/destinations.json";
import { register } from "@/content/live";
import { S } from "@/app/state";
import { cityOf, isAll, nearestCityTo } from "@/data/cities";
import { THEMES } from "@/data/config";
import type { Destination, ThemeDef } from "@/shared/types";

/**
 * The 57 tirthas of the two towns. Source of truth:
 * src/content/data/destinations.json (each
 * text field is { en, hi } so a place can't be added without its Hindi). See
 * docs/04.
 *
 * `let`, not `const`, for the same reason as EVENTS: the Board maintains this
 * and a corrected opening time should not need a release. The bundled copy is
 * the floor — it renders first and remains in force if the network never
 * answers. See content/live.ts and docs/13.
 *
 * A place that arrives live and is NOT in the bundled distance matrix still
 * plans correctly: `CachedProvider.idx()` returns -1 for an unknown id and the
 * leg falls through to EstimateProvider, which is the same path a hotel or a
 * dropped pin already takes. It is estimated rather than measured, so run
 * `npm run build-matrix` before a new place matters enough to be exact.
 */
export let D = data as unknown as Destination[];
register<Destination>("places", (items) => {
  // Guard the floor: an endpoint that answers with fewer places than the
  // bundle almost certainly means a half-finished import, and silently
  // shrinking the catalogue is worse than ignoring the update. live.ts already
  // refuses an empty list; this refuses a suspicious one.
  if (items.length < (data as unknown as Destination[]).length / 2) return;
  D = items;
});

/**
 * The places of the town currently chosen — what every list on screen shows.
 *
 * A function, not a constant: `D` is replaced when live content lands and
 * `S.city` changes under the user, so anything captured at module load would
 * be one town behind. The engine, the map and the search all call this; `D`
 * itself stays available for the few things that are genuinely cross-town
 * (resolving a saved id, counting what is saved elsewhere).
 */
export const DC = (): Destination[] =>
  isAll(S.city) ? D.slice() : D.filter((d) => cityOf(d) === S.city);

/**
 * The places a ROUTE may draw from, given where it sets off.
 *
 * Browsing both towns is a browsing decision; it is not a claim that a single
 * day can hold both. Thanesar and Pehowa are 25 km and fifty minutes apart, so
 * a pool spanning them lets the planner spend two hours of an eight-hour day
 * driving between two halves of an itinerary nobody asked to split. When a
 * town is chosen, that town is the pool. When both are, the START decides —
 * a day is built around where it begins.
 */
export const DP = (from: { lat: number; lng: number }): Destination[] => {
  if (!isAll(S.city)) return DC();
  const id = nearestCityTo(from).id;
  return D.filter((d) => cityOf(d) === id);
};

/**
 * The themes that actually have places in the town on screen, with counts.
 *
 * The grid used to render all of THEMES unconditionally, and once there were
 * two towns that put a full-bleed photograph on Home captioned "Nature ·
 * 0 places" — a tile that looks like every other tile and opens an empty
 * screen. A theme is a way into the catalogue; one with nothing behind it is
 * not a way into anything, so it is not offered.
 *
 * The count comes back with the theme because every caller needs both and
 * recomputing it is the kind of thing that drifts.
 */
export const themesHere = (): { th: ThemeDef; n: number }[] => {
  const here = DC();
  return THEMES.map((th) => ({ th, n: here.filter((d) => d.themes.indexOf(th.id) >= 0).length })).filter(
    (x) => x.n > 0,
  );
};
