/**
 * The part of the dashboard that edits everything which is not an event.
 *
 * Places, stays, start points and e-rickshaw stands are all the same problem: a
 * JSON document with a stable id, kept in the `content` table, read by the app
 * exactly as stored. A place carries 28 fields, half of them bilingual pairs
 * and three of them repeating groups. Hand-writing four forms of that shape —
 * and then keeping four save functions in step with four field lists — is how
 * a dashboard rots: the day someone adds a field to a place, one of the four
 * places that needed changing gets missed, and the field silently never saves.
 *
 * So there is one form engine and a description of each document. `SPEC` says
 * what a place is; `groupHtml` renders any spec and `readGroup` reads any spec
 * back. Adding a field is one line in one list, and it renders, saves and
 * round-trips without touching anything else.
 *
 * Kept out of admin.ts because that file is the shell — the gate, the session,
 * the events form — and this is a self-contained thing bolted into it. Both are
 * plain strings the Worker serves; there is still no build step, deliberately.
 */

/* The vocabularies come from the app, and are repeated here as hints rather
   than enforced. The server does not validate these documents (see the note on
   the admin content route): a typo'd theme makes a place miss a filter, which
   is visible and fixable, whereas a dropdown that is wrong because this file
   drifted from data/config.ts is a field the editor cannot set at all. */
const THEMES = "mahabharat, temples, sarovar, heritage, museum, nature, spiritual, aarti";
const FACILITIES = "washroom, water, food, parking";
const CITIES = "kurukshetra, pehowa";

