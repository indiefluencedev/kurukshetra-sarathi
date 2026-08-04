// Plans that outlive the tab.
//
// Two separate jobs, and they were both missing:
//   • the draft — whatever you were half-way through answering. Reload the page
//     and it used to be gone, so you started at "when are you going" again.
//   • saved plans — a finished route you want back next week, with the day, the
//     hotel you picked, who you were travelling with and everything else. The
//     old localStorage version kept five fields and dropped the rest, so
//     "reopen" meant "re-answer".
//
// Only the *answers* are stored. The route itself is rebuilt from them, because
// the engine is deterministic given the same inputs and the same day — storing
// it would just be a second copy that can go stale against the place data.
import { S, bump, newPlan, store, setCarried } from "@/app/state";
import { put, get, all, del } from "@/shared/lib/db";
import { nm } from "@/shared/i18n/i18n";
import { dur } from "@/shared/lib/format";
import { isoToday } from "@/shared/lib/datetime";
import type { Plan } from "@/shared/types";

const DRAFT = "draft";

export interface SavedPlan {
  id: string;
  at: number;
  title: string;
  /** stop ids, so the list can be described without rebuilding the route */
  ids: string[];
  plan: PlanInputs;
}

/** The plan minus everything derived — what actually needs to survive. */
type PlanInputs = Omit<Plan, "res" | "alts" | "multi">;

function inputs(p: Plan): PlanInputs {
  const { res, alts, multi, ...rest } = p;
  // structuredClone-safe: every remaining field is a plain value, array or map
  return JSON.parse(JSON.stringify(rest));
}

/** Fill in anything a plan saved by an older version of the app is missing. */
function rehydrate(saved: PlanInputs): Plan {
  const p: Plan = { ...newPlan(), ...saved, res: null, alts: [], multi: null };
  // You can't visit last Tuesday. Keep the time of day and everything else, but
  // move a stale date forward — otherwise the route is checked against the
  // opening hours of a day that has been and gone.
  if (p.date < isoToday()) p.date = isoToday();
  return p;
}

/* ---------------- the answers that outlive one plan ----------------
   The draft brings back the plan you were in the middle of. This brings back
   the parts of it that are true of *you* rather than of that particular day:
   where you are staying, how you get about, who you are with. Second and third
   plans start four taps in. See docs/10 §2.5. */

const PREFS = "prefs";

/**
 * The fields that carry over. An explicit list, not a spread: adding a field
 * to Plan should never start silently persisting it, and `mins`, `date`,
 * `startClock` and `days` must never appear here — they describe one visit.
 */
const CARRY = [
  "startType",
  "start",
  "endType",
  "end",
  "endManual",
  "mode",
  "modes",
  "pace",
  "who",
  "themes",
  "opts",
] as const;

type Carried = Pick<Plan, (typeof CARRY)[number]>;

/** Remember how this plan was answered. Called once per built route. */
export function rememberAnswers(p: Plan): void {
  const rec: { id: string; at: number } & Record<string, unknown> = { id: PREFS, at: Date.now() };
  for (const k of CARRY) rec[k] = p[k];
  put(rec).catch(() => {
    /* private mode / no quota — the next plan just starts blank */
  });
}

async function loadCarried(): Promise<void> {
  try {
    const rec = (await get<Record<string, unknown>>(PREFS)) as (Carried & { id: string }) | undefined;
    if (!rec) return;
    const seed: Partial<Plan> = {};
    for (const k of CARRY) if (rec[k] !== undefined) (seed as Record<string, unknown>)[k] = rec[k];
    setCarried(seed);
  } catch {
    /* no prefs yet, or no IndexedDB */
  }
}

/* ---------------- the draft ---------------- */

let pending: ReturnType<typeof setTimeout> | null = null;

/** Remember the in-progress plan. Debounced — bump() fires on every keystroke. */
export function saveDraft() {
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => {
    pending = null;
    if (!S.plan) return;
    put({ id: DRAFT, at: Date.now(), plan: inputs(S.plan) }).catch(() => {
      /* private mode / no quota — the app still works, it just forgets */
    });
  }, 400);
}

