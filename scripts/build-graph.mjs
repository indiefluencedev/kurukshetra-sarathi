// Derive the candidate place graph from the coordinates already in the repo.
//
//   npm run build-graph
//
// Writes src/content/data/edges.json — the relationships between places that
// the planner cannot work out from a straight line: what shares one gate, what
// you can walk between, and how long that walk actually takes.
//
// WHY THIS EXISTS
// The scheduler used to charge a full parking buffer and a car leg for every
// stop, including two tirthas sixty metres apart. So a visitor who had asked
// for Mahabharat places would be routed past the Krishna Museum's front door
// and never offered it, because "another stop" cost six minutes of parking it
// did not actually cost. Distance alone cannot say that. This file can.
//
// WHAT IT IS AND IS NOT
// Everything here is DERIVED from lat/lng, so it is a starting point, not an
// answer. `verified: false` means no human has walked it. A derived edge is
// safe to use — the worst case is that the walk is longer than the crow flies,
// which the road factor already allows for — but only a person can say that
// the "walk" crosses a railway line with no footbridge, or that two pins forty
// metres apart are on opposite banks of a sarovar. Those are the corrections
// worth making by hand, and they are the ones that make the app feel local.
//
// Edges are undirected and written once, with `a` < `b` by id.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEST = join(HERE, "../src/content/data/destinations.json");
const INDEX = join(HERE, "../src/content/data/places-index.json");
const OUT = join(HERE, "../src/content/data/edges.json");

/* ---- the two thresholds, and why they are what they are ----
   These are calibration knobs, not constants of nature. Tune them against
   real ground, not against what looks tidy in a diff.

   SAME_COMPLEX — one ticket gate, one car park, usually one boundary wall.
   150m is what separates "the Gurudwara on the Brahma Sarovar embankment"
   (6m) from "the museum across the road" (612m).

   WALKABLE — far enough to be worth walking from where you already parked,
   near enough that an elderly pilgrim will actually do it. 500m is ~7 minutes
   each way. Do not raise this without asking who is walking: the audience is
   in their sixties and seventies, in Haryana heat, and a 900m "walk" that
   looks reasonable on a map is a 25-minute round trip in the sun. */
const SAME_COMPLEX = 150;
const WALKABLE = 500;

/** Walking is 4.5 km/h; footpaths cut corners a car cannot, so 1.2 not 1.35. */
const WALK_KMH = 4.5;
const WALK_FACTOR = 1.2;

const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;
function metres(a, b) {
  const dLat = rad(b.lat - a.lat),
    dLng = rad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

const walkMin = (m) => Math.max(1, Math.round(((m * WALK_FACTOR) / 1000 / WALK_KMH) * 60));

const dest = JSON.parse(readFileSync(DEST, "utf8"));
const index = JSON.parse(readFileSync(INDEX, "utf8"));
// Anchors (stations, stays) join the same graph: a hotel two hundred metres
// from a tirtha is a walkable first leg, and saying so is free.
const nodes = [
  ...dest.map((d) => ({ id: d.id, lat: d.lat, lng: d.lng, name: d.name, kind: "destination" })),
  ...index.map((p) => ({ id: p.id, lat: p.lat, lng: p.lng, name: p.name, kind: p.kind })),
].filter((n) => n.lat && n.lng);

/* keep whatever a human has already corrected — this script must never be able
   to undo hand-verified work by being run again */
let previous = [];
try {
  previous = JSON.parse(readFileSync(OUT, "utf8"));
} catch {
  /* first run */
}
const kept = new Map();
previous.filter((e) => e.verified).forEach((e) => kept.set(e.a + "|" + e.b, e));

const edges = [];
for (let i = 0; i < nodes.length; i++) {
  for (let j = i + 1; j < nodes.length; j++) {
    const [a, b] = nodes[i].id < nodes[j].id ? [nodes[i], nodes[j]] : [nodes[j], nodes[i]];
    const m = Math.round(metres(a, b));
    if (m > WALKABLE) continue;

    const key = a.id + "|" + b.id;
    if (kept.has(key)) {
      edges.push(kept.get(key));
      continue;
    }
    edges.push({
      a: a.id,
      b: b.id,
      rel: m <= SAME_COMPLEX ? "same-complex" : "walkable",
      m,
      min: { walking: walkMin(m) },
      verified: false,
      _names: a.name.en + " ↔ " + b.name.en,
      _check: `https://www.google.com/maps/dir/${a.lat},${a.lng}/${b.lat},${b.lng}/data=!4m2!4m1!3e2`,
    });
  }
}
edges.sort((x, y) => x.a.localeCompare(y.a) || x.b.localeCompare(y.b));

writeFileSync(OUT, JSON.stringify(edges, null, 1) + "\n");

const complex = edges.filter((e) => e.rel === "same-complex").length;
console.log(
  `${edges.length} edges → ${OUT.split("/").slice(-1)[0]}\n` +
    `  ${complex} same-complex, ${edges.length - complex} walkable\n` +
    `  ${edges.filter((e) => e.verified).length} verified by a human\n` +
    `\nOpen the _check links and confirm each walk is real. A pin on the far\n` +
    `bank of a sarovar is 40m away and a 900m walk round it.`,
);
