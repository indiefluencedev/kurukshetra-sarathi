// Gather candidate stays and terminals for the curated places index.
//
//   npm run harvest-places
//
// Writes tools/out/places-candidates.json — a REVIEW file, never shipped and
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
// bulk-exporting their data into your repo is not. That is also why there is
// no rating here: a rating is Google's content, and the honest substitute is a
// person checking the shortlist, which is what `verified` records.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const INDEX = join(HERE, "../src/content/data/places-index.json");
const CITIES = JSON.parse(readFileSync(join(HERE, "../src/content/data/cities.json"), "utf8"));
const OUT_DIR = join(HERE, "out");
const OUT = join(OUT_DIR, "places-candidates.json");

// Kurukshetra district's administrative boundary — OSM relation 1942848.
// Overpass area ids are 3600000000 + the relation id. The district, not a
// radius: it contains Thanesar, Pipli AND Pehowa, which is exactly the set of
// towns the app plans in, and it cannot leak into Karnal the way a circle does.
const AREA = 3601942848;

// Community-run and frequently at capacity — the main interpreter answered 504
// twice in a row while this file was being written, which silently dropped
// hotels and stations from the harvest. Try the mirrors in turn instead.
// Mirrors first, main last: overpass-api.de answers a busy query with HTTP 200
// and an HTML error page, so "it worked" and "it failed" look the same until
// the JSON parse throws. The mirrors are quieter and answer in JSON or not at
// all, which is the failure mode worth having.
const MIRRORS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];

const KINDS = {
  // no `hostel` — around here that tag is university halls, not a place to stay
  hotel: ['"tourism"="hotel"', '"tourism"="motel"', '"tourism"="guest_house"'],
  // Dharamshalas are barely tagged as such. `amenity=shelter` is the closest
  // indexed signal; the name sweep below is what actually finds them.
  dharamshala: ['"amenity"="shelter"'],
  station: ['"railway"="station"', '"railway"="halt"'],
  busstand: ['"amenity"="bus_station"'],
};

// What a dharamshala is actually called on a signboard. Overpass cannot search
// names across an area without an unindexed scan that times out, so these go to
// Nominatim, which is a name index and answers in a second.
const NAME_SWEEP = {
  dharamshala: ["dharamshala", "dharamshala Pehowa", "yatri niwas", "sarai Kurukshetra", "ashram Pehowa", "bhawan Kurukshetra"],
  hotel: ["hotel Pehowa", "hotel Pipli", "guest house Kurukshetra", "resort Pipli"],
  station: ["railway station Kurukshetra", "railway station Pehowa"],
  busstand: ["bus stand Pehowa", "bus stand Kurukshetra", "bus stand Pipli"],
};

/* A name scan of the two built-up areas, for the places OSM has under a name
   but not under a useful tag — a dharamshala mapped as `building=yes` is
   invisible to every query above. An unindexed regex is only affordable
   because these boxes are a few kilometres across; do NOT widen them to the
   district or Overpass will time out at 47s the way the app's own query did.
   Boxes are (south, west, north, east): Thanesar–Pipli, then Pehowa town. */
const NAME_BOXES = ["29.90,76.75,30.02,76.92", "29.93,76.52,30.03,76.64"];
const NAME_RE =
  "dharam|dharm|niwas|nivas|sarai|ashram|bhawan|bhavan|hotel|guest|resort|lodge|inn|yatri|धर्मशाला|निवास";

/* How far from a town centre a stay may be and still be that town's. Stations
   are exempt: Shahabad Markanda is 24km north and Pehowa Road 11km south, and
   both are where people actually get off the train for these towns. A hotel
   24km away is not a Kurukshetra hotel, it is an Ambala one. */
const STAY_KM = 12;

// Nominatim can't take a polygon, so it gets the district's bounding box and
// every result is then checked against the district it reports.
const BOX = "76.40,30.25,77.15,29.60";
const DISTRICT = "Kurukshetra";