/** Restore the in-progress plan, if there is one. Call once, before first paint. */
export async function loadDraft(): Promise<void> {
  try {
    const rec = await get<{ plan: PlanInputs }>(DRAFT);
    if (!rec?.plan || S.plan) return;
    S.plan = rehydrate(rec.plan);
  } catch {
    /* no draft, or no IndexedDB */
  }
}

/* ---------------- saved plans ---------------- */

/**
 * Keep a built plan.
 *
 * A plan that has been saved once keeps its id, so rebuilding it — adding a
 * stop from "also fits", switching to a gentler pace — updates the record
 * instead of leaving a trail of near-identical copies in Saved.
 */
export async function savePlan(p: Plan): Promise<SavedPlan> {
  const label = typeof p.label === "string" ? p.label : nm(p.label);
  const rec: SavedPlan = {
    id: p.savedId || "p" + Date.now(),
    at: Date.now(),
    title: label || dur(p.mins || 0),
    // a multi-day plan keeps only the current day in `res` — save every day's
    // stops, or a 3-day yatra lists back as a third of itself
    ids: (p.multi ? p.multi.days.flatMap((d) => d.stops) : p.res?.stops || []).map((s) => s.d.id),
    plan: inputs(p),
  };
  await put(rec);
  p.savedId = rec.id;
  return rec;
}

export const listPlans = async (): Promise<SavedPlan[]> => {
  // The store holds several kinds of record in one table and only one is a
  // plan. This used to name the other two (draft, prefs) and exclude them by
  // id — which silently broke the moment content/live.ts began caching feeds
  // here under "content:*". Those rows have no `ids`, so PlanRow's
  // `r.ids.map(...)` threw and took the whole Saved screen down with it: no
  // list, no save button, nothing. It read exactly like plans not being saved.
  //
  // So the test is now positive — what a plan *is*, rather than what it is
  // not. A new record type sharing this store cannot reintroduce the bug.
  const rows = (await all<SavedPlan>()).filter(
    (r) => r && r.id !== DRAFT && r.id !== PREFS && Array.isArray(r.ids) && !!r.plan,
  );
  return rows.sort((a, b) => b.at - a.at);
};

/**
 * Forget a saved plan.
 *
 * Also clears `savedId` on the plan currently open, when it is the same one.
 * Without that, deleting from Saved left the live plan still believing it was
 * saved: the Plan screen went on showing it under "Your plan" and telling the
 * visitor "it is in Saved" while Saved said "Nothing saved yet". Two screens
 * disagreeing about the same object, and the app was the one that was wrong.
 *
 * The plan itself is deliberately NOT cleared — it is still the plan you are
 * looking at, and deleting a bookmark should not close the page.
 */
export async function deletePlan(id: string): Promise<void> {
  await del(id);
  if (S.plan?.savedId === id) {
    delete S.plan.savedId;
    bump();
  }
}

/** Put a saved plan back into the app, ready for its route to be rebuilt. */
export async function openPlan(id: string): Promise<Plan | null> {
  const rec = await get<SavedPlan>(id);
  if (!rec) return null;
  S.plan = rehydrate(rec.plan);
  bump();
  return S.plan;
}

/* ---------------- boot ---------------- */

/**
 * Bring across routes saved by the localStorage version. They only ever held
 * ids and a handful of settings, so the reopened plan is thinner than a
 * newly-saved one — but it is not lost, which is the point.
 */
async function migrateFromLocalStorage() {
  const old = store.routes;
  if (!old.length) return;
  const have = await listPlans();
  if (have.length) return;
  for (const r of old) {
    const p = newPlan();
    p.mins = r.mins || 240;
    p.label = r.title || "";
    p.mode = r.mode || "car";
    p.modes = [r.mode || "car"];
    p.pace = r.pace || "balanced";
    p.themes = r.themes || [];
    await put({ id: "p" + (r.at || Date.now()), at: r.at || Date.now(), title: r.title || "", ids: r.ids || [], plan: inputs(p) });
  }
  store.routes = [];
}

/** Restore what the last session left behind. Awaited once, before first paint. */
export async function bootPersistence(): Promise<void> {
  try {
    await migrateFromLocalStorage();
  } catch {
    /* a failed migration must never block the app starting */
  }
  // carried answers first: they seed newPlan(), which loadDraft() builds on
  await loadCarried();
  await loadDraft();
}
