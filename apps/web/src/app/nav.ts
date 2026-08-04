import { S } from "./state";
import { fromISO } from "@/shared/lib/datetime";

/** Navigate (works with HashRouter: setting the hash triggers a route change). */
export const go = (r: string) => {
  window.location.hash = r;
};

export const track = (e: string, d?: unknown) => {
  try {
    console.debug("ev", e, d || "");
  } catch {
    /* ignore */
  }
};

/* ---- the day of the visit (was planDate/planWeekday) ---- */
export const planDate = () => fromISO(S.plan ? S.plan.date : undefined);
export const planWeekday = () => planDate().getDay();
