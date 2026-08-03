import { get, put } from "@/shared/lib/db";
import { bump } from "@/app/state";

/**
 * Content that can change without shipping a new app.
 *
 * The calendar goes stale on its own and is maintained by people who do not
 * deploy software. Bundling it means every corrected date is a release, which
 * is the wrong shape for a district app — so a content file may also be served
 * from a URL and updated there.
 *
 * Three rules, in this order, and the order is the whole design:
 *
 *  1. The BUNDLED copy is always available and is what renders first. The app
 *     opens on a rural signal and must never wait for a network to draw.
 *  2. The last-fetched copy is applied from IndexedDB at boot, synchronously
 *     as far as the visitor is concerned — it is already on the device.
 *  3. The network is asked afterwards, in the background. If it answers with a
 *     different revision that copy is stored and applied; if it does not answer
 *     at all, nothing happens and nobody notices.
 *
 * So the network is an optimisation, never a dependency. Turn off
 * VITE_CONTENT_URL and the app is exactly what it was: a static bundle.
 *
 * `register` is deliberately content-agnostic. Places and hotels are the same
 * shape of problem — a JSON array maintained by someone in an office — and are
 * meant to arrive through this same path rather than a second mechanism.
 */

/**
 * Where the Worker serves content. Empty in dev and in any offline build.
 *
 * The `?.` is not decoration. Vite replaces `import.meta.env` with an object
 * literal at build time, but the check scripts import this module under plain
 * node, where `import.meta.env` is undefined — and the unguarded form throws at
 * module load, taking check-planner and check-graph down with it.
 */
const BASE = (import.meta.env?.VITE_CONTENT_URL || "").replace(/\/$/, "");

/** What the endpoint returns, and what we cache. `rev` is opaque — any change wins. */
interface Payload<T> {
  rev: string;
  items: T[];
}

interface Cached<T> extends Payload<T> {
  /** keyed into the shared IndexedDB store; `content:` keeps it out of listPlans */
  id: string;
  at: number;
}

const KEY = (name: string) => "content:" + name;

interface Feed<T> {
  name: string;
  apply: (items: T[]) => void;
}

const feeds: Feed<any>[] = [];

/**
 * Declare a content file as updatable. `apply` replaces the module's own copy
 * and is called at most twice per launch — once from cache, once from network.
 */
export function register<T>(name: string, apply: (items: T[]) => void) {
  feeds.push({ name, apply });
}

async function fromCache<T>(f: Feed<T>): Promise<string | null> {
  try {
    const rec = await get<Cached<T>>(KEY(f.name));
    if (!rec?.items?.length) return null;
    f.apply(rec.items);
    return rec.rev;
  } catch {
    return null; // private mode, quota — the bundled copy still stands
  }
}

async function fromNetwork<T>(f: Feed<T>, have: string | null) {
  if (!BASE) return false;
  try {
    const r = await fetch(`${BASE}/content/${f.name}.json`, { cache: "no-cache" });
    if (!r.ok) return false;
    const p = (await r.json()) as Payload<T>;
    // An endpoint that answers with nothing must never blank the calendar —
    // "no events" and "the request went wrong" look identical from here.
    if (!p || !Array.isArray(p.items) || !p.items.length) return false;
    if (p.rev && p.rev === have) return false;
    f.apply(p.items);
    await put<Cached<T>>({ id: KEY(f.name), rev: p.rev || String(Date.now()), items: p.items, at: Date.now() });
    return true;
  } catch {
    return false; // offline is the normal case, not an error
  }
}

/**
 * Bring every registered feed up to date. Call once at boot and never await it
 * on a render path — the bundled copy is already on screen by the time this
 * resolves.
 */
export async function refreshContent(): Promise<void> {
  let changed = false;
  for (const f of feeds) {
    const have = await fromCache(f);
    if (have !== null) changed = true;
    if (await fromNetwork(f, have)) changed = true;
  }
  if (changed) bump();
}
