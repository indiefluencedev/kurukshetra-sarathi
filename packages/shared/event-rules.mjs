/**
 * What makes an event valid. ONE definition, imported by both sides.
 *
 * `scripts/check-content.mjs` gates the bundled JSON at build time and the
 * Worker gates what the admin dashboard writes at runtime. Those are the same
 * question asked in two places, and two copies of the answer would drift the
 * first time a field was added — leaving the dashboard happily accepting an
 * event the app refuses to render.
 *
 * Plain .mjs with no imports so it runs unmodified under node (the check
 * scripts) and inside a Worker (esbuild bundles it).
 */

export const KINDS = ["festival", "snan", "show", "mela", "yatra", "closure"];

/** Kinds that overlay a day rather than defining it — see docs/11. */
export const OVERLAY_KINDS = ["yatra", "closure"];
export const isOverlayKind = (k) => OVERLAY_KINDS.indexOf(k) >= 0;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Roughly Kurukshetra district — catches a transposed lat/lng exactly. */
export const BOX = { latMin: 29.7, latMax: 30.3, lngMin: 76.5, lngMax: 77.2 };

const loc = (v) => v && typeof v.en === "string" && v.en.trim() && typeof v.hi === "string" && v.hi.trim();

/**
 * Every problem with one event, as sentences. Empty array means valid.
 *
 * `knownPlace` is optional: the check script can resolve destination ids, and
 * the Worker cannot without shipping the whole catalogue, so it validates
 * everything else and lets that one rule pass.
 */
export function validateEvent(e, knownPlace) {
  const out = [];
  const at = e?.name?.en || e?.id || "?";

  if (!e || typeof e !== "object") return [`${at}: not an object`];
  if (!e.id || !/^[a-z0-9-]+$/.test(e.id)) out.push(`${at}: id must be lower-case letters, digits and hyphens`);
  if (!KINDS.includes(e.kind)) out.push(`${at}: unknown kind "${e.kind}"`);
  if (!loc(e.name)) out.push(`${at}: name needs both en and hi`);
  if (!loc(e.blurb)) out.push(`${at}: blurb needs both en and hi`);
  if (!loc(e.notice)) out.push(`${at}: notice needs both en and hi`);

  if (!ISO.test(e.from || "")) out.push(`${at}: from must be yyyy-mm-dd`);
  if (!ISO.test(e.to || "")) out.push(`${at}: to must be yyyy-mm-dd`);
  if (ISO.test(e.from || "") && ISO.test(e.to || "") && e.from > e.to)
    out.push(`${at}: from must not be after to`);

  for (const k of ["visitFactor", "travelFactor"]) {
    const v = e[k];
    if (typeof v !== "number" || !(v >= 1 && v <= 3))
      out.push(`${at}: ${k} must be a number between 1.0 and 3.0`);
  }

  if (!Array.isArray(e.places) || !e.places.length) out.push(`${at}: needs at least one place`);
  else if (knownPlace) {
    for (const id of e.places) if (!knownPlace(id)) out.push(`${at}: unknown place "${id}"`);
  }
  if (e.bias && knownPlace) {
    for (const id of Object.keys(e.bias)) if (!knownPlace(id)) out.push(`${at}: bias names unknown place "${id}"`);
  }

  // A district event is only useful if it says WHEN and WHERE on the ground.
  // "There is a procession somewhere today" is not something anyone can act on.
  if (isOverlayKind(e.kind)) {
    if (!e.window) out.push(`${at}: a ${e.kind} needs a window — an all-day road closure is not a thing`);
    if (!Array.isArray(e.corridor) || e.corridor.length < 2)
      out.push(`${at}: a ${e.kind} needs a corridor of at least two points — it happens along a road`);
    if (!e.advice) out.push(`${at}: a ${e.kind} needs advice: "join" or "avoid"`);
  }
  if (e.window) {
    if (!HM.test(e.window.from || "") || !HM.test(e.window.to || ""))
      out.push(`${at}: window times must be HH:MM`);
    else if (e.window.from >= e.window.to) out.push(`${at}: window from must precede to`);
  }
  (e.corridor || []).forEach((c, n) => {
    const ok = c && c.lat > BOX.latMin && c.lat < BOX.latMax && c.lng > BOX.lngMin && c.lng < BOX.lngMax;
    if (!ok) out.push(`${at}: corridor[${n}] is outside the district`);
  });
  if (e.advice && e.advice !== "join" && e.advice !== "avoid")
    out.push(`${at}: advice must be "join" or "avoid", got "${e.advice}"`);

  return out;
}

/**
 * Problems across the whole set — the rules one event cannot check alone.
 *
 * `activeEvent()` returns the first match, so two destination events claiming
 * one place on one day is an ambiguity the app would resolve silently and
 * wrongly. Overlays are exempt: they never reach `activeEvent`.
 */
export function validateEventSet(events) {
  const out = [];
  const seen = new Set();
  const claimed = new Map();

  for (const e of events) {
    if (seen.has(e.id)) out.push(`${e.id}: duplicate id`);
    seen.add(e.id);

    if (isOverlayKind(e.kind) || !ISO.test(e.from || "") || !ISO.test(e.to || "")) continue;
    // local dates throughout — toISOString() would shift IST midnight back a day
    const iso = (d) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    for (let d = new Date(e.from + "T00:00"); iso(d) <= e.to; d.setDate(d.getDate() + 1)) {
      for (const id of e.places || []) {
        const k = id + "@" + iso(d);
        if (claimed.has(k)) out.push(`${e.id}: ${id} on ${iso(d)} is already claimed by ${claimed.get(k)}`);
        else claimed.set(k, e.id);
      }
    }
  }
  return out;
}
