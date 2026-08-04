// Breaks — the parts of a day that are not sightseeing. A route that runs from
// nine to five with no meal and nowhere to sit down is not a route anyone over
// sixty will finish, so the day earns its breaks from its own shape and the
// budget spends those minutes up front instead of pretending they're free.
// See docs/03.
import type { Loc } from "@/shared/types";

export type BreakKind = "lunch" | "dinner" | "tea";

export interface BreakDef {
  kind: BreakKind;
  /** earliest minute-of-day it may be taken — it's taken at the first stop after this */
  from: number;
  min: number;
  name: Loc;
  note: Loc;
}

export interface BreakOpts {
  /** the traveller asked to leave time to eat */
  meal?: boolean;
  pace?: string;
  who?: string;
}

const LUNCH_FROM = 12 * 60 + 30;
const DINNER_FROM = 19 * 60;

/** Which breaks a day starting at `startClock` and running `budgetMin` earns. */
export function planBreaks(startClock: number, budgetMin: number, o: BreakOpts): BreakDef[] {
  const end = startClock + budgetMin;
  const out: BreakDef[] = [];

  if (o.meal !== false) {
    if (startClock <= LUNCH_FROM && end >= LUNCH_FROM + 40)
      out.push({
        kind: "lunch",
        from: LUNCH_FROM,
        min: 40,
        name: { en: "Lunch", hi: "दोपहर का भोजन" },
        note: { en: "Dhabas and canteens sit near most of the tirthas — 40 minutes is enough for a thali.", hi: "अधिकांश तीर्थों के पास ढाबे और कैंटीन हैं — थाली के लिए 40 मिनट पर्याप्त हैं।" },
      });
    if (end >= DINNER_FROM + 40)
      out.push({
        kind: "dinner",
        from: DINNER_FROM,
        min: 40,
        name: { en: "Dinner", hi: "रात का भोजन" },
        note: { en: "Eat before the last leg — kitchens near the tirthas close early.", hi: "अंतिम चरण से पहले भोजन कर लें — तीर्थों के पास रसोइयाँ जल्दी बंद होती हैं।" },
      });
  }

  // An unhurried pace, elders or a family group all mean the same thing in
  // practice: a sit-down every few hours, or the last stops get skipped.
  const wantsRest = o.pace === "relaxed" || o.who === "seniors" || o.who === "family" || o.who === "group";
  if (wantsRest && budgetMin >= 240) {
    const tea = (n: number): BreakDef => ({
      kind: "tea",
      from: startClock + n,
      min: 15,
      name: { en: "Rest and tea", hi: "विश्राम और चाय" },
      note: { en: "Sit down, drink water. Every tirtha here has shade and a water point.", hi: "बैठें, पानी पिएँ। यहाँ हर तीर्थ पर छाया और पानी की व्यवस्था है।" },
    });
    out.push(tea(165));
    if (budgetMin >= 420) out.push(tea(390));
  }

  return out.sort((a, b) => a.from - b.from);
}

/** Minutes the breaks will consume — reserved before any stop is chosen. */
export const breakMinutes = (list: BreakDef[]): number => list.reduce((a, b) => a + b.min, 0);

/** A break, once it has an actual time and a stop to take it at. */
export interface TakenBreak extends BreakDef {
  at: number;
  after: number; // index of the stop it follows
}

/**
 * Take every break now due, at the stop we're standing at. Mutates `due`
 * (shifting off what it takes) and returns the new clock — a break is taken
 * where you already are, so lunch lands at a place with a dhaba rather than in
 * the middle of a drive.
 */
export function takeDueBreaks(clock: number, due: BreakDef[], stopIndex: number, into: TakenBreak[]): number {
  while (due.length && clock >= due[0].from) {
    const b = due.shift()!;
    into.push({ ...b, at: clock, after: stopIndex });
    clock += b.min;
  }
  return clock;
}
