// Opening-hours rules. A stop reached before it opens WAITS rather than being
// dropped; a stop closed on the given weekday is excluded. See docs/03.
import type { Destination } from "@/shared/types";

/** minutes-of-day for an "HH:MM" string. */
export const openMin = (hhmm: string): number => {
  const p = hhmm.split(":");
  return +p[0] * 60 + +p[1];
};

export const isClosedDay = (d: Destination, weekday: number): boolean =>
  !!(d.closed && d.closed.indexOf(weekday) >= 0);

/** Is d open at minute-of-day m on this weekday? */
export function openAt(d: Destination, weekday: number, m: number): boolean {
  if (isClosedDay(d, weekday)) return false;
  if (!d.hours) return true;
  return m >= openMin(d.hours.o) && m <= openMin(d.hours.c);
}
