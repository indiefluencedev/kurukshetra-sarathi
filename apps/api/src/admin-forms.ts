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
     geo   a map. Searches, pins, and writes lat AND lng onto the parent —
           it is the only field whose value is not stored under its own key.
     pts   a map you click along, kept as [{lat,lng}]
   req marks a field the form refuses to save without.
   sec starts a new headed section in the form, and runs until the next one. */
const SPEC = {
  places: [
    { k:"id", t:"text", lb:"Id", req:1, sec:"What it is", hint:"Lower-case with hyphens, e.g. brahma-sarovar. Reusing an id edits that place. Changing it creates a second one.", ph:"brahma-sarovar" },
    { k:"city", t:"sel", lb:"Town", opts:["kurukshetra","pehowa"], hint:"Which town's lists this appears in." },
    { k:"name", t:"loc", lb:"Name", req:1, ph:"Brahma Sarovar", phHi:"ब्रह्म सरोवर" },
    { k:"short", t:"locarea", lb:"One line", req:1, hint:"The sentence under the name on every card. One sentence.", ph:"Asia's largest sacred tank, and the ceremonial heart of Kurukshetra.", phHi:"एशिया का सबसे बड़ा पवित्र सरोवर, कुरुक्षेत्र का उत्सव-केंद्र।" },
    { k:"why", t:"locarea", lb:"Why it matters", hint:"The long piece on the place's own page. History, scripture, what happened here.", ph:"Abul Fazl, in Akbar's court, called it a small sea. A dip during an eclipse is held to carry the merit of an Ashvamedha yajna.", phHi:"अकबर के दरबारी अबुल-फ़ज़ल ने इसे लघु समुद्र कहा।" },
    { k:"themes", t:"csv", lb:"Themes", hint:"Comma separated. Known: ${THEMES}", ph:"sarovar, heritage, aarti" },
    { k:"lat", t:"geo", lb:"Where it is", req:1, sec:"Where it is",
      hint:"Search for it, or click the map. Drag the pin to correct it. Put the pin where a visitor actually arrives — the gate, not the middle of the grounds." },
    { k:"placeId", t:"text", lb:"Google place id", hint:"Optional. Lets Directions open the right pin rather than a coordinate.", ph:"ChIJL6JHE1ZHDjkRLrWe5di8dqg" },
    { k:"img", t:"img", lb:"Main photograph", sec:"Photographs" },
    { k:"gallery", t:"imgs", lb:"More photographs" },
    { k:"visit", t:"obj", lb:"How long people spend", sec:"When to come", of:[
      { k:"rec", t:"num", lb:"Usually (minutes)", req:1, hint:"What the planner budgets.", ph:"60" },
      { k:"min", t:"num", lb:"Rushed (minutes)", ph:"30" },
      { k:"max", t:"num", lb:"Unhurried (minutes)", ph:"120" },
    ] },
    { k:"hours", t:"obj", lb:"Opening hours", of:[
      { k:"o", t:"time", lb:"Opens", ph:"05:00" },
      { k:"c", t:"time", lb:"Closes", ph:"21:00" },
    ] },
    { k:"closed", t:"days", lb:"Closed on", hint:"Most museums here close on Monday. Leave all unticked if it never closes." },
    { k:"free", t:"bool", lb:"Free to enter", sec:"Cost, and what is there" },
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
    { k:"rank", t:"num", lb:"Importance", sec:"How the planner treats it", hint:"Higher comes first when the planner has to choose. 0-100.", ph:"90" },
    { k:"first", t:"num", lb:"First-visit rank", hint:"Higher means \"see this on a first trip\".", ph:"1" },
    { k:"anchor", t:"obj", lb:"Fixed-time event", hint:"Only for something that happens at a set hour, like an aarti or a light show.", of:[
      { k:"at", t:"num", lb:"Starts at (minutes after midnight)", hint:"6pm is 1080. The planner builds the day around this.", ph:"1080" },
      { k:"win", t:"csv", lb:"Window (two numbers)", hint:"Earliest and latest it is worth arriving, same units. e.g. 1020, 1110", ph:"1020, 1110" },
      { k:"lb", t:"loc", lb:"What it is called", ph:"Evening aarti", phHi:"संध्या आरती" },
    ] },
    { k:"pending", t:"bool", lb:"Hide from the app", hint:"Keeps the record without showing it. For somewhere closed for restoration." },
  ],

  hotels: [
    { k:"id", t:"text", lb:"Id", req:1, sec:"What it is", hint:"Lower-case with hyphens, e.g. neelkanth-yatri-niwas.", ph:"neelkanth-yatri-niwas" },
    { k:"city", t:"sel", lb:"Town", opts:["kurukshetra","pehowa"] },
    { k:"name", t:"loc", lb:"Name", req:1, ph:"Neelkanth Yatri Niwas", phHi:"नीलकंठ यात्री निवास" },
    { k:"kind", t:"sel", lb:"Kind", req:1, opts:["hotel","dharamshala","guesthouse","homestay"],
      hint:"A dharamshala and a hotel are different propositions for a pilgrim, not different prices." },
    { k:"area", t:"loc", lb:"Locality", hint:"In words — \"near the bus stand\", \"Sector 13\". What tells someone how far out it is.", ph:"Near Brahma Sarovar, 400 m from the ghats", phHi:"ब्रह्म सरोवर के पास, घाटों से 400 मी" },
    { k:"lat", t:"geo", lb:"Where it is", req:1, sec:"Where it is",
      hint:"Search for it, or click the map. Put the pin on the door, not on the block." },
    { k:"price", t:"obj", lb:"Rupees per night", sec:"What it costs", hint:"Indicative. A tariff card is never one number.", of:[
      { k:"min", t:"num", lb:"From", ph:"30" },
      { k:"max", t:"num", lb:"To", ph:"120" },
    ] },
    { k:"phone", t:"text", lb:"Phone", hint:"The number someone should actually ring. With the STD code.", ph:"01744-220123" },
    { k:"note", t:"locarea", lb:"What a local would tell you", ph:"Simple rooms, no food. Ask for one on the sarovar side.", phHi:"साधारण कमरे, भोजन नहीं। सरोवर की ओर का कमरा माँगें।" },
    { k:"img", t:"img", lb:"Photograph", sec:"Photographs" },
    { k:"gallery", t:"imgs", lb:"More photographs" },
    { k:"facilities", t:"csv", lb:"Facilities", hint:"Comma separated. Known: ${FACILITIES}", ph:"washroom, water, parking" },
    { k:"pending", t:"bool", lb:"Hide from the app", hint:"For somewhere that has closed." },
  ],

  startpoints: [
    { k:"id", t:"text", lb:"Id", req:1, sec:"What it is", hint:"Lower-case with hyphens, e.g. kurukshetra-junction.", ph:"kurukshetra-junction" },
    { k:"kind", t:"sel", lb:"Kind", req:1, opts:["station","busstand","hotel","dharamshala"] },
    { k:"city", t:"sel", lb:"Town", opts:["kurukshetra","pehowa"] },
    { k:"name", t:"loc", lb:"Name", req:1, ph:"Kurukshetra Junction", phHi:"कुरुक्षेत्र जंक्शन" },
    { k:"area", t:"loc", lb:"Locality", ph:"Railway Road", phHi:"रेलवे रोड" },
    { k:"lat", t:"geo", lb:"Where it is", req:1, sec:"Where it is",
      hint:"Put the pin on the GATE people actually walk out of, not the middle of the site. Every journey the app plans starts from this exact point." },
    { k:"code", t:"text", lb:"Station code", sec:"Details", hint:"For a railway station — KKDE, SHDM. What a ticket is booked against.", ph:"KKDE" },
    { k:"phone", t:"text", lb:"Phone", ph:"139" },
    { k:"checked", t:"text", lb:"Coordinates last checked", hint:"YYYY-MM-DD. The day a person last confirmed the pin against a map.", ph:"2026-08-05" },
    { k:"verified", t:"bool", lb:"Pin confirmed by a person" },
  ],

  events: [
    { k:"id", t:"text", lb:"Id", req:1, ph:"gita-mahotsav-2027", sec:"What it is",
      hint:"Lower-case with hyphens, and include the year — an event recurs, its id must not. Reusing an id edits that event." },
    { k:"kind", t:"sel", lb:"Kind", req:1, opts:["festival","snan","show","mela","yatra","closure"],
      hint:"A yatra or a closure is a procession or a road shut for a few hours, and needs the hours and the route below." },
    { k:"name", t:"loc", lb:"Name", req:1, ph:"International Gita Mahotsav", phHi:"अंतर्राष्ट्रीय गीता महोत्सव" },
    { k:"blurb", t:"locarea", lb:"Short line", req:1, ph:"Midnight aarti, jhankis and kirtan at every Krishna temple in the district.",
      phHi:"जिले के हर कृष्ण मंदिर में मध्यरात्रि आरती, झांकियाँ और कीर्तन।", hint:"One sentence, shown on the banner." },
    { k:"notice", t:"locarea", lb:"Warning", req:1, ph:"Come before 7pm or park at the university and walk.",
      phHi:"शाम 7 बजे से पहले आएँ, या विश्वविद्यालय में पार्क कर पैदल चलें।", hint:"What a visitor should do differently." },
    { k:"img", t:"img", lb:"Banner photograph", sec:"The banner",
      hint:"Runs the full width of the home screen. It is cropped to 16:9 there, so a picture of another shape loses its top and bottom — the preview below says so if it will." },
    { k:"from", t:"date", lb:"First day", req:1, sec:"When" },
    { k:"to", t:"date", lb:"Last day", req:1, hint:"The same as the first day for a one-day event." },
    { k:"window", t:"obj", lb:"Hours it runs", hint:"Only for a yatra or a closure — the hours the road is actually affected.", of:[
      { k:"from", t:"time", lb:"Starts at" },
      { k:"to", t:"time", lb:"Ends at" },
    ] },
    { k:"places", t:"csv", lb:"Places it affects", req:1, ph:"brahma-sarovar, jyotisar", sec:"Where, and what it does to the day",
      hint:"Place ids from the catalogue, comma separated." },
    { k:"advice", t:"sel", lb:"Advice", opts:["avoid","join"],
      hint:"avoid — keep away from this road. join — worth going to." },
    { k:"corridor", t:"pts", lb:"The route it runs along",
      hint:"For a yatra or a closure. Click along the road, in order, at least twice. Drag a point to correct it." },
    { k:"visitFactor", t:"num", lb:"How much longer a visit takes", req:1, step:"0.1", ph:"1.5",
      hint:"1.0 is normal. 1.5 means half as long again, because of the crowd." },
    { k:"travelFactor", t:"num", lb:"How much slower the roads are", req:1, step:"0.1", ph:"1.3",
      hint:"1.0 is normal. 1.3 means a third slower." },
  ],

  erickshaw: [
    { k:"id", t:"text", lb:"Id", req:1, sec:"What it is", ph:"stand-brahma-sarovar" },
    { k:"city", t:"sel", lb:"Town", opts:["kurukshetra","pehowa"] },
    { k:"name", t:"loc", lb:"Stand name", req:1, ph:"Brahma Sarovar stand", phHi:"ब्रह्म सरोवर स्टैंड" },
    { k:"area", t:"loc", lb:"Locality", ph:"South gate", phHi:"दक्षिण द्वार" },
    { k:"lat", t:"geo", lb:"Where the stand is", req:1, sec:"Where it is",
      hint:"Search for it, or click the map where the rickshaws actually wait." },
    { k:"phone", t:"text", lb:"Phone", sec:"Details", ph:"9812345678" },
    { k:"note", t:"locarea", lb:"Anything worth knowing", hint:"Typical fare, hours it is manned.", ph:"About 30 rupees to the museum. Manned 6am to 9pm.", phHi:"संग्रहालय तक लगभग ₹30। सुबह 6 से रात 9 बजे तक।" },
  ],

  /* The home screen's opening photograph. It used to be a file in the app's
     bundle, which is why its fifteen pictures showed up in the library as
     "not used anywhere" — nothing in the database pointed at them, because
     nothing in the database COULD. Changing what the app opens on was a
     release. It is a catalogue like the others now. */
  hero: [
    { k:"id", t:"text", lb:"Id", req:1, sec:"What it is", hint:"Usually the place's own id.", ph:"brahma-sarovar" },
    { k:"city", t:"sel", lb:"Town", opts:["kurukshetra","pehowa"],
      hint:"Whose home screen it opens on. A visitor in Pehowa must not be shown Brahma Sarovar under a header that says Pehowa." },
    { k:"img", t:"img", lb:"Photograph", req:1,
      hint:"Fills the top of the home screen, so a wide picture works best — 16:9." },
    { k:"fact", t:"locarea", lb:"The line over it", req:1,
      hint:"One sentence, and make it the interesting one. This is the app's answer to \"why did I come here\".",
      ph:"Abul Fazl, in Akbar's court, looked at this tank and called it a small sea.",
      phHi:"अकबर के दरबारी अबुल-फ़ज़ल ने इस सरोवर को देखकर इसे 'लघु समुद्र' कहा था।" },
  ],
};

