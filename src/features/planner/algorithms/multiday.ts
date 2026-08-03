// multiday.ts — split a window longer than one sensible day into morning-started
// days, never repeating a place across days. Takes the engine's `build` as a
// parameter to avoid an import cycle. See docs/03.
import { D } from "@/data/destinations";
import { addDays } from "@/shared/lib/datetime";
import type { Itinerary } from "@/shared/types";

export const DAY_MAX = 9 * 60; // most active minutes in one day
export const DAY_START = 9 * 60; // the morning hour days 2..n fall back to
export const DAY_END = 18 * 60; // when a day of sightseeing is over (09:00 + DAY_MAX)

/**
 * When day `n` sets off.
 *
 * Day 1 starts when the visitor said they would start — this used to be
 * hardcoded to DAY_START, so a stay of two days or more silently threw the
 * answer to "what time do you begin?" away and every itinerary opened at
 * 9:00am no matter what had been chosen.
 *
 * Later days have no stated time — the visitor is waking up in a hotel, not
 * arriving — so they fall back to the morning hour. An early riser keeps their
 * hour, though: someone who set off at 07:00 on day 1 is not made to wait
 * until 09:00 on day 2.
 */
export const dayStart = (n: number, chosen?: number | null): number =>
  n === 0 ? (chosen ?? DAY_START) : Math.min(chosen ?? DAY_START, DAY_START);

type BuildFn = (o: any) => Itinerary;

export function buildDays(o: any, build: BuildFn) {
  const totalDays = Math.max(1, Math.min(7, Math.ceil(o.budgetMin / DAY_MAX)));
  if (totalDays === 1) return null;
  const used: Record<string, boolean> = {};
  const days: Itinerary[] = [];
  for (let n = 0; n < totalDays; n++) {
    const leftMin = o.budgetMin - n * DAY_MAX;
    if (leftMin <= 45) break;
    const pool = D.filter((d) => !used[d.id]).map((d) => d.id);
    if (!pool.length) break;
    const start = dayStart(n, o.startClock);
    const day = build(
      Object.assign({}, o, {
        // a late start shortens the first day rather than running it past
        // closing time — the window is "until the places shut", not "nine hours
        // from whenever you happened to begin"
        budgetMin: Math.min(DAY_MAX, leftMin, DAY_END - start),
        startClock: start,
        weekday: (o.weekday + n) % 7,
        // each day is its own date, so a stay that runs into the Mahotsav gets
        // the festival's crowds on those days and not on the ones before it
        date: o.date ? addDays(o.date, n) : undefined,
        onlyIds: pool,
      }),
    );
    if (!day.stops.length) break;
    day.stops.forEach((s) => (used[s.d.id] = true));
    days.push(day);
  }
  if (days.length < 2) return null;
  const sum = days.reduce(
    (a, d) => ({
      travel: a.travel + d.totals.travel,
      visit: a.visit + d.totals.visit,
      wait: a.wait + d.totals.wait,
      park: a.park + d.totals.park,
      meal: a.meal + d.totals.meal,
      km: +(a.km + d.totals.km).toFixed(1),
      total: a.total + d.totals.total,
      stops: a.stops + d.stops.length,
    }),
    { travel: 0, visit: 0, wait: 0, park: 0, meal: 0, km: 0, total: 0, stops: 0 },
  );
  return { days, totals: sum, meta: days[0].meta };
}
