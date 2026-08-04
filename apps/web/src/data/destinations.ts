import data from "@/content/data/destinations.json";
import { register } from "@/content/live";
import type { Destination } from "@/shared/types";

/**
 * The 36 tirthas. Source of truth: src/content/data/destinations.json (each
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