/* Which kinds get a tab, and what to call them in the interface. "hotels" is
   the storage kind; "Stays" is the word, because a dharamshala is not a hotel
   and the list holds both. */
const KINDS = [
  { k:"events", lb:"Events" },
  { k:"places", lb:"Places" },
  { k:"hotels", lb:"Stays" },
  { k:"startpoints", lb:"Start points" },
  { k:"erickshaw", lb:"E-rickshaw" },
  { k:"hero", lb:"Home screen" },
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

  if (t === "text" || t === "time" || t === "num" || t === "date") {
    const it = t === "num" ? "number" : t === "time" ? "time" : t === "date" ? "date" : "text";
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
  } else if (t === "geo") {
    // ONE field that writes two keys. A latitude box and a longitude box asked
    // an editor to produce six decimal places of WGS-84 for a temple they can
    // see from the office window — the honest answer to which is a map.
    // The numbers stay on screen and stay editable: they are what is saved,
    // they are what a colleague reads out over the phone, and if the tiles
    // never load they are still a working form.
    const lat = v && v.lat, lng = v && v.lng;
    inner = '<div class="geo">' +
      '<div class="gsearch"><input type="search" data-gq placeholder="Search a landmark — Brahma Sarovar, Pehowa bus stand…">' +
      '<button type="button" class="ghost sm" data-gfind>Search</button></div>' +
      '<div class="gres" data-gres hidden></div>' +
      '<div class="gmap" data-gmap></div>' +
      '<div class="gnum"><label>Latitude<input data-i="lat" type="number" step="any" placeholder="29.961355" value="' +
        ek(lat == null ? "" : lat) + '"></label>' +
      '<label>Longitude<input data-i="lng" type="number" step="any" placeholder="76.828553" value="' +
        ek(lng == null ? "" : lng) + '"></label></div>' +
      '<div class="gwarn" data-gwarn hidden></div></div>';
  } else if (t === "pts") {
    // A map you click along, over a textarea that is still the value.
    //
    // It WAS only the textarea — "one lat, lng per line, read them off
    // openstreetmap.org with right-click → show address". That is a dozen
    // round trips to another website to describe one road, and no way at all
    // to see whether the line you typed follows the road you meant. The
    // textarea survives underneath because pasting a corridor someone sent you
    // is still the fastest way to enter one, and because it is what readField
    // reads — the map writes into it, so there is exactly one value.
    const txt = (Array.isArray(v) ? v : []).map(p => p.lat + ", " + p.lng).join("\n");
    inner = '<div class="geo"><div class="gmap tall" data-cmap></div>' +
      '<div class="cbar"><span class="cn" data-cn></span><span style="flex:1"></span>' +
      '<button type="button" class="ghost sm" data-cundo>Undo last point</button>' +
      '<button type="button" class="danger sm" data-cclear>Clear</button></div>' +
      '<details class="craw"><summary>Type or paste the points instead</summary>' +
      '<textarea data-i rows="5" placeholder="29.9695, 76.8181&#10;29.9662, 76.8265">' + ek(txt) +
      "</textarea></details></div>";
  } else if (t === "obj") {
    inner = '<div class="sub" data-group>' + groupHtml(f.of, v || {}) + "</div>";
  } else if (t === "list") {
    const rows = (Array.isArray(v) ? v : []).map(item => listRow(f, item)).join("");
    inner = '<div class="rows" data-rows>' + rows + "</div>" +
      '<button type="button" class="ghost sm" data-add>' + ek(f.add || "Add") + "</button>";
  }

  /* Exactly two children, always: the label block and the control block.
     That is what lets the grid line fields up — each .fld is a two-row subgrid
     of the row it sits in, so every label in a row shares one height and every
     control starts on one line. Without the .ctl wrapper an image field (an
     input, a button AND a strip of thumbnails) would be four rows deep and
     nothing beside it would align. */
  return '<div class="fld" data-k="' + ek(f.k) + '" data-t="' + ek(t) + '"><label class="fl">' + lb +
    hintOf(f) + '</label><div class="ctl">' + inner + "</div></div>";
}

/** One repeat inside a list field. Its own group, plus a way to remove it. */
function listRow(f, item) {
  return '<div class="lrow"><div data-group>' + groupHtml(f.of, item || {}) + "</div>" +
    '<button type="button" class="danger sm" data-del>Remove</button></div>';
}

/* A place carries twenty-eight fields. Twenty-eight boxes in one undifferentiated
   run is not a form, it is an inventory — the editor has to read every label to
   find the one they came for, and there is nothing to tell them they have
   finished a part of it. "sec" breaks the run into named parts and costs one
   word on one line of SPEC.
 *
 * At the top level each part is a STEP: one on screen at a time, chosen from the
 * rail down the side. Scrolling past twenty-eight fields to check you have
 * filled in six of them is the thing this replaces. Sub-objects and list rows
 * are never stepped — a list row is one small thing, and hiding half of it
 * behind a Next button would be the same mistake at a smaller scale.
 */
function stepsOf(fields) {
  const out = [];
  let sec = null;
  for (const f of fields) {
    if (f.sec && f.sec !== sec) { sec = f.sec; out.push({ lb: sec, fs: [] }); }
    if (!out.length) out.push({ lb: "Details", fs: [] });   // a spec with no sections at all
    out[out.length - 1].fs.push(f);
  }
  return out;
}

function groupHtml(fields, obj, top) {
  // "geo" is the one field whose value is the object around it, not a key in it.
  const val = (f) => f.t === "geo" ? obj : (obj ? obj[f.k] : undefined);
  if (!top) {
    let sec = "";
    return fields.map(f => {
      const head = f.sec && f.sec !== sec ? ((sec = f.sec), '<h3 class="sec">' + ek(f.sec) + "</h3>") : "";
      return head + fieldHtml(f, val(f));
    }).join("");
  }
  return stepsOf(fields).map((s, i) =>
    '<div class="step" data-step="' + i + '" hidden><h3 class="sec">' + ek(s.lb) + "</h3>" +
    '<div class="sfields">' + s.fs.map(f => fieldHtml(f, val(f))).join("") + "</div></div>").join("");
}

/* ---- reading back -------------------------------------------------------- */

/* :scope > .fld is what keeps nesting honest. A place has an "inside" list
   whose rows each contain a "name" field, and a plain querySelector for
   [data-k=name] from the top would find the first row's, not the place's.
   The second selector is the same rule one storey down: at the TOP level the
   fields sit inside a step, and only there. A bare descendant selector would
   have worked for the top level and quietly started reading list rows wrong. */
function readGroup(fields, root) {
  const out = {};
  for (const f of fields) {
    const sel = '.fld[data-k="' + f.k + '"]';
    const el = root.querySelector(":scope > " + sel + ", :scope > .step > .sfields > " + sel);
    if (!el) continue;
    const v = readField(f, el);
    // A map writes lat AND lng, so its value merges rather than nesting. It is
    // keyed on "lat" so the required check downstream needs no special case.
    if (f.t === "geo") { if (v) { out.lat = v.lat; out.lng = v.lng; } continue; }
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

  if (t === "text" || t === "time" || t === "date") { const s = one().value.trim(); return s || undefined; }
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
  if (t === "geo") {
    const la = parseFloat(el.querySelector('[data-i="lat"]').value);
    const ln = parseFloat(el.querySelector('[data-i="lng"]').value);
    return isNaN(la) || isNaN(ln) ? undefined : { lat: la, lng: ln };
  }
  if (t === "pts") {
    const rows = one().value.split("\n").map(l => l.trim()).filter(Boolean).map(l => {
      const p = l.split(",");
      return { lat: parseFloat(p[0]), lng: parseFloat(p[1]) };
    }).filter(p => !isNaN(p.lat) && !isNaN(p.lng));
    return rows.length ? rows : undefined;
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
    // Through .ctl, and still :scope-anchored — a list row may itself hold
    // fields, and a loose descendant selector would read them as rows.
    el.querySelectorAll(":scope > .ctl > [data-rows] > .lrow").forEach(r => {
      const o = readGroup(f.of, r.querySelector("[data-group]"));
      if (Object.keys(o).length) rows.push(o);
    });
    return rows.length ? rows : undefined;
  }
  return undefined;
}

/* ---- maps -----------------------------------------------------------------
 *
 * Leaflet and OpenStreetMap tiles, which is what the app itself draws with, so
 * the pin an editor places is seen against the same map the visitor will see it
 * on. Loaded from a CDN in the page head rather than bundled, because this
 * dashboard deliberately has no build step.
 *
 * EVERY function here checks window.L first and returns quietly. If the CDN is
 * blocked or the office wifi is having a morning, the form degrades to the
 * latitude and longitude boxes it always had — which is a worse form, but it is
 * a WORKING form. A dashboard that cannot save a phone number because a map
 * script did not load would be a straight downgrade.
 */

/* Between the two towns, and zoomed to hold both. Where a map with nothing on
   it yet should open — a world view would make the first click a minute of
   panning. */
const HOME = [29.9695, 76.8390];
/* Kurukshetra district, roughly. The same box the calendar's rules use, and it
   catches the one mistake that is otherwise invisible: a transposed lat/lng
   still saves, still renders, and puts the place in the Bay of Bengal. */
const BOX = { latMin: 29.7, latMax: 30.3, lngMin: 76.5, lngMax: 77.2 };
const inBox = (p) => p.lat > BOX.latMin && p.lat < BOX.latMax && p.lng > BOX.lngMin && p.lng < BOX.lngMax;

function newMap(host, centre, zoom) {
  const map = L.map(host, { scrollWheelZoom: false }).setView(centre, zoom);
  // scrollWheelZoom off, then on once the map is clicked: a tall form with a
  // map in the middle of it otherwise swallows the page scroll and traps you.
  map.once("click", () => map.scrollWheelZoom.enable());
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19, attribution: '&copy; OpenStreetMap',
  }).addTo(map);
  return map;
}

