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
   construction. This asserts the walk comes out within a whisker of
   geometrically optimal against a brute force over the pocket.

   Within a whisker, not exactly optimal. `reorder` scores candidates with
   `simulate` — the real cost model, opening hours and the spread of waiting
   included — while this brute force scores raw metres. When those two
   disagree the engine is right and this measure is not: a pocket that walks
   ten metres further and arrives before a temple shuts is the better day. So
   the bar is "no zig-zag", which is what the failure looked like (17% over,
   254m in one pocket), rather than "no metre wasted". */
const WALK_SLACK = 1.05;
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
        walked <= best * WALK_SLACK + 1,
        `walk from ${pk[0].d.name.en} covers ${Math.round(walked)}m; ${Math.round(best)}m was available ` +
          `(${pk.slice(1).map((s) => s.d.name.en).join(" -> ")})`,
      );
      checked++;
    }
  }
  assert.ok(checked >= 3, `expected several walk pockets to check, saw ${checked}`);
}

console.log("walk-order checks passed");

/* ── the resident's questions actually answer ───────────────────────────────
   The Home alert only appears on the day an overlay event runs, so on any
   other day it cannot be verified by looking at the app. These assert the
   three functions behind it against the real calendar.

   (This lives here rather than in check-content because check-content runs on
   plain node and cannot import a .ts module.) */
{
  const { liveAt, liveToday, startingSoon, isOverlay, eventPoints } = await import("../src/data/events.ts");
  const { locate } = await import("../src/features/journey/corridor.ts");
  const { D } = await import("../src/data/destinations.ts");
  const byId = (id) => D.find((d) => d.id === id);

  const overlays = EVENTS.filter((e) => isOverlay(e));
  assert.ok(overlays.length, "there should be at least one overlay event to check");

  for (const e of overlays) {
    const day = e.from;
    const mins = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
    const open = mins(e.window.from);
    const shut = mins(e.window.to);

    // the HOUR matters, not just the date — a 4pm procession is not news at breakfast
    assert.ok(liveAt(e, day, open + 5), `${e.id} must be live inside its own window`);
    assert.ok(!liveAt(e, day, open - 30), `${e.id} must not be live half an hour before it starts`);
    assert.ok(!liveAt(e, day, shut + 30), `${e.id} must not be live after it ends`);

    assert.ok(liveToday(day, open + 5).some((x) => x.id === e.id));
    assert.ok(
      startingSoon(day, open - 45, 90).some((x) => x.id === e.id),
      `${e.id} should be announced 45 minutes ahead`,
    );
    assert.ok(!startingSoon(day, open - 45, 10).some((x) => x.id === e.id), "…but not on a 10-minute horizon");

    // an overlay never governs the engine's factors, even on its own day
    const active = activeEvent(day);
    assert.ok(!active || !isOverlay(active), `${e.id} must not be what activeEvent returns`);

    // "is it in my way" is answerable: a point ON the corridor reads as on it,
    // one well off it does not
    const pts = eventPoints(e, byId);
    assert.ok(pts.length >= 2, `${e.id} needs a usable line`);
    assert.ok(locate(pts[1], pts).offset < 50, `a point on ${e.id}'s corridor should read as on it`);
    assert.ok(
      locate({ lat: pts[0].lat + 0.05, lng: pts[0].lng + 0.05 }, pts).offset > 2500,
      "a point 5 km away should not",
    );
  }
}

console.log("event alert checks passed");

