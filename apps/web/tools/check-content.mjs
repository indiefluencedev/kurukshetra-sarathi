// CI / pre-commit content check: every {en,hi} is fully translated and the two
// UI dictionaries share the same keys. Exits non-zero on any problem. See docs/04.
import { readFileSync } from "node:fs";
import { validateEvent, validateEventSet } from "@kuk/shared/event-rules.mjs";

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
/* The rules themselves live in shared/event-rules.mjs, because the Worker's
   admin dashboard has to enforce exactly the same ones. Two copies would drift
   the first time a field was added, and the dashboard would happily accept an
   event the app refuses to render. This file supplies the one thing the Worker
   cannot: whether a place id actually exists in the catalogue. */
const destIds = new Set(data.destinations.map((d) => d.id));
const knownPlace = (id) => destIds.has(id);

data.events.forEach((e, i) => {
  const at = `events[${i}] ${e?.name?.en || e?.id || "?"}`;
  for (const p of validateEvent(e, knownPlace)) out.push(`${at}: ${p.replace(/^[^:]*: /, "")}`);
});
for (const p of validateEventSet(data.events)) out.push(`events: ${p}`);

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