/**
 * Say so when the map could not load.
 *
 * Every function here used to return quietly on a missing window.L, which is
 * right about the form — it still works — and wrong about the person using it.
 * What they see is a blank grey rectangle where a map was promised, no error
 * anywhere, and two number boxes they have no way to fill in. "The map is
 * broken" and "you must type coordinates" are different messages and only the
 * second one is actionable.
 */
function noMap(fld) {
  const host = fld.querySelector("[data-gmap]") || fld.querySelector("[data-cmap]");
  if (host && !host._told) {
    host._told = 1;
    host.innerHTML = '<div class="gdead">The map could not load, so there is nothing to click.<br>' +
      "Type the coordinates below, or reload the page to try again.</div>";
  }
}

/** One coordinate field: search, click, drag. */
function initGeo(fld) {
  if (!window.L) return noMap(fld);
  const host = fld.querySelector("[data-gmap]");
  if (!host || host._map) return;

  const laI = fld.querySelector('[data-i="lat"]');
  const lnI = fld.querySelector('[data-i="lng"]');
  const at = () => {
    const a = parseFloat(laI.value), b = parseFloat(lnI.value);
    return isNaN(a) || isNaN(b) ? null : { lat: a, lng: b };
  };

  const start = at();
  const map = newMap(host, start ? [start.lat, start.lng] : HOME, start ? 16 : 12);
  const pin = L.marker(start ? [start.lat, start.lng] : HOME, { draggable: true }).addTo(map);
  // A pin nobody has placed yet must not look like a pin somebody placed.
  if (!start) pin.setOpacity(0.4);

  const warn = fld.querySelector("[data-gwarn]");
  const say = (p) => {
    const bad = p && !inBox(p);
    warn.hidden = !bad;
    if (bad) warn.textContent =
      "That pin is outside Kurukshetra district. If you typed the numbers, check they are not the wrong way round — latitude is the ~29 one.";
  };

  const put = (ll) => {
    laI.value = ll.lat.toFixed(6);
    lnI.value = ll.lng.toFixed(6);
    pin.setLatLng(ll).setOpacity(1);
    say({ lat: ll.lat, lng: ll.lng });
  };
  map.on("click", (e) => put(e.latlng));
  pin.on("dragend", () => put(pin.getLatLng()));

  // Typed numbers move the pin, so the two halves can never disagree about
  // where the place is while both are on screen saying different things.
  const typed = () => {
    const p = at();
    if (!p) return;
    pin.setLatLng(p).setOpacity(1);
    map.setView(p, Math.max(map.getZoom(), 16));
    say(p);
  };
  laI.addEventListener("change", typed);
  lnI.addEventListener("change", typed);
  say(start);

  const find = () => geoSearch(fld, (p) => { put(p); map.setView(p, 17); });
  fld.querySelector("[data-gfind]").addEventListener("click", find);
  fld.querySelector("[data-gq]").addEventListener("keydown", (e) => {
    // A search box inside a form: Enter must search, not submit or do nothing.
    if (e.key === "Enter") { e.preventDefault(); find(); }
  });

  host._map = map;
}

/**
 * Search by name — Nominatim, the same index openstreetmap.org's own box uses.
 *
 * Fired by a button or Enter, never per keystroke: Nominatim's usage policy is
 * one request a second, and search-as-you-type against a free public service
 * run on donations is how a small district app gets itself banned.
 */
async function geoSearch(fld, pick) {
  const q = (fld.querySelector("[data-gq]").value || "").trim();
  const box = fld.querySelector("[data-gres]");
  if (!q) { box.hidden = true; return; }

  box.hidden = false;
  box.innerHTML = '<div class="gr muted">Searching…</div>';

  // viewbox biases results to the district; NOT bounded, so a place whose OSM
  // name differs from the local one is still found rather than silently absent.
  const u = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&addressdetails=1" +
    "&viewbox=76.5,30.3,77.2,29.7&q=" + encodeURIComponent(q);
  let hits = [];
  try {
    hits = await fetch(u, { headers: { accept: "application/json" } }).then(r => r.json());
  } catch (e) {
    box.innerHTML = '<div class="gr muted">Could not reach the map search. Click the map instead.</div>';
    return;
  }
  if (!hits.length) {
    box.innerHTML = '<div class="gr muted">Nothing found. Try a nearby landmark, or click the map.</div>';
    return;
  }

  box.innerHTML = hits.map((h, i) =>
    '<button type="button" class="gr" data-gpick="' + i + '">' + ek(h.display_name) +
    (inBox({ lat: +h.lat, lng: +h.lon }) ? "" : ' <em class="far">outside the district</em>') +
    "</button>").join("");
  box.onclick = (e) => {
    const b = e.target.closest("[data-gpick]");
    if (!b) return;
    const h = hits[Number(b.getAttribute("data-gpick"))];
    pick({ lat: +h.lat, lng: +h.lon });
    box.hidden = true;
  };
}

/** The corridor field: click along a road, drag to correct, undo, clear. */
function initPts(fld) {
  if (!window.L) return noMap(fld);
  const host = fld.querySelector("[data-cmap]");
  if (!host || host._map) return;
  const ta = fld.querySelector("[data-i]");

  const read = () => ta.value.split("\n").map(l => l.trim()).filter(Boolean).map(l => {
    const p = l.split(",");
    return { lat: parseFloat(p[0]), lng: parseFloat(p[1]) };
  }).filter(p => !isNaN(p.lat) && !isNaN(p.lng));

  let pts = read();
  const map = newMap(host, pts.length ? [pts[0].lat, pts[0].lng] : HOME, pts.length ? 15 : 13);
  const line = L.polyline([], { weight: 5, opacity: 0.85 }).addTo(map);
  const pins = L.layerGroup().addTo(map);

  const draw = (fit) => {
    // The textarea is the value, so it is written on every change — never the
    // other way round. One source of truth, and readField never learns there
    // is a map.
    ta.value = pts.map(p => p.lat.toFixed(6) + ", " + p.lng.toFixed(6)).join("\n");
    line.setLatLngs(pts);
    pins.clearLayers();
    pts.forEach((p, i) => {
      const m = L.marker(p, { draggable: true, title: "Point " + (i + 1) }).addTo(pins);
      m.on("drag", () => { pts[i] = m.getLatLng(); line.setLatLngs(pts); });
      m.on("dragend", () => draw(false));
    });
    fld.querySelector("[data-cn]").textContent = pts.length
      ? pts.length + " point" + (pts.length === 1 ? "" : "s") + (pts.length < 2 ? " — a route needs at least two" : "")
      : "Click the map along the road, in order.";
    if (fit && pts.length > 1) map.fitBounds(line.getBounds(), { padding: [30, 30] });
  };

  map.on("click", (e) => { pts.push(e.latlng); draw(false); });
  fld.querySelector("[data-cundo]").addEventListener("click", () => { pts.pop(); draw(false); });
  fld.querySelector("[data-cclear]").addEventListener("click", () => { pts = []; draw(false); });
  // Pasting into the textarea is still a supported way in.
  ta.addEventListener("change", () => { pts = read(); draw(true); });

  draw(true);
  host._map = map;
}

/**
 * Maps can only be built once their container is on screen and has a size.
 *
 * Leaflet measures the element at construction; built inside a hidden drawer it
 * comes out zero pixels tall and stays that way. So this runs after the drawer
 * is shown, not in cForm where the HTML is made — and again on every step
 * change, because a step is hidden until it is opened and the map inside it has
 * exactly the same problem the drawer did. Building is idempotent (initGeo
 * bails on host._map); the resize is the part that has to happen every time.
 */
function initMaps() {
  const on = $("#cform").querySelectorAll('.step:not([hidden])');
  on.forEach(s => {
    s.querySelectorAll('.fld[data-t="geo"]').forEach(initGeo);
    s.querySelectorAll('.fld[data-t="pts"]').forEach(initPts);
    s.querySelectorAll(".gmap").forEach(h => { if (h._map) h._map.invalidateSize(); });
  });
}

/* ---- the content screens -------------------------------------------------- */

let CKIND = "places";      // which tab is open
let CITEMS = [];           // what the server last gave us for it
let MEDIA = null;          // the image library, loaded once and reused

function cSpec() { return SPEC[CKIND]; }
/* Events predate the content table and keep their own endpoint — and their own
   server-side rules, which is why cSave below reads "problems" as well as
   "error". One list of fields either way. */
function cUrl() { return CKIND === "events" ? "/admin/events" : "/admin/content/" + CKIND; }

