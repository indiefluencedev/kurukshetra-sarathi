// Scoring rules: which places rank highest, and how the hour of arrival nudges
// that. Pure policy — tweak the weights here to change selection behaviour.
// See docs/03.
import type { Destination } from "@/shared/types";

const wrap = (m: number) => ((m % 1440) + 1440) % 1440;

/**
 * Base desirability of a POI. rank/first are editorial priority (0–100);
 * a theme match is a strong boost; `bias` lets alternatives nudge specific ids.
 */
export function poiScore(
  d: Destination,
  interests: string[],
  wantAll: boolean,
  bias?: Record<string, number>,
): number {
  let s = (d.rank || 0) * 0.4 + (d.first || 0) * 0.3;
  if (!wantAll) {
    const hits = d.themes.filter((t) => interests.indexOf(t) >= 0).length;
    s += hits * 34;
  }
  if (bias && bias[d.id]) s += bias[d.id];
  return s;
}

/** How well a stop suits the hour it would be reached (best-time-of-day). */
export function timeFit(d: Destination, arriveMin: number): number {
  const h = Math.floor(wrap(arriveMin) / 60);
  switch (d.bestKey) {
    case "evening":
      return h >= 16 ? 26 : h >= 14 ? 8 : -14;
    case "morning":
      return h < 11 ? 22 : h < 14 ? 2 : -10;
    case "midday":
      return h >= 11 && h < 16 ? 18 : 2;
    default:
      return 0;
  }
}
