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
  stays: read(base + "data/hotels.json"),
  events: read(base + "data/events.json"),
  cities: read(base + "data/cities.json"),
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
// Terminals only. Somewhere to sleep is a stay — see the block below it.
const KINDS = new Set(["station", "busstand"]);
const STAY_KINDS = new Set(["hotel", "dharamshala", "guesthouse", "homestay"]);
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

/* ---- the stays ----
   Same rules, and one more: a stay is somewhere a visitor may be told to start
   their day from, so a swapped coordinate is the same failure as a start
   point's. The price is checked because "from 800 to 400" reads as a working
   range and prints backwards. */
const stayIds = new Map();
data.stays.forEach((s, i) => {
  const at = `stays[${i}] ${s?.name?.en || s?.id || "?"}`;
  if (!s.id) out.push(`${at}: missing id`);
  else if (stayIds.has(s.id)) out.push(`${at}: duplicate id "${s.id}" (also ${stayIds.get(s.id)})`);
  else stayIds.set(s.id, at);

  if (!STAY_KINDS.has(s.kind)) out.push(`${at}: unknown kind "${s.kind}"`);
  /* A pin is what the app needs and the one field open data could not supply
     for this district — see the header of the harvest. So a stay with no
     coordinate is allowed IF it is hidden: it sits in the dashboard with its
     phone number waiting for someone to place it. A stay the app will offer
     without one is the error, because the planner would route to undefined. */
  if (s.lat == null && s.lng == null) {
    if (!s.pending) out.push(`${at}: no pin, so it must be "pending" until someone places it`);
    else warn.push(`${at}: waiting for a pin`);
  } else if (typeof s.lat !== "number" || typeof s.lng !== "number") {
    out.push(`${at}: lat/lng must both be numbers`);
  } else if (s.lat < BOX.lat[0] || s.lat > BOX.lat[1] || s.lng < BOX.lng[0] || s.lng > BOX.lng[1]) {
    out.push(`${at}: ${s.lat}, ${s.lng} is outside Kurukshetra district`);
  }
  if (s.price && s.price.min > s.price.max) out.push(`${at}: price runs backwards`);
});

/* ---- the towns ----
   Every list on screen is `filter(d => d.city === S.city)`. A place carrying a
   town id that no longer exists is not a visible error — it is a place that
   silently stops appearing anywhere, which is the failure mode this catches.
   The same filter runs over hero photographs and the start-point index, so all
   three are checked against the same list. */
const cityIds = new Set(data.cities.map((c) => c.id));
const DEFAULT_CITY = data.cities[0]?.id;
if (!DEFAULT_CITY) out.push("cities: the list is empty — every filter would come back empty");
for (const c of data.cities) {
  const at = `cities ${c.id}`;
  if (!c.centre || typeof c.centre.lat !== "number" || typeof c.centre.lng !== "number")
    out.push(`${at}: centre must be {lat,lng} numbers`);
  if (!c.wx || typeof c.wx.lat !== "number") out.push(`${at}: wx must be {lat,lng} numbers`);
  if (!c.pin) out.push(`${at}: no pin code — the weather sheet prints it`);
}
for (const [name, list] of [["destinations", data.destinations], ["hero", data.hero], ["places", data.places], ["stays", data.stays]]) {
  list.forEach((x, i) => {
    const id = x.city ?? DEFAULT_CITY;
    if (!cityIds.has(id)) out.push(`${name}[${i}] ${x.id}: unknown city "${x.city}"`);
  });
}
// A town with no places is a town the picker offers and the visitor lands on
// an empty Explore — worse than not offering it at all.
for (const c of data.cities) {
  const n = data.destinations.filter((d) => (d.city ?? DEFAULT_CITY) === c.id).length;
  if (!n) out.push(`cities ${c.id}: no destinations belong to it`);
}

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