async function cLoad(kind) {
  if (kind) CKIND = kind;
  const r = await api(cUrl()).then(r => r.json());
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
  // 16:9 previews for the calendar, 4:3 for everything else — see .wide169.
  $("#pane-content").classList.toggle("wide169", CKIND === "events");
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

    const where = [
      it.city || "",
      it.from ? (it.to && it.to !== it.from ? it.from + " → " + it.to : it.from) : "",
      it.window ? it.window.from + "–" + it.window.to : "",
      it.lat != null ? Number(it.lat).toFixed(4) + ", " + Number(it.lng).toFixed(4) : "",
    ].filter(Boolean).map(x => "<div>" + ek(x) + "</div>").join("");

    // Whatever this kind actually carries, rather than a fixed set of columns
    // that is half empty for three of the four kinds.
    const d = [];
    if (it.kind) d.push(ek(it.kind));
    if (it.themes && it.themes.length) d.push(ek(it.themes.join(", ")));
    if (it.places && it.places.length) d.push(it.places.length + " place" + (it.places.length === 1 ? "" : "s"));
    if (it.advice) d.push(ek(it.advice));
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

/* ---- the editor: one step at a time, or the whole thing as JSON -------------
 *
 * A place is twenty-eight fields and nobody holds twenty-eight fields in their
 * head. Three things follow from that, and they are the whole of what is below:
 *
 *  - the form is walked one part at a time, with a rail that says which parts
 *    still want something (steps, from SPEC's own "sec" — no new description);
 *  - anyone who would rather type the record out can have it as JSON, with an
 *    empty template naming every key and what belongs in it;
 *  - nothing saves until it has been SEEN. Save shows the record drawn the way
 *    the app will draw it, and the button under that is what writes to the
 *    database.
 *
 * All three are in the engine rather than in any one form, so places, stays,
 * start points, e-rickshaw stands, events and the home screen get them at once
 * and cannot drift apart later.
 */

let CSTEP = 0;        // which step is on screen, or "pv" for the preview
let MODE = "form";    // "form" or "json" — two ways into the same record

/** The fields only. cForm resets the editor around them; applyJSON does not. */
function drawForm(obj) {
  $("#cform").innerHTML = groupHtml(cSpec(), obj || {}, true);
  $("#cform").querySelectorAll("[data-thumbs]").forEach(paintThumbs);
}

/** Draw the form for one document, or an empty one, and start at the top. */
function cForm(obj) {
  $("#editor").classList.toggle("wide169", wantAR() > 1.5);
  drawForm(obj);
  MODE = "form";
  document.querySelectorAll("#cmodes [data-mode]").forEach(b =>
    b.classList.toggle("on", b.getAttribute("data-mode") === "form"));
  showStep(0);
  cmsg("");
  jmsg("");
}
function cBlank() { cForm(null); $("#ctitle").textContent = "Add a new " + kindWord(); }

/** What is in the form right now. The form is the record; JSON is a view of it. */
function currentDoc() { return readGroup(cSpec(), $("#cform")); }

/** One field's current value, for the rail's done/not-done marks. */
function fieldValue(f) {
  const el = $("#cform").querySelector('.step > .sfields > .fld[data-k="' + f.k + '"]');
  return el ? readField(f, el) : undefined;
}

function showStep(n) {
  CSTEP = n;
  const pv = n === "pv";
  const json = MODE === "json";
  $("#cform").hidden = pv || json;
  $("#cpreview").hidden = !pv || json;
  $("#cjsonpane").hidden = !json;
  $("#cform").querySelectorAll(".step").forEach(s => {
    s.hidden = pv || Number(s.getAttribute("data-step")) !== n;
  });
  if (pv && !json) renderPreview();
  paintSteps();
  // After the step is on screen, never before: a map measured inside a hidden
  // step comes out zero pixels tall, which is the same bug the drawer had.
  if (!pv && !json) initMaps();
  const m = document.querySelector(".dmain");
  if (m) m.scrollTop = 0;
}

/**
 * The rail, and the buttons under the form.
 *
 * A step with a required field that is still empty is marked, and a step with
 * nothing required at all is marked neither way — a hollow circle beside
 * "Photographs", which a place does not have to have, reads as a job left
 * undone and sends people looking for a field that does not exist.
 */
function paintSteps() {
  const st = stepsOf(cSpec());
  const rail = st.map((s, i) => {
    const req = s.fs.filter(f => f.req);
    const done = req.length ? req.every(f => fieldValue(f) !== undefined) : null;
    const cls = "srow" + (CSTEP === i ? " on" : "") + (done === true ? " ok" : done === false ? " todo" : "");
    return '<button type="button" class="' + cls + '" data-step="' + i + '"><i></i>' + ek(s.lb) + "</button>";
  }).join("");
  $("#csteps").innerHTML = rail + '<span class="srailgap"></span>' +
    '<button type="button" class="srow pvstep' + (CSTEP === "pv" ? " on" : "") + '" data-step="pv"><i></i>Preview</button>';

  const last = st.length - 1;
  $("#cback").hidden = CSTEP === 0;
  $("#cnext").hidden = CSTEP === "pv";
  $("#cnext").textContent = CSTEP === last ? "Preview →" : "Next →";
  $("#csave").textContent = CSTEP === "pv" ? "Save" : "Review & save";
}

function stepBy(d) {
  const last = stepsOf(cSpec()).length - 1;
  if (CSTEP === "pv") return void showStep(d < 0 ? last : "pv");
  const n = CSTEP + d;
  showStep(n > last ? "pv" : Math.max(0, n));
}

/**
 * Switch between the form and the JSON.
 *
 * Leaving JSON means the text becomes the record, so it has to parse first. If
 * it does not, the mode does not change and the reason stays on screen —
 * quietly throwing away what somebody typed because of a trailing comma is the
 * one outcome here that is not recoverable.
 */
function setMode(m) {
  if (m === MODE) return true;
  if (MODE === "json" && !applyJSON()) return false;
  MODE = m;
  if (m === "json") fillJSON();
  document.querySelectorAll("#cmodes [data-mode]").forEach(b =>
    b.classList.toggle("on", b.getAttribute("data-mode") === m));
  showStep(CSTEP === "pv" && m === "json" ? 0 : CSTEP);
  return true;
}

const jmsg = (t, bad) => {
  const m = $("#jm");
  if (!m) return;
  m.className = t ? "msg " + (bad ? "bad" : "good") : "";
  m.textContent = t || "";
};

function fillJSON() {
  const doc = currentDoc();
  const empty = Object.keys(doc).length === 0;
  setJSON(JSON.stringify(empty ? jsonTemplate(cSpec()) : doc, null, 2));
  $("#jref").innerHTML = refHtml(cSpec(), "");
  jmsg(empty
    ? "Every key this kind of record can carry, with an example value in each. Replace the values, delete the lines you do not need, then switch back to Form or press Review & save."
    : "");
}

/* ---- colouring the JSON ----------------------------------------------------
 *
 * A textarea cannot colour its own text, so the usual trick: a <pre> holding
 * the same text, marked up, sitting exactly underneath a textarea whose text is
 * transparent. The textarea is still the real control — real caret, real
 * selection, real undo, real paste — and the <pre> is scenery that scrolls with
 * it. Both have to carry identical font, padding and line-height or the two
 * copies drift apart by a pixel per line, so those are set together below.
 *
 * A key, a string, a number and true/false/null in four different colours is
 * the whole point: unbalanced quotes stop looking like text and start looking
 * wrong, which is the mistake this pane invites and the one JSON.parse reports
 * ten lines away from.
 */
function setJSON(text) {
  $("#cjson").value = text;
  jPaint();
}

function jPaint() {
  const ta = $("#cjson"), pre = $("#jhl");
  if (!ta || !pre) return;
  // The trailing newline keeps the last line reachable: a <pre> ending in a
  // token is one line shorter than a textarea ending in a newline.
  pre.innerHTML = jHighlight(ta.value) + "\n";
  jSync();
}

function jSync() {
  const ta = $("#cjson"), pre = $("#jhl");
  if (!ta || !pre) return;
  pre.scrollTop = ta.scrollTop;
  pre.scrollLeft = ta.scrollLeft;
}

/* Tokenised on the RAW text and escaped piece by piece, never the other way
   round: escaping first turns every " into &quot; and there is no longer a
   string literal anywhere for this to find. */
function jHighlight(src) {
  const re = /"(?:\\.|[^"\\])*"(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
  let out = "", last = 0, m;
  while ((m = re.exec(src)) !== null) {
    out += ek(src.slice(last, m.index));
    const t = m[0];
    if (t.charAt(0) === '"') {
      if (m[1]) {
        // A key: the quoted part, then whatever whitespace and colon followed.
        const q = t.slice(0, t.length - m[1].length);
        out += '<b class="jk">' + ek(q) + "</b>" + ek(m[1]);
      } else {
        out += '<span class="js">' + ek(t) + "</span>";
      }
    } else if (t === "true" || t === "false" || t === "null") {
      out += '<span class="jl">' + ek(t) + "</span>";
    } else {
      out += '<span class="jn">' + ek(t) + "</span>";
    }
    last = m.index + t.length;
  }
  return out + ek(src.slice(last));
}

/** JSON in, form out. Returns false if there was nothing usable to apply. */
function applyJSON() {
  const raw = ($("#cjson").value || "").trim();
  if (!raw) { jmsg("There is nothing here to apply.", 1); return false; }
  let doc;
  try {
    doc = JSON.parse(raw);
  } catch (e) {
    jmsg("This is not valid JSON, so it cannot be read:\n" + e.message +
      "\n\nA comma after the LAST item in a list, or a missing quotation mark, is nearly always the cause.", 1);
    return false;
  }
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    jmsg("The whole thing has to be one record in braces — { … } — not a list and not a bare value.", 1);
    return false;
  }
  const known = keySet(cSpec());
  const odd = Object.keys(doc).filter(k => !known[k]);
  drawForm(doc);
  // Unknown keys are said out loud rather than refused. The form is what saves,
  // and the form has no box for a key it does not know — so a key nobody
  // mentions is a key that silently disappears between typing and saving.
  jmsg(odd.length
    ? "Applied. These are not fields of a " + kindWord() + " and will NOT be saved: " + odd.join(", ")
    : "Applied to the form.", odd.length ? 1 : 0);
  return true;
}

/** Every key the form can actually save. geo is two keys under one field. */
function keySet(fields) {
  const o = {};
  fields.forEach(f => { if (f.t === "geo") { o.lat = 1; o.lng = 1; } else o[f.k] = 1; });
  return o;
}

/* The empty document, with an example in every value rather than a blank. A
   skeleton of "": "" teaches nobody the shape of a bilingual pair or of a
   repeating group; the placeholders that are already in SPEC for the form do
   exactly that job here. */
function jsonTemplate(fields) {
  const out = {};
  for (const f of fields) {
    if (f.t === "geo") { out.lat = 29.961355; out.lng = 76.828553; continue; }
    out[f.k] = exampleOf(f);
  }
  return out;
}

function exampleOf(f) {
  const t = f.t;
  if (t === "num") return f.ph ? Number(f.ph) : 0;
  if (t === "bool") return false;
  if (t === "csv") return f.ph ? f.ph.split(",").map(s => s.trim()) : [];
  if (t === "sel") return f.opts[0];
  if (t === "loc" || t === "locarea") return { en: f.ph || "", hi: f.phHi || "" };
  if (t === "days" || t === "imgs" || t === "pts") return [];
  if (t === "obj") return jsonTemplate(f.of);
  if (t === "list") return [jsonTemplate(f.of)];
  return f.ph || "";   // text, time, date, area, img
}

/** What each key means and what may go in it. Generated, so it cannot drift. */
function refHtml(fields, prefix) {
  return fields.map(f => {
    if (f.t === "geo") {
      return '<div class="jr"><code>lat</code> <code>lng</code><span>' + ek(f.lb) +
        ' <em class="req">required</em> — decimal degrees. Latitude is the one near 29.</span></div>';
    }
    const kids = (f.t === "obj" || f.t === "list") ? refHtml(f.of, prefix + f.k + ".") : "";
    return '<div class="jr"><code>' + ek(prefix + f.k) + "</code><span>" + ek(f.lb) +
      (f.req ? ' <em class="req">required</em>' : "") + " — " + ek(allowOf(f)) + "</span></div>" + kids;
  }).join("");
}

function allowOf(f) {
  const t = f.t;
  if (t === "sel") return "one of: " + f.opts.join(", ");
  if (t === "loc") return "{ “en”, “hi” } — one line in each language";
  if (t === "locarea") return "{ “en”, “hi” } — a paragraph in each language";
  if (t === "csv") {
    const i = f.hint ? f.hint.indexOf("Known:") : -1;
    return "a list of words" + (i >= 0 ? ". " + f.hint.slice(i) : "");
  }
  if (t === "num") return "a number";
  if (t === "bool") return "true or false";
  if (t === "time") return "“HH:MM”, 24-hour";
  if (t === "date") return "“YYYY-MM-DD”";
  if (t === "days") return "a list of day numbers, 0 is Sunday";
  if (t === "img") return "one photograph id, no extension";
  if (t === "imgs") return "a list of photograph ids";
  if (t === "pts") return "a list of { “lat”, “lng” }";
  if (t === "obj") return "an object with the keys below";
  if (t === "list") return "a list of objects with the keys below";
  return "text";
}

