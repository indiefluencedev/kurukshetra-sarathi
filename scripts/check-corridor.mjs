// Self-check for the drive guide's geometry. Left and right are the one thing
// here that cannot be eyeballed from a screenshot and will be wrong in a way
// nobody notices until a visitor looks out of the wrong window.
// Run: npm run check-corridor
import assert from "node:assert/strict";
import { locate, lineLength, passingPlaces, CORRIDOR_M } from "../src/features/journey/corridor.ts";
import { D } from "../src/data/destinations.ts";
import { PLACES_INDEX } from "../src/data/places-index.ts";

/* A road running due north from the town centre. In this frame, east is
   +lng and north is +lat, so a place to the EAST of a northbound road is on
   the driver's RIGHT. */
const north = [
  { lat: 29.96, lng: 76.83 },
  { lat: 29.98, lng: 76.83 },
];

const east = { lat: 29.97, lng: 76.8315 };
const west = { lat: 29.97, lng: 76.8285 };

assert.equal(locate(east, north).side, "right", "east of a northbound road is on the right");
assert.equal(locate(west, north).side, "left", "west of a northbound road is on the left");

// drive the same road the other way and the sides must swap
const south = [...north].reverse();
assert.equal(locate(east, south).side, "left", "the same place is on the other side going back");
assert.equal(locate(west, south).side, "right");

/* ---- along and offset ---- */
const mid = locate(east, north);
const total = lineLength(north);
assert.ok(Math.abs(mid.along - total / 2) < 20, "halfway up the road is halfway along it");
// 0.0015° of longitude at this latitude is ~145m
assert.ok(mid.offset > 100 && mid.offset < 200, `offset ~145m, got ${Math.round(mid.offset)}`);

// a degenerate line has no sides
assert.equal(locate(east, [{ lat: 29.96, lng: 76.83 }]), null);

/* ---- ordering and the corridor cutoff ---- */
const near = { id: "near", lat: 29.965, lng: 76.8305, themes: [], visit: { rec: 10, min: 5, max: 20 } };
const far = { id: "far", lat: 29.975, lng: 76.8302, themes: [], visit: { rec: 10, min: 5, max: 20 } };
const miles = { id: "miles", lat: 29.97, lng: 76.92, themes: [], visit: { rec: 10, min: 5, max: 20 } };

const found = passingPlaces(north, [far, miles, near], new Set());
assert.deepEqual(
  found.map((p) => p.id),
  ["near", "far"],
  "announced in the order you meet them, and nothing beyond the corridor",
);
assert.ok(found.every((p) => p.offset <= CORRIDOR_M));

// a place already on the itinerary is never announced as a passing sight
assert.deepEqual(passingPlaces(north, [near, far], new Set(["near"])).map((p) => p.id), ["far"]);

// a place whose pin is not yet verified is never announced at all
const unsure = { ...near, id: "unsure", pending: true };
assert.deepEqual(passingPlaces(north, [unsure], new Set()), []);

console.log("check-corridor: all assertions passed");

/* ── the first leg is a leg ──────────────────────────────────────────────────
   The drive guide is handed the previous stop and the current one. On the FIRST
   stop there is no previous, and the caller used to pass the current stop
   twice — a zero-length line, no corridor, nothing announced. Which meant the
   one leg a visitor is most likely to be driving cold, from the bus stand or
   the station into town, was the one leg that stayed silent. It now runs from
   the plan's start point.

   Asserted on the real bus stand → Brahma Sarovar run, because that is the
   journey this was reported on. Every hit must also carry a description: the
   announcement says what a place IS, not just its name, and a place with an
   empty `short` would be read out as a bare label. */
{
  const stand = PLACES_INDEX.find((p) => p.kind === "busstand");
  const brahma = D.find((d) => d.id === "brahma-sarovar");
  assert.ok(stand && brahma, "the fixture places must exist");

  const sameEnds = passingPlaces(
    [{ lat: brahma.lat, lng: brahma.lng }, { lat: brahma.lat, lng: brahma.lng }],
    D,
    new Set(),
  );
  assert.equal(sameEnds.length, 0, "a leg with both ends at one place has no corridor — this was the bug");

  const leg = [{ lat: stand.lat, lng: stand.lng }, { lat: brahma.lat, lng: brahma.lng }];
  const seen = passingPlaces(leg, D, new Set([brahma.id]));
  assert.ok(seen.length >= 3, `the bus stand run should pass several places, got ${seen.length}`);
  assert.ok(
    seen.some((p) => p.id === "nabha-house"),
    "Nabha House sits beside this road and must be announced",
  );
  for (const p of seen) {
    const d = D.find((x) => x.id === p.id);
    assert.ok(d.short?.en && d.short?.hi, `${p.id} is announced, so it needs a description in both languages`);
  }
}

console.log("first-leg guide checks passed");
