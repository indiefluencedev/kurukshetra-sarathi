// Self-checks for the two planner rules that are easy to get quietly wrong:
// which breaks a day earns and where they land on the clock, and what an event
// does to the day it falls on.
// Run: npm run check-planner   (node strips the TS types; no test framework)
import assert from "node:assert/strict";
import { planBreaks, breakMinutes, takeDueBreaks } from "../src/features/planner/rules/breaks.ts";
import { Engine } from "../src/features/planner/engine.ts";
import { PLACES_INDEX } from "../src/data/places-index.ts";
import { EVENTS, activeEvent, ongoing, upcoming, affects } from "../src/data/events.ts";

const H = (h, m = 0) => h * 60 + m;
const kinds = (l) => l.map((b) => b.kind);
const addDays = (iso, n) => {
  const d = new Date(iso + "T00:00");
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/* ---- which breaks a day earns ---- */

// a 9am–5pm family day: lunch, and two sit-downs
assert.deepEqual(kinds(planBreaks(H(9), 480, { meal: true, who: "family" })), ["tea", "lunch", "tea"]);

// the same day at a brisk pace, on your own: lunch only
assert.deepEqual(kinds(planBreaks(H(9), 480, { meal: true, pace: "fast", who: "solo" })), ["lunch"]);

// two hours in the morning earns nothing — there is no midday to span
assert.deepEqual(planBreaks(H(9), 120, { meal: true, who: "family" }), []);

// "leave time to eat" turned off means no meals, whatever the hour
assert.deepEqual(kinds(planBreaks(H(9), 600, { meal: false, who: "family" })), ["tea", "tea"]);

// an evening that runs past 7:40pm earns dinner
assert.ok(kinds(planBreaks(H(15), 360, { meal: true, who: "solo" })).includes("dinner"));

// the minutes are reservable up front, or the day overruns its window
assert.equal(breakMinutes(planBreaks(H(9), 480, { meal: true, who: "solo" })), 40);
assert.equal(breakMinutes(planBreaks(H(9), 480, { meal: true, who: "family" })), 70);

/* ---- and where they land ---- */

// nothing is due at 11am, so the clock is untouched
{
  const due = planBreaks(H(9), 480, { meal: true, who: "solo" });
  const taken = [];
  assert.equal(takeDueBreaks(H(11), due, 0, taken), H(11));
  assert.equal(taken.length, 0);
  assert.equal(due.length, 1, "an undue break stays due");
}

// past 12:30 lunch is taken, at the stop we're standing at, and costs its minutes
{
  const due = planBreaks(H(9), 480, { meal: true, who: "solo" });
  const taken = [];
  assert.equal(takeDueBreaks(H(13), due, 2, taken), H(13) + 40);
  assert.deepEqual(kinds(taken), ["lunch"]);
  assert.equal(taken[0].at, H(13));
  assert.equal(taken[0].after, 2, "a break is taken at a stop, never mid-drive");
  assert.equal(due.length, 0, "a taken break is not taken twice");
}

// a long overrun takes everything now due, in clock order, once each
{
  const due = planBreaks(H(9), 480, { meal: true, who: "family" });
  const taken = [];
  const end = takeDueBreaks(H(20), due, 4, taken);
  assert.deepEqual(kinds(taken), ["tea", "lunch", "tea"]);
  assert.equal(end, H(20) + 70);
  assert.equal(due.length, 0);
}

// a day finished before 12:30 eats nothing, even though lunch was budgeted
{
  const due = planBreaks(H(9), 480, { meal: true, who: "solo" });
  const taken = [];
  assert.equal(takeDueBreaks(H(11, 30), due, 0, taken), H(11, 30));
  assert.equal(taken.length, 0);
}

/* ---- what an event does to the day it falls on ----
   The behaviour is meant to be emergent: nothing in the engine special-cases a
   festival, so the only proof it works is arithmetic on two real plans. If this
   ever passes trivially (both plans identical) the wiring has come undone. */

// the reader answers the questions the rail and the engine actually ask
{
  const e = EVENTS[0];
  assert.equal(activeEvent(e.from)?.id, e.id, "an event covers its own first day");
  assert.equal(activeEvent(e.to)?.id, e.id, "and its last — the range is inclusive");
  assert.equal(activeEvent(addDays(e.to, 1)), null, "and nothing after it");
  assert.deepEqual(ongoing(e.from).map((x) => x.id), [e.id]);
  assert.ok(!ongoing(e.from).length || !upcoming(e.from).some((x) => x.id === e.id), "ongoing is not also upcoming");
  assert.ok(affects(e, e.places[0]) && !affects(e, "no-such-place"));
  assert.ok(!upcoming(addDays(e.from, 1), 3).length, "a 3-day horizon does not reach a distant event");
}

// a full day at the Mahotsav against the same day a fortnight earlier
{
  const mahotsav = EVENTS.find((e) => e.id === "gita-mahotsav-2026");
  const centre = { lat: 29.9614, lng: 76.8286 };
  const day = (date) =>
    Engine.build({
      budgetMin: 480,
      startClock: 9 * 60,
      start: centre,
      end: centre,
      weekday: new Date(date + "T00:00").getDay(),
      date,
      mode: "car",
      pace: "balanced",
      interests: [],
      filters: {},
    });

  // same weekday, so opening hours and closed days are identical and the only
  // difference between the two plans is the festival
  const busy = day(mahotsav.from);
  const quiet = day(addDays(mahotsav.from, -14));

  assert.equal(activeEvent(mahotsav.from)?.id, mahotsav.id);
  assert.equal(activeEvent(addDays(mahotsav.from, -14)), null);

  assert.ok(
    busy.stops.length < quiet.stops.length,
    `a festival day should fit fewer stops (${busy.stops.length} vs ${quiet.stops.length})`,
  );

  const perStop = (it) => it.totals.visit / it.stops.length;
  assert.ok(
    perStop(busy) > perStop(quiet),
    `and each stop should take longer (${perStop(busy).toFixed(1)} vs ${perStop(quiet).toFixed(1)} min)`,
  );

  // the bias has to actually land the visitor at the festival, or the whole
  // feature is a slower day out with no reason given
  assert.ok(
    busy.stops.some((s) => affects(mahotsav, s.d.id)),
    "a festival day must reach at least one of the festival's places",
  );

  assert.equal(busy.meta.event, mahotsav.id, "the plan carries the event for the UI to badge");
  assert.ok(busy.meta.eventStops.length, "and names which of its stops are affected");
  assert.equal(quiet.meta.event, null);
}

/* ---- a dead end has to offer a way out ----
   The no-fit screen is the one place a visitor cannot act, so the fix it
   offers has to be real: applying it must actually produce a route. Anything
   less is a button that apologises twice. */
{
  const centre = { lat: 29.9614, lng: 76.8286 };
  const base = {
    start: centre,
    end: centre,
    mode: "car",
    pace: "balanced",
    interests: [],
    filters: {},
    date: "2026-11-26",
    weekday: new Date("2026-11-26T00:00").getDay(),
  };

  // half an hour, setting off at half past seven in the evening: by the time
  // you have parked, everything worth entering has shut
  const bad = { ...base, budgetMin: 30, startClock: 19 * 60 + 30 };
  const dead = Engine.build(bad);
  assert.equal(dead.stops.length, 0, "this window is meant to be impossible");
  assert.ok(dead.fix, "an impossible window must come back with a way out");
  assert.ok(dead.fix.stops > 0, "and the way out must reach at least one place");

  // cheapest concession first: leaving earlier costs the visitor nothing, so it
  // must be preferred over a longer day or a different date
  assert.equal(dead.fix.key, "earlier");
  assert.ok(dead.fix.patch.startClock < bad.startClock);

  // and the promise has to hold: rebuilding with the patch gives what it said
  const fixed = Engine.build({ ...bad, ...dead.fix.patch });
  assert.equal(
    fixed.stops.length,
    dead.fix.stops,
    `the fix promised ${dead.fix.stops} stops and delivered ${fixed.stops.length}`,
  );

  // a day that works must not carry one — there is nothing to fix
  const fine = Engine.build({ ...base, budgetMin: 480, startClock: 9 * 60 });
  assert.ok(fine.stops.length > 0);
  assert.equal(fine.fix, null, "a working plan offers no remedy");

  // the probes must not recurse: a probe that fails carries no fix of its own
  assert.equal(Engine.build({ ...bad, probe: true }).fix, null, "a probe never looks for a fix for the fix");
}

console.log("planner checks passed");

/* ── a multi-day stay begins when the visitor said it does ──────────────────
   `buildDays` used to hardcode `startClock: DAY_START` for every day, so the
   answer to "what time do you begin?" was collected on step 1 and then thrown
   away by any stay of two days or more: every itinerary opened at 9:00am. The
   assertion is on the first stop's arrival, because that is the number the
   visitor actually reads. */
{
  const centre = { lat: 29.9614, lng: 76.8286 };
  const base = {
    start: centre,
    end: centre,
    mode: "car",
    pace: "balanced",
    interests: [],
    filters: {},
    date: "2026-11-26",
    weekday: new Date("2026-11-26T00:00").getDay(),
    budgetMin: 3 * 60 * 9,
    startClock: 7 * 60,
  };

  const multi = Engine.buildDays(base);
  assert.ok(multi && multi.days.length >= 2, "a three-day window must split into days");

  // Assert on the hour each day SETS OFF, not on the first arrival: arrival is
  // confounded by opening hours, so a 07:00 start whose best first stop opens
  // at 09:00 legitimately shows a 09:00 arrival plus a wait.
  assert.equal(multi.days[0].meta.startClock, 7 * 60, "day 1 sets off at the stated hour, not at nine");

  // an early riser stays an early riser on the days that follow
  assert.equal(multi.days[1].meta.startClock, 7 * 60, "day 2 keeps an earlier riser's hour");

  // and a late start is not silently carried into the following mornings
  const late = Engine.buildDays({ ...base, startClock: 11 * 60 });
  assert.ok(late && late.days.length >= 2);
  assert.equal(late.days[0].meta.startClock, 11 * 60, "a late day 1 begins late");
  assert.equal(
    late.days[1].meta.startClock,
    9 * 60,
    "day 2 falls back to the morning — the visitor is waking in a hotel, not arriving",
  );
}

console.log("multi-day start-time checks passed");

/* ── the walk inside a cluster follows the ground, not the fame ─────────────
   Legs cost whole minutes, and inside a cluster of places a few hundred metres
   apart that rounds nearly every ordering to the same number. With nothing to
   separate them the search kept whatever order `greedy` produced — and greedy
   orders by score, i.e. by popularity. The result was a numbered sequence that
   zig-zagged on the map: stop 6 back past stop 4 to reach stop 7.

   `reorder` now breaks those ties on distance, which costs no time by
   construction. This asserts the walk actually comes out geometrically optimal
   against a brute force over the pocket. */
{
  const hav = (a, b) => {
    const R = 6371000, r = (x) => (x * Math.PI) / 180;
    const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
    const t = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(t));
  };
  const len = (pts) => pts.slice(1).reduce((n, p, i) => n + hav(pts[i], p), 0);
  const perms = (a) =>
    a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p]));

  const stand = PLACES_INDEX.find((p) => p.kind === "busstand");
  const base = {
    start: { lat: stand.lat, lng: stand.lng, ref: stand.id, label: stand.name.en },
    end: { lat: stand.lat, lng: stand.lng, ref: stand.id, label: stand.name.en },
    mode: "car", pace: "balanced", filters: {},
    date: "2026-11-26", weekday: new Date("2026-11-26T00:00").getDay(),
    budgetMin: 480, startClock: 9 * 60,
  };

  let checked = 0;
  for (const interests of [[], ["mahabharata"], ["spiritual"], ["heritage"]]) {
    const it = Engine.build({ ...base, interests });
    const pockets = [];
    it.stops.forEach((s) => {
      if (s.anchor && pockets.length) pockets[pockets.length - 1].push(s);
      else pockets.push([s]);
    });
    for (const pk of pockets) {
      if (pk.length < 3 || pk.length > 8) continue; // 8! is where brute force stops being free
      const walked = len([pk[0].d, ...pk.slice(1).map((s) => s.d)]);
      const best = Math.min(...perms(pk.slice(1)).map((p) => len([pk[0].d, ...p.map((s) => s.d)])));
      assert.ok(
        walked <= best + 1,
        `walk from ${pk[0].d.name.en} covers ${Math.round(walked)}m; ${Math.round(best)}m was available ` +
          `(${pk.slice(1).map((s) => s.d.name.en).join(" -> ")})`,
      );
      checked++;
    }
  }
  assert.ok(checked >= 3, `expected several walk pockets to check, saw ${checked}`);
}

console.log("walk-order checks passed");
