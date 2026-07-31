// multiday.ts — split a window longer than one sensible day into morning-started
// days, never repeating a place across days. Takes the engine's `build` as a
// parameter to avoid an import cycle. See docs/03.
import { D } from "@/data/destinations";
import type { Itinerary } from "@/shared/types";

export const DAY_MAX = 9 * 60; // most active minutes in one day
export const DAY_START = 9 * 60; // each day starts at 09:00

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
    const day = build(
      Object.assign({}, o, {
        budgetMin: Math.min(DAY_MAX, leftMin),
        startClock: DAY_START,
        weekday: (o.weekday + n) % 7,
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
