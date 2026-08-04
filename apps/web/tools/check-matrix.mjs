// Self-check for the routing matrix — the file nobody reads and everything
// trusts. A wrong number here does not crash anything; it quietly tells a
// pilgrim they have time for one more tirtha when they do not.
// Run: npm run check-matrix
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { haversine } from "../src/features/planner/routing/estimate.ts";
import { routing } from "../src/features/planner/routing/index.ts";
import { D } from "../src/data/destinations.ts";

const read = (f) => JSON.parse(readFileSync(new URL("../src/content/data/" + f, import.meta.url), "utf8"));
const M = read("matrix.json");
const places = read("places-index.json");
const at = new Map([...D, ...places].map((p) => [p.id, p]));

/* ---- the index lines up with the data ---- */

assert.equal(M.ids.length, D.length + places.length, "the matrix covers every fixed point");
M.ids.forEach((id) => assert.ok(at.has(id), `matrix names an unknown id: ${id}`));
assert.equal(new Set(M.ids).size, M.ids.length, "no id appears twice");

const n = M.ids.length;
assert.equal(M.min.length, n);
assert.equal(M.km.length, n);
M.min.forEach((row, i) => assert.equal(row.length, n, `min row ${i} is the wrong length`));
M.km.forEach((row, i) => assert.equal(row.length, n, `km row ${i} is the wrong length`));
for (let i = 0; i < n; i++) {
  assert.equal(M.min[i][i], 0, "a place is zero minutes from itself");
  assert.equal(M.km[i][i], 0);
}

/* ---- every pin is in Kurukshetra ----
   This is the check that actually catches a swapped lat/lng, and it catches it
   exactly rather than statistically: transpose 29.96/76.83 and the place lands
   in the Indian Ocean. The same box check-content applies to the places index,
   applied to everything the matrix routes between. */

const BOX = { lat: [29.6, 30.35], lng: [76.4, 77.2] };
M.ids.forEach((id) => {
  const p = at.get(id);
  assert.ok(
    p.lat >= BOX.lat[0] && p.lat <= BOX.lat[1] && p.lng >= BOX.lng[0] && p.lng <= BOX.lng[1],
    `${id} at ${p.lat},${p.lng} is outside Kurukshetra — swapped coordinates?`,
  );
});

/* and nothing here is a half-day's drive away.

   The bar was 60 km, on the reasoning that the district is 45 km across. That
   held while every pin was within a few kilometres of Thanesar. It stopped
   holding the day Pehowa's tirthas and the stations that serve them joined the
   matrix: Shahabad Markanda sits at the district's northern edge and Pehowa
   Road at its south-western one, and the road between them is 62 km because it
   goes round Thanesar rather than through the fields. Corner to corner is a
   real journey, and the four pairs that make it are all corner to corner.

   90 km is still far below anything a coordinate error produces — a pin that
   lands in the next state is hundreds of kilometres out, which is the mistake
   this is here to catch. */
const far = [];
for (let i = 0; i < n; i++)
  for (let j = 0; j < n; j++) {
    if (M.km[i][j] != null && M.km[i][j] > 90) far.push(`${M.ids[i]} → ${M.ids[j]}: ${M.km[i][j]} km`);
  }
assert.deepEqual(far, [], "a pair this far apart is not in the same district");

/* ---- and the detours are believable ----
   Only above 2 km. Below that the figure is dominated by OSRM snapping each
   pin to the nearest way and by divided carriageways: Rantuk Yaksh to Pipli
   Zoo is 0.9 km apart and 9.4 km by road one way, 3.0 km back, because NH-44
   runs between them and you cannot turn across it. Those are true numbers, and
   a band tight enough to reject them would reject the road network itself.
   Measured over this data: at 2 km the spread is 1.05–2.94. */

