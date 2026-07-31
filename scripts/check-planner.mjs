// Self-check for the planner rule that's easy to get quietly wrong: which
// breaks a day earns, and where they land on the clock.
// Run: npm run check-planner   (node strips the TS types; no test framework)
import assert from "node:assert/strict";
import { planBreaks, breakMinutes, takeDueBreaks } from "../src/features/planner/rules/breaks.ts";

const H = (h, m = 0) => h * 60 + m;
const kinds = (l) => l.map((b) => b.kind);

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

console.log("planner checks passed");
