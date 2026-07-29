// Pure date/time helpers, ported verbatim from the demo. No app-state imports
// (keep this a dependency leaf so state/i18n can import it freely).

export const pad2 = (n: number) => String(n).padStart(2, "0");
export const pad = pad2;

export function isoToday(): string {
  const d = new Date();
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
}
export function isoDate(d: Date): string {
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
}
export function fromISO(iso?: string): Date {
  const p = (iso || isoToday()).split("-");
  return new Date(+p[0], +p[1] - 1, +p[2]);
}
export function isToday(iso: string): boolean {
  return iso === isoToday();
}

/** minutes-since-midnight → "h:mmam/pm" */
export function clock(m: number): string {
  m = (((Math.round(m) % 1440) + 1440) % 1440);
  const h = Math.floor(m / 60),
    x = m % 60,
    ap = h < 12 ? "am" : "pm",
    hh = h % 12 || 12;
  return hh + ":" + pad(x) + ap;
}

export const nowM = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

/** current wall-clock as "h:mm AM/PM" (the header clock). */
export function clock12(): string {
  const n = new Date(),
    h = n.getHours(),
    m = n.getMinutes();
  return (h % 12 || 12) + ":" + pad2(m) + " " + (h < 12 ? "AM" : "PM");
}