export const FORMS_JS = String.raw`
/* ---- what each document is ------------------------------------------------
   t: the field type, understood by fieldHtml/readField below.
     text  one line        loc     {en,hi} one line each
     area  paragraph       locarea {en,hi} paragraphs
     num   number          bool    checkbox
     csv   comma list -> array of strings
     sel   dropdown        time    HH:MM
     days  weekday checkboxes -> [0..6]
     img   one image id    imgs    several
     obj   fixed sub-object (of: fields)
     list  repeating group (of: fields)
   req marks a field the form refuses to save without. */
const SPEC = {
  places: [
    { k:"id", t:"text", lb:"Id", req:1, hint:"Lower-case with hyphens, e.g. brahma-sarovar. Reusing an id edits that place. Changing it creates a second one.", ph:"brahma-sarovar" },
    { k:"city", t:"sel", lb:"Town", opts:["kurukshetra","pehowa"], hint:"Which town's lists this appears in." },
    { k:"name", t:"loc", lb:"Name", req:1, ph:"Brahma Sarovar", phHi:"ब्रह्म सरोवर" },
    { k:"short", t:"locarea", lb:"One line", req:1, hint:"The sentence under the name on every card. One sentence.", ph:"Asia's largest sacred tank, and the ceremonial heart of Kurukshetra.", phHi:"एशिया का सबसे बड़ा पवित्र सरोवर, कुरुक्षेत्र का उत्सव-केंद्र।" },
    { k:"why", t:"locarea", lb:"Why it matters", hint:"The long piece on the place's own page. History, scripture, what happened here.", ph:"Abul Fazl, in Akbar's court, called it a small sea. A dip during an eclipse is held to carry the merit of an Ashvamedha yajna.", phHi:"अकबर के दरबारी अबुल-फ़ज़ल ने इसे लघु समुद्र कहा।" },
    { k:"themes", t:"csv", lb:"Themes", hint:"Comma separated. Known: ${THEMES}", ph:"sarovar, heritage, aarti" },
    { k:"lat", t:"num", lb:"Latitude", req:1, step:"any", hint:"Right-click the spot on openstreetmap.org and choose \"show address\".", ph:"29.9613554" },
    { k:"lng", t:"num", lb:"Longitude", req:1, step:"any", ph:"76.8285533" },
    { k:"placeId", t:"text", lb:"Google place id", hint:"Optional. Lets Directions open the right pin rather than a coordinate.", ph:"ChIJL6JHE1ZHDjkRLrWe5di8dqg" },
    { k:"img", t:"img", lb:"Main photograph" },
    { k:"gallery", t:"imgs", lb:"More photographs" },
    { k:"visit", t:"obj", lb:"How long people spend", of:[
      { k:"rec", t:"num", lb:"Usually (minutes)", req:1, hint:"What the planner budgets.", ph:"60" },
      { k:"min", t:"num", lb:"Rushed (minutes)", ph:"30" },
      { k:"max", t:"num", lb:"Unhurried (minutes)", ph:"120" },
    ] },
    { k:"hours", t:"obj", lb:"Opening hours", of:[
      { k:"o", t:"time", lb:"Opens", ph:"05:00" },
      { k:"c", t:"time", lb:"Closes", ph:"21:00" },
    ] },
    { k:"closed", t:"days", lb:"Closed on", hint:"Most museums here close on Monday. Leave all unticked if it never closes." },
    { k:"free", t:"bool", lb:"Free to enter" },
    { k:"fee", t:"loc", lb:"What it costs", hint:"Only if not free. Plain words: \"₹20, camera ₹50\".", ph:"20 rupees, camera 50", phHi:"₹20, कैमरा ₹50" },
    { k:"best", t:"loc", lb:"Best time to come", ph:"Sunset, when the ghats are lit", phHi:"सूर्यास्त, जब घाट जगमगाते हैं" },
    { k:"bestKey", t:"text", lb:"Best-time tag", hint:"Optional short tag the app groups by, e.g. sunset, morning.", ph:"sunset" },
    { k:"inside", t:"list", lb:"What is inside", add:"Add something inside", of:[
      { k:"n", t:"loc", lb:"Name", ph:"Sarveshwar Mahadev Mandir", phHi:"सर्वेश्वर महादेव मंदिर" },
      { k:"d", t:"locarea", lb:"Description", ph:"On an island mid-tank, reached by a bridge.", phHi:"सरोवर के मध्य टापू पर, पुल से पहुँचा जाता है।" },
    ] },
    { k:"notice", t:"list", lb:"Things to know", add:"Add a notice", of:[
      { k:"t", t:"loc", lb:"Heading", ph:"Very crowded at eclipses", phHi:"ग्रहण पर अत्यधिक भीड़" },
      { k:"d", t:"locarea", lb:"Detail", ph:"On an island mid-tank, reached by a bridge.", phHi:"सरोवर के मध्य टापू पर, पुल से पहुँचा जाता है।" },
    ] },
    { k:"parking", t:"loc", lb:"Parking", ph:"Free, at the south gate", phHi:"निःशुल्क, दक्षिण द्वार पर" },
    { k:"facilities", t:"csv", lb:"Facilities", hint:"Comma separated. Known: ${FACILITIES}", ph:"washroom, water, parking" },
    { k:"indoor", t:"bool", lb:"Mostly indoors", hint:"Used to suggest somewhere when it is raining or very hot." },
    { k:"child", t:"bool", lb:"Good with children" },
    { k:"senior", t:"bool", lb:"Easy for older visitors", hint:"Few steps, somewhere to sit, short walk from parking." },
    { k:"rank", t:"num", lb:"Importance", hint:"Higher comes first when the planner has to choose. 0-100.", ph:"90" },
    { k:"first", t:"num", lb:"First-visit rank", hint:"Higher means \"see this on a first trip\".", ph:"1" },
    { k:"anchor", t:"obj", lb:"Fixed-time event", hint:"Only for something that happens at a set hour, like an aarti or a light show.", of:[
      { k:"at", t:"num", lb:"Starts at (minutes after midnight)", hint:"6pm is 1080. The planner builds the day around this.", ph:"1080" },
      { k:"win", t:"csv", lb:"Window (two numbers)", hint:"Earliest and latest it is worth arriving, same units. e.g. 1020, 1110", ph:"1020, 1110" },
      { k:"lb", t:"loc", lb:"What it is called", ph:"Evening aarti", phHi:"संध्या आरती" },
    ] },
    { k:"pending", t:"bool", lb:"Hide from the app", hint:"Keeps the record without showing it. For somewhere closed for restoration." },
  ],

  hotels: [
    { k:"id", t:"text", lb:"Id", req:1, hint:"Lower-case with hyphens, e.g. neelkanth-yatri-niwas.", ph:"neelkanth-yatri-niwas" },
    { k:"city", t:"sel", lb:"Town", opts:["kurukshetra","pehowa"] },
    { k:"name", t:"loc", lb:"Name", req:1, ph:"Neelkanth Yatri Niwas", phHi:"नीलकंठ यात्री निवास" },
    { k:"kind", t:"sel", lb:"Kind", req:1, opts:["hotel","dharamshala","guesthouse","homestay"],
      hint:"A dharamshala and a hotel are different propositions for a pilgrim, not different prices." },
    { k:"area", t:"loc", lb:"Locality", hint:"In words — \"near the bus stand\", \"Sector 13\". What tells someone how far out it is.", ph:"Near Brahma Sarovar, 400 m from the ghats", phHi:"ब्रह्म सरोवर के पास, घाटों से 400 मी" },
    { k:"lat", t:"num", lb:"Latitude", req:1, step:"any", ph:"29.9601" },
    { k:"lng", t:"num", lb:"Longitude", req:1, step:"any", ph:"76.8290" },
    { k:"price", t:"obj", lb:"Rupees per night", hint:"Indicative. A tariff card is never one number.", of:[
      { k:"min", t:"num", lb:"From", ph:"30" },
      { k:"max", t:"num", lb:"To", ph:"120" },
    ] },
    { k:"phone", t:"text", lb:"Phone", hint:"The number someone should actually ring. With the STD code.", ph:"01744-220123" },
    { k:"note", t:"locarea", lb:"What a local would tell you", ph:"Simple rooms, no food. Ask for one on the sarovar side.", phHi:"साधारण कमरे, भोजन नहीं। सरोवर की ओर का कमरा माँगें।" },
    { k:"img", t:"img", lb:"Photograph" },
    { k:"gallery", t:"imgs", lb:"More photographs" },
    { k:"facilities", t:"csv", lb:"Facilities", hint:"Comma separated. Known: ${FACILITIES}", ph:"washroom, water, parking" },
    { k:"pending", t:"bool", lb:"Hide from the app", hint:"For somewhere that has closed." },
  ],

  startpoints: [
    { k:"id", t:"text", lb:"Id", req:1, hint:"Lower-case with hyphens, e.g. kurukshetra-junction.", ph:"kurukshetra-junction" },
    { k:"kind", t:"sel", lb:"Kind", req:1, opts:["station","busstand","hotel","dharamshala"] },
    { k:"city", t:"sel", lb:"Town", opts:["kurukshetra","pehowa"] },
    { k:"name", t:"loc", lb:"Name", req:1, ph:"Kurukshetra Junction", phHi:"कुरुक्षेत्र जंक्शन" },
    { k:"area", t:"loc", lb:"Locality", ph:"Railway Road", phHi:"रेलवे रोड" },
    { k:"lat", t:"num", lb:"Latitude", req:1, step:"any", hint:"Put the pin on the GATE people actually walk out of, not the middle of the site.", ph:"29.9701" },
    { k:"lng", t:"num", lb:"Longitude", req:1, step:"any", ph:"76.8342" },
    { k:"code", t:"text", lb:"Station code", hint:"For a railway station — KKDE, SHDM. What a ticket is booked against.", ph:"KKDE" },
    { k:"phone", t:"text", lb:"Phone", ph:"139" },
    { k:"checked", t:"text", lb:"Coordinates last checked", hint:"YYYY-MM-DD. The day a person last confirmed the pin against a map.", ph:"2026-08-05" },
    { k:"verified", t:"bool", lb:"Pin confirmed by a person" },
  ],

  erickshaw: [
    { k:"id", t:"text", lb:"Id", req:1, ph:"stand-brahma-sarovar" },
    { k:"city", t:"sel", lb:"Town", opts:["kurukshetra","pehowa"] },
    { k:"name", t:"loc", lb:"Stand name", req:1, ph:"Brahma Sarovar stand", phHi:"ब्रह्म सरोवर स्टैंड" },
    { k:"area", t:"loc", lb:"Locality", ph:"South gate", phHi:"दक्षिण द्वार" },
    { k:"lat", t:"num", lb:"Latitude", req:1, step:"any", ph:"29.9605" },
    { k:"lng", t:"num", lb:"Longitude", req:1, step:"any", ph:"76.8281" },
    { k:"phone", t:"text", lb:"Phone", ph:"9812345678" },
    { k:"note", t:"locarea", lb:"Anything worth knowing", hint:"Typical fare, hours it is manned.", ph:"About 30 rupees to the museum. Manned 6am to 9pm.", phHi:"संग्रहालय तक लगभग ₹30। सुबह 6 से रात 9 बजे तक।" },
  ],
};

/* Which kinds get a tab, and what to call them in the interface. "hotels" is
   the storage kind; "Stays" is the word, because a dharamshala is not a hotel
   and the list holds both. */
const KINDS = [
  { k:"places", lb:"Places" },
  { k:"hotels", lb:"Stays" },
  { k:"startpoints", lb:"Start points" },
  { k:"erickshaw", lb:"E-rickshaw" },
];

/* ---- rendering ---------------------------------------------------------- */

const ek = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
const hintOf = (f) => f.hint ? '<span class="hint">' + ek(f.hint) + '</span>' : "";
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

/** One field, wrapped so readGroup can find it again by key. */
function fieldHtml(f, v) {
  const t = f.t;
  const lb = ek(f.lb) + (f.req ? ' <em class="req">required</em>' : "");
  let inner = "";

  // A placeholder carrying a REAL example, not a restatement of the label.
  // "Id — required" says nothing to someone who has never seen this data;
  // "brahma-sarovar" greyed out in the box says the whole rule at a glance.
  const ph = (x) => x ? ' placeholder="' + ek(x) + '"' : "";

  if (t === "text" || t === "time" || t === "num") {
    const it = t === "num" ? "number" : t === "time" ? "time" : "text";
    inner = '<input data-i type="' + it + '"' + (f.step ? ' step="' + f.step + '"' : "") + ph(f.ph) +
            ' value="' + ek(v == null ? "" : v) + '">';
  } else if (t === "area") {
    inner = '<textarea data-i' + ph(f.ph) + ">" + ek(v == null ? "" : v) + "</textarea>";
  } else if (t === "bool") {
    inner = '<label class="chk"><input data-i type="checkbox"' + (v ? " checked" : "") + '> yes</label>';
  } else if (t === "csv") {
    inner = '<input data-i type="text"' + ph(f.ph) + ' value="' +
      ek(Array.isArray(v) ? v.join(", ") : (v == null ? "" : v)) + '">';
  } else if (t === "sel") {
    inner = '<select data-i><option value=""></option>' +
      f.opts.map(o => '<option' + (v === o ? " selected" : "") + '>' + ek(o) + "</option>").join("") + "</select>";
  } else if (t === "loc" || t === "locarea") {
    const box = (lang, val) => t === "locarea"
      ? '<textarea data-i="' + lang + '"' + ph(lang === "en" ? f.ph : f.phHi) + ">" + ek(val) + "</textarea>"
      : '<input data-i="' + lang + '" type="text"' + ph(lang === "en" ? f.ph : f.phHi) +
        ' value="' + ek(val) + '">';
    inner = '<div class="pair"><span><small>English</small>' + box("en", (v && v.en) || "") + "</span>" +
            '<span><small>हिन्दी</small>' + box("hi", (v && v.hi) || "") + "</span></div>";
  } else if (t === "days") {
    inner = '<div class="days">' + DAYS.map((d, i) =>
      '<label class="chk"><input data-i="' + i + '" type="checkbox"' +
      (Array.isArray(v) && v.indexOf(i) >= 0 ? " checked" : "") + "> " + d + "</label>").join("") + "</div>";
  } else if (t === "img" || t === "imgs") {
    const val = t === "imgs" ? (Array.isArray(v) ? v.join(", ") : "") : (v == null ? "" : v);
    inner = '<div class="imgf"><input data-i type="text" value="' + ek(val) + '" placeholder="' +
      (t === "imgs" ? "brahma-sarovar-1, brahma-sarovar-2" : "brahma-sarovar") + '">' +
      '<button type="button" class="ghost sm" data-pick="' + t + '">Pick…</button></div>' +
      '<div class="thumbs" data-thumbs></div>';
  } else if (t === "obj") {
    inner = '<div class="sub" data-group>' + groupHtml(f.of, v || {}) + "</div>";
  } else if (t === "list") {
    const rows = (Array.isArray(v) ? v : []).map(item => listRow(f, item)).join("");
    inner = '<div class="rows" data-rows>' + rows + "</div>" +
      '<button type="button" class="ghost sm" data-add>' + ek(f.add || "Add") + "</button>";
  }

  return '<div class="fld" data-k="' + ek(f.k) + '" data-t="' + ek(t) + '"><label class="fl">' + lb +
    hintOf(f) + "</label>" + inner + "</div>";
}

/** One repeat inside a list field. Its own group, plus a way to remove it. */
function listRow(f, item) {
  return '<div class="lrow"><div data-group>' + groupHtml(f.of, item || {}) + "</div>" +
    '<button type="button" class="danger sm" data-del>Remove</button></div>';
}

function groupHtml(fields, obj) {
  return fields.map(f => fieldHtml(f, obj ? obj[f.k] : undefined)).join("");
}

/* ---- reading back -------------------------------------------------------- */

/* :scope > .fld is what keeps nesting honest. A place has an "inside" list
   whose rows each contain a "name" field, and a plain querySelector for
   [data-k=name] from the top would find the first row's, not the place's. */
function readGroup(fields, root) {
  const out = {};
  for (const f of fields) {
    const el = root.querySelector(':scope > .fld[data-k="' + f.k + '"]');
    if (!el) continue;
    const v = readField(f, el);
    // Absent rather than empty: the app treats a missing field and an empty one
    // the same, and documents that carry "" for every unanswered field are
    // twice the size and much harder to read in the database.
    if (v !== undefined) out[f.k] = v;
  }
  return out;
}

function readField(f, el) {
  const t = f.t;
  const one = () => el.querySelector("[data-i]");

  if (t === "text" || t === "time") { const s = one().value.trim(); return s || undefined; }
  if (t === "num") { const s = one().value.trim(); return s === "" ? undefined : Number(s); }
  if (t === "area") { const s = one().value.trim(); return s || undefined; }
  if (t === "bool") return one().checked ? true : undefined;
  if (t === "csv") {
    const a = one().value.split(",").map(s => s.trim()).filter(Boolean);
    // A csv of numbers (anchor.win) stays numbers — the app compares it to a clock.
    const nums = a.every(s => s !== "" && !isNaN(Number(s)));
    return a.length ? (f.k === "win" && nums ? a.map(Number) : a) : undefined;
  }
  if (t === "sel") { const s = one().value; return s || undefined; }
  if (t === "loc" || t === "locarea") {
    const en = el.querySelector('[data-i="en"]').value.trim();
    const hi = el.querySelector('[data-i="hi"]').value.trim();
    return en || hi ? { en: en, hi: hi } : undefined;
  }
  if (t === "days") {
    const a = [];
    el.querySelectorAll("[data-i]").forEach(x => { if (x.checked) a.push(Number(x.getAttribute("data-i"))); });
    return a.length ? a : undefined;
  }
  if (t === "img") { const s = one().value.trim(); return s || undefined; }
  if (t === "imgs") {
    const a = one().value.split(",").map(s => s.trim()).filter(Boolean);
    return a.length ? a : undefined;
  }
  if (t === "obj") {
    const o = readGroup(f.of, el.querySelector("[data-group]"));
    return Object.keys(o).length ? o : undefined;
  }
  if (t === "list") {
    const rows = [];
    el.querySelectorAll(":scope > [data-rows] > .lrow").forEach(r => {
      const o = readGroup(f.of, r.querySelector("[data-group]"));
      if (Object.keys(o).length) rows.push(o);
    });
    return rows.length ? rows : undefined;
  }
  return undefined;
}

/* ---- the content screens -------------------------------------------------- */

let CKIND = "places";      // which tab is open
let CITEMS = [];           // what the server last gave us for it
let MEDIA = null;          // the image library, loaded once and reused

function cSpec() { return SPEC[CKIND]; }

async function cLoad(kind) {
  if (kind) CKIND = kind;
  const r = await api("/admin/content/" + CKIND).then(r => r.json());
  CITEMS = r.items || [];
  paintTable();
  $("#ccount").textContent = CITEMS.length + " " + (CITEMS.length === 1 ? "entry" : "entries");
}

/**
 * The catalogue as a table.
 *
 * It was a stack of <li> with the name in bold and everything else run together
 * into one grey line — which is readable for four events and useless for
 * fifty-seven places. You cannot scan a column that is not a column: "does this
 * one have a photograph", "which are hidden", "is the Hindi missing" are all
 * questions about a set of rows, and the answer has to be visible down the page
 * rather than assembled by reading each entry.
 *
 * The photograph is the first column deliberately. It is the field most likely
 * to be wrong after the move to R2 — an id pointing at nothing looks fine in
 * text and obviously broken as a picture.
 */
function paintTable() {
  const q = ($("#csearch").value || "").trim().toLowerCase();
  const rows = CITEMS.map((it, i) => ({ it: it, i: i })).filter(({ it }) => {
    if (!q) return true;
    return ((it.id || "") + " " + ((it.name && it.name.en) || "") + " " + ((it.name && it.name.hi) || "") +
            " " + (it.city || "") + " " + (it.kind || "")).toLowerCase().indexOf(q) >= 0;
  });

  const head = "<tr><th></th><th>Name</th><th>Id</th><th>Where</th><th>Details</th><th></th></tr>";
  const body = rows.map(({ it, i }) => {
    const en = (it.name && it.name.en) || "";
    const hi = (it.name && it.name.hi) || "";
    // The fallback is always rendered, hidden behind the image, and revealed by
    // onerror. "no photograph set" and "photograph id points at nothing" are
    // different problems and only the second one is a mistake — an empty frame
    // for both is how a broken id survives a review.
    const thumb = it.img
      ? '<img src="' + ek(imgSrc(it.img)) + '" alt="" loading="lazy" onerror="this.classList.add(\'bad\')">' +
        '<span class="nopic missing">missing</span>'
      : '<span class="nopic">none</span>';
    const gal = (it.gallery || []).length;

    const where = [it.city || "", it.lat != null ? Number(it.lat).toFixed(4) + ", " + Number(it.lng).toFixed(4) : ""]
      .filter(Boolean).map(x => "<div>" + ek(x) + "</div>").join("");

    // Whatever this kind actually carries, rather than a fixed set of columns
    // that is half empty for three of the four kinds.
    const d = [];
    if (it.kind) d.push(ek(it.kind));
    if (it.themes && it.themes.length) d.push(ek(it.themes.join(", ")));
    if (it.visit && it.visit.rec) d.push(it.visit.rec + " min");
    if (it.price && (it.price.min || it.price.max)) d.push("₹" + (it.price.min || "?") + "–" + (it.price.max || "?"));
    if (it.phone) d.push(ek(it.phone));
    if (it.code) d.push(ek(it.code));
    if (gal) d.push(gal + " more photo" + (gal === 1 ? "" : "s"));
    if (!hi) d.push('<em class="warn">no Hindi</em>');
    if (it.pending) d.push('<em class="warn">hidden</em>');

    return '<tr' + (it.pending ? ' class="dim"' : "") + '>' +
      '<td class="tpic">' + thumb + "</td>" +
      '<td><b>' + ek(en || it.id) + "</b>" + (hi ? '<div class="hi">' + ek(hi) + "</div>" : "") + "</td>" +
      '<td><code>' + ek(it.id) + "</code></td>" +
      "<td>" + (where || "—") + "</td>" +
      '<td class="det">' + (d.join(" · ") || "—") + "</td>" +
      '<td class="tacts"><button class="ghost sm" data-edit="' + i + '">Edit</button>' +
      '<button class="danger sm" data-cdel="' + ek(it.id) + '">Delete</button></td></tr>';
  }).join("");

  $("#clist").innerHTML = rows.length
    ? "<table class=\"dt\"><thead>" + head + "</thead><tbody>" + body + "</tbody></table>"
    : '<p class="muted">' + (q ? "Nothing matches “" + ek(q) + "”." : "Nothing yet.") + "</p>";
}

/** Draw the form for one document, or an empty one. */
function cForm(obj) {
  $("#cform").innerHTML = groupHtml(cSpec(), obj || {});
  $("#editor").querySelectorAll("[data-thumbs]").forEach(paintThumbs);
  cmsg("");
}
function cBlank() { cForm(null); $("#ctitle").textContent = "Add a new " + kindWord(); }

/** The word for one record of the kind on screen, for headings people read. */
function kindWord() {
  const k = KINDS.filter(x => x.k === CKIND)[0];
  const w = (k ? k.lb : CKIND).toLowerCase();
  return w === "places" ? "place" : w === "stays" ? "stay" :
         w === "start points" ? "start point" : w === "e-rickshaw" ? "e-rickshaw stand" : "entry";
}

function openEditor() { $("#editor").hidden = false; document.body.style.overflow = "hidden"; }
function closeEditor() { $("#editor").hidden = true; document.body.style.overflow = ""; }

function cEdit(i) {
  const it = CITEMS[i];
  if (!it) return;
  cForm(it);
  $("#ctitle").textContent = "Editing " + ((it.name && it.name.en) || it.id || "");
  openEditor();
}

const cmsg = (t, bad) => {
  const m = $("#cm");
  m.className = t ? "msg " + (bad ? "bad" : "good") : "";
  m.textContent = t;
};

async function cSave() {
  const doc = readGroup(cSpec(), $("#cform"));
  const missing = cSpec().filter(f => f.req && doc[f.k] === undefined).map(f => f.lb);
  if (missing.length) return cmsg("Fill these in first: " + missing.join(", "), true);
  if (!/^[a-z0-9-]+$/.test(doc.id)) return cmsg("The id may only hold lower-case letters, digits and hyphens.", true);

  const r = await api("/admin/content/" + CKIND, {
    method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(doc),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return cmsg(j.error || ("Save failed (" + r.status + ")"), true);
  cmsg("");
  closeEditor();
  await cLoad();
}

async function cDel(id) {
  if (!confirm("Delete " + id + "?\n\nThis removes it from the app. If it has only closed for a while, tick \"Hide from the app\" instead — that keeps the record.")) return;
  await api("/admin/content/" + CKIND, {
    method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: id }),
  });
  cLoad();
}

/* ---- photographs ---------------------------------------------------------- */

const imgSrc = (id) => "/img/" + encodeURIComponent(id) + (id.indexOf(".") < 0 ? ".webp" : "");

/** Little previews under an image field, so a wrong id is visible immediately. */
function paintThumbs(box) {
  const fld = box.closest(".fld");
  const input = fld.querySelector("[data-i]");
  const ids = input.value.split(",").map(s => s.trim()).filter(Boolean);
  box.innerHTML = ids.map(id =>
    '<span class="th"><img src="' + ek(imgSrc(id)) + '" alt="" loading="lazy" ' +
    'onerror="this.parentNode.classList.add(\'miss\')"><small>' + ek(id) + "</small></span>").join("");
}

async function mediaList(force) {
  if (MEDIA && !force) return MEDIA;
  const r = await api("/admin/media").then(r => r.json());
  MEDIA = r.items || [];
  return MEDIA;
}

/**
 * The picker. Opens over the form, lists what is in the bucket, and puts the
 * chosen key into the field that opened it.
 */
async function pickImage(fld, multi) {
  const items = await mediaList();
  $("#pickgrid").innerHTML = items.map(o => {
    const id = o.key.replace(/\.[a-z]+$/, "");
    return '<button type="button" class="pk" data-key="' + ek(id) + '">' +
      '<img src="' + ek("/img/" + encodeURIComponent(o.key)) + '" alt="" loading="lazy">' +
      "<small>" + ek(id) + "</small></button>";
  }).join("") || "<p class=\"muted\">Nothing uploaded yet.</p>";
  $("#picker").hidden = false;
  $("#picker").setAttribute("data-multi", multi ? "1" : "");
  PICK_FOR = fld;
}
let PICK_FOR = null;

function pickChoose(id) {
  if (!PICK_FOR) return;
  const input = PICK_FOR.querySelector("[data-i]");
  const multi = $("#picker").getAttribute("data-multi") === "1";
  if (multi) {
    const have = input.value.split(",").map(s => s.trim()).filter(Boolean);
    if (have.indexOf(id) < 0) have.push(id);
    input.value = have.join(", ");
  } else {
    input.value = id;
    $("#picker").hidden = true;
  }
  paintThumbs(PICK_FOR.querySelector("[data-thumbs]"));
}

/**
 * Upload. The key is the id the content will refer to, so it is asked for
 * rather than taken from the filename — a file called "IMG_4821.jpg" would
 * otherwise become an id nobody can guess, and the whole scheme depends on
 * img:"brahma-sarovar" meaning brahma-sarovar.webp.
 */
async function mediaUpload(ev) {
  ev.preventDefault();
  const file = $("#upfile").files[0];
  let key = $("#upkey").value.trim().toLowerCase();
  if (!file) return upmsg("Choose an image first.", true);
  const ext = (file.type.split("/")[1] || "webp").replace("jpeg", "jpg");
  if (!key) key = (file.name.replace(/\.[^.]+$/, "") || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (!key) return upmsg("Give it a name, e.g. brahma-sarovar.", true);
  if (key.indexOf(".") < 0) key = key + "." + ext;

  upmsg("Uploading…");
  const r = await api("/admin/media?key=" + encodeURIComponent(key), {
    method: "PUT", headers: { "content-type": file.type }, body: file,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return upmsg(j.error || ("Upload failed (" + r.status + ")"), true);
  upmsg("Uploaded as " + key + " — use the id \"" + key.replace(/\.[a-z]+$/, "") + "\".");
  $("#upfile").value = ""; $("#upkey").value = "";
  await mediaList(true);
  if ($("#tab-media").hidden === false) paintLibrary();
  if (!$("#picker").hidden) { const f = PICK_FOR; if (f) pickImage(f, $("#picker").getAttribute("data-multi") === "1"); }
}
const upmsg = (t, bad) => { const m = $("#upm"); m.className = t ? "msg " + (bad ? "bad" : "good") : ""; m.textContent = t; };

async function paintLibrary() {
  const items = await mediaList(true);
  $("#libcount").textContent = items.length + " " + (items.length === 1 ? "photograph" : "photographs") +
    " · " + (items.reduce((n, o) => n + o.size, 0) / 1024 / 1024).toFixed(2) + " MB";
  $("#libgrid").innerHTML = items.map(o =>
    '<div class="pk"><img src="' + ek("/img/" + encodeURIComponent(o.key)) + '" alt="" loading="lazy">' +
    "<small>" + ek(o.key.replace(/\.[a-z]+$/, "")) + "</small>" +
    '<button type="button" class="danger sm" data-mdel="' + ek(o.key) + '">Delete</button></div>').join("") ||
    "<p class=\"muted\">Nothing uploaded yet. Use the box above.</p>";
}

async function mediaDelete(key) {
  if (!confirm("Delete " + key + "?\n\nAny place still pointing at it will show an empty frame.")) return;
  await api("/admin/media?key=" + encodeURIComponent(key), { method: "DELETE" });
  await mediaList(true);
  paintLibrary();
}

/* ---- wiring --------------------------------------------------------------
   One delegated listener per surface rather than inline handlers, for the same
   reason the sign-in form uses addEventListener: an inline handler that fails
   to run looks exactly like a button that does nothing. */
function wireForms() {
  $("#clist").addEventListener("click", (e) => {
    const ed = e.target.closest("[data-edit]");
    if (ed) return cEdit(Number(ed.getAttribute("data-edit")));
    const dl = e.target.closest("[data-cdel]");
    if (dl) return cDel(dl.getAttribute("data-cdel"));
  });

  $("#editor").addEventListener("click", (e) => {
    const add = e.target.closest("[data-add]");
    if (add) {
      const fld = add.closest(".fld");
      const spec = findSpec(fld);
      fld.querySelector("[data-rows]").insertAdjacentHTML("beforeend", listRow(spec, {}));
      return;
    }
    const del = e.target.closest("[data-del]");
    if (del) return del.closest(".lrow").remove();
    const pick = e.target.closest("[data-pick]");
    if (pick) return pickImage(pick.closest(".fld"), pick.getAttribute("data-pick") === "imgs");
  });

  // Typing an id by hand should preview too, not only picking one.
  $("#editor").addEventListener("input", (e) => {
    const fld = e.target.closest('.fld[data-t="img"], .fld[data-t="imgs"]');
    if (fld) paintThumbs(fld.querySelector("[data-thumbs]"));
  });

  $("#csave").addEventListener("click", cSave);
  $("#cclose").addEventListener("click", closeEditor);
  $("#cclose2").addEventListener("click", closeEditor);
  // Clicking the dimmed area behind the drawer closes it, as every drawer does.
  $("#editor").addEventListener("click", (e) => { if (e.target.id === "editor") closeEditor(); });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!$("#picker").hidden) return void ($("#picker").hidden = true);
    if (!$("#editor").hidden) closeEditor();
  });
  // Filtering redraws from CITEMS rather than asking the server again — the
  // whole catalogue is already here, and a request per keystroke would be a
  // database read per keystroke.
  $("#csearch").addEventListener("input", paintTable);
  $("#cadd").addEventListener("click", () => { cBlank(); openEditor(); });

  $("#picker").addEventListener("click", (e) => {
    if (e.target.id === "picker" || e.target.closest("[data-pclose]")) return void ($("#picker").hidden = true);
    const b = e.target.closest("[data-key]");
    if (b) pickChoose(b.getAttribute("data-key"));
  });

  $("#upform").addEventListener("submit", mediaUpload);
  $("#libgrid").addEventListener("click", (e) => {
    const d = e.target.closest("[data-mdel]");
    if (d) mediaDelete(d.getAttribute("data-mdel"));
  });
}

/** The spec entry for a rendered field — needed to add a row to a list. */
function findSpec(fld) {
  const k = fld.getAttribute("data-k");
  const walk = (fields) => {
    for (const f of fields) {
      if (f.k === k && (f.t === "list" || f.t === "obj")) return f;
      if (f.of) { const r = walk(f.of); if (r) return r; }
    }
    return null;
  };
  return walk(cSpec());
}
`;

