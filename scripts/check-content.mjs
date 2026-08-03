// CI / pre-commit content check: every {en,hi} is fully translated and the two
// UI dictionaries share the same keys. Exits non-zero on any problem. See docs/04.
import { readFileSync } from "node:fs";

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const base = "../src/content/";
const en = read(base + "i18n/en.json");
const hi = read(base + "i18n/hi.json");
const data = {
  destinations: read(base + "data/destinations.json"),
  themes: read(base + "data/themes.json"),
  reels: read(base + "data/reels.json"),
  hero: read(base + "data/hero.json"),
  places: read(base + "data/places-index.json"),
  events: read(base + "data/events.json"),
};

const out = [];
function walk(node, path) {
  if (Array.isArray(node)) return node.forEach((v, i) => walk(v, `${path}[${i}]`));
  if (node && typeof node === "object") {
    if (typeof node.en === "string" || typeof node.hi === "string") {
      if (!String(node.en ?? "").trim()) out.push(`missing en at ${path}`);
      if (!String(node.hi ?? "").trim()) out.push(`missing hi at ${path}`);
    }
    for (const k of Object.keys(node)) walk(node[k], `${path}.${k}`);
  }
}
const ek = Object.keys(en),
  hk = Object.keys(hi);
ek.filter((k) => !(k in hi)).forEach((k) => out.push(`i18n: hi missing key "${k}"`));
hk.filter((k) => !(k in en)).forEach((k) => out.push(`i18n: en missing key "${k}"`));
for (const [name, node] of Object.entries(data)) walk(node, name);

/* ---- the curated places index ----
   These are start and end points: a wrong coordinate doesn't degrade the app,
   it sends someone to the wrong side of town. So the shape is enforced, and
   anything a human hasn't confirmed yet is called out. */
const KINDS = new Set(["station", "busstand", "hotel", "dharamshala"]);
// Kurukshetra district, generously boxed. Anything outside is a typo or a
// coordinate pair that got swapped.
const BOX = { lat: [29.6, 30.35], lng: [76.4, 77.2] };
const warn = [];
const seen = new Map();

data.places.forEach((p, i) => {
  const at = `places[${i}] ${p?.name?.en || p?.id || "?"}`;
  if (!p.id) out.push(`${at}: missing id`);
  else if (seen.has(p.id)) out.push(`${at}: duplicate id "${p.id}" (also ${seen.get(p.id)})`);
  else seen.set(p.id, at);

  if (!KINDS.has(p.kind)) out.push(`${at}: unknown kind "${p.kind}"`);
  if (typeof p.lat !== "number" || typeof p.lng !== "number") out.push(`${at}: lat/lng must be numbers`);
  else {
    if (p.lat < BOX.lat[0] || p.lat > BOX.lat[1]) out.push(`${at}: lat ${p.lat} is outside Kurukshetra`);
    if (p.lng < BOX.lng[0] || p.lng > BOX.lng[1]) out.push(`${at}: lng ${p.lng} is outside Kurukshetra`);
  }
  if (p.name?.en && p.name.en === p.name.hi) warn.push(`${at}: hi name is a copy of the en name`);
  if (!p.verified) warn.push(`${at}: not verified — nobody has checked the pin`);
  else if (!p.checked) warn.push(`${at}: verified but no "checked" date`);
});

/* ---- the events calendar ----
   The dates are lunar and hand-entered from the panchang every year, which is
   exactly the kind of field that gets a typo nobody notices until the festival
   has been and gone. The factors are calibration knobs, so their band is
   checked rather than their value. See docs/10 §4.4. */
const KINDS_E = new Set(["festival", "snan", "show", "mela"]);
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const destIds = new Set(data.destinations.map((d) => d.id));
const seenE = new Map();
const claimed = new Map(); // "placeId@date" → event id, so two events can't own a place at once

data.events.forEach((e, i) => {
  const at = `events[${i}] ${e?.name?.en || e?.id || "?"}`;
  if (!e.id) out.push(`${at}: missing id`);
  else if (seenE.has(e.id)) out.push(`${at}: duplicate id "${e.id}"`);
  else seenE.set(e.id, at);

  if (!KINDS_E.has(e.kind)) out.push(`${at}: unknown kind "${e.kind}"`);
  if (!ISO.test(e.from || "")) out.push(`${at}: from "${e.from}" is not YYYY-MM-DD`);
  if (!ISO.test(e.to || "")) out.push(`${at}: to "${e.to}" is not YYYY-MM-DD`);
  if (ISO.test(e.from || "") && ISO.test(e.to || "") && e.from > e.to) out.push(`${at}: from is after to`);

  for (const f of ["visitFactor", "travelFactor"]) {
    const v = e[f];
    if (typeof v !== "number" || v < 1 || v > 3) out.push(`${at}: ${f} ${v} is outside 1.0–3.0`);
  }

  if (!Array.isArray(e.places) || !e.places.length) out.push(`${at}: no places`);
  else
    e.places.forEach((id) => {
      if (!destIds.has(id)) out.push(`${at}: unknown place "${id}"`);
    });

  Object.keys(e.bias || {}).forEach((id) => {
    if (!destIds.has(id)) out.push(`${at}: bias names unknown place "${id}"`);
  });

  // activeEvent() returns the first match, so an overlap on the same place is
  // an ambiguity the reader would resolve silently and wrongly
  if (ISO.test(e.from || "") && ISO.test(e.to || "")) {
    // local dates throughout — toISOString() would shift IST midnight back a day
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    for (let d = new Date(e.from + "T00:00"); iso(d) <= e.to; d.setDate(d.getDate() + 1)) {
      for (const id of e.places || []) {
        const day = iso(d);
        const k = id + "@" + day;
        if (claimed.has(k)) out.push(`${at}: ${id} on ${day} is already claimed by ${claimed.get(k)}`);
        else claimed.set(k, e.id);
      }
    }
  }
});

if (warn.length) {
  console.warn(`places index — ${warn.length} thing(s) still to do:`);
  warn.forEach((w) => console.warn("  · " + w));
  console.warn("  (run `npm run harvest-places` to gather candidates)\n");
}

if (out.length) {
  console.error(`content check FAILED (${out.length}):`);
  out.forEach((e) => console.error("  - " + e));
  process.exit(1);
}
console.log("content check OK — all {en,hi} translated, UI keys in parity.");