const MIN_STRAIGHT = 2;
const LOW = 1.0; // a road is never shorter than the great circle
/* Observed worst is 3.97 — bus-new → Pipli Zoo, 2.96 km apart and 11.74 km by
   road — and the reverse of that pair is 3.8 km. That is the NH-44 effect
   described above, now showing up above the 2 km threshold because the
   terminals sit on the highway itself: the bus stand and the zoo are on
   opposite carriageways with no turn between them, so one direction runs to
   the next interchange and back. Was 3.5, on a data set whose worst was 2.94.
   4.5 is headroom over a measured number, not a guess. */
const HIGH = 4.5;
const bad = [];
let worst = { ratio: 0 };

for (let i = 0; i < n; i++) {
  for (let j = 0; j < n; j++) {
    if (i === j) continue;
    const km = M.km[i][j];
    if (km == null) continue; // unroutable pairs fall back to the estimate
    const straight = haversine(at.get(M.ids[i]), at.get(M.ids[j]));
    if (straight < MIN_STRAIGHT) continue;
    const ratio = km / straight;
    if (ratio > worst.ratio) worst = { ratio, from: M.ids[i], to: M.ids[j], km, straight };
    if (ratio < LOW || ratio > HIGH) {
      bad.push(`${M.ids[i]} → ${M.ids[j]}: ${km} km road vs ${straight.toFixed(2)} km straight (×${ratio.toFixed(2)})`);
    }
  }
}

if (bad.length) {
  console.error(`check-matrix FAILED — ${bad.length} implausible pair(s) over ${MIN_STRAIGHT} km:`);
  bad.slice(0, 12).forEach((b) => console.error("  - " + b));
  process.exit(1);
}

/* ---- and the durations agree with the distances ----
   Above half a kilometre. Below it the one-minute floor dominates: Jyotisar
   and its sarovar are the same OSRM node, 0 km and 1 minute apart, which is
   0 km/h and perfectly correct. Those pairs are walked anyway — the scheduler
   prices them from edges.json, never from here. */

for (let i = 0; i < n; i++) {
  for (let j = 0; j < n; j++) {
    if (i === j || M.km[i][j] == null || M.min[i][j] == null) continue;
    if (M.km[i][j] < 0.5) continue;
    const kmh = M.km[i][j] / (M.min[i][j] / 60);
    assert.ok(
      kmh > 3 && kmh < 90,
      `${M.ids[i]} → ${M.ids[j]}: ${kmh.toFixed(1)} km/h is not a road speed`,
    );
  }
}

/* ---- the provider actually reads it ---- */

const brahma = D.find((d) => d.id === "brahma-sarovar");
const jyotisar = D.find((d) => d.id === "jyotisar");
const i = M.ids.indexOf("brahma-sarovar"),
  j = M.ids.indexOf("jyotisar");

assert.equal(routing.travelMin(brahma, jyotisar, "car"), M.min[i][j], "the car time comes from the matrix");
assert.equal(routing.roadKm(brahma, jyotisar), +M.km[i][j].toFixed(1), "so does the distance");

// a mode OSRM did not measure still uses the measured distance
const walk = routing.travelMin(brahma, jyotisar, "walking");
assert.ok(walk > routing.travelMin(brahma, jyotisar, "car"), "walking is slower than driving the same road");

// an arbitrary point has no row, and must fall through rather than throw
const pin = { lat: 29.97, lng: 76.84 };
assert.ok(routing.travelMin(pin, jyotisar, "car") > 0, "a dropped pin falls back to the estimate");
assert.ok(routing.roadKm(pin, brahma) > 0);

// a curated start point is matched by its places-index ref, not its coordinates
const station = places[0];
const si = M.ids.indexOf(station.id);
assert.ok(si >= 0, "the places index is in the matrix");
assert.equal(
  routing.travelMin({ lat: 0, lng: 0, ref: station.id }, brahma, "car"),
  M.min[si][M.ids.indexOf("brahma-sarovar")],
  "a start point chosen from the list is looked up by ref, so a stale coordinate cannot matter",
);

console.log(
  `check-matrix: ${n}×${n} OK — built ${M.built}, worst detour ${worst.from} → ${worst.to} ` +
    `(${worst.km} km road vs ${worst.straight.toFixed(2)} straight, ×${worst.ratio.toFixed(2)})`,
);
