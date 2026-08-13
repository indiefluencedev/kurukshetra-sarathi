// Precompute the road-distance matrix, once, at authoring time.
//
// Every "how long from here to there" in the app used to be a great-circle
// distance multiplied by 1.35. That is fine for ORDERING stops and wrong for
// telling a sixty-eight-year-old they have twenty minutes: Kurukshetra's grid
// is not a plane, and the 1.35 fudge is 1.1 on the GT Road and 1.9 crossing the
// sarovars. This asks OSRM for the real thing and freezes the answer in the
// bundle, so the planner stays instant and offline. See docs/10 §2.3–2.4.
//
// Run:  npm run build-matrix        (needs network; nothing else does)
//
// ONE FILE, NOT ONE PER MODE. The public OSRM demo ignores the profile in the
// URL — /foot/ and /driving/ return byte-identical numbers — so six per-mode
// files would be six copies of the car's. Instead we keep the real road
// DISTANCE, which is mode-independent, and let the provider divide it by the
// mode's speed. The distance is measured; only the speed is estimated, which
// is the honest split.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const SRC = new URL("../src/content/data/", import.meta.url);
const OUT = new URL("../src/content/data/matrix.json", import.meta.url);
const read = (f) => JSON.parse(readFileSync(new URL(f, SRC), "utf8"));

// OSRM's public demo. Free, no key, best-effort — and only ever called here,
// never from the app's plan path.
const BASE = "https://router.project-osrm.org/table/v1/driving/";

const dests = read("destinations.json");
const places = read("places-index.json");
/* Stays are start points too — the planner asks this matrix by `ref`, so a day
   that begins at a dharamshala gets the measured road time rather than the
   great-circle guess. Only the ones with a pin: most of the catalogue is
   waiting for someone to place it (see the stays block in check-content), and
   a point with no coordinate has nothing to ask OSRM about. Re-run this after
   pinning one, or its travel times stay estimated. */
const stays = read("hotels.json").filter((s) => s.lat != null && s.lng != null);

/* Pending places are in the matrix even though the planner will not route to
   them: the row costs 300 bytes, and leaving a hole means renumbering every
   index the day someone verifies the pin. */
const points = [...dests, ...places, ...stays].map((p) => ({ id: p.id, lat: p.lat, lng: p.lng }));

const dupe = points.map((p) => p.id).filter((id, i, a) => a.indexOf(id) !== i);
if (dupe.length) {
  console.error("build-matrix: id collision between destinations and places-index: " + dupe.join(", "));
  process.exit(1);
}

const coords = points.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(";");
const url = `${BASE}${coords}?annotations=duration,distance`;

console.log(`build-matrix: asking OSRM for ${points.length}×${points.length} = ${points.length ** 2} pairs…`);

const res = await fetch(url);
if (!res.ok) {
  console.error(`build-matrix: OSRM said ${res.status} ${res.statusText}`);
  console.error("  The demo server rate-limits. Wait a minute and run it again.");
  process.exit(1);
}
const j = await res.json();
if (j.code !== "Ok" || !j.durations || !j.distances) {
  console.error("build-matrix: unusable response: " + (j.message || j.code));
  process.exit(1);
}

/* OSRM answers in seconds and metres, and it snaps each coordinate to the
   nearest routable way. A pin that snaps a long way off is a bad pin, not a
   bad road — say so rather than baking it in. */
const FAR_SNAP_M = 700;
const strayed = j.destinations
  .map((d, i) => ({ id: points[i].id, m: Math.round(d.distance) }))
  .filter((x) => x.m > FAR_SNAP_M);
if (strayed.length) {
  console.warn(`build-matrix: ${strayed.length} pin(s) snapped far from any road — check the coordinates:`);
  strayed.forEach((x) => console.warn(`  · ${x.id}: ${x.m} m`));
}

const n = points.length;
const min = [];
const km = [];
for (let i = 0; i < n; i++) {
  min[i] = [];
  km[i] = [];
  for (let jx = 0; jx < n; jx++) {
    if (i === jx) {
      min[i][jx] = 0;
      km[i][jx] = 0;
      continue;
    }
    const secs = j.durations[i][jx];
    const metres = j.distances[i][jx];
    // null means OSRM found no route — leave the estimate to cover it
    min[i][jx] = secs == null ? null : Math.max(1, Math.round(secs / 60));
    km[i][jx] = metres == null ? null : +(metres / 1000).toFixed(2);
  }
}

const holes = min.flat().filter((v) => v === null).length;
if (holes) console.warn(`build-matrix: ${holes} pair(s) unroutable — those fall back to the estimate`);

mkdirSync(dirname(OUT.pathname), { recursive: true });
writeFileSync(
  OUT,
  JSON.stringify({
    built: new Date().toISOString().slice(0, 10),
    source: "OSRM public demo, driving profile",
    ids: points.map((p) => p.id),
    min,
    km,
  }) + "\n",
);

const bytes = readFileSync(OUT).length;
console.log(`build-matrix: wrote ${n}×${n} to src/content/data/matrix.json (${Math.round(bytes / 1024)} KB)`);
console.log("  now run: npm run check-matrix");
