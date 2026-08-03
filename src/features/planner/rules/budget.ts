// Budget rules: how the raw time window becomes spendable minutes, and the
// visit-duration scaling per pace. Keeps timings honest so a route always
// finishes inside the window. See docs/03.
import { CONFIG } from "@/data/config";
import { planBreaks, breakMinutes, type BreakDef, type BreakOpts } from "./breaks";

const contingency = CONFIG.contingency as Record<string, number>;
const paceVisit = CONFIG.paceVisitFactor as Record<string, number>;

export interface Budget {
  usable: number; // window minus the pace contingency
  breaks: BreakDef[]; // meals and rests the day earns, in clock order
  meal: number; // minutes reserved for those breaks
  spendable: number; // usable minus breaks — what stops+travel may consume
  visitFactor: number; // scales each stop's recommended visit by pace
  contingency: number; // the pace contingency fraction applied (for metadata)
}

/** Derive the spendable budget for a window starting at `startClock`, length `budgetMin`. */
export function computeBudget(budgetMin: number, startClock: number, pace: string, o: BreakOpts): Budget {
  const cont = contingency[pace] != null ? contingency[pace] : 0.1;
  const usable = Math.round(budgetMin * (1 - cont));

  // Reserve every break up front so none of them can overflow the window.
  const breaks = planBreaks(startClock, budgetMin, { ...o, pace });
  const meal = breakMinutes(breaks);

  return {
    usable,
    breaks,
    meal,
    spendable: usable - meal,
    visitFactor: paceVisit[pace] || 1,
    contingency: cont,
  };
}

export const PARKING = CONFIG.parkingBufferMin;