/* ── the town on screen scopes every list ──────────────────────────────────
   `DC()` sits under Home, Explore, Search, the map and the planner's own
   candidate pool. If it ever returned all 57 places, a Pehowa visitor would be
   routed to Jyotisar, 25 km away, with no way to tell from the screen that
   anything was wrong — the lists would simply be longer. So it is asserted
   both ways round, and against the same partition the hero rail uses. */
{
  const { S, setCity, city } = await import("../src/app/state.ts");
  const { CITIES } = await import("../src/data/cities.ts");
  const { D, DC, themesHere } = await import("../src/data/destinations.ts");
  const { heroFor } = await import("../src/data/reels-hero.ts");

  assert.ok(CITIES.length >= 2, "this check is about there being more than one town");
  const was = S.city;

  let total = 0;
  for (const c of CITIES) {
    setCity(c.id);
    assert.equal(city().id, c.id, "setCity actually switches");
    const list = DC();
    assert.ok(list.length, `${c.id} has no places — the picker would offer an empty town`);
    assert.ok(
      list.every((d) => (d.city || CITIES[0].id) === c.id),
      `${c.id}'s list contains a place from another town`,
    );
    assert.ok(heroFor().length, `${c.id} has no hero photographs and no fallback`);

    // A theme tile is a full-bleed photograph that opens a filtered list. One
    // that says "0 places" opens nothing, and looks identical to one that does
    // — so the grid must never be offered a theme this town cannot fill.
    const shown = themesHere();
    assert.ok(shown.length, `${c.id} offers no themes at all`);
    for (const { th, n } of shown) {
      assert.ok(n > 0, `${c.id} offers "${th.id}" with ${n} places`);
      assert.equal(n, list.filter((d) => d.themes.includes(th.id)).length, `${c.id}/${th.id} count is wrong`);
    }
    total += list.length;
  }
  // every place belongs to exactly one town: no place is stranded, none double-counted
  assert.equal(total, D.length, "the towns partition the catalogue");

  // and the weather follows the town, or Pehowa reads Thanesar's forecast
  setCity(CITIES[0].id);
  const a = city().wx;
  setCity(CITIES[1].id);
  const b = city().wx;
  assert.notDeepEqual(a, b, "each town forecasts its own coordinates");

  setCity(was);
}

console.log("town-scoping checks passed");

/* ── the plus on a card builds a real day ──────────────────────────────────
   The plus itself (`addTo`) now opens a sheet to ask WHICH day and WHERE it
   starts, so it lives in AddSheet.tsx and cannot be loaded here — node's type
   stripper does not read .tsx. What that sheet does once it has its answers is
   `startDayWith` / `pushStop` / `dropFrom`, and those are the parts with the
   arithmetic worth guarding.

   The trap is the clock: stops are timed from the one before, so removing a
   stop without re-timing what follows leaves every later arrival wrong by
   that stop's length — a day that quietly claims to end an hour late. */
{
  const { S, setCity, city } = await import("../src/app/state.ts");
  const { CITIES } = await import("../src/data/cities.ts");
  const { DC } = await import("../src/data/destinations.ts");
  const { isoToday } = await import("../src/shared/lib/datetime.ts");
  const { startDayWith, pushStop, dropFrom, inPlan, savedCount } = await import(
    "../src/features/place/place-actions.ts"
  );

  setCity(CITIES[0].id);
  S.plan = null;
  const [a, b, c] = DC().slice(0, 3);
  const from = { lat: city().centre.lat, lng: city().centre.lng, label: "Town centre" };

  // no plan at all: starting a day has to make one, with the start point it
  // was given rather than a silent guess
  startDayWith(a, isoToday(), from, "other");
  assert.ok(S.plan && S.plan.res, "starting a day must create one");
  assert.equal(savedCount(), 1);
  assert.ok(inPlan(a.id));
  assert.equal(S.plan.start.label, from.label, "the day must start where it was told to");
  assert.ok(S.plan.startClock != null, "a day with no start hour cannot time its stops");

  pushStop(S.plan, b);
  pushStop(S.plan, c);
  assert.equal(savedCount(), 3, "further adds join the day that exists");

  // the same place twice is one stop, not two
  pushStop(S.plan, c);
  assert.equal(savedCount(), 3, "adding a place already in the day must not duplicate it");

  dropFrom(b.id);
  assert.equal(savedCount(), 2, "dropping removes it");
  assert.ok(!inPlan(b.id) && inPlan(a.id) && inPlan(c.id), "and removes only that one");

  // what remains has to be consistent: each stop timed from the one before,
  // and the totals equal to the sum of the stops rather than a stale figure
  const res = S.plan.res;
  let clock = S.plan.startClock;
  let travel = 0, visit = 0;
  for (const s of res.stops) {
    assert.equal(s.arrive, clock + s.travel, `${s.d.id} arrives at the wrong time`);
    assert.equal(s.depart, s.arrive + s.visit, `${s.d.id} departs at the wrong time`);
    clock = s.depart;
    travel += s.travel;
    visit += s.visit;
  }
  assert.equal(res.totals.travel, travel, "totals.travel drifted from the stops");
  assert.equal(res.totals.visit, visit, "totals.visit drifted from the stops");
  assert.equal(res.totals.finish, S.plan.startClock + res.totals.total, "the finish time drifted");

  // emptying it leaves no day, rather than a route screen with nothing on it
  dropFrom(a.id);
  dropFrom(c.id);
  assert.equal(S.plan, null, "an emptied day is no day");
}

console.log("quick-add checks passed");