export const FORMS_CSS = String.raw`
 /* ---- the shell ----------------------------------------------------------
    One list of destinations down the left, one working area to the right, and
    the editor only on screen when something is being edited.

    What this replaced: two rows of navigation in two different places (a top
    bar choosing "Content / Events / Photographs", and a separate strip of pills
    choosing which kind of content), a working area pinned to a narrow column
    with empty space either side of it, and a form that was always open even
    when nobody was adding anything — so the page loaded showing a blank form
    for a record that did not exist, above the list of records that did. */
 .shell{display:flex;min-height:100vh;align-items:stretch}
 .side{width:216px;flex:0 0 216px;background:var(--paper);border-right:1px solid var(--line);
   display:flex;flex-direction:column;position:sticky;top:0;height:100vh}
 .sbrand{font-weight:700;font-size:17px;padding:18px 18px 12px}
 #sidenav{display:flex;flex-direction:column;gap:1px;padding:4px 10px;flex:1;overflow:auto}
 .sgrp{font-size:10.5px;text-transform:uppercase;letter-spacing:.09em;color:var(--muted);
   font-weight:700;padding:14px 8px 5px}
 #sidenav button{background:none;border:0;text-align:left;padding:9px 10px;border-radius:8px;
   color:var(--ink);font-size:14px;font-weight:600}
 #sidenav button:hover{background:var(--bg)}
 #sidenav button.on{background:var(--accent);color:#fff}
 .sfoot{border-top:1px solid var(--line);padding:12px;display:flex;flex-direction:column;gap:7px}
 .sfoot .you{font-size:12px;color:var(--muted);word-break:break-all}
 .sfoot button{width:100%;font-size:12.5px;padding:8px}
 .work{flex:1;min-width:0;display:flex;flex-direction:column}
 .topbar{display:flex;align-items:center;gap:12px;padding:16px 22px;border-bottom:1px solid var(--line);
   background:var(--paper);position:sticky;top:0;z-index:4}
 .topbar h1{font-size:19px;margin:0}
 .pane{padding:22px}
 @media(max-width:820px){
   .shell{display:block}
   .side{width:auto;flex:none;height:auto;position:static;border-right:0;border-bottom:1px solid var(--line)}
   #sidenav{flex-direction:row;flex-wrap:wrap;gap:4px}
   .sgrp{display:none}
   .sfoot{flex-direction:row;align-items:center}
 }

 /* ---- the editor drawer ----
    Over the table rather than under it. The record being edited is the only
    thing that matters while it is open, and sliding it over the list keeps the
    list exactly where it was for when it closes. */
 #editor{position:fixed;inset:0;z-index:40;display:flex;justify-content:flex-end;
   background:rgba(28,24,21,.45)}
 #editor .drawer{background:var(--bg);width:min(760px,100%);height:100%;display:flex;
   flex-direction:column;box-shadow:-8px 0 30px rgba(28,24,21,.18)}
 #editor .dhead{display:flex;align-items:center;gap:10px;padding:15px 20px;background:var(--paper);
   border-bottom:1px solid var(--line)}
 #editor .dhead h2{margin:0;font-size:16px;text-transform:none;letter-spacing:0;color:var(--ink)}
 #editor .dbody{flex:1;overflow:auto;padding:18px 20px}
 #editor .dfoot{padding:13px 20px;background:var(--paper);border-top:1px solid var(--line);
   display:flex;gap:8px;align-items:center}
 .fld{margin:14px 0}
 .fl{font-size:13px;font-weight:700;display:block;margin-bottom:4px}
 .fl .req{font-style:normal;font-weight:400;color:var(--bad);font-size:11px;
   text-transform:uppercase;letter-spacing:.06em;margin-left:6px}
 .pair{display:grid;grid-template-columns:1fr 1fr;gap:10px}
 .pair small{display:block;font-size:11px;color:var(--muted);margin-top:2px}
 @media(max-width:640px){.pair{grid-template-columns:1fr}}
 .sub{border-left:3px solid var(--line);padding-left:12px;margin-top:6px}
 .rows{display:grid;gap:10px;margin:6px 0}
 .lrow{border:1px solid var(--line);border-radius:10px;padding:10px;background:var(--bg)}
 .chk{display:inline-flex;align-items:center;gap:6px;font-weight:400;font-size:14px;margin:0}
 .chk input{width:auto;margin:0}
 .days{display:flex;gap:12px;flex-wrap:wrap;margin-top:4px}
 button.sm{padding:5px 10px;font-size:12px}
 .imgf{display:flex;gap:8px;align-items:flex-start}
 .imgf input{flex:1}
 .thumbs{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
 .th{width:74px;text-align:center}
 .th img{width:74px;height:56px;object-fit:cover;border-radius:6px;border:1px solid var(--line);display:block}
 .th small{display:block;font-size:10px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
 /* An id pointing at nothing has to look wrong, not just render an empty box —
    a broken image and a photograph that has not loaded yet are the same picture. */
 .th.miss img{display:none}
 .th.miss{border:1px dashed var(--bad);border-radius:6px;color:var(--bad);padding:4px 2px}
 .th.miss:after{content:"not found";font-size:10px;display:block}
 .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:10px}
 .pk{background:#fff;border:1px solid var(--line);border-radius:8px;padding:6px;cursor:pointer;text-align:center}
 .pk img{width:100%;height:76px;object-fit:cover;border-radius:5px;display:block}
 .pk small{display:block;font-size:10px;color:var(--muted);margin-top:4px;overflow:hidden;
   text-overflow:ellipsis;white-space:nowrap}
 .pk button{margin-top:6px;width:100%}
 #picker{position:fixed;inset:0;background:rgba(28,24,21,.55);z-index:30;padding:24px;overflow:auto}
 #picker .box{background:var(--paper);border-radius:14px;padding:18px;max-width:820px;margin:0 auto}
 .muted{color:var(--muted);font-size:14px}
 .wide{grid-column:1/-1}

 /* The content screen is one column, not two. A table of fifty-seven places
    squeezed into half the width is the thing this replaced. */
 main.one{grid-template-columns:1fr}
 .toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 14px}
 .toolbar input[type=search]{flex:1;min-width:180px;margin:0;max-width:340px}

 /* the catalogue */
 table.dt{width:100%;border-collapse:collapse;font-size:14px}
 table.dt th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.07em;
   color:var(--muted);font-weight:700;padding:0 10px 8px;border-bottom:1px solid var(--line)}
 table.dt td{padding:9px 10px;border-bottom:1px solid var(--line);vertical-align:middle}
 table.dt tr:last-child td{border-bottom:0}
 table.dt tbody tr:hover{background:var(--bg)}
 table.dt .hi{color:var(--muted);font-size:13px}
 table.dt code{font-size:12px;color:var(--muted);background:var(--bg);padding:2px 6px;border-radius:5px}
 table.dt .det{color:var(--muted);font-size:12.5px;max-width:280px}
 table.dt .tacts{white-space:nowrap;text-align:right}
 table.dt .tacts button{margin-left:6px}
 table.dt tr.dim td{opacity:.55}
 .warn{font-style:normal;color:var(--bad);font-weight:700}
 /* The photograph column. A missing picture and a WRONG id have to look
    different — both are empty frames otherwise, and only one is a mistake. */
 .tpic{width:64px}
 .tpic img{width:56px;height:42px;object-fit:cover;border-radius:5px;border:1px solid var(--line);display:block}
 .tpic img.bad{display:none}
 .tpic .nopic{display:inline-block;font-size:10px;color:var(--muted);
   border:1px dashed var(--line);border-radius:5px;padding:12px 4px;width:56px;text-align:center}
 .tpic img + .nopic{display:none}
 .tpic img.bad + .nopic{display:inline-block;color:var(--bad);border-color:var(--bad);font-weight:700}
 /* Wide screens get the form in columns; groups always span the full width. */
 #cform{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:0 18px}
 #cform > .fld[data-t="list"],#cform > .fld[data-t="obj"],
 #cform > .fld[data-t="locarea"]{grid-column:1/-1}
 @media(max-width:720px){#cform{grid-template-columns:1fr}}
`;