/* ---- the preview -----------------------------------------------------------
 *
 * The record drawn the way the app draws it, from the same values that are
 * about to be saved. Deliberately a copy of the app's layout rather than the
 * app itself: the dashboard has no build step and cannot import a React
 * component, and standing up a draft endpoint plus a scratch store so the real
 * app could render an unsaved record is a great deal of machinery for a
 * confirmation screen.
 *
 * ponytail: hand-copied layout, so it can drift from the app. If it does, the
 * upgrade is a draft endpoint the real app renders in an iframe.
 */
const pvT = (v) => (v && v.en) || "";
const pvH = (v) => (v && v.hi) || "";
const pvLab = (s) => '<div class="pvlab">' + ek(s) + "</div>";

function pvDur(m) {
  if (!m) return "—";
  const h = Math.floor(m / 60), r = m % 60;
  return h ? (h + " hr" + (r ? " " + r + " min" : "")) : (r + " min");
}
function pvHours(h) {
  if (!h || !h.o || !h.c) return "—";
  if (h.o === "00:00" && h.c === "23:59") return "All day";
  return h.o.replace(/^0/, "") + "–" + h.c.replace(/^0/, "");
}
function pvFee(doc) {
  if (doc.free) return "Free";
  if (!doc.fee || !doc.fee.en) return "—";
  return /^(free|no entry|no charge)/i.test(doc.fee.en) ? "Free" : "Ticketed";
}

/* An id that points at nothing and no id at all are different mistakes, and an
   empty grey box is what both look like unless one of them says so. */
function pvFig(id, wide) {
  const open = '<div class="pvfig' + (wide ? " w169" : "") + '">';
  if (!id) return open + '<span class="pvnone">no photograph</span></div>';
  // The fallback is always rendered and hidden behind the picture; onerror
  // reveals it. Same trick as the table, for the same reason.
  return open + '<img src="' + ek(imgSrc(id)) + '" alt="" onerror="this.classList.add(\'bad\')">' +
    '<span class="pvnone">nothing in the library is called “' + ek(id) + '”</span></div>';
}

function pvTags(list) {
  const t = (list || []).filter(Boolean).map(x => '<span class="pvtag">' + ek(x) + "</span>").join("");
  return t ? '<div class="pvtags">' + t + "</div>" : "";
}

function pvCard(doc, sub) {
  return '<div class="pvcard">' + pvFig(doc.img) +
    '<div class="pvbd"><h3>' + ek(pvT(doc.name) || doc.id || "Unnamed") + "</h3>" +
    (pvH(doc.name) ? '<div class="alt">' + ek(pvH(doc.name)) + "</div>" : "") +
    "<p>" + ek(sub !== undefined ? sub : pvT(doc.short)) + "</p>" +
    pvTags([doc.visit && doc.visit.rec ? pvDur(doc.visit.rec) : "", doc.city]) + "</div></div>";
}

function pvPlace(doc) {
  const inside = (doc.inside || []).map(r =>
    '<div class="pvrow"><b>' + ek(pvT(r.n)) + "</b>" +
    (pvH(r.n) ? '<i>' + ek(pvH(r.n)) + "</i>" : "") +
    (pvT(r.d) ? "<p>" + ek(pvT(r.d)) + "</p>" : "") + "</div>").join("");
  const notes = (doc.notice || []).map(r =>
    '<div class="pvnotice"><b>' + ek(pvT(r.t)) + "</b>" +
    (pvT(r.d) ? "<p>" + ek(pvT(r.d)) + "</p>" : "") + "</div>").join("");
  const blk = (h, body) => body ? '<div class="pvblk"><h2>' + ek(h) + "</h2>" + body + "</div>" : "";

  return pvLab("In a list") + pvCard(doc) + pvLab("Its own page") +
    '<div class="pvpage">' +
      '<div class="pvhero">' + pvFig(doc.img) +
        '<div class="pvcap"><h1>' + ek(pvT(doc.name) || doc.id || "Unnamed") + "</h1>" +
        '<div class="alt">' + ek(pvH(doc.name)) + "</div></div></div>" +
      pvTags((doc.themes || []).slice(0, 3)) +
      '<div class="pvfacts">' +
        "<div><b>" + ek(pvDur(doc.visit && doc.visit.rec)) + "</b><span>How long</span></div>" +
        "<div><b>" + ek(pvFee(doc)) + "</b><span>Entry</span></div>" +
        "<div><b>" + ek(pvHours(doc.hours)) + "</b><span>Hours</span></div>" +
      "</div>" +
      (pvT(doc.best) ? '<p class="pvbest"><b>Best time:</b> ' + ek(pvT(doc.best)) + "</p>" : "") +
      blk("Why it matters", pvT(doc.why) ? "<p>" + ek(pvT(doc.why)) + "</p>" : "") +
      blk("What is inside", inside) +
      blk("Things to know", notes) +
      blk("Parking", pvT(doc.parking) ? "<p>" + ek(pvT(doc.parking)) + "</p>" : "") +
      pvTags(doc.facilities) +
    "</div>";
}

function pvStay(doc) {
  const price = doc.price && (doc.price.min || doc.price.max)
    ? "₹" + (doc.price.min || "?") + "–" + (doc.price.max || "?") + " a night" : "";
  return pvLab("In the list of stays") + pvCard(doc, pvT(doc.area)) + pvLab("Its own page") +
    '<div class="pvpage">' + pvFig(doc.img) +
      '<div class="pvbd pvpad"><h1>' + ek(pvT(doc.name) || doc.id || "Unnamed") + "</h1>" +
      '<div class="alt">' + ek(pvH(doc.name)) + "</div>" +
      pvTags([doc.kind, price, doc.phone, pvT(doc.area)]) +
      (pvT(doc.note) ? "<p>" + ek(pvT(doc.note)) + "</p>" : "") +
      pvTags(doc.facilities) + "</div></div>";
}

function pvEvent(doc) {
  const when = doc.from ? (doc.to && doc.to !== doc.from ? doc.from + " → " + doc.to : doc.from) : "—";
  const n = (doc.places || []).length;
  return pvLab("The banner on the home screen") +
    '<div class="pvpage">' +
      '<div class="pvhero">' + pvFig(doc.img, 1) +
        '<div class="pvcap"><h1>' + ek(pvT(doc.name) || doc.id || "Unnamed") + "</h1>" +
        '<div class="alt">' + ek(pvH(doc.name)) + "</div></div></div>" +
      pvTags([when, doc.kind, doc.advice,
        doc.window && doc.window.from ? doc.window.from + "–" + doc.window.to : ""]) +
      (pvT(doc.blurb) ? '<p class="pvpad">' + ek(pvT(doc.blurb)) + "</p>" : "") +
      (pvT(doc.notice) ? '<div class="pvnotice"><b>What to do differently</b><p>' + ek(pvT(doc.notice)) + "</p></div>" : "") +
      '<div class="pvblk"><h2>What it does to the day</h2><p>Visits take ' +
        ek(String(doc.visitFactor || 1)) + "× as long and the roads are " +
        ek(String(doc.travelFactor || 1)) + "× slower" +
        (n ? ", at " + n + " place" + (n === 1 ? "" : "s") : "") + ".</p></div>" +
    "</div>";
}

function pvHero(doc) {
  return pvLab("The top of the home screen") +
    '<div class="pvpage"><div class="pvhero">' + pvFig(doc.img, 1) +
      '<div class="pvcap"><p class="fact">' + ek(pvT(doc.fact)) + "</p></div></div>" +
      (pvH(doc.fact) ? '<p class="alt pvpad">' + ek(pvH(doc.fact)) + "</p>" : "") + "</div>";
}

function pvPoint(doc) {
  const where = doc.lat != null && doc.lng != null
    ? Number(doc.lat).toFixed(4) + ", " + Number(doc.lng).toFixed(4) : "";
  return pvLab("Where it appears") +
    '<div class="pvcard"><div class="pvbd"><h3>' + ek(pvT(doc.name) || doc.id || "Unnamed") + "</h3>" +
    (pvH(doc.name) ? '<div class="alt">' + ek(pvH(doc.name)) + "</div>" : "") +
    (pvT(doc.area) ? "<p>" + ek(pvT(doc.area)) + "</p>" : "") +
    pvTags([doc.kind, doc.code, doc.phone, where]) +
    (pvT(doc.note) ? "<p>" + ek(pvT(doc.note)) + "</p>" : "") + "</div></div>";
}

function pvBody(doc) {
  if (CKIND === "places") return pvPlace(doc);
  if (CKIND === "hotels") return pvStay(doc);
  if (CKIND === "events") return pvEvent(doc);
  if (CKIND === "hero") return pvHero(doc);
  return pvPoint(doc);
}

/**
 * What is wrong, said before it is saved rather than found in the app later.
 *
 * Red is for things the app cannot do without. Everything else is stated
 * plainly and does not stop a save — a place with no Hindi yet is a real record
 * somebody is part-way through, not a mistake, and refusing it would just mean
 * the work is not kept.
 */
function checksHtml(doc) {
  const out = [];
  const spec = cSpec();
  const hasGeo = spec.some(f => f.t === "geo");

  // geo is excluded because it reports itself below, in the words that help.
  spec.filter(f => f.req && f.t !== "geo").forEach(f => {
    if (doc[f.k] === undefined) out.push([1, "Missing: " + f.lb]);
  });

  const walk = (fields, obj, where) => {
    for (const f of fields) {
      const v = obj ? obj[f.k] : undefined;
      if ((f.t === "loc" || f.t === "locarea") && v && v.en && !v.hi)
        out.push([0, "No Hindi for “" + f.lb + "”" + where]);
      if (f.t === "obj" && v) walk(f.of, v, where);
      if (f.t === "list" && Array.isArray(v))
        v.forEach((r, i) => walk(f.of, r, " — " + f.lb + ", row " + (i + 1)));
    }
  };
  walk(spec, doc, "");

  if (spec.some(f => f.t === "img") && !doc.img)
    out.push([0, "No photograph — the app will draw an empty frame here"]);
  if (hasGeo && doc.lat == null) out.push([1, "No location pinned"]);
  else if (hasGeo && !inBox({ lat: doc.lat, lng: doc.lng }))
    out.push([1, "The pin is outside Kurukshetra district — check the two numbers are not the wrong way round"]);
  if (doc.pending) out.push([0, "Hidden from the app — this saves, but nobody will see it"]);

  return "<h4>Before you save</h4>" + (out.length
    ? out.map(x => '<div class="ck' + (x[0] ? " bad" : "") + '">' + ek(x[1]) + "</div>").join("")
    : '<div class="ck ok">Everything the app needs is here.</div>');
}

function renderPreview() {
  const doc = currentDoc();
  $("#cpreview").innerHTML =
    '<p class="pvnote">This is how the app will show it. Nothing has been saved yet — Save is the button below.</p>' +
    '<div class="pvwrap"><div class="phone">' + pvBody(doc) + "</div>" +
    '<div class="pvchecks">' + checksHtml(doc) + "</div></div>";
}

/** The word for one record of the kind on screen, for headings people read. */
function kindWord() {
  const k = KINDS.filter(x => x.k === CKIND)[0];
  const w = (k ? k.lb : CKIND).toLowerCase();
  return w === "places" ? "place" : w === "stays" ? "stay" : w === "events" ? "event" :
         w === "start points" ? "start point" : w === "e-rickshaw" ? "e-rickshaw stand" : "entry";
}