const ID_PREFIX = { hotel: "stay", dharamshala: "stay", station: "stn", busstand: "bus" };
const UA = "kurukshetra-saarthi/0.1 (places index harvest; contact via repo)";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function overpass(tags) {
  const body = tags.flatMap((t) => [`node[${t}](area.k);`, `way[${t}](area.k);`]).join("");
  return ask(`[out:json][timeout:90];area(${AREA})->.k;(${body});out center 200;`);
}

/** Anything NAMED like a stay, inside the two town boxes, whatever its tags. */
async function overpassByName() {
  const body = NAME_BOXES.map((b) => `nwr["name"~"${NAME_RE}",i](${b});`).join("");
  return ask(`[out:json][timeout:120];(${body});out center 300;`);
}

async function ask(q) {
  let last;
  for (const url of MIRRORS) {
    try {
      const r = await fetch(url, {
        method: "POST",
        // Overpass answers 406 to a request with no Accept and no identifiable
        // agent — it is community-run and screens out anonymous bulk clients.
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          "User-Agent": UA,
        },
        body: new URLSearchParams({ data: q }),
      });
      if (!r.ok) throw new Error(`Overpass ${r.status}`);
      const j = await r.json();
      if (j.remark) throw new Error("Overpass: " + j.remark);
      return j.elements || [];
    } catch (e) {
      last = new Error(new URL(url).host + ": " + e.message);
      await sleep(1500);
    }
  }
  throw last;
}

async function nominatim(q) {
  const url =
    "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=25&bounded=1&addressdetails=1" +
    "&viewbox=" + BOX + "&q=" + encodeURIComponent(q);
  const r = await fetch(url, { headers: { Accept: "application/json", "User-Agent": UA } });
  if (!r.ok) throw new Error(`Nominatim ${r.status}`);
  const j = await r.json();
  // the box overlaps Karnal, Kaithal and Ambala; the district each result
  // reports is what decides whether it belongs here
  return (j || []).filter((x) => x.address?.state_district === DISTRICT || x.address?.county === DISTRICT);
}

const slug = (s) =>
  s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 28);

/* Which town a pin belongs to: whichever centre it is closest to, in plain
   degrees. Thanesar and Pehowa are 25km apart and everything else in the
   district is nearer one than the other by a wide margin, so a great-circle
   refinement would change no answer. Pipli is 6km from Thanesar and correctly
   lands in Kurukshetra — it is a locality of that town, not a third one. */
const KM_PER_DEG = 111.32;
const nearestCity = (lat, lng) =>
  CITIES.reduce((best, c) => {
    const dy = c.centre.lat - lat;
    const dx = (c.centre.lng - lng) * Math.cos((lat * Math.PI) / 180);
    const km = Math.sqrt(dy * dy + dx * dx) * KM_PER_DEG;
    return !best || km < best.km ? { id: c.id, km } : best;
  }, null);

const existing = JSON.parse(readFileSync(INDEX, "utf8"));
/* Match on id as well as name. A curated entry usually gets its name tidied —
   OSM's bare "Jyotisar" becomes "Jyotisar Halt" — and matching on the name
   alone put it straight back in the review file as a fresh candidate, which is
   the one thing this file must not do. */
const known = new Set(existing.flatMap((p) => [p.name.en.toLowerCase().trim(), "#" + p.id]));

