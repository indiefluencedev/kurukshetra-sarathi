// Gather candidate stays and terminals for the curated places index.
//
//   npm run harvest-places
//
// Writes scripts/out/places-candidates.json — a REVIEW file, never shipped and
// never imported. The job it turns "type sixty places by hand" into is: open
// the file, check each pin against a map, write the Hindi name, and move the
// row into src/content/data/places-index.json.
//
// Why a review step at all: a coordinate that is thirty metres out sends an
// eighty-year-old pilgrim to the wrong gate. OSM's pins are contributed, not
// surveyed, and its dharamshala coverage here is close to nothing. So this
// script gives you a starting list, not an answer — nothing it writes is
// trusted until a person has looked at it.
//
// Source is OpenStreetMap (ODbL): free to redistribute with attribution, which
// the app already carries on its maps. Note that Google Maps is not a lawful
// source for a file like this — their terms forbid storing Places results.
// Reading a single coordinate off the map by hand to correct a pin is fine;
// bulk-exporting their data into your repo is not.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const INDEX = join(HERE, "../src/content/data/places-index.json");
const OUT_DIR = join(HERE, "out");
const OUT = join(OUT_DIR, "places-candidates.json");

// Kurukshetra district's administrative boundary — OSM relation 1942848.
// Overpass area ids are 3600000000 + the relation id.
const AREA = 3601942848;

const KINDS = {
  hotel: ['"tourism"="hotel"', '"tourism"="motel"', '"tourism"="guest_house"'],
  dharamshala: ['"amenity"="shelter"'],
  station: ['"railway"="station"'],
  busstand: ['"amenity"="bus_station"'],
};

const ID_PREFIX = { hotel: "stay", dharamshala: "stay", station: "stn", busstand: "bus" };

async function overpass(tags) {
  const body = tags.flatMap((t) => [`node[${t}](area.k);`, `way[${t}](area.k);`]).join("");
  const q = `[out:json][timeout:90];area(${AREA})->.k;(${body});out center 200;`;
  const r = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    // Overpass answers 406 to a request with no Accept and no identifiable
    // agent — it is community-run and screens out anonymous bulk clients.
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "User-Agent": "kurukshetra-saarthi/0.1 (places index harvest; contact via repo)",
    },
    body: new URLSearchParams({ data: q }),
  });
  if (!r.ok) throw new Error(`Overpass ${r.status}`);
  const j = await r.json();
  if (j.remark) throw new Error("Overpass: " + j.remark);
  return j.elements || [];
}

const slug = (s) =>
  s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 28);

const existing = JSON.parse(readFileSync(INDEX, "utf8"));
const known = new Set(existing.map((p) => p.name.en.toLowerCase().trim()));

const rows = [];
for (const [kind, tags] of Object.entries(KINDS)) {
  process.stdout.write(`  ${kind}… `);
  let els = [];
  try {
    els = await overpass(tags);
  } catch (e) {
    console.log("FAILED (" + e.message + ") — skipping");
    continue;
  }
  let added = 0;
  for (const el of els) {
    const t = el.tags || {};
    const name = (t.name || "").trim();
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (!name || lat == null || lng == null) continue;
    if (known.has(name.toLowerCase())) continue; // already curated — leave it alone
    known.add(name.toLowerCase());
    rows.push({
      id: `${ID_PREFIX[kind]}-${slug(name)}`,
      kind,
      name: { en: name, hi: t["name:hi"] || "" }, // blank hi = still needs a human
      lat: +Number(lat).toFixed(6),
      lng: +Number(lng).toFixed(6),
      area: { en: t["addr:city"] || t["addr:suburb"] || "", hi: "" },
      ...(t["railway:ref"] || t.ref ? { code: t["railway:ref"] || t.ref } : {}),
      ...(t.phone || t["contact:phone"] ? { phone: t.phone || t["contact:phone"] } : {}),
      checked: null, // ISO date, once a person has confirmed the pin
      verified: false,
      _osm: `https://www.openstreetmap.org/${el.type}/${el.id}`,
      _map: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
    });
    added++;
  }
  console.log(`${added} new`);
  await new Promise((r) => setTimeout(r, 2000)); // Overpass is community-run; be polite
}

rows.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.en.localeCompare(b.name.en));
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, JSON.stringify(rows, null, 1) + "\n");

console.log(`\n${rows.length} candidate(s) → ${OUT}`);
console.log(`${existing.length} already curated in places-index.json (left untouched)\n`);
console.log("Next, per row: open _map, check the pin is on the actual entrance,");
console.log("write name.hi and area, set checked to today's date and verified to true,");
console.log("then move it into src/content/data/places-index.json and drop the _ fields.");