function openEditor() {
  $("#editor").hidden = false;
  document.body.style.overflow = "hidden";
  initMaps();
}
function closeEditor() {
  $("#editor").hidden = true;
  document.body.style.overflow = "";
  MODE = "form";
  // Leaflet keeps window-level listeners per map. cForm replaces the HTML under
  // them, so without this every open-and-close leaves another dead map watching
  // for resizes.
  $("#cform").querySelectorAll(".gmap").forEach(h => { if (h._map) { h._map.remove(); h._map = null; } });
}

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

/**
 * Save, but only from the preview.
 *
 * The first press is never a save: it draws the record the way the app will and
 * puts the real Save under it. That costs one extra click and it is the only
 * point at which anybody sees, before it is live, that the Hindi is missing or
 * that the photograph id points at nothing.
 */
async function cSave() {
  // Typed as JSON and pressed Save without going back to the form: apply it
  // first, and stop here if it will not parse.
  if (MODE === "json" && !setMode("form")) return;

  const doc = currentDoc();
  const bad = cSpec().filter(f => f.req && doc[f.k] === undefined);
  if (bad.length) {
    // Land on the step that is missing something rather than announcing it from
    // a screen that does not contain the box being complained about.
    const st = stepsOf(cSpec()).findIndex(s => s.fs.indexOf(bad[0]) >= 0);
    showStep(st < 0 ? 0 : st);
    return cmsg("Fill these in first: " + bad.map(f => f.lb).join(", "), true);
  }
  if (!/^[a-z0-9-]+$/.test(doc.id)) {
    showStep(0);
    return cmsg("The id may only hold lower-case letters, digits and hyphens.", true);
  }
  if (CSTEP !== "pv") { showStep("pv"); return cmsg(""); }

  const r = await api(cUrl(), {
    method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(doc),
  });
  const j = await r.json().catch(() => ({}));
  // The calendar validates on the server and answers with a list of what is
  // wrong. Showing only the error field here reported "invalid" and threw the
  // reasons away, which is the least useful half of the response.
  if (!r.ok) return cmsg((j.problems && j.problems.length ? j.problems : [j.error || ("Save failed (" + r.status + ")")]).join("\n"), true);
  cmsg("");
  closeEditor();
  await cLoad();
}

async function cDel(id) {
  if (!confirm("Delete " + id + "?\n\nThis removes it from the app. If it has only closed for a while, tick \"Hide from the app\" instead — that keeps the record.")) return;
  await api(cUrl(), {
    method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: id }),
  });
  cLoad();
}

/* ---- photographs ---------------------------------------------------------- */

const imgSrc = (id) => "/img/" + encodeURIComponent(id) + (id.indexOf(".") < 0 ? ".webp" : "");

/* What shape the app will draw this picture in. An event banner and the home
   screen's opening photograph are both cropped to 16:9; everything else sits in
   a 4:3 card. */
const wantAR = () => (CKIND === "events" || CKIND === "hero" ? 16 / 9 : 4 / 3);

/**
 * Say what the crop will do to a picture of the wrong shape.
 *
 * "16:9" in a hint is a rule the editor cannot check. They upload a photograph
 * taken on a phone — 4:3, portrait, whatever the phone gave them — the thumbnail
 * here is drawn in the right shape by CSS, and it all looks correct until the
 * home screen cuts the top off a temple. The picture is not broken and the field
 * is not wrong, so nothing anywhere would ever have mentioned it. The browser
 * already knows the real dimensions the moment it decodes the file; this just
 * asks it.
 */
function checkAspect(img) {
  const want = Number(img.getAttribute("data-ar"));
  const got = img.naturalWidth / img.naturalHeight;
  if (!want || !got) return;
  // A tenth off is a crop nobody will notice. This is for the wrong SHAPE.
  if (Math.abs(got - want) / want < 0.1) return;
  const th = img.closest(".th");
  if (!th) return;
  th.classList.add("wrongar");
  th.setAttribute("data-armsg", img.naturalWidth + "×" + img.naturalHeight + " — " +
    (got < want ? "taller than the frame, so the top and bottom will be cut off"
                : "wider than the frame, so the sides will be cut off"));
}

/** Little previews under an image field, so a wrong id is visible immediately. */
function paintThumbs(box) {
  const fld = box.closest(".fld");
  const input = fld.querySelector("[data-i]");
  const ids = input.value.split(",").map(s => s.trim()).filter(Boolean);
  box.innerHTML = ids.map(id =>
    '<span class="th"><img src="' + ek(imgSrc(id)) + '" alt="" loading="lazy" data-ar="' + wantAR() + '" ' +
    'onload="checkAspect(this)" onerror="this.parentNode.classList.add(\'miss\')">' +
    "<small>" + ek(id) + "</small></span>").join("");
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
/** Everything a photograph could belong to, for the upload selector. */
async function fillUploadFor() {
  const uses = await usage();
  const sel = $("#upfor");
  const sets = [
    { url:"/admin/content/places", lb:"Places" },
    { url:"/admin/events", lb:"Events" },
    { url:"/admin/content/hero", lb:"Home screen" },
    { url:"/admin/content/hotels", lb:"Stays" },
  ];
  let html = '<option value="">— choose —</option>';
  for (const s2 of sets) {
    let items = [];
    try { items = (await api(s2.url).then(r => r.json())).items || []; } catch (e) { /* skip */ }
    if (!items.length) continue;
    html += '<optgroup label="' + ek(s2.lb) + '">' + items.map(it =>
      '<option value="' + ek(it.id) + '">' + ek((it.name && it.name.en) || it.id) + "</option>").join("") + "</optgroup>";
  }
  sel.innerHTML = html;
}

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
  paintLibrary(true);
  if (!$("#picker").hidden) { const f = PICK_FOR; if (f) pickImage(f, $("#picker").getAttribute("data-multi") === "1"); }
}
const upmsg = (t, bad) => { const m = $("#upm"); m.className = t ? "msg " + (bad ? "bad" : "good") : ""; m.textContent = t; };

/**
 * What every photograph is FOR.
 *
 * A bucket of a hundred files named after tirthas is not a library, it is a
 * directory listing — and the question an editor actually has is never "what
 * files exist", it is "does Jyotisar have a picture" and "is this one still
 * being used by anything". So the library is grouped by what refers to each
 * key, and anything nothing refers to is called out rather than buried in
 * alphabetical order among the ones that are in use.
 *
 * Built by reading the catalogues once and walking their img and gallery
 * fields. No new server route and nothing to keep in step: whatever a document
 * points at is, by definition, what that photograph is for.
 *
 * THE HOME SCREEN IS IN THIS LIST, and putting it there is the whole reason the
 * count of unused pictures was nonsense. Fifteen of the eighteen the library
 * called "not used anywhere", in red, above a Delete button, were the home
 * carousel — every one of them load-bearing, none of them referenced by any
 * document, because the carousel lived in the app's bundle where the database
 * could not see it. This function was telling the truth about a question that
 * was too small. See SPEC.hero.
 */
const RESERVED = { logo: "the app's own seal", "logo-sm": "the app's own seal" };
let USES = null;
async function usage(force) {
  if (USES && !force) return USES;
  const map = {};
  const add = (key, group, label) => {
    if (!key) return;
    (map[key] = map[key] || []).push({ group: group, label: label });
  };
  // Bundled by the app rather than fetched, so nothing points at them and
  // nothing ever will. Named anyway: "not used anywhere" next to a Delete
  // button is an invitation, and this is the logo.
  for (const k of Object.keys(RESERVED)) add(k, "app", RESERVED[k]);
  const sets = [
    { url: "/admin/events", group: "events" },
    { url: "/admin/content/places", group: "places" },
    { url: "/admin/content/hotels", group: "stays" },
    { url: "/admin/content/hero", group: "home" },
    { url: "/admin/content/startpoints", group: "startpoints" },
    { url: "/admin/content/erickshaw", group: "erickshaw" },
  ];
  for (const s of sets) {
    let items = [];
    try { items = (await api(s.url).then(r => r.json())).items || []; } catch (e) { /* one feed down must not blank the library */ }
    for (const it of items) {
      const label = (it.name && (it.name.en || it.name.hi)) || it.id;
      add(it.img, s.group, label);
      (it.gallery || []).forEach(g => add(g, s.group, label));
    }
  }
  USES = map;
  return map;
}

const GROUPS = [
  { g:"all", lb:"All" },
  { g:"places", lb:"Places" },
  { g:"events", lb:"Events" },
  { g:"home", lb:"Home screen" },
  { g:"stays", lb:"Stays" },
  { g:"unused", lb:"Not used" },
];
let MGROUP = "all";

async function paintLibrary(force) {
  const items = await mediaList(force);
  const uses = await usage(force);

  const of = (key) => uses[key.replace(/\.[a-z]+$/, "")] || [];
  const inGroup = (key) => {
    const u = of(key);
    if (MGROUP === "all") return true;
    if (MGROUP === "unused") return u.length === 0;
    return u.some(x => x.group === MGROUP);
  };

  $("#mgroups").innerHTML = GROUPS.map(x => {
    const n = items.filter(o => {
      const u = of(o.key);
      return x.g === "all" ? true : x.g === "unused" ? u.length === 0 : u.some(y => y.group === x.g);
    }).length;
    return '<button data-mg="' + x.g + '"' + (MGROUP === x.g ? ' class="on"' : "") + ">" + ek(x.lb) +
      ' <small>' + n + "</small></button>";
  }).join("");

  const shown = items.filter(o => inGroup(o.key));
  $("#libcount").textContent = shown.length + " of " + items.length + " · " +
    (items.reduce((n, o) => n + o.size, 0) / 1024 / 1024).toFixed(2) + " MB";

  $("#libgrid").innerHTML = shown.map(o => {
    const id = o.key.replace(/\.[a-z]+$/, "");
    const u = of(o.key);
    const used = u.length
      ? '<small class="use">' + ek(u.map(x => x.label).join(", ")) + "</small>"
      : '<small class="use none">nothing points at this one</small>';
    return '<div class="pk"><img src="' + ek("/img/" + encodeURIComponent(o.key)) + '" alt="" loading="lazy">' +
      "<small>" + ek(id) + "</small>" + used +
      '<button type="button" class="danger sm" data-mdel="' + ek(o.key) + '">Delete</button></div>';
  }).join("") || '<p class="muted">Nothing in this group.</p>';
}

