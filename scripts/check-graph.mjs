// Self-check for the walk-pocket scheduler — the part that is easy to get
// quietly wrong, because a wrong answer here still looks like a valid route.
// Run: npm run check-graph
import assert from "node:assert/strict";
import { cluster, sameComplex, onFoot, walkMin } from "../src/data/graph.ts";
import { simulate } from "../src/features/planner/algorithms/schedule.ts";
import { D } from "../src/data/destinations.ts";
import { Engine } from "../src/features/planner/engine.ts";

const by = (id) => {
  const d = D.find((x) => x.id === id);
  assert.ok(d, `fixture place missing: ${id}`);
  return d;
};

const ctx = {
  start: { lat: 29.9614, lng: 76.8286 },
  end: { lat: 29.9614, lng: 76.8286 },
  mode: "car",
  weekday: 5, // a Friday — nothing in the set is shut
  visitFactor: 1,
  startClock: 9 * 60,
  parking: 6,
  breaks: [],
};

/* ---- the graph itself ---- */

// the Jyotisar complex is one place with several things inside it
assert.equal(cluster("jyotisar"), cluster("jyotisar-virat"));
assert.ok(sameComplex("jyotisar", "anubhav-kendra"));

// the museum is a walk from Brahma Sarovar, but NOT the same complex —
// this is the distinction the whole model rests on
assert.ok(!sameComplex("brahma-sarovar", "krishna-museum"));
assert.ok(onFoot("krishna-museum", "panorama"));
assert.ok(walkMin("krishna-museum", "panorama") <= 5);

// walkability must not be transitive: central Kurukshetra is dense enough
// that closure over it would claim the whole town is one car park
assert.ok(!onFoot("jyotisar", "brahma-sarovar"));

/* ---- parking is charged per car park, not per stop ---- */

const driveBoth = simulate([{ d: by("krishna-museum") }, { d: by("panorama") }], ctx);
const walkSecond = simulate(
  [{ d: by("krishna-museum") }, { d: by("panorama"), anchor: "krishna-museum" }],
  ctx,
);
assert.ok(driveBoth.valid && walkSecond.valid);
assert.equal(driveBoth.park, 12, "two driving stops pay two parking buffers");
assert.equal(walkSecond.park, 6, "one car park, one buffer");

// and the walked version is genuinely cheaper, which is the point: the second
// place stops looking unaffordable the moment the model knows you can walk it
assert.ok(
  walkSecond.used < driveBoth.used,
  `walking should cost less than driving (${walkSecond.used} vs ${driveBoth.used})`,
);

/* ---- the car stays at the anchor ---- */

// finishing inside a pocket owes a walk back to where the car is parked
assert.ok(walkSecond.walk > 0, "a pocket charges the walk out and the walk back");
assert.equal(walkSecond.cur.id, "krishna-museum", "we end up back at the car");

// driving on from a pocket departs from the anchor, not from where we stood
const onward = simulate(
  [
    { d: by("krishna-museum") },
    { d: by("panorama"), anchor: "krishna-museum" },
    { d: by("jyotisar") },
  ],
  ctx,
);
assert.ok(onward.valid);
assert.equal(onward.park, 12, "two car parks: the pocket, then Jyotisar");

/* ---- a pocket never invents time ---- */
// every leg must be accounted: used = travel + wait + visit + park
const sum = onward.stops.reduce((a, s) => a + s.wait + s.visit, 0);
assert.equal(
  Math.round(onward.used),
  Math.round(onward.travel + sum + onward.park),
  "minutes must balance",
);

/* ---- end to end: the defect this whole file exists to fix ----
   Ask for Mahabharat places and the planner must still tell you about the
   things you can walk to from the car park you are standing in, even when
   they belong to another theme. Before walk pockets, the theme was a hard
   gate and these were invisible. */
const day = Engine.build({
  budgetMin: 480,
  startClock: 9 * 60,
  start: ctx.start,
  end: ctx.end,
  weekday: 5,
  mode: "car",
  pace: "balanced",
  interests: ["mahabharata"],
  filters: {},
});

assert.ok(day.stops.length > 3, "a full day should reach more than three places");

const walked = day.stops.filter((s) => s.anchor);
assert.ok(walked.length > 0, "a full day in central Kurukshetra has walk pockets");

const offTheme = day.stops.filter((s) => !s.d.themes.includes("mahabharata"));
assert.ok(
  offTheme.length > 0,
  "a themed day must still surface what is physically on its doorstep",
);
assert.ok(
  offTheme.some((s) => s.anchor),
  "and the reason it surfaces must be that you can walk to it",
);

/* the theme must still lead — measured on the stops the visitor is DRIVEN to.
   Counting every stop equally was the wrong test: it scored the museum sixty
   metres from a car park already paid for the same as a sixteen-minute drive
   to Jyotisar, so a day that walked to five cheap neighbours "failed" for
   being too generous. A pocket stop is nearly free by construction (§3.3
   stage 2) — that is the entire point of pockets. What must never happen is
   the planner *driving* somewhere off-theme, and that is what this asserts. */
const driven = day.stops.filter((s) => !s.anchor);
const drivenOff = driven.filter((s) => !s.d.themes.includes("mahabharata"));
assert.ok(
  drivenOff.length * 2 <= driven.length,
  `a Mahabharat day must drive to Mahabharat places (${driven.length - drivenOff.length} on, ${drivenOff.length} off)`,
);

// and the day must actually reach the places the theme is named for
const reached = new Set(day.stops.map((s) => s.d.id));
assert.ok(
  ["jyotisar", "sannihit-sarovar", "bhishma-kund"].filter((id) => reached.has(id)).length >= 2,
  "a full Mahabharat day must reach at least two of the battlefield's own tirthas",
);

// parking charged per car park, never per stop
assert.ok(
  day.totals.park < day.stops.length * ctx.parking,
  "a day with pockets pays fewer parking buffers than it has stops",
);

console.log(
  `check-graph: all assertions passed  (${day.stops.length} stops, ` +
    `${walked.length} walked, ${offTheme.length} off-theme)`,
);

/* ---- the walk pocket has to name the right vehicle ----
   "Leave the car and walk" is perfectly good English and completely wrong if
   the visitor chose the bus. A screenshot cannot catch it; this can. */
import { S } from "../src/app/state.ts";
import { leaveVehicle, leaveVehicleShort } from "../src/features/route/mode-words.ts";

const withMode = (m, fn) => {
  const before = S.plan;
  S.plan = { ...(before || {}), mode: m };
  try {
    return fn();
  } finally {
    S.plan = before;
  }
};

assert.match(withMode("car", leaveVehicle), /car/i);
assert.match(withMode("public", leaveVehicle), /off/i);
assert.doesNotMatch(withMode("public", leaveVehicle), /car|bike/i, "a bus passenger has no car to leave");
assert.doesNotMatch(withMode("twowheeler", leaveVehicleShort), /car/i);
assert.doesNotMatch(withMode("walking", leaveVehicle), /car|bike|off/i, "someone on foot leaves nothing");
assert.doesNotMatch(withMode("erickshaw", leaveVehicle), /car/i);

console.log("check-graph: vehicle wording follows the mode");