const rows = [];
const push = (kind, name, lat, lng, t, src) => {
  name = (name || "").trim();
  if (!name || lat == null || lng == null) return false;
  const id = `${ID_PREFIX[kind]}-${slug(name)}`;
  if (known.has(name.toLowerCase()) || known.has("#" + id)) return false; // already curated, or already seen
  const near = nearestCity(+lat, +lng);
  // A stay half a district away is not this town's stay, however cleanly it
  // geocoded. Overpass handed back a Best Western 30km north and a banquet
  // hall in Ambala on the first run, both labelled "kurukshetra" by proximity
  // alone, and both would have been rows a reviewer had to know to throw out.
  if (kind !== "station" && near.km > STAY_KM) return false;
  known.add(name.toLowerCase());
  const a = t.address || {};
  rows.push({
    id,
    kind,
    city: near.id,
    _km: +near.km.toFixed(1),
    name: { en: name, hi: t["name:hi"] || "" }, // blank hi = still needs a human
    lat: +Number(lat).toFixed(6),
    lng: +Number(lng).toFixed(6),
    area: { en: t["addr:city"] || t["addr:suburb"] || a.suburb || a.town || a.village || "", hi: "" },
    ...(t["railway:ref"] || t.ref ? { code: t["railway:ref"] || t.ref } : {}),
    ...(t.phone || t["contact:phone"] ? { phone: t.phone || t["contact:phone"] } : {}),
    checked: null, // ISO date, once a person has confirmed the pin
    verified: false,
    _src: src,
    _map: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
  });
  return true;
};

for (const [kind, tags] of Object.entries(KINDS)) {
  process.stdout.write(`  ${kind}… `);
  let added = 0;
  try {
    for (const el of await overpass(tags)) {
      const t = el.tags || {};
      if (push(kind, t.name, el.lat ?? el.center?.lat, el.lon ?? el.center?.lon, t, `https://www.openstreetmap.org/${el.type}/${el.id}`))
        added++;
    }
  } catch (e) {
    process.stdout.write(`overpass failed (${e.message}) `);
  }
  for (const q of NAME_SWEEP[kind] || []) {
    try {
      for (const r of await nominatim(q)) {
        const name = r.name || String(r.display_name).split(",")[0];
        if (push(kind, name, r.lat, r.lon, { address: r.address }, `https://www.openstreetmap.org/${r.osm_type}/${r.osm_id}`))
          added++;
      }
    } catch (e) {
      process.stdout.write(`nominatim "${q}" failed (${e.message}) `);
    }
    await sleep(1100); // Nominatim's published limit is one request a second
  }
  console.log(`${added} new`);
  await sleep(1500); // Overpass is community-run; be polite
}

/* The name scan runs last and files everything as `dharamshala`, because that
   is the kind OSM under-tags and the kind a reviewer has to reclassify anyway.
   A row that turns out to be a hotel costs one word to fix; a dharamshala that
   never appeared costs a phone call to find. */
process.stdout.write("  named (town boxes)… ");
try {
  let added = 0;
  for (const el of await overpassByName()) {
    const t = el.tags || {};
    // things that merely mention a hotel — an institute of hotel management,
    // a bus stop named after one — are not places to sleep
    if (t.office || t.leisure || t.amenity === "place_of_worship" || t.highway) continue;
    if (push("dharamshala", t.name, el.lat ?? el.center?.lat, el.lon ?? el.center?.lon, t, `https://www.openstreetmap.org/${el.type}/${el.id}`))
      added++;
  }
  console.log(`${added} new`);
} catch (e) {
  console.log(`failed (${e.message})`);
}

rows.sort(
  (a, b) => a.city.localeCompare(b.city) || a.kind.localeCompare(b.kind) || a.name.en.localeCompare(b.name.en),
);
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, JSON.stringify(rows, null, 1) + "\n");

const per = {};
for (const r of rows) per[r.city + "/" + r.kind] = (per[r.city + "/" + r.kind] || 0) + 1;
console.log(`\n${rows.length} candidate(s) → ${OUT}`);
Object.entries(per).sort().forEach(([k, n]) => console.log(`  ${k}: ${n}`));
console.log(`\n${existing.length} already curated in places-index.json (left untouched)\n`);
console.log("Next, per row: open _map, check the pin is on the actual entrance,");
console.log("write name.hi and area, set checked to today's date and verified to true,");
console.log("then move it into src/content/data/places-index.json and drop the _ fields.");