async function mediaDelete(key) {
  if (!confirm("Delete " + key + "?\n\nAny place still pointing at it will show an empty frame.")) return;
  await api("/admin/media?key=" + encodeURIComponent(key), { method: "DELETE" });
  await mediaList(true);
  paintLibrary(true);
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
    // The rail's marks are about what is filled in, so they follow typing. Only
    // the required fields are read, which is a handful per kind.
    if (MODE === "form" && e.target.closest("#cform")) paintSteps();
  });

  /* The rail. Any step, in any order — an editor correcting one phone number
     must not have to walk through six screens to reach it. Preview is a step
     like the others, so it can be looked at half-way through. */
  $("#csteps").addEventListener("click", (e) => {
    const b = e.target.closest("[data-step]");
    if (!b) return;
    const n = b.getAttribute("data-step");
    if (MODE === "json" && !setMode("form")) return;
    showStep(n === "pv" ? "pv" : Number(n));
  });
  $("#cback").addEventListener("click", () => stepBy(-1));
  $("#cnext").addEventListener("click", () => stepBy(1));
  $("#cmodes").addEventListener("click", (e) => {
    const b = e.target.closest("[data-mode]");
    if (b) setMode(b.getAttribute("data-mode"));
  });
  $("#jtemplate").addEventListener("click", () => {
    setJSON(JSON.stringify(jsonTemplate(cSpec()), null, 2));
    jmsg("Every key, with an example in each. Replace the values and delete what you do not need.");
  });
  // The colouring is scenery painted over the real control, so it has to follow
  // every way the text or the viewport can change.
  $("#cjson").addEventListener("input", jPaint);
  $("#cjson").addEventListener("scroll", jSync);
  $("#jcopy").addEventListener("click", () => {
    $("#cjson").select();
    // execCommand because the dashboard is often opened over plain http on the
    // office machine, and navigator.clipboard does not exist there.
    try { document.execCommand("copy"); jmsg("Copied."); } catch (e) { jmsg("Press Ctrl-C to copy.", 1); }
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
  // Choosing what it is a photograph OF names the file, because the name is
  // the link between the two — a picture called IMG_4821 belongs to nothing.
  $("#upfor").addEventListener("change", async () => {
    const id = $("#upfor").value;
    if (!id) return;
    const taken = (await mediaList()).map(o => o.key.replace(/\.[a-z]+$/, ""));
    let key = id, n = 1;
    while (taken.indexOf(key) >= 0) key = id + "-" + (++n);
    $("#upkey").value = key;
    upmsg(taken.indexOf(id) >= 0
      ? "That one already has a photograph, so this will be added as " + key + "."
      : "");
  });
  $("#mgroups").addEventListener("click", (e) => {
    const b = e.target.closest("[data-mg]");
    if (!b) return;
    MGROUP = b.getAttribute("data-mg");
    paintLibrary();
  });
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
 #editor .drawer{background:var(--bg);width:min(1000px,100%);height:100%;display:flex;
   flex-direction:column;box-shadow:-8px 0 30px rgba(28,24,21,.18)}
 #editor .dhead{display:flex;align-items:center;gap:10px;padding:15px 20px;background:var(--paper);
   border-bottom:1px solid var(--line)}
 #editor .dhead h2{margin:0;font-size:16px;text-transform:none;letter-spacing:0;color:var(--ink)}
 /* The rail does not scroll with the form. Where you are in a long record is
    exactly the thing that must not disappear as you scroll down it. */
 #editor .dbody{flex:1;display:flex;min-height:0}
 #editor .dmain{flex:1;min-width:0;overflow:auto;padding:18px 20px}
 #editor .dfoot{padding:13px 20px;background:var(--paper);border-top:1px solid var(--line);
   display:flex;gap:8px;align-items:center}

 /* ---- the step rail ----
    One part of the record at a time, and a mark against each part saying
    whether it still wants something. Free to jump: somebody fixing one phone
    number must not be walked through six screens to reach it. */
 .steprail{width:186px;flex:0 0 186px;background:var(--paper);border-right:1px solid var(--line);
   padding:14px 10px;display:flex;flex-direction:column;gap:2px;overflow:auto}
 .steprail .srow{background:none;border:0;text-align:left;padding:9px 10px;border-radius:8px;
   color:var(--muted);font-size:13.5px;font-weight:600;display:flex;align-items:center;gap:9px}
 .steprail .srow:hover{background:var(--bg);color:var(--ink)}
 .steprail .srow.on{background:var(--bg);color:var(--ink);box-shadow:inset 2px 0 0 var(--accent)}
 .steprail .srow i{width:9px;height:9px;border-radius:99px;flex:0 0 9px;
   border:1.5px solid var(--line);background:transparent}
 .steprail .srow.ok i{background:var(--ok);border-color:var(--ok)}
 .steprail .srow.todo i{border-color:var(--accent);border-style:dashed}
 .steprail .srailgap{flex:1;min-height:10px}
 .steprail .pvstep{border-top:1px solid var(--line);border-radius:0 0 8px 8px;padding-top:12px;margin-top:2px}
 .steprail .pvstep i{border-radius:2px;transform:rotate(45deg);border-color:var(--muted)}
 .steprail .pvstep.on i{background:var(--accent);border-color:var(--accent)}
 /* One step's fields. The heading is the step's own name, so it is a title
    rather than the divider it is inside a sub-group. */
 .step > h3.sec{margin:0 0 12px;border-top:0;padding-top:0;font-size:12px;color:var(--ink)}
 .modes{display:flex;gap:2px;background:var(--bg);border:1px solid var(--line);border-radius:9px;padding:2px}
 .modes button{background:none;border:0;color:var(--muted);padding:6px 13px;border-radius:7px;font-size:13px}
 .modes button.on{background:var(--paper);color:var(--ink);box-shadow:0 1px 2px rgba(28,24,21,.12)}

 /* ---- JSON ----
    For the people who would rather type the record than fill in forty boxes.
    The reference beside it is generated from the same SPEC the form is, so it
    cannot describe a key that does not exist. */
 .jbar{display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap}
 .jwrap{display:grid;grid-template-columns:1fr 300px;gap:14px;align-items:start}
 @media(max-width:900px){.jwrap{grid-template-columns:1fr}}
 .jref{font-size:12px;border:1px solid var(--line);border-radius:10px;background:var(--paper);
   padding:10px 12px;max-height:60vh;overflow:auto}
 .jr{padding:6px 0;border-bottom:1px solid var(--line);line-height:1.45}
 .jr:last-child{border-bottom:0}
 .jr code{background:var(--bg);border-radius:4px;padding:1px 5px;font-size:11.5px;color:var(--ink)}
 .jr span{display:block;color:var(--muted);margin-top:2px}
 .jr .req{font-style:normal;color:var(--bad);font-size:10px;text-transform:uppercase;letter-spacing:.06em}

 /* ---- the preview ----
    The record as the app will draw it, in a phone-width column so the line
    lengths and the crops are the real ones. Beside it, what is still wrong. */
 .pvnote{font-size:13px;color:var(--muted);margin:0 0 14px}
 .pvwrap{display:grid;grid-template-columns:1fr 260px;gap:18px;align-items:start}
 @media(max-width:860px){.pvwrap{grid-template-columns:1fr}}
 .phone{max-width:400px;background:var(--paper);border:1px solid var(--line);border-radius:var(--r,14px);
   overflow:hidden;font-size:15px}
 .pvlab{font-size:10.5px;text-transform:uppercase;letter-spacing:.09em;color:var(--muted);
   font-weight:700;padding:12px 14px 6px;background:var(--bg)}
 .pvfig{position:relative;aspect-ratio:4/3;background:var(--bg);display:flex;align-items:center;
   justify-content:center;overflow:hidden}
 .pvfig.w169{aspect-ratio:16/9}
 .pvfig img{width:100%;height:100%;object-fit:cover;display:block}
 .pvfig img.bad{display:none}
 .pvnone{font-size:11.5px;color:var(--muted);text-align:center;padding:0 14px}
 .pvfig img + .pvnone{display:none}
 .pvfig img.bad + .pvnone{display:block;color:var(--bad);font-weight:700}
 .pvcard{display:flex;gap:12px;padding:12px 14px;align-items:flex-start}
 .pvcard .pvfig{width:96px;flex:0 0 96px;border-radius:9px}
 .pvbd{min-width:0;flex:1}
 .pvbd h3,.pvbd h1{margin:0;font-size:16px;line-height:1.3}
 .pvbd h1{font-size:20px}
 .pvbd .alt,.pvcap .alt{color:var(--muted);font-size:13px;margin-top:1px}
 .pvbd p,.pvblk p,.pvpage > p{margin:6px 0 0;font-size:13.5px;line-height:1.5;color:var(--ink)}
 .pvpad{padding:0 14px}
 .pvpage{border-top:1px solid var(--line)}
 .pvhero{position:relative}
 .pvhero .pvfig{border-radius:0}
 /* The name sits ON the photograph, over a gradient, exactly as the app does
    it — a title floating on cream below the picture is a different screen. */
 .pvcap{position:absolute;left:0;right:0;bottom:0;padding:26px 14px 12px;color:#fff;
   background:linear-gradient(transparent,rgba(28,24,21,.78))}
 .pvcap h1{margin:0;font-size:21px;line-height:1.25;color:#fff}
 .pvcap .alt{color:rgba(255,255,255,.82)}
 .pvcap .fact{margin:0;font-size:15px;line-height:1.4}
 .pvtags{display:flex;gap:6px;flex-wrap:wrap;padding:12px 14px 0}
 .pvtag{background:var(--bg);border:1px solid var(--line);border-radius:99px;padding:3px 10px;
   font-size:11.5px;color:var(--muted)}
 .pvfacts{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--line);
   margin:14px 0 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
 .pvfacts div{background:var(--paper);padding:11px 8px;text-align:center}
 .pvfacts b{display:block;font-size:15px}
 .pvfacts span{font-size:10.5px;color:var(--muted)}
 .pvbest{margin:12px 14px 0;font-size:13.5px}
 .pvblk{padding:14px}
 .pvblk h2{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:0 0 6px}
 .pvrow{padding:8px 0;border-top:1px solid var(--line)}
 .pvrow b{display:block;font-size:14px}
 .pvrow i{font-style:normal;color:var(--muted);font-size:12.5px}
 .pvnotice{margin:12px 14px;background:var(--bg);border-left:3px solid var(--accent);
   border-radius:0 8px 8px 0;padding:9px 11px}
 .pvnotice b{font-size:13px}
 .pvchecks{border:1px solid var(--line);border-radius:10px;background:var(--paper);padding:12px 14px}
 .pvchecks h4{margin:0 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
 .ck{font-size:12.5px;line-height:1.45;padding:5px 0 5px 16px;position:relative;color:var(--muted)}
 .ck:before{content:"";position:absolute;left:0;top:11px;width:7px;height:7px;border-radius:99px;
   background:var(--muted);opacity:.45}
 .ck.bad{color:var(--bad);font-weight:600}
 .ck.bad:before{background:var(--bad);opacity:1}
 .ck.ok{color:var(--ok)}
 .ck.ok:before{background:var(--ok);opacity:1}
 /* A map that could not load is a grey rectangle and no explanation otherwise. */
 .gdead{padding:22px 16px;text-align:center;font-size:13px;color:var(--muted);line-height:1.5}

 @media(max-width:820px){
   .steprail{width:auto;flex:none;flex-direction:row;overflow-x:auto;border-right:0;
     border-bottom:1px solid var(--line);padding:8px}
   #editor .dbody{flex-direction:column}
   .steprail .srow{white-space:nowrap}
   .steprail .srailgap{display:none}
   .steprail .pvstep{border-top:0;border-left:1px solid var(--line);padding-top:9px;margin-top:0}
 }
 .fld{margin:14px 0}
 .fl{font-size:13px;font-weight:700;display:block;margin-bottom:4px}
 /* Section headings. A place has twenty-eight fields and they are not one
    thought — "where it is" and "what it costs" are different jobs, often done
    by different people on different days. */
 h3.sec{grid-column:1/-1;margin:26px 0 2px;font-size:11px;text-transform:uppercase;
   letter-spacing:.09em;color:var(--muted);border-top:1px solid var(--line);padding-top:14px}
 h3.sec:first-child{margin-top:6px;border-top:0;padding-top:0}
 .fl .req{font-style:normal;font-weight:400;color:var(--bad);font-size:11px;
   text-transform:uppercase;letter-spacing:.06em;margin-left:6px}
 .pair{display:grid;grid-template-columns:1fr 1fr;gap:10px}
 .pair small{display:block;font-size:11px;color:var(--muted);margin-top:2px}
 @media(max-width:640px){.pair{grid-template-columns:1fr}}
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
 /* An event's picture is a banner across the top of the home screen, so it is
    previewed in the shape it will actually be seen in. A 4:3 thumbnail of a
    16:9 crop tells the editor nothing about what will be cut off. */
 .wide169 .th img,.wide169 .tpic img{width:112px;height:63px}
 .wide169 .th{width:112px}
 .wide169 .tpic{width:120px}
 .th small{display:block;font-size:10px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
 /* An id pointing at nothing has to look wrong, not just render an empty box —
    a broken image and a photograph that has not loaded yet are the same picture. */
 .th.miss img{display:none}
 .th.miss{border:1px dashed var(--bad);border-radius:6px;color:var(--bad);padding:4px 2px}
 .th.miss:after{content:"not found";font-size:10px;display:block}
 /* The right picture in the wrong shape. Not an error — the app will render it
    — so it is stated rather than flagged red, and it is stated in terms of what
    the visitor will actually lose. */
 .thumbs .th.wrongar{width:auto;max-width:280px}
 .th.wrongar img{outline:2px solid #C98A2E;outline-offset:1px}
 .th.wrongar:after{content:attr(data-armsg);display:block;font-size:10.5px;line-height:1.35;
   color:#8A5D12;margin-top:3px;white-space:normal;text-align:left}

 /* ---- maps ----
    A slippy map inside a form field. Deliberately not tall: it is one control
    among twenty, and a half-screen map pushes everything else out of reach. */
 .geo{margin-top:4px}
 .gmap{height:240px;border:1px solid var(--line);border-radius:10px;overflow:hidden;background:var(--bg)}
 .gmap.tall{height:320px}
 .leaflet-container{font:inherit;font-size:12px}
 .gsearch{display:flex;gap:8px;margin-bottom:8px}
 .gsearch input{margin:0}
 .gres{border:1px solid var(--line);border-radius:10px;background:#fff;margin-bottom:8px;
   max-height:190px;overflow:auto}
 .gr{display:block;width:100%;text-align:left;background:none;border:0;border-bottom:1px solid var(--line);
   padding:8px 11px;font-size:13px;font-weight:400;line-height:1.35;border-radius:0}
 .gr:last-child{border-bottom:0}
 button.gr:hover{background:var(--bg)}
 .gr .far{font-style:normal;color:var(--bad);font-size:11px;font-weight:700}
 .gnum{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px}
 .gnum label{margin:0;font-size:11px;font-weight:400;color:var(--muted)}
 .gwarn{margin-top:8px;padding:9px 11px;border-radius:8px;background:#F9EAE3;color:var(--bad);font-size:12.5px}
 .cbar{display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap}
 .cn{font-size:12.5px;color:var(--muted)}
 .craw{margin-top:10px}
 .craw summary{font-size:12px;color:var(--muted);cursor:pointer}
 .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:10px}
 .pk{background:#fff;border:1px solid var(--line);border-radius:8px;padding:6px;cursor:pointer;text-align:center}
 .pk img{width:100%;height:76px;object-fit:cover;border-radius:5px;display:block}
 .pk small{display:block;font-size:10px;color:var(--muted);margin-top:4px;overflow:hidden;
   text-overflow:ellipsis;white-space:nowrap}
 .pk button{margin-top:6px;width:100%}
 /* ABOVE the drawer, not below it. The picker is opened by a button inside the
    editor, and the editor is a full-screen fixed layer at z-index 40 — so at
    30 the picker was painted, sized and populated entirely behind it. "Pick…"
    did nothing, twice, and then Escape closed the picker nobody had seen
    instead of the drawer. */
 #picker{position:fixed;inset:0;background:rgba(28,24,21,.55);z-index:50;padding:24px;overflow:auto}
 #picker .box{background:var(--paper);border-radius:14px;padding:18px;max-width:820px;margin:0 auto}
 .muted{color:var(--muted);font-size:14px}
 .mgroups{display:flex;gap:5px;flex-wrap:wrap}
 .mgroups button{background:#fff;border:1px solid var(--line);color:var(--muted);
   border-radius:99px;padding:6px 12px;font-size:12.5px}
 .mgroups button small{opacity:.65;font-weight:700;margin-left:3px}
 .mgroups button.on{background:var(--accent);border-color:var(--accent-d);color:#fff}
 .pk .use{display:block;font-size:10px;color:var(--muted);margin-top:2px;line-height:1.3;
   overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
 .pk .use.none{color:var(--bad);font-weight:700}
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
 /* ---- the shape of a form -------------------------------------------------
    Two columns, and every control in a row starting on the same line.
 *
 * That second part is the whole of it. Hints are one line for "Town" and three
 * for "Id", so a plain grid put the two inputs beside each other at two
 * different heights, and a form of twenty fields had twenty small
 * misalignments in it. Each .fld is a two-row subgrid — label row, control row
 * — so the row's tallest hint sets one height for all of them and the inputs
 * line up. It is the browser doing what a designer would do by hand, and it
 * costs three lines.
 *
 * Anything BILINGUAL takes the full width, because it is already two columns
 * inside (English | हिन्दी) and nesting that in half a form gives four cramped
 * boxes on one line. "Name" squeezed into 300px beside an empty column, while
 * "One line" — the same kind of field — ran the full width, was the visible
 * half of this. */
 .sfields,.sub{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));
   gap:18px 18px;align-items:start}
 .sfields > .fld,.sub > .fld{margin:0;display:grid;grid-template-rows:subgrid;grid-row:span 2}
 .sfields > .fld[data-t="loc"],.sfields > .fld[data-t="locarea"],
 .sfields > .fld[data-t="list"],.sfields > .fld[data-t="obj"],
 .sfields > .fld[data-t="geo"],.sfields > .fld[data-t="pts"],
 .sfields > .fld[data-t="days"],.sfields > .fld[data-t="imgs"],
 .sfields > .fld[data-t="csv"],
 .sub > .fld[data-t="loc"],.sub > .fld[data-t="locarea"],
 .sub > .fld[data-t="list"],.sub > .fld[data-t="obj"]{grid-column:1/-1}
 /* Browsers without subgrid get the old ragged rows rather than a broken page:
    span 2 with no subgrid would leave a blank row under every field. */
 @supports not (grid-template-rows:subgrid){
   .sfields > .fld,.sub > .fld{display:block;grid-row:auto}
 }
 .sub{border-left:3px solid var(--line);padding-left:12px;margin-top:6px}
 /* A control block is the bottom row of its field, so what sits inside it
    should start at the top of that row rather than float in the middle. */
 .ctl{align-self:start}
 .ctl > :first-child{margin-top:0}
 @media(max-width:720px){.sfields,.sub{grid-template-columns:1fr}}

 /* ---- JSON, in colour ----
    Key, string, number and literal each their own, so a run-on quote stops
    reading as text and starts reading as a mistake. The <pre> underneath must
    match the textarea over it exactly — same font, same padding, same
    line-height — or the two copies drift a pixel per line. */
 .jed{position:relative;border:1px solid var(--line);border-radius:8px;background:#fff;overflow:hidden}
 .jed > .jhl,.jed > textarea{margin:0;padding:10px 12px;border:0;border-radius:0;
   font:13px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;
   white-space:pre;tab-size:2;overflow:auto}
 .jed > textarea{position:relative;z-index:1;display:block;width:100%;height:60vh;min-height:320px;
   background:transparent;color:transparent;caret-color:var(--ink);resize:vertical}
 .jed > textarea::selection{background:#CFE0F0;color:transparent}
 .jed > .jhl{position:absolute;inset:0;z-index:0;pointer-events:none;color:var(--muted)}
 .jk{color:#1E3A5F;font-weight:700}          /* keys — the app's guide blue */
 .js{color:#4F5B2E;font-weight:400}          /* strings — the open green */
 .jn{color:#A34A05}                          /* numbers — deep accent */
 .jl{color:#9A3B1E;font-weight:700}          /* true / false / null */
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
    <label>What is it a photograph of?
     <span class="hint">Pick the place or event it belongs to and the name below fills itself in. Every photograph here is a picture of something in the app — choosing it is what keeps the library sorted.</span>
     <select id="upfor"><option value="">— choose —</option></select></label>
   <label>Name it
     <span class="hint">Lower-case with hyphens, no extension. THIS is what goes in a record's photograph field. A second picture of the same place wants a -2 on the end. Uploading an existing name replaces that picture everywhere it is used.</span>
     <input type="text" id="upkey" placeholder="brahma-sarovar"></label>
    <div class="bar"><button class="primary" type="submit">Upload</button></div>
    <div id="upm"></div>
   </form>
  </section>
  <section>
   <div class="toolbar">
    <h2 style="margin:0">The library</h2>
    <nav class="mgroups" id="mgroups"></nav>
    <span style="flex:1"></span>
    <span class="you" id="libcount"></span>
   </div>
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
   <!-- Two ways into the same record, not two kinds of record. Whichever is on
        screen, what saves is the form — JSON is applied to it on the way out. -->
   <div class="modes" id="cmodes">
    <button type="button" data-mode="form" class="on">Form</button>
    <button type="button" data-mode="json">JSON</button>
   </div>
   <button class="ghost" type="button" id="cclose">Close</button>
  </div>
  <div class="dbody">
   <nav class="steprail" id="csteps"></nav>
   <div class="dmain">
    <div id="cm"></div>
    <div id="cform"></div>
    <div id="cpreview" hidden></div>
    <div id="cjsonpane" hidden>
     <div class="jbar">
      <button class="ghost sm" type="button" id="jtemplate">Insert the empty template</button>
      <button class="ghost sm" type="button" id="jcopy">Copy</button>
      <span style="flex:1"></span>
      <span class="muted" style="font-size:12px">Switching back to Form applies what is here.</span>
     </div>
     <div id="jm"></div>
     <div class="jwrap">
      <!-- The coloured copy sits under a transparent-text textarea. aria-hidden
           because it is the same text twice and a screen reader should be told
           it once, by the control that is actually focusable. -->
      <div class="jed">
       <pre class="jhl" id="jhl" aria-hidden="true"></pre>
       <textarea id="cjson" spellcheck="false" autocapitalize="off" autocorrect="off"></textarea>
      </div>
      <div class="jref" id="jref"></div>
     </div>
    </div>
   </div>
  </div>
  <div class="dfoot">
   <button class="ghost" type="button" id="cback">← Back</button>
   <button class="ghost" type="button" id="cnext">Next →</button>
   <span style="flex:1"></span>
   <span class="muted" style="font-size:12px">Reaches phones within five minutes.</span>
   <button class="ghost" type="button" id="cclose2">Cancel</button>
   <button class="primary" type="button" id="csave">Review &amp; save</button>
  </div>
 </div>
</div>
`;