export const FORMS_HTML = String.raw`
<div id="pane-content" class="pane">
 <section>
  <div class="toolbar">
   <input type="search" id="csearch" placeholder="Search name, id or town…">
   <span class="you" id="ccount"></span>
   <span style="flex:1"></span>
   <button class="primary" type="button" id="cadd">+ Add new</button>
  </div>
  <div id="clist"></div>
 </section>
</div>

<div id="pane-media" class="pane" hidden>
 <main>
  <section>
   <h2>Add a photograph</h2>
   <form id="upform">
    <label>Image file
     <span class="hint">webp, jpg, png or avif. Up to 6 MB. webp is what the app uses — it is a third the size for the same picture.</span>
     <input type="file" id="upfile" accept="image/webp,image/jpeg,image/png,image/avif"></label>
    <label>Name it
     <span class="hint">Lower-case with hyphens, no extension — e.g. brahma-sarovar. THIS is what you type into a place's photograph field. Leave blank to take it from the file name. Uploading an existing name replaces that picture everywhere it is used.</span>
     <input type="text" id="upkey" placeholder="brahma-sarovar"></label>
    <div class="bar"><button class="primary" type="submit">Upload</button></div>
    <div id="upm"></div>
   </form>
  </section>
  <section>
   <h2>Every photograph <span class="you" id="libcount"></span></h2>
   <div class="grid" id="libgrid"></div>
  </section>
 </main>
</div>

<div id="picker" hidden>
 <div class="box">
  <div class="bar" style="margin:0 0 12px">
   <b style="flex:1">Choose a photograph</b>
   <button class="ghost" type="button" data-pclose>Done</button>
  </div>
  <div class="grid" id="pickgrid"></div>
 </div>
</div>
`;

/** The editor, kept out of the panes so it can sit over all of them. */
export const EDITOR_HTML = String.raw`
<div id="editor" hidden>
 <div class="drawer">
  <div class="dhead">
   <h2 id="ctitle">Add a new entry</h2>
   <span style="flex:1"></span>
   <button class="ghost" type="button" id="cclose">Close</button>
  </div>
  <div class="dbody">
   <div id="cm"></div>
   <div id="cform"></div>
  </div>
  <div class="dfoot">
   <button class="primary" type="button" id="csave">Save</button>
   <button class="ghost" type="button" id="cclose2">Cancel</button>
   <span style="flex:1"></span>
   <span class="muted" style="font-size:12px">Reaches phones within five minutes.</span>
  </div>
 </div>
</div>
`;
