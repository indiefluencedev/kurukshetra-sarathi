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
      // Stored as minutes after midnight because that is what the planner does
      // arithmetic on. Asked for as a clock, because "1080" is a number only a
      // programmer can read and the person filling this in is not one.
      { k:"at", t:"mins", lb:"Starts at", req:0, hint:"The planner builds the day around this." },
      { k:"win", t:"minspan", lb:"Worth arriving between", hint:"The earliest and latest it is worth turning up. Leave both empty if it does not matter." },
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
    { k:"places", t:"places", lb:"Places it affects", req:1, ph:"brahma-sarovar, jyotisar", sec:"Where, and what it does to the day",
      hint:"Search the catalogue and tag every place it happens at. Janmashtami is at five temples on the same night, and a place that is not tagged here hears nothing about the event." },
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
    { k:"img", t:"img", lb:"Photograph",
      hint:"Optional. Leave it empty and the place's own main photograph is used — which is usually the right " +
           "answer, and one picture instead of two. Set one only when the home screen wants a wider crop; it " +
           "fills the top of the screen at 16:9." },
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

/* ---- minutes after midnight, asked for as a clock -------------------------
 *
 * The planner adds and compares these, so a plain number is the right thing to
 * STORE — 6pm is 1080 and arithmetic on it is trivial. It is entirely the wrong
 * thing to ASK FOR. "Starts at (minutes after midnight)" with 1080 in the box
 * is a unit conversion done in an editor's head, every time, for a number they
 * can already read off the temple noticeboard.
 *
 * So the same clock dial the opening hours use — see timeHtml — converted on
 * the way in and out. The stored document does not change, and neither does
 * anything that reads it: JSON mode still shows 1080, because 1080 is what is
 * saved.
 */
const pad2 = (n) => (n < 10 ? "0" : "") + n;

function minsToClock(v) {
  if (v == null || v === "" || isNaN(Number(v))) return "";
  const n = ((Number(v) % 1440) + 1440) % 1440;   // 1500 is tomorrow's 01:00
  return pad2(Math.floor(n / 60)) + ":" + pad2(n % 60);
}

function clockToMins(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s == null ? "" : s).trim());
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  return h > 23 || mi > 59 ? null : h * 60 + mi;
}

/** "18:00" -> "6:00 pm". How the app writes a time, everywhere it writes one. */
function clock12(hhmm) {
  const n = clockToMins(hhmm);
  if (n == null) return "";
  const h = Math.floor(n / 60);
  return (h % 12 || 12) + ":" + pad2(n % 60) + " " + (h >= 12 ? "pm" : "am");
}

/**
 * A time, asked for the way the app asks for one.
 *
 * <input type="time"> is the browser's control, not ours: a blue system
 * dropdown in a system font, different on every machine, sitting in the middle
 * of a cream form. The app already has a clock for this — a real face, hour
 * ring then minute ring, in the app's own colours — and an editor setting an
 * aarti time should be turning the same dial a visitor turns.
 *
 * The value stays in a hidden input under the button, so readField reads a
 * string exactly as it did when this was a native control and knows nothing
 * about any of it.
 */
function timeHtml(name, hhmm) {
  const at = name ? '="' + name + '"' : "";
  return '<div class="tpick"><input type="hidden" data-i' + at + ' value="' + ek(hhmm || "") + '">' +
    '<button type="button" class="tbtn" data-topen>' +
    '<span class="tv">' + (hhmm ? ek(clock12(hhmm)) : '<i class="tempty">Set a time</i>') + "</span>" +
    '<span class="tico" aria-hidden="true"></span></button>' +
    (hhmm ? '<button type="button" class="tclear" data-tclear title="Clear this time">×</button>' : "") +
    "</div>";
}

/** One field, wrapped so readGroup can find it again by key. */
function fieldHtml(f, v) {
  const t = f.t;
  const lb = ek(f.lb) + (f.req ? ' <em class="req">required</em>' : "");
  let inner = "";

  // A placeholder carrying a REAL example, not a restatement of the label.
  // "Id — required" says nothing to someone who has never seen this data;
  // "brahma-sarovar" greyed out in the box says the whole rule at a glance.
  const ph = (x) => x ? ' placeholder="' + ek(x) + '"' : "";

  if (t === "time") {
    inner = timeHtml("", v == null ? "" : v);
  } else if (t === "text" || t === "num" || t === "date") {
    const it = t === "num" ? "number" : t === "date" ? "date" : "text";
    inner = '<input data-i type="' + it + '"' + (f.step ? ' step="' + f.step + '"' : "") + ph(f.ph) +
            ' value="' + ek(v == null ? "" : v) + '">';
  } else if (t === "area") {
    inner = '<textarea data-i' + ph(f.ph) + ">" + ek(v == null ? "" : v) + "</textarea>";
  } else if (t === "bool") {
    // No "yes" beside the box. The field's own label already says what ticking
    // it means, and in a row of three that word appeared three times saying
    // nothing. The label is made clickable in wireForms instead.
    inner = '<label class="chk"><input data-i type="checkbox"' + (v ? " checked" : "") + "></label>";
  } else if (t === "mins") {
    inner = timeHtml("", minsToClock(v));
  } else if (t === "minspan") {
    const a = Array.isArray(v) ? v : [];
    inner = '<div class="pair"><span><small>From</small>' + timeHtml("from", minsToClock(a[0])) + "</span>" +
      '<span><small>To</small>' + timeHtml("to", minsToClock(a[1])) + "</span></div>";
  } else if (t === "csv") {
    inner = '<input data-i type="text"' + ph(f.ph) + ' value="' +
      ek(Array.isArray(v) ? v.join(", ") : (v == null ? "" : v)) + '">';
  } else if (t === "places") {
    /* The places an event happens at.
     *
     * It was a csv box of ids, which asks an editor to know that the Krishna
     * museum is "krishna-museum" and not "museum-krishna", gives them no way
     * to find out, and then says nothing at all when the answer is wrong: a
     * typo saves cleanly and the event silently never reaches that place.
     * Five right ids and five wrong ones looked identical, because neither
     * drew anything.
     *
     * So: search by name, tag as many as you like, see them on a map. An
     * event at five temples on the same night is the normal case here, not an
     * edge one — Janmashtami is exactly that — so the control is a list from
     * the start rather than one box that happens to take commas.
     *
     * The ids stay underneath in a details, for the reason the corridor keeps
     * its textarea: pasting a list somebody sent you is still the fastest way
     * in, and it is what readField reads. The picker writes into it, so there
     * is exactly one value.
     */
    const ids = Array.isArray(v) ? v : (typeof v === "string" && v ? v.split(",") : []);
    inner = '<div class="geo">' +
      '<div class="rchips" data-rchips></div>' +
      '<div class="gsearch"><input type="search" data-rq placeholder="Search the catalogue — Brahma Sarovar, Jyotisar, museum…"></div>' +
      '<div class="gres" data-rres hidden></div>' +
      '<div class="gmap" data-rmap></div>' +
      '<div class="gwarn" data-rwarn hidden></div>' +
      '<details class="idraw"><summary>Type the place ids instead</summary>' +
      '<input data-i type="text"' + ph(f.ph) + ' value="' +
        ek(ids.map(s => String(s).trim()).filter(Boolean).join(", ")) + '"></details></div>';
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
    /* The photographs themselves, then the ways to add one.
     *
     * This used to be a text box holding "brahma-sarovar-1, brahma-sarovar-2"
     * and a Pick button — which asks an editor to know the id of a picture
     * before they can attach it, and offers no way at all to attach one that
     * is not in the bucket yet. Getting a photograph off a phone and onto a
     * place meant going to the Photographs screen, choosing the place from a
     * dropdown to name the file, uploading, coming back, and typing the id.
     *
     * So: the pictures are the field, Upload is the first button, and the ids
     * are folded away underneath. The text input survives down there because
     * it is still the VALUE — readField reads it and knows nothing about any
     * of this, exactly as the corridor map writes into its textarea.
     */
    const val = t === "imgs" ? (Array.isArray(v) ? v.join(", ") : "") : (v == null ? "" : v);
    const many = t === "imgs";
    inner = '<div class="imgf">' +
      '<div class="thumbs" data-thumbs></div>' +
      '<div class="imgbar">' +
        '<button type="button" class="primary sm" data-up>Upload ' +
          (many ? "photographs…" : "a photograph…") + "</button>" +
        '<button type="button" class="ghost sm" data-pick="' + t + '">Choose from the library</button>' +
        // The real file input, driven by the button above it. A bare file input
        // says "No file chosen" in a system font nobody can style and gives no
        // hint that several may be picked at once.
        '<input type="file" data-file hidden accept="image/webp,image/jpeg,image/png,image/avif"' +
          (many ? " multiple" : "") + ">" +
      "</div>" +
      // Which folder these land in, said before anything is chosen rather than
      // discovered afterwards in the library.
      '<div class="foldnote" data-fold></div>' +
      '<div class="upnote" data-upnote></div>' +
      '<details class="idraw"><summary>' +
        (many ? "Type the photograph ids instead" : "Type the photograph id instead") +
        '</summary><input data-i type="text" value="' + ek(val) + '" placeholder="' +
        (many ? "brahma-sarovar-1, brahma-sarovar-2" : "brahma-sarovar") + '"></details></div>';
  } else if (t === "geo") {
    // ONE field that writes two keys. A latitude box and a longitude box asked
    // an editor to produce six decimal places of WGS-84 for a temple they can
    // see from the office window — the honest answer to which is a map.
    // The numbers stay on screen and stay editable: they are what is saved,
    // they are what a colleague reads out over the phone, and if the tiles
    // never load they are still a working form.
    const lat = v && v.lat, lng = v && v.lng;
    inner = '<div class="geo">' +
      '<div class="gsearch"><input type="search" data-gq placeholder="Search a landmark, or paste a map link or 29.96, 76.82">' +
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
  /* A checkbox is a small thing. Given a whole grid cell it sat under a label
     and a hint with an inch of nothing beneath it, three times over, and the
     third one left a hole in the row. Runs of them are collected into one
     full-width strip of chips that wraps — which is how a set of yes/no
     properties reads anyway: as a list you scan, not as three separate
     questions. Only at the top level; no sub-group has a checkbox in it. */
  return stepsOf(fields).map((s, i) => {
    let body = "", run = [];
    const flush = () => {
      if (run.length) body += '<div class="boolrow">' + run.join("") + "</div>";
      run = [];
    };
    for (const f of s.fs) {
      if (f.t === "bool") { run.push(fieldHtml(f, val(f))); continue; }
      flush();
      body += fieldHtml(f, val(f));
    }
    flush();
    return '<div class="step" data-step="' + i + '" hidden><h3 class="sec">' + ek(s.lb) + "</h3>" +
      '<div class="sfields">' + body + "</div></div>";
  }).join("");
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
    const el = root.querySelector(":scope > " + sel +
      ", :scope > .step > .sfields > " + sel +
      ", :scope > .step > .sfields > .boolrow > " + sel);
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
  if (t === "mins") { const m = clockToMins(one().value); return m == null ? undefined : m; }
  if (t === "minspan") {
    const a = clockToMins(el.querySelector('[data-i="from"]').value);
    const b = clockToMins(el.querySelector('[data-i="to"]').value);
    // Half a window is not a window — the planner reads win[0] and win[1].
    return a == null || b == null ? undefined : [a, b];
  }
  if (t === "csv" || t === "places") {
    // The picker writes the same csv the box always held, so one reader does
    // both and the saved shape is unchanged — an array of place ids.
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

/* ---- the clock dial --------------------------------------------------------
 *
 * A port of the app's own TimeSheet, turned inside out for a page with no
 * React in it. Same face, same two rings, same geometry — hour first, then the
 * minutes, and the minute ring takes any minute rather than snapping to the
 * five it happens to label. It is the same control an actual visitor turns, in
 * the same colours, which is the point: the dashboard is not a different
 * product with a different idea of what a clock looks like.
 *
 * One dial for the whole page, opened against whichever hidden input asked for
 * it. Nothing commits until Set — a mis-drag costs nothing.
 */
const DIAL_R = 39;               // ring radius, % of the face — as the app has it
let TFOR = null;                 // the hidden input being edited
let TH = 9, TM = 0, TPM = false, TRING = "h";

function openDial(box) {
  TFOR = box.querySelector("[data-i]");
  const n = clockToMins(TFOR.value);
  const start = n == null ? 9 * 60 : n;
  const h24 = Math.floor(start / 60);
  TH = h24 % 12 || 12;
  TM = start % 60;
  TPM = h24 >= 12;
  TRING = "h";
  $("#tdial").hidden = false;
  paintDial();
}

const dialTotal = () => ((TH % 12) + (TPM ? 12 : 0)) * 60 + TM;

function paintDial() {
  $("#tread-h").textContent = TH;
  $("#tread-m").textContent = pad2(TM);
  $("#tread-ap").textContent = TPM ? "pm" : "am";
  $("#tread-h").className = "cr-part" + (TRING === "h" ? " on" : "");
  $("#tread-m").className = "cr-part" + (TRING === "m" ? " on" : "");
  document.querySelectorAll("#tdial [data-ap]").forEach(b =>
    b.classList.toggle("on", (b.getAttribute("data-ap") === "pm") === TPM));

  // Twelve labels: the hours, or the minutes every five.
  let html = '<div class="dial-hand" style="transform:rotate(' +
    (TRING === "h" ? TH * 30 : TM * 6) + 'deg)"></div><div class="dial-hub"></div>';
  for (let i = 0; i < 12; i++) {
    const v = TRING === "h" ? i + 1 : i * 5;
    const deg = TRING === "h" ? (i + 1) * 30 : i * 30;
    const a = ((deg - 90) * Math.PI) / 180;
    const on = TRING === "h" ? TH === v : TM === v;
    html += '<button type="button" class="dial-h' + (on ? " on" : "") + '" data-mark="' + v + '" ' +
      'style="left:' + (50 + DIAL_R * Math.cos(a)) + "%;top:" + (50 + DIAL_R * Math.sin(a)) + '%">' +
      (TRING === "h" ? v : pad2(v)) + "</button>";
  }
  // A minute the ring does not label still needs a marker, or the hand looks broken.
  if (TRING === "m" && TM % 5 !== 0) {
    const a = ((TM * 6 - 90) * Math.PI) / 180;
    html += '<div class="dial-tip" style="left:' + (50 + DIAL_R * Math.cos(a)) +
      "%;top:" + (50 + DIAL_R * Math.sin(a)) + '%"></div>';
  }
  $("#tface").innerHTML = html;
  $("#thint").textContent = TRING === "h"
    ? "Tap the hour." : "Tap or drag around the ring for any minute.";
  $("#tset").textContent = "Set " + clock12(minsToClock(dialTotal()));
}

/** Where on the face was that pointer? -> degrees clockwise from twelve. */
function faceAngle(el, cx, cy) {
  const b = el.getBoundingClientRect();
  const dx = cx - (b.left + b.width / 2);
  const dy = cy - (b.top + b.height / 2);
  return ((Math.atan2(dy, dx) * 180) / Math.PI + 450) % 360;
}

/** Write the dial back to the field it was opened from, and redraw the button. */
function setTime(box, hhmm) {
  const input = box.querySelector("[data-i]");
  input.value = hhmm || "";
  const btn = box.querySelector(".tbtn .tv");
  btn.innerHTML = hhmm ? ek(clock12(hhmm)) : '<i class="tempty">Set a time</i>';
  const clear = box.querySelector("[data-tclear]");
  if (hhmm && !clear) {
    box.insertAdjacentHTML("beforeend",
      '<button type="button" class="tclear" data-tclear title="Clear this time">×</button>');
  } else if (!hhmm && clear) {
    clear.remove();
  }
  if (MODE === "form" && !$("#editor").hidden) paintSteps();
}

function wireDial() {
  const face = $("#tface");
  let dragging = false;
  const at = (e) => {
    const deg = faceAngle(face, e.clientX, e.clientY);
    if (TRING === "h") TH = Math.round(deg / 30) || 12;
    else TM = Math.round(deg / 6) % 60;
    paintDial();
  };
  face.addEventListener("pointerdown", (e) => {
    dragging = true;
    face.setPointerCapture(e.pointerId);
    at(e);
  });
  face.addEventListener("pointermove", (e) => { if (dragging) at(e); });
  const up = () => {
    // Hour chosen, so hand it the minutes — the same two-turn flow the app has.
    if (dragging && TRING === "h") { TRING = "m"; paintDial(); }
    dragging = false;
  };
  face.addEventListener("pointerup", up);
  face.addEventListener("pointercancel", up);

  $("#tdial").addEventListener("click", (e) => {
    if (e.target.id === "tdial" || e.target.closest("[data-tcancel]")) return void ($("#tdial").hidden = true);
    const ring = e.target.closest("[data-ring]");
    if (ring) { TRING = ring.getAttribute("data-ring"); return paintDial(); }
    const ap = e.target.closest("[data-ap]");
    if (ap) { TPM = ap.getAttribute("data-ap") === "pm"; return paintDial(); }
    /* isConnected, because the face is redrawn on pointerup and this click
       arrives afterwards holding the button that USED to be there. Acting on a
       detached node would read an hour off it while the ring had already moved
       on to minutes, and quietly set the minutes to the hour. */
    const mk = e.target.closest("[data-mark]");
    if (mk && mk.isConnected) {
      const v = Number(mk.getAttribute("data-mark"));
      if (TRING === "h") { TH = v; TRING = "m"; } else TM = v;
      return paintDial();
    }
    if (e.target.closest("#tset")) {
      if (TFOR) setTime(TFOR.closest(".tpick"), minsToClock(dialTotal()));
      $("#tdial").hidden = true;
    }
  });
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
  const street = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19, attribution: '&copy; OpenStreetMap',
  }).addTo(map);

  /*
   * Satellite, because a good half of what this dashboard pins is not on the
   * street map at all.
   *
   * A new dharamshala has no OSM way, no name in any index, and nothing to
   * search for — on the street map it is an unlabelled gap between two roads,
   * and the editor is guessing. On imagery it is a roof and a courtyard, and
   * somebody who knows the town picks it out in one look. This is the reason
   * the Google Places index looked attractive, and it costs one tile URL
   * instead: Esri's imagery is free to use this way and needs no key.
   *
   * Note {z}/{y}/{x} — Esri orders the path differently from OSM, and getting
   * it wrong yields a map of somewhere else entirely rather than an error.
   */
  const sat = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 19, attribution: 'Imagery &copy; Esri',
  });
  L.control.layers({ "Map": street, "Satellite": sat }, {}, { collapsed: false }).addTo(map);
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
 * A coordinate the editor already has, in any of the shapes it arrives in.
 *
 * This is the escape hatch for everything no free index knows about, and it is
 * the honest alternative to buying the Google Places API: an editor who cannot
 * find a place here CAN find it in Google Maps in another tab, as a person,
 * and copy the address bar. Pasting that link is a human reading a map and
 * writing down where a building is — not this app ingesting and storing
 * Google's Content, which is the thing their terms forbid and which would also
 * have obliged us to draw every visitor's map with Google tiles.
 *
 * Three shapes, tried in order:
 *   !3d29.9695!4d76.8390   a place's own pin, in a full Google Maps URL
 *   @29.9695,76.8390,17z   the map view centre, in the same URL
 *   29.9695, 76.8390       what a colleague sends over WhatsApp
 *
 * The view centre is deliberately LAST: a URL carrying both has the real pin
 * in !3d/!4d, and the @ is wherever the map happened to be scrolled to.
 */
function asPoint(q) {
  const m = q.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/)
    || q.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
    || q.match(/^(-?\d+\.\d+)[ ,]+(-?\d+\.\d+)$/);
  if (!m) return null;
  const p = { lat: +m[1], lng: +m[2] };
  // A real coordinate, before it reaches the district check — that one is
  // about the wrong town, this one is about the string not being a coordinate.
  if (isNaN(p.lat) || isNaN(p.lng) || Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180) return null;
  return p;
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

  // A pasted coordinate is already the answer — don't ask Nominatim to look up
  // a number it will fail to find. See asPoint for why this box takes links.
  const point = asPoint(q);
  if (point) { box.hidden = true; pick(point); return; }
  if (/goo\.gl|maps\.app/.test(q)) {
    box.hidden = false;
    box.innerHTML = '<div class="gr muted">That is a short Google link, which hides the coordinates. ' +
      "Open it, wait for the full maps.google.com address to appear, and paste that instead.</div>";
    return;
  }

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

/* ---- tagging places ------------------------------------------------------- */

/**
 * The catalogue, for anything that has to name a place.
 *
 * Fetched once and kept. Fifty-odd documents, and every event form wants the
 * same list, so re-asking per field would be three requests to draw one step.
 * Failure is not fatal: the id box under the picker is still a working way in,
 * which is the same bargain the maps make.
 */
let PLACES = null;
async function loadPlaces() {
  if (PLACES) return PLACES;
  let items = [];
  try { items = (await api("/admin/content/places").then(r => r.json())).items || []; } catch (e) { /* below */ }
  PLACES = items.map(p => ({
    id: p.id,
    label: (p.name && (p.name.en || p.name.hi)) || p.id,
    hi: (p.name && p.name.hi) || "",
    city: p.city || "",
    lat: p.lat, lng: p.lng,
  }));
  return PLACES;
}
function placeById(id) {
  const all = PLACES || [];
  for (let i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
  return null;
}

/** The places tagged on the form that is open, as points worth drawing. */
function taggedPlaces() {
  const box = document.querySelector('#cform .fld[data-t="places"] [data-i]');
  if (!box) return [];
  return box.value.split(",").map(s => s.trim()).filter(Boolean)
    .map(placeById).filter(p => p && p.lat != null && p.lng != null);
}

/**
 * The places picker: search the catalogue, tag as many as apply, see them.
 *
 * The map here is not for choosing — a place already has its coordinates, and
 * this field only names it. The map is for CHECKING, which is the thing the
 * old box could not do at any price: five pins spread across Thanesar is a
 * district-wide festival, and one pin is a typo in the other four ids.
 */
async function initRefs(fld) {
  const host = fld.querySelector("[data-rmap]");
  if (!host || host._wired) return;
  host._wired = 1;

  const raw = fld.querySelector("[data-i]");
  const chips = fld.querySelector("[data-rchips]");
  const qi = fld.querySelector("[data-rq]");
  const res = fld.querySelector("[data-rres]");
  const warn = fld.querySelector("[data-rwarn]");
  const ids = () => raw.value.split(",").map(s => s.trim()).filter(Boolean);

  let map = null, pins = null;
  if (window.L) {
    map = newMap(host, HOME, 12);
    pins = L.layerGroup().addTo(map);
  } else {
    host.innerHTML = '<div class="gdead">The map could not load, so the pins cannot be drawn.<br>' +
      "The tags above are still what gets saved.</div>";
  }

  function draw(fit) {
    const a = ids();
    chips.innerHTML = a.length
      ? a.map(id => {
          const p = placeById(id);
          return '<span class="rchip' + (p ? "" : " bad") + '" title="' + ek(id) + '">' +
            ek(p ? p.label : id) +
            '<button type="button" data-rdel="' + ek(id) + '" aria-label="Remove">&times;</button></span>';
        }).join("")
      : '<span class="rnone">Nothing tagged yet. Search below — an event can be at as many places as it needs.</span>';

    /* An id that matches nothing is the failure the old box could not report.
       Only said once the catalogue has actually arrived: before that every id
       is unknown, and a form that cries wrong about five correct ids while it
       is still loading has taught the editor to ignore it. */
    const unknown = (PLACES && PLACES.length) ? a.filter(id => !placeById(id)) : [];
    warn.hidden = !unknown.length;
    if (unknown.length) warn.textContent = (unknown.length === 1
      ? "There is no place called " + unknown[0] + " in the catalogue"
      : "These are not in the catalogue: " + unknown.join(", ")) +
      ". Nothing about this event will reach them, and they cannot be drawn on the map.";

    if (!map) return;
    pins.clearLayers();
    const at = [];
    a.forEach(id => {
      const p = placeById(id);
      if (!p || p.lat == null || p.lng == null) return;
      L.marker([p.lat, p.lng]).addTo(pins).bindTooltip(p.label);
      at.push([p.lat, p.lng]);
    });
    // maxZoom, or a single tagged place fills the frame at street level and
    // gives no clue where in the district it is.
    if (fit && at.length) map.fitBounds(L.latLngBounds(at), { padding: [34, 34], maxZoom: 15 });
  }

  const set = (a) => {
    raw.value = a.join(", ");
    draw(true);
    // The corridor map draws these too — see initPts.
    document.dispatchEvent(new CustomEvent("kuk:places"));
  };

  // Filtering an array already in memory, so this runs per keystroke. The
  // once-a-second rule that keeps the landmark search behind a button is
  // Nominatim's; there is no network here.
  const find = () => {
    const needle = (qi.value || "").trim().toLowerCase();
    if (!needle) { res.hidden = true; return; }
    const have = ids();
    const hits = (PLACES || []).filter(p => have.indexOf(p.id) < 0 &&
      (p.id.indexOf(needle) >= 0 || p.label.toLowerCase().indexOf(needle) >= 0 || p.hi.indexOf(needle) >= 0)
    ).slice(0, 8);
    res.hidden = false;
    res.innerHTML = hits.length
      ? hits.map(p => '<button type="button" class="gr" data-radd="' + ek(p.id) + '">' + ek(p.label) +
          ' <em class="rid">' + ek(p.id) + (p.city ? " &middot; " + ek(p.city) : "") + "</em></button>").join("")
      : '<div class="gr muted">Nothing in the catalogue by that name.</div>';
  };

  qi.addEventListener("input", find);
  // A search box inside a form: Enter must not submit it.
  qi.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); find(); } });
  res.addEventListener("click", (e) => {
    const b = e.target.closest("[data-radd]");
    if (!b) return;
    set(ids().concat(b.getAttribute("data-radd")));
    qi.value = "";
    res.hidden = true;
  });
  chips.addEventListener("click", (e) => {
    const b = e.target.closest("[data-rdel]");
    if (!b) return;
    const gone = b.getAttribute("data-rdel");
    set(ids().filter(id => id !== gone));
  });
  // Typed or pasted ids are still a way in, so they redraw everything too.
  raw.addEventListener("change", () => { draw(true); document.dispatchEvent(new CustomEvent("kuk:places")); });

  draw(true);            // the ids, before the names for them exist
  await loadPlaces();
  draw(true);            // again, now with labels, pins and the unknown check
  // The corridor map wants them too, and it was built before they arrived.
  document.dispatchEvent(new CustomEvent("kuk:places"));
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

  /* The tagged places, drawn here too but not editable.
   *
   * A rath yatra route means nothing on its own. What an editor is actually
   * checking is whether the line they clicked runs past the temples the event
   * is tagged with — one question about two fields, so it needs one map.
   * Circles rather than pins, so the route's own draggable points stay the
   * things that look draggable.
   */
  const ctx = L.layerGroup().addTo(map);
  const drawCtx = () => {
    // The form is rebuilt every time one is opened, which leaves this listener
    // bound to a map that is no longer on the page.
    if (!map._container || !map._container.isConnected) return;
    ctx.clearLayers();
    const at = [];
    taggedPlaces().forEach(p => {
      L.circleMarker([p.lat, p.lng], { radius: 7, weight: 2, color: "#C98A2E", fillColor: "#C98A2E", fillOpacity: 0.45 })
        .addTo(ctx).bindTooltip(p.label);
      at.push([p.lat, p.lng]);
    });
    // No route clicked yet: open over the tagged places rather than the middle
    // of the district, so the first click is already near the right road. It
    // stops doing this the moment there is a route to look at.
    if (at.length && !pts.length) map.fitBounds(L.latLngBounds(at), { padding: [34, 34], maxZoom: 15 });
  };
  document.addEventListener("kuk:places", drawCtx);

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
  drawCtx();
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
    // Before the corridor: initPts draws whatever is already tagged, and the
    // picker is what loads the catalogue those tags are looked up in.
    s.querySelectorAll('.fld[data-t="places"]').forEach(initRefs);
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
  /* A record with no id yet is a NEW one, and its id may be made from its name.
     One that has an id keeps it, always: an id is the key the record is stored
     under, so changing it does not rename anything — it writes a second record
     and leaves the first exactly where it was. */
  const idIn = $("#cform").querySelector('.fld[data-k="id"] [data-i]');
  if (idIn && !idIn.value) idIn.setAttribute("data-auto", "1");
  paintFolderNotes();
}

/**
 * The id, written from the name.
 *
 * Ids are lower-case-with-hyphens and Pehowa's carry a p- — every one of the
 * twenty-one already does. That is a convention held in somebody's head, which
 * is to say it is a convention that will be broken on a busy afternoon, and the
 * breakage is invisible: a place with a wrong id saves perfectly and simply
 * never matches anything that refers to it.
 *
 * Only ever fills a box nobody has typed in. The moment an editor edits the id
 * themselves the flag comes off and this stops touching it.
 */
/**
 * Say which folder a photograph will land in, on the field that uploads it.
 *
 * The folder is the record's id, so on an existing record it is already
 * decided and the only useful thing is to state it. On a new one it does not
 * exist yet, and uploading before the name is filled in would put the pictures
 * under a name taken from the FILE — which is how a library ends up with
 * img-4821 sitting in no folder at all.
 */
function paintFolderNotes() {
  const idIn = $("#cform").querySelector('.fld[data-k="id"] [data-i]');
  const id = idIn ? idIn.value.trim() : "";
  $("#cform").querySelectorAll("[data-fold]").forEach(el => {
    el.innerHTML = id
      ? "Goes into the folder <code>" + ek(id) + "</code>"
      : '<b class="warn">No id yet.</b> Fill in the name on the first step — the folder is named after it.';
  });
}

/* Pehowa's ids carry a p-. An empty name gives an empty id and never a bare
   "p-", which would be a real id, saveable, and belong to nothing. */
function makeId(name, city) {
  const base = slug(name);
  return base && city === "pehowa" ? "p-" + base : base;
}

function autoId() {
  const idIn = $("#cform").querySelector('.fld[data-k="id"] [data-i]');
  if (!idIn || idIn.getAttribute("data-auto") !== "1") return;
  const en = $("#cform").querySelector('.fld[data-k="name"] [data-i="en"]');
  const city = $("#cform").querySelector('.fld[data-k="city"] [data-i]');
  idIn.value = makeId(en ? en.value : "", city ? city.value : "");
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
  const sel = '.fld[data-k="' + f.k + '"]';
  const el = $("#cform").querySelector(".step > .sfields > " + sel +
    ", .step > .sfields > .boolrow > " + sel);
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
  // What is STORED, which is the whole point of the JSON view — the form shows
  // these as a clock, the document holds minutes.
  if (t === "mins") return 1080;
  if (t === "minspan") return [1020, 1110];
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
  if (t === "mins") return "minutes after midnight — 1080 is 6pm (the form asks for a clock time)";
  if (t === "minspan") return "two numbers, minutes after midnight — [1020, 1110] is 5pm to 6.30pm";
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
  // An empty field has to say it is empty. A blank strip where the pictures go
  // looks identical to a strip that has not loaded yet.
  box.innerHTML = ids.length ? ids.map(id =>
    '<span class="th"><img src="' + ek(imgSrc(id)) + '" alt="" loading="lazy" data-ar="' + wantAR() + '" ' +
    'onload="checkAspect(this)" onerror="this.parentNode.classList.add(\'miss\')">' +
    '<button type="button" class="rm" data-rm="' + ek(id) + '" title="Take this one off" ' +
    'aria-label="Take ' + ek(id) + ' off this record">×</button>' +
    "<small>" + ek(id) + "</small></span>").join("")
    : '<span class="nothumbs">No photograph on this one yet.</span>';
}

/* ---- uploading from the record itself --------------------------------------
 *
 * The name of a photograph is the ONLY link between a picture and the place it
 * belongs to — img:"brahma-sarovar" means brahma-sarovar.webp and nothing else
 * enforces it. So when the upload happens from inside a record, the record's
 * own id names the file and there is nothing for anybody to type or get wrong.
 * A file called IMG_4821.jpg becomes an id nobody can guess, which is how a
 * library ends up full of pictures belonging to nothing.
 */
const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** base, base-2, base-3 — the first name in that series nothing is using. */
async function nextKey(base) {
  const taken = (await mediaList()).map(o => o.key.replace(/\.[a-z]+$/, ""));
  if (taken.indexOf(base) < 0) return base;
  let n = 1, k;
  do { k = base + "-" + (++n); } while (taken.indexOf(k) >= 0);
  return k;
}

/** One file into the bucket. Returns the id a record should point at. */
async function putImage(file, key) {
  const ext = (file.type.split("/")[1] || "webp").replace("jpeg", "jpg");
  const r = await api("/admin/media?key=" + encodeURIComponent(key + "." + ext), {
    method: "PUT", headers: { "content-type": file.type }, body: file,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || ("Upload failed (" + r.status + ")"));
  return key;
}

/**
 * Upload straight into a photograph field, and attach what lands.
 *
 * Several at once for a gallery, because a place has a gallery — asking for
 * six files one at a time, each needing a name, is the reason those galleries
 * are empty. Serially rather than in parallel: nextKey asks what is already in
 * the bucket, so two files racing would both be told the same free name and
 * the second would overwrite the first.
 */
async function uploadInto(fld, files) {
  if (!files || !files.length) return;
  const many = fld.getAttribute("data-t") === "imgs";
  const input = fld.querySelector("[data-i]");
  const note = fld.querySelector("[data-upnote]");
  const say = (t, bad) => { note.textContent = t || ""; note.className = "upnote" + (bad ? " bad" : ""); };

  const have = input.value.split(",").map(s => s.trim()).filter(Boolean);
  const base = slug(currentDoc().id);
  let n = 0;

  for (const f of files) {
    // The record's id if it has one yet, otherwise the file's own name — a new
    // place whose id has not been typed still has to be able to take a picture.
    const stem = base || slug(f.name.replace(/\.[^.]+$/, "")) || "photo";
    // Asked here as well as on the server: a 9 MB photograph straight off a
    // phone is the common case, and finding out after pushing all 9 MB up an
    // office connection is a minute of nothing followed by a refusal.
    if (f.size > 6 * 1024 * 1024) {
      say(f.name + " is " + (f.size / 1024 / 1024).toFixed(1) + " MB. The limit is 6 MB — " +
        "save it smaller, or export it as webp.", 1);
      break;
    }
    say("Uploading " + (n + 1) + " of " + files.length + "…");
    let id;
    try {
      id = await putImage(f, await nextKey(stem));
    } catch (e) {
      say((e && e.message) || "Upload failed.", 1);
      break;
    }
    await mediaList(true);          // so the next nextKey sees what just landed
    if (many) { if (have.indexOf(id) < 0) have.push(id); }
    else input.value = id;
    n++;
  }

  if (many) input.value = have.join(", ");
  paintThumbs(fld.querySelector("[data-thumbs]"));
  // What every photograph is FOR is derived by reading the catalogues, and this
  // record has not been saved yet — but the bucket has changed, so the library
  // must not go on showing a list that predates these files.
  USES = null;
  if (n) say(n === 1 ? "Uploaded and attached." : n + " uploaded and attached.");
}

async function mediaList(force) {
  if (MEDIA && !force) return MEDIA;
  const r = await api("/admin/media").then(r => r.json());
  MEDIA = r.items || [];
  return MEDIA;
}

/**
 * The picker. Opens over the form and puts the chosen key into the field.
 *
 * It opens on THIS RECORD'S FOLDER, not on the bucket. A place being edited has
 * exactly one folder that could sensibly be picked from — its own, the one
 * named after its id — and putting ninety-nine keys in alphabetical order in
 * front of an editor to find it is not a choice, it is a search they have to do
 * by eye. Worse, the picture next to the right one, alphabetically, belongs to
 * a different tirtha: the wrong photograph is one careless click away and looks
 * exactly like the right one afterwards.
 *
 * If that folder has nothing in it, the answer is not an empty grid — it is to
 * say so and offer the upload, which the record's own id names, so the file
 * lands in the folder that was missing. That is the whole loop, in the dialogue
 * that noticed the gap.
 *
 * The whole library is still one button away, because a photograph is
 * occasionally shared — a home-screen entry pointing at the place's own
 * picture is the normal case of it.
 */
let PICK_FOR = null;
let PICK_ALL = false;    // false = this record's folder; true = the bucket

async function pickImage(fld, multi) {
  PICK_FOR = fld;
  PICK_ALL = false;      // every opening starts in the folder it belongs to
  $("#picker").hidden = false;
  $("#picker").setAttribute("data-multi", multi ? "1" : "");
  await paintPicker();
}

async function paintPicker() {
  const items = await mediaList();
  await usage();      // cached; fills RECS so the folders here are the library's
  const idIn = $("#cform").querySelector('.fld[data-k="id"] [data-i]');
  const mine = slug(idIn ? idIn.value : "");
  /* The same folder the library would draw, which matters wherever one id is
     the start of another: jyotisar, jyotisar-virat and jyotisar-water are three
     places, and the naming rule alone would hand all three to jyotisar. RECS is
     longest-first, so folderOf gives each photograph to the record that owns
     it. Falling back to the plain rule covers a record too new to be in RECS —
     its id has been typed but nothing has been saved yet. */
  const own = (k) => {
    const s = stemOf(k), r = folderOf(s);
    return r ? r.id === mine : (s === mine || s.indexOf(mine + "-") === 0);
  };
  // No id typed yet — a brand new record — so there is no folder to open on.
  const scoped = !!mine && !PICK_ALL;
  const list = scoped ? items.filter(o => own(o.key)) : items.slice();
  if (!scoped && mine) list.sort((a, b) => (own(b.key) ? 1 : 0) - (own(a.key) ? 1 : 0));

  $("#picktitle").textContent = scoped ? "In this folder" : "Everything in the library";
  $("#pickwhere").textContent = scoped ? mine : "";
  const all = $("#picker").querySelector("[data-pall]");
  all.hidden = !mine;
  all.textContent = scoped ? "Everything in the library" : "Back to " + mine;

  $("#pickgrid").innerHTML = list.map(o => {
    const id = stemOf(o.key);
    return '<button type="button" class="pk" data-key="' + ek(id) + '">' +
      '<img src="' + ek("/img/" + encodeURIComponent(o.key)) + '" alt="" loading="lazy">' +
      "<small>" + ek(id) + "</small></button>";
  }).join("") || (scoped
    ? '<p class="muted">There is no folder called <code>' + ek(mine) + '</code> yet — nothing ' +
      "has been uploaded under that name. Upload one and the folder exists.</p>" +
      '<button type="button" class="primary" data-pup>Upload the first photograph</button>'
    : '<p class="muted">Nothing uploaded yet.</p>');
}

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
  OWNER = {};
  const add = (key, group, label, id) => {
    if (!key) return;
    (map[key] = map[key] || []).push({ group: group, label: label });
    // The first record to claim a photograph owns it. See folderOf.
    if (id && !OWNER[key]) OWNER[key] = id;
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
    /* No e-rickshaw. A stand is a number, a name and a point on the map —
       there is no photograph of one, its spec has no img field, and a tab of
       empty folders is a tab that only ever wastes a click. */
  ];
  const recs = [];
  const seen = {};
  for (const s of sets) {
    let items = [];
    try { items = (await api(s.url).then(r => r.json())).items || []; } catch (e) { /* one feed down must not blank the library */ }
    for (const it of items) {
      const label = (it.name && (it.name.en || it.name.hi)) || it.id;
      /* One folder per id, not one per record. A home-screen entry is normally
         keyed on the place it is a photograph OF — SPEC.hero says so — so the
         same id arrives twice and would draw the same folder twice, each
         holding the same pictures. Places come before hero in this list, which
         is also the label a person would rather read. */
      if (!seen[it.id]) {
        seen[it.id] = 1;
        const sp = SPLIT[s.group];
        recs.push({ id: it.id, label: label, group: s.group, sub: (sp && it[sp.f]) || "" });
      }
      add(it.img, s.group, label, it.id);
      (it.gallery || []).forEach(g => add(g, s.group, label, it.id));
    }
  }
  // Longest id first, so "p-saraswati-tirth" wins over "p-saraswati" for a key
  // that begins with both. Sorted once here rather than on every lookup.
  RECS = recs.sort((a, b) => b.id.length - a.id.length);
  USES = map;
  return map;
}

/**
 * Which folder a photograph is in.
 *
 * There are no folders in R2 — keys are flat — so the folder is worked out
 * rather than stored, which is why this needed no migration and why
 * /img/<id>.webp still resolves exactly as it did.
 *
 * A RECORD THAT POINTS AT A PHOTOGRAPH OWNS IT. That is the first rule and it
 * used not to exist: the only rule was the naming one, so the fifteen opening
 * photographs — h-brahma-sarovar, h-jyotisar, named that way because they are
 * the wide crop of a place, not the place's own picture — sat in a pile called
 * "In no folder" underneath a paragraph saying they belong to nothing, while
 * the home screen was drawing every one of them. A file the catalogue names is
 * never an orphan, whatever it is called.
 *
 * The naming rule stays underneath it, because it is what makes an upload land
 * somewhere before anybody has saved a record pointing at it:
 * brahma-sarovar-2 is in brahma-sarovar's folder the moment it exists.
 */
let RECS = [];
let OWNER = {};      // photograph id -> the id of the record that points at it
function folderOf(stem) {
  const own = OWNER[stem];
  if (own) for (const r of RECS) if (r.id === own) return r;
  for (const r of RECS)
    if (stem === r.id || stem.indexOf(r.id + "-") === 0) return r;   // RECS is longest-first
  return null;
}

const GROUPS = [
  { g:"places", lb:"Places" },
  { g:"stays", lb:"Stays" },
  { g:"events", lb:"Events" },
  { g:"startpoints", lb:"Start points" },
  { g:"home", lb:"Home screen" },
  { g:"loose", lb:"In no folder" },
];

/* The wall is sorted into named sections rather than one alphabetical run of
   seventy-six, and each section splits again along the line that section is
   actually worked in:

     Places        Kurukshetra | Pehowa      two towns, two bodies of work
     Stays         Dharamshalas | Hotels     a dharamshala is not a hotel
     Start points  Railway stations | Bus stands
     Events        —                         one pile, and a small one

   The value comes off the record itself ("f" names the field), so a place that
   moves town, or a stay recorded as a dharamshala, moves tab with nothing else
   touched. A group with no entry here has no second row at all. */
const SPLIT = {
  places:      { f:"city", none:"No town set" },
  home:        { f:"city", none:"No town set" },
  stays:       { f:"kind", none:"No kind set",
                 lb:{ dharamshala:"Dharamshalas", hotel:"Hotels", guesthouse:"Guesthouses", homestay:"Homestays" } },
  startpoints: { f:"kind", none:"No kind set",
                 lb:{ station:"Railway stations", busstand:"Bus stands", hotel:"Hotels", dharamshala:"Dharamshalas" } },
};
const subLb = (g, v) => ((SPLIT[g] && SPLIT[g].lb && SPLIT[g].lb[v]) ||
  (v ? v.charAt(0).toUpperCase() + v.slice(1) : ""));
let MGROUP = "places";   // which kind of thing the folders are for
let MSUB = "";           // which slice within it, when the kind is split
let BINS = {};        // folder id -> the objects in it
let LOOSE = [];       // photographs whose name matches no record

const stemOf = (key) => key.replace(/\.[a-z]+$/, "");

/** Sort every object in the bucket into its folder. */
async function rebuildBins(force) {
  const items = await mediaList(force);
  await usage(force);                       // fills RECS, which folderOf needs
  BINS = {};
  LOOSE = [];
  for (const o of items) {
    const r = folderOf(stemOf(o.key));
    if (r) (BINS[r.id] = BINS[r.id] || []).push(o);
    else LOOSE.push(o);
  }
  for (const k of Object.keys(BINS)) BINS[k].sort((a, b) => a.key.localeCompare(b.key));
  return items;
}

/**
 * The library, as folders you can actually see into.
 *
 * A wall of album cards — a cover photograph, a count, the name and the id —
 * and clicking one goes INTO it. That is what a folder is; a row with a
 * triangle on it is a list pretending.
 *
 * Still lazy, and more so than before. A cover is one small picture per folder
 * and carries loading="lazy", so the browser fetches only the ones actually
 * scrolled to; opening a folder shows that folder's photographs and no others.
 * Ninety-nine at once, which is what this replaced, never happens at any point.
 */
let MFOLDER = null;      // null = the wall; an id = inside it; "" = the loose ones

const photoTile = (o) =>
  '<div class="pk"><img src="' + ek("/img/" + encodeURIComponent(o.key)) + '" alt="" loading="lazy">' +
  "<small>" + ek(stemOf(o.key)) + "</small>" +
  '<button type="button" class="danger sm" data-mdel="' + ek(o.key) + '">Delete</button></div>';

function folderCard(r) {
  const objs = BINS[r.id] || [];
  const cover = objs.length
    ? '<img src="' + ek("/img/" + encodeURIComponent(objs[0].key)) + '" alt="" loading="lazy">'
    : '<span class="fempty">no photograph yet</span>';
  return '<button type="button" class="fcard' + (objs.length ? "" : " isempty") + '" data-open="' + ek(r.id) + '">' +
    '<span class="fcover">' + cover +
    (objs.length > 1 ? '<span class="fbadge">' + objs.length + "</span>" : "") + "</span>" +
    '<span class="fmeta"><b>' + ek(r.label) + "</b><code>" + ek(r.id) + "</code></span></button>";
}

/**
 * Making a new folder.
 *
 * A folder is not a thing that can be created here, because a folder IS a
 * record — the folder p-avakirna exists because a place called Avakirna Tirth
 * does, and photographs find it by name. So "new folder" asks what the folder
 * is going to be ABOUT and opens a blank one of those, with its Photographs
 * step waiting. Save the record and the folder is there.
 *
 * The alternative was a folder that belongs to nothing, which is the pile
 * called "In no folder" and is the thing we have been digging out of.
 */
const FOLDKINDS = [
  { nav:"places", lb:"A place" },
  { nav:"hotels", lb:"A stay" },
  { nav:"events", lb:"An event" },
  { nav:"startpoints", lb:"A start point" },
  { nav:"hero", lb:"A home-screen photograph" },
  // No e-rickshaw stand: nothing here would make a folder for it. See usage().
];

async function newFolder(nav) {
  $("#nfold").hidden = true;
  show(nav);                 // the sidebar, the title and the table all follow
  await cLoad(nav);
  cBlank();
  openEditor();
  // Straight to the step they came here for. Steps are 0-based; Photographs is
  // found by name rather than by number, since the specs differ per kind.
  const i = stepsOf(cSpec()).findIndex(s => s.lb === "Photographs");
  if (i >= 0) showStep(i);
}

async function paintLibrary(force) {
  const items = await rebuildBins(force);

  /* ---- inside one folder ---- */
  if (MFOLDER !== null) {
    const rec = RECS.filter(r => r.id === MFOLDER)[0];
    const objs = MFOLDER === "" ? LOOSE : (BINS[MFOLDER] || []);
    $("#mgroups").hidden = true;
    $("#msubs").hidden = true;
    $("#msearch").hidden = true;
    $("#libcount").textContent = objs.length + " photograph" + (objs.length === 1 ? "" : "s") + " in here";
    $("#libgrid").className = "inside";
    $("#libgrid").innerHTML =
      '<div class="fhead">' +
        '<button type="button" class="ghost sm" data-back>&#8592; All folders</button>' +
        '<b class="fname">' + ek(rec ? rec.label : "In no folder") + "</b>" +
        (MFOLDER ? "<code>" + ek(MFOLDER) + "</code>" : "") +
        '<span style="flex:1"></span>' +
        // Upload at the TOP of the folder it goes into, which is where the eye
        // already is on the way in. It was under the pictures, read last.
        (MFOLDER
          ? '<button type="button" class="primary sm" data-fup>Upload into this folder</button>' +
            '<input type="file" data-ffile hidden multiple accept="image/webp,image/jpeg,image/png,image/avif">'
          // Nothing names these, because nothing owns them — so this is the one
          // upload anywhere that still asks for a name. It is what the app's own
          // seal is, and it is why the standalone form does not need to exist.
          : '<input type="text" id="loosekey" placeholder="logo" style="max-width:170px;margin:0">' +
            '<button type="button" class="primary sm" data-fup>Upload</button>' +
            '<input type="file" data-ffile hidden accept="image/webp,image/jpeg,image/png,image/avif">') +
      "</div>" +
      '<div class="upnote" data-fnote></div>' +
      (MFOLDER ? "" : '<p class="muted" style="margin-top:0">These belong to no record: nothing in the catalogue ' +
        "points at them and their name matches no id. Either the name is wrong, or they are things the app " +
        "uses directly, like its seal.</p>") +
      (objs.length
        ? '<div class="grid">' + objs.map(photoTile).join("") + "</div>"
        : '<p class="muted">Nothing in here yet. Anything uploaded from this folder, or from the record itself, lands in it.</p>');
    return;
  }

  /* ---- the wall of folders ----
     Two rows of tabs: what KIND of thing, then which slice of it (see SPLIT).
     Places under Kurukshetra and Places under Pehowa are two bodies of work and
     only one of them is ever the one being worked on, so only one of them is
     ever drawn. The second row appears only for kinds that split — events are
     one pile, and a row with one tab in it is not a choice. */
  $("#mgroups").hidden = false;
  $("#msearch").hidden = false;
  const q = (($("#msearch") || {}).value || "").trim().toLowerCase();

  const shotsOf = (rs) => rs.reduce((n, r) => n + (BINS[r.id] || []).length, 0);

  /* The number on a kind tab counts FOLDERS, not photographs. It counted
     photographs, and every tab but Places therefore read zero — which says
     "there is nothing here" about thirteen start points that are all waiting to
     be photographed. Folders is the count of work; the photograph totals are on
     the line above, where the size of the bucket belongs. */
  const kindTab = (x) => {
    const n = x.g === "loose" ? LOOSE.length : RECS.filter(r => r.group === x.g).length;
    return '<button data-mg="' + x.g + '"' + (MGROUP === x.g ? ' class="on"' : "") + ">" +
      ek(x.lb) + " <small>" + n + "</small></button>";
  };
  $("#mgroups").innerHTML = GROUPS.map(kindTab).join("");

  // The slices this kind actually has, in the order SPLIT names them so
  // Dharamshalas sits before Hotels rather than wherever the alphabet puts it.
  // "-" is the tab for records with the field unset, and only exists when there
  // are some.
  const inKind = RECS.filter(r => r.group === MGROUP);
  const sp = SPLIT[MGROUP];
  const order = (sp && sp.lb) ? Object.keys(sp.lb) : [];
  const vals = [];
  for (const r of inKind) if (r.sub && vals.indexOf(r.sub) < 0) vals.push(r.sub);
  vals.sort((a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b);
    return (ia < 0) === (ib < 0) ? (ia < 0 ? a.localeCompare(b) : ia - ib) : (ia < 0 ? 1 : -1);
  });
  const unset = sp && inKind.some(r => !r.sub);
  const tabs = vals.concat(unset && vals.length ? ["-"] : []);
  if (tabs.indexOf(MSUB) < 0) MSUB = tabs[0] || "";

  $("#msubs").hidden = !(tabs.length > 1 || (tabs.length === 1 && vals.length === 1));
  $("#msubs").innerHTML = tabs.map(c => {
    const rs = inKind.filter(r => (c === "-" ? !r.sub : r.sub === c));
    return '<button data-mt="' + ek(c) + '"' + (MSUB === c ? ' class="on"' : "") + ">" +
      ek(c === "-" ? sp.none : subLb(MGROUP, c)) +
      " <small>" + rs.length + "</small></button>";
  }).join("");

  /* ---- the loose pile is its own tab, and it is a pile, not a folder ---- */
  if (MGROUP === "loose") {
    $("#msubs").hidden = true;
    $("#libcount").textContent = LOOSE.length + " photograph" + (LOOSE.length === 1 ? "" : "s");
    $("#libgrid").className = "inside";
    $("#libgrid").innerHTML =
      '<div class="fhead"><b class="fname">In no folder</b>' +
        '<span style="flex:1"></span>' +
        '<input type="text" id="loosekey" placeholder="logo" style="max-width:170px;margin:0">' +
        '<button type="button" class="primary sm" data-fup>Upload</button>' +
        '<input type="file" data-ffile hidden accept="image/webp,image/jpeg,image/png,image/avif"></div>' +
      '<div class="upnote" data-fnote></div>' +
      '<p class="muted" style="margin-top:0">These belong to no record: nothing in the catalogue points at ' +
      "them and their name matches no id. Either the name is wrong, or they are things the app uses directly, " +
      "like its seal.</p>" +
      (LOOSE.length ? '<div class="grid">' + LOOSE.map(photoTile).join("") + "</div>" : "");
    MFOLDER = null;
    return;
  }

  /* A search looks everywhere. Being told "nothing matches" because the folder
     is filed under the other town is worse than no search at all. */
  const recs = (q ? RECS.slice() : inKind.filter(r => (MSUB === "-" ? !r.sub : r.sub === MSUB || !vals.length)))
    .filter(r => !q || (r.label + " " + r.id).toLowerCase().indexOf(q) >= 0)
    .sort((a, b) => a.label.localeCompare(b.label));

  $("#libcount").textContent = q
    ? recs.length + " folder" + (recs.length === 1 ? "" : "s") + " matching, everywhere"
    : recs.length + " folder" + (recs.length === 1 ? "" : "s") + " · " +
      shotsOf(recs) + " photograph" + (shotsOf(recs) === 1 ? "" : "s") + " · " +
      items.length + " in all, " + (items.reduce((n, o) => n + o.size, 0) / 1024 / 1024).toFixed(2) + " MB";

  const newCard = q ? ""
    : '<button type="button" class="fcard newf" data-newfold>' +
      '<span class="fcover"><span class="fplus">+</span></span>' +
      '<span class="fmeta"><b>New folder</b><code>a place, a stay, an event…</code></span></button>';

  $("#libgrid").className = "wall";
  $("#libgrid").innerHTML = '<div class="wgrid">' + newCard + recs.map(folderCard).join("") + "</div>" +
    (recs.length || newCard ? "" : '<p class="muted">Nothing here yet.</p>');
}

/** Upload into the folder that is open. Its id is the name, so nothing is typed. */
async function uploadToFolder(files) {
  if (!files || !files.length || MFOLDER === null) return;
  const note = $("#libgrid").querySelector("[data-fnote]");
  const say = (t, bad) => { note.textContent = t || ""; note.className = "upnote" + (bad ? " bad" : ""); };

  // Inside a real folder the id IS the name. The loose pile has no id, so it is
  // the only place left that asks for one.
  const base = MFOLDER || slug((($("#loosekey") || {}).value) || "");
  if (!base) return say("Give it a name first — lower-case, with hyphens. For example: logo.", 1);

  let n = 0;
  for (const f of files) {
    if (f.size > 6 * 1024 * 1024) {
      say(f.name + " is " + (f.size / 1024 / 1024).toFixed(1) + " MB. The limit is 6 MB.", 1);
      break;
    }
    say("Uploading " + (n + 1) + " of " + files.length + "…");
    try {
      await putImage(f, await nextKey(base));
    } catch (e) {
      say((e && e.message) || "Upload failed.", 1);
      break;
    }
    await mediaList(true);
    n++;
  }
  USES = null;
  await paintLibrary(true);
  if (n) {
    const m = $("#libgrid").querySelector("[data-fnote]");
    if (m) m.textContent = n === 1 ? "Uploaded." : n + " uploaded.";
  }
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

    // The styled button in front of the real file input.
    const up = e.target.closest("[data-up]");
    if (up) return void up.closest(".imgf").querySelector("[data-file]").click();

    const topen = e.target.closest("[data-topen]");
    if (topen) return openDial(topen.closest(".tpick"));
    const tclr = e.target.closest("[data-tclear]");
    if (tclr) return setTime(tclr.closest(".tpick"), "");

    /* The whole chip toggles its checkbox, not just the 16 pixels of the box.
       The label cannot do this natively — it is a sibling of the input rather
       than its parent, which is what keeps every field two children deep for
       the subgrid — so it is done here. No double-toggle: a <label> with no
       "for" and no input inside it does nothing on its own. */
    const bl = e.target.closest('.fld[data-t="bool"] .fl');
    if (bl) {
      const box = bl.closest(".fld").querySelector("[data-i]");
      box.checked = !box.checked;
      return paintSteps();
    }

    /* Taking a photograph off a record is not deleting it. The file stays in
       the bucket and every other record still pointing at it is untouched —
       which is why this asks nothing before doing it, and why the library's
       own Delete button is the one that warns. */
    const rm = e.target.closest("[data-rm]");
    if (rm) {
      const fld = rm.closest(".fld");
      const input = fld.querySelector("[data-i]");
      const gone = rm.getAttribute("data-rm");
      input.value = input.value.split(",").map(s => s.trim())
        .filter(x => x && x !== gone).join(", ");
      return paintThumbs(fld.querySelector("[data-thumbs]"));
    }
  });

  $("#editor").addEventListener("change", (e) => {
    const file = e.target.closest("[data-file]");
    if (!file) return;
    const fld = file.closest(".fld");
    uploadInto(fld, Array.prototype.slice.call(file.files));
    // Cleared so that choosing the same file twice in a row still fires change.
    file.value = "";
  });

  // Typing an id by hand should preview too, not only picking one.
  $("#editor").addEventListener("input", (e) => {
    const fld = e.target.closest('.fld[data-t="img"], .fld[data-t="imgs"]');
    if (fld) paintThumbs(fld.querySelector("[data-thumbs]"));
    // Touched by hand: it is theirs now, and autoId leaves it alone.
    if (e.target.closest('.fld[data-k="id"]')) e.target.setAttribute("data-auto", "");
    if (e.target.closest('.fld[data-k="name"], .fld[data-k="city"]')) autoId();
    if (e.target.closest('.fld[data-k="id"], .fld[data-k="name"], .fld[data-k="city"]')) paintFolderNotes();
    // The rail's marks are about what is filled in, so they follow typing. Only
    // the required fields are read, which is a handful per kind.
    if (MODE === "form" && e.target.closest("#cform")) paintSteps();
  });
  // A dropdown fires change, not input.
  $("#editor").addEventListener("change", (e) => {
    if (e.target.closest('.fld[data-k="city"]')) { autoId(); paintFolderNotes(); paintSteps(); }
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
    if (!$("#tdial").hidden) return void ($("#tdial").hidden = true);
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
    if (e.target.closest("[data-pall]")) { PICK_ALL = !PICK_ALL; return void paintPicker(); }
    // The folder is empty, so the way out of the picker is to fill it. The
    // field's own Upload does the naming, which is what makes the folder.
    if (e.target.closest("[data-pup]")) {
      $("#picker").hidden = true;
      return void PICK_FOR.querySelector("[data-file]").click();
    }
    const b = e.target.closest("[data-key]");
    if (b) pickChoose(b.getAttribute("data-key"));
  });

  $("#mgroups").addEventListener("click", (e) => {
    const b = e.target.closest("[data-mg]");
    if (!b) return;
    MGROUP = b.getAttribute("data-mg");
    MSUB = "";        // resolved to this kind's first slice on the way through
    MFOLDER = null;
    paintLibrary();
  });
  $("#msubs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-mt]");
    if (!b) return;
    MSUB = b.getAttribute("data-mt");
    MFOLDER = null;
    paintLibrary();
  });
  $("#libgrid").addEventListener("click", (e) => {
    const d = e.target.closest("[data-mdel]");
    if (d) return mediaDelete(d.getAttribute("data-mdel"));
    const up = e.target.closest("[data-fup]");
    if (up) return void up.parentNode.querySelector("[data-ffile]").click();
    if (e.target.closest("[data-back]")) { MFOLDER = null; return void paintLibrary(); }
    if (e.target.closest("[data-newfold]")) {
      $("#nfkinds").innerHTML = FOLDKINDS.map(k =>
        '<button type="button" class="ghost" data-nf="' + k.nav + '">' + ek(k.lb) + "</button>").join("");
      return void ($("#nfold").hidden = false);
    }
    /* Going INTO a folder rather than unfolding it in place. Only this folder's
       photographs are ever on screen, which is the lazy loading and the mental
       model at the same time. "" is the loose pile, so the attribute is read
       rather than tested for truth. */
    const open = e.target.closest("[data-open]");
    if (open) { MFOLDER = open.getAttribute("data-open"); paintLibrary(); }
  });
  $("#libgrid").addEventListener("change", (e) => {
    const f = e.target.closest("[data-ffile]");
    if (!f) return;
    uploadToFolder(Array.prototype.slice.call(f.files));
    f.value = "";
  });
  $("#msearch").addEventListener("input", () => paintLibrary());
  $("#nfold").addEventListener("click", (e) => {
    if (e.target.id === "nfold" || e.target.closest("[data-nfcancel]")) return void ($("#nfold").hidden = true);
    const k = e.target.closest("[data-nf]");
    if (k) newFolder(k.getAttribute("data-nf"));
  });
  wireDial();
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
 /* ---- a run of checkboxes ----
    Chips that wrap, rather than one grid cell each. A yes/no property is a
    small thing; given a full cell it sat under a label and a hint with an inch
    of nothing below it, and the third one left a hole in the row. */
 .boolrow{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:10px}
 .boolrow > .fld{margin:0;display:flex;flex-direction:row-reverse;align-items:flex-start;gap:10px;
   flex:1 1 230px;min-width:210px;max-width:360px;background:var(--paper);border:1px solid var(--line);
   border-radius:10px;padding:11px 13px;cursor:pointer}
 .boolrow > .fld:hover{border-color:var(--accent-line,#EFC08A)}
 .boolrow .fl{margin:0;flex:1;cursor:pointer}
 .boolrow .fl .hint{margin-top:2px}
 .boolrow .ctl{flex:0 0 auto;padding-top:1px}
 .boolrow .chk input{width:17px;height:17px;accent-color:var(--accent)}
 .days{display:flex;gap:12px;flex-wrap:wrap;margin-top:4px}
 button.sm{padding:5px 10px;font-size:12px}
 /* ---- photographs on a record ----
    The pictures first and big enough to recognise, then the ways to add one,
    then the ids folded away. A 74px thumbnail of a temple is a brown smudge —
    it cannot answer "is this the right photograph", which is the only question
    anybody is asking here. */
 .imgf{display:block}
 .imgbar{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
 .thumbs{display:flex;gap:10px;flex-wrap:wrap}
 .nothumbs{display:block;width:100%;text-align:center;font-size:12.5px;color:var(--muted);
   border:1px dashed var(--line);border-radius:9px;padding:16px 12px}
 .upnote{font-size:12.5px;color:var(--muted);margin-top:8px}
 .upnote.bad{color:var(--bad);font-weight:600}
 /* ---- the clock ----
    The app's dial, in the dashboard's palette. Its tokens map straight over:
    surface->paper, stone->line, clay->accent. A time is set with the same
    control a visitor uses, not with whatever blue box the operating system
    happens to draw for <input type="time">. */
 .tpick{display:flex;align-items:center;gap:6px;margin-top:4px}
 .tbtn{flex:1;display:flex;align-items:center;gap:8px;background:#fff;border:1px solid var(--line);
   border-radius:8px;padding:9px 11px;font:inherit;font-size:14px;font-weight:400;color:var(--ink);
   text-align:left;cursor:pointer}
 .tbtn:hover{border-color:var(--accent-line,#EFC08A)}
 .tbtn .tv{flex:1}
 .tbtn .tempty{font-style:normal;color:var(--muted)}
 /* the little clock face on the button, drawn rather than a font glyph */
 .tbtn .tico{width:15px;height:15px;border-radius:50%;border:1.5px solid var(--muted);
   position:relative;flex:0 0 auto}
 .tbtn .tico:before,.tbtn .tico:after{content:"";position:absolute;left:50%;top:50%;
   background:var(--muted);transform-origin:0 0}
 .tbtn .tico:before{width:1.5px;height:4.5px;margin:-4.5px 0 0 -.75px;border-radius:1px}
 .tbtn .tico:after{width:3.5px;height:1.5px;margin:-.75px 0 0 0;border-radius:1px}
 .tclear{background:none;border:1px solid var(--line);border-radius:8px;color:var(--muted);
   padding:0;width:32px;height:32px;font-size:16px;font-weight:700;line-height:1;flex:0 0 auto}
 .tclear:hover{border-color:var(--bad);color:var(--bad)}

 #tdial{position:fixed;inset:0;z-index:60;background:rgba(28,24,21,.55);display:grid;
   place-items:center;padding:20px;overflow:auto}
 .tbox{background:var(--paper);border-radius:16px;padding:20px;width:100%;max-width:330px;
   box-shadow:0 18px 50px rgba(28,24,21,.3)}
 .clockread{display:flex;align-items:baseline;justify-content:center;gap:1px;
   font-family:"Baskerville","Iowan Old Style",Palatino,Georgia,serif;font-size:30px;
   font-weight:600;color:var(--ink);margin:2px 0 14px}
 .cr-part{border:0;background:none;font:inherit;color:var(--muted);cursor:pointer;
   padding:2px 7px;border-radius:9px;line-height:1.1}
 .cr-part.on{background:#FBEEDF;color:var(--accent-d)}
 .cr-sep{color:var(--muted)}
 .cr-ap{font-size:17px;color:var(--muted);margin-left:5px}
 .dial{position:relative;width:100%;max-width:258px;margin:0 auto;aspect-ratio:1;touch-action:none;
   border-radius:50%;background:#fff;border:1px solid var(--line);
   box-shadow:inset 0 1px 10px rgba(20,18,14,.05)}
 .dial-hub{position:absolute;left:50%;top:50%;width:9px;height:9px;margin:-4.5px 0 0 -4.5px;
   border-radius:50%;background:var(--accent)}
 .dial-hand{position:absolute;left:50%;bottom:50%;width:2px;height:31%;margin-left:-1px;
   background:var(--accent);transform-origin:50% 100%;border-radius:2px;transition:transform .26s cubic-bezier(.22,.61,.36,1)}
 .dial-h{position:absolute;width:38px;height:38px;margin:-19px 0 0 -19px;border:0;padding:0;
   border-radius:50%;background:transparent;color:var(--ink);cursor:pointer;
   font-family:"Baskerville","Iowan Old Style",Palatino,Georgia,serif;font-size:15px;font-weight:600;
   display:grid;place-items:center}
 .dial-h:hover{background:var(--bg)}
 .dial-h.on{background:var(--accent);color:#fff}
 .dial-tip{position:absolute;width:9px;height:9px;margin:-4.5px 0 0 -4.5px;border-radius:50%;
   background:var(--accent);box-shadow:0 0 0 3px #FBEEDF}
 .thint{text-align:center;font-size:12.5px;color:var(--muted);margin:10px 0 0}
 .tsegs{display:flex;gap:7px;justify-content:center;margin-top:14px}
 .tsegs button{min-width:58px;padding:9px 12px;border-radius:999px;border:1px solid var(--line);
   background:#fff;color:var(--ink);font-size:13.5px;font-weight:500}
 .tsegs button.on{background:#5E3B22;color:#fff;border-color:#5E3B22}
 .tbar{display:flex;gap:8px;margin-top:18px}
 .tbar button{flex:1}
 @media (prefers-reduced-motion:reduce){.dial-hand{transition:none}}


 /* Which folder these land in — stated on the field that uploads them. */
 .foldnote{font-size:12px;color:var(--muted);margin-top:8px}
 .foldnote code{background:var(--bg);border-radius:5px;padding:2px 7px;font-size:11.5px;color:var(--ink)}
 .idraw{margin-top:10px}
 .idraw summary{font-size:12px;color:var(--muted);cursor:pointer}
 .th{position:relative;width:96px;text-align:center}
 /* Off this record, not out of the bucket — so it does not ask, and the
    library's Delete is still the one that warns. */
 .th .rm{position:absolute;top:-7px;right:-7px;width:21px;height:21px;padding:0;border-radius:99px;
   background:var(--paper);border:1px solid var(--line);color:var(--bad);font-size:14px;
   font-weight:700;line-height:1;box-shadow:0 1px 3px rgba(28,24,21,.22)}
 .th .rm:hover{background:var(--bad);border-color:var(--bad);color:#fff}
 .th img{width:96px;height:72px;object-fit:cover;border-radius:6px;border:1px solid var(--line);display:block}
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
 .gr .rid{font-style:normal;color:var(--muted);font-size:11px}

 /* ---- tagged places ----
    Chips, because the value is a set of things and a set reads as a set. Each
    one carries its own remove button: the old box made "untag one of five"
    a text-editing job, commas and all. */
 .rchips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}
 .rchip{display:inline-flex;align-items:center;gap:5px;background:#fff;border:1px solid var(--line);
   border-radius:999px;padding:4px 5px 4px 11px;font-size:12.5px;line-height:1.3}
 .rchip.bad{border-color:var(--bad);color:var(--bad)}
 .rchip button{background:none;border:0;padding:0;width:19px;height:19px;line-height:1;
   border-radius:50%;color:var(--muted);font-size:14px;cursor:pointer}
 .rchip button:hover{background:var(--bg);color:var(--bad)}
 .rnone{font-size:12.5px;color:var(--muted)}

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

 /* ---- the library, as folders ----
    A wall of album cards with a cover on each, and clicking one goes into it.
    A row with a triangle on it was a list pretending to be a folder — and it
    showed nothing of what was inside, which is the only thing anybody is
    looking for. The cover is one lazy-loaded picture per card, so the browser
    fetches the ones scrolled to and no others. */
 #libgrid.wall{display:block}
 .wgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(178px,1fr));gap:14px}

 /* ---- two rows of tabs ----
    What kind of thing, then which town. Only one town's folders are ever
    drawn, because only one of them is ever the one being worked on. The
    second row is absent for kinds that have no towns. */
 .mtabs{display:flex;gap:2px;flex-wrap:wrap;border-bottom:1px solid var(--line);margin-bottom:16px}
 .mtabs button{background:none;border:0;border-bottom:2px solid transparent;color:var(--muted);
   padding:9px 13px;font-size:13.5px;font-weight:600;border-radius:8px 8px 0 0;margin-bottom:-1px}
 .mtabs button:hover{color:var(--ink);background:var(--bg)}
 .mtabs button.on{color:var(--accent-d);border-bottom-color:var(--accent);background:var(--bg)}
 .mtabs button small{opacity:.65;font-weight:700;margin-left:4px}
 .msubs{display:flex;gap:6px;flex-wrap:wrap;margin:-6px 0 16px}
 .msubs button{background:#fff;border:1px solid var(--line);color:var(--muted);border-radius:99px;
   padding:5px 13px;font-size:12.5px;font-weight:600}
 .msubs button.on{background:#5E3B22;border-color:#5E3B22;color:#fff}
 .msubs button small{opacity:.7;margin-left:4px}
 .fcard{display:block;width:100%;text-align:left;background:none;border:0;padding:0;cursor:pointer;
   font:inherit;font-weight:400}
 /* the sheet behind the cover — what makes a folder read as a stack */
 .fcover{position:relative;display:block;aspect-ratio:4/3;border-radius:10px;background:var(--bg);
   border:1px solid var(--line);overflow:visible}
 .fcover:before{content:"";position:absolute;left:6px;right:6px;top:-5px;height:10px;
   background:var(--paper);border:1px solid var(--line);border-bottom:0;border-radius:8px 8px 0 0;z-index:0}
 .fcover img{position:relative;z-index:1;width:100%;height:100%;object-fit:cover;
   border-radius:9px;display:block}
 .fcard:hover .fcover{border-color:var(--accent)}
 .fcard:hover .fcover img{filter:brightness(1.04)}
 .fempty{position:relative;z-index:1;display:grid;place-items:center;height:100%;
   font-size:11.5px;color:var(--muted);border-radius:9px;
   background:repeating-linear-gradient(45deg,transparent,transparent 7px,rgba(0,0,0,.02) 7px,rgba(0,0,0,.02) 14px)}
 .fcard.isempty .fcover{border-style:dashed}
 .fbadge{position:absolute;z-index:2;right:7px;bottom:7px;background:rgba(28,24,21,.78);color:#fff;
   font-size:11px;font-weight:700;border-radius:99px;padding:2px 8px;backdrop-filter:blur(3px)}
 .fmeta{display:block;padding:8px 2px 0}
 .fmeta b{display:block;font-size:13px;line-height:1.3;overflow:hidden;text-overflow:ellipsis;
   white-space:nowrap}
 .fmeta code{font-size:10.5px;color:var(--muted);background:none;padding:0}
 .fcard.loose .fcover{border-color:var(--bad)}
 /* Making a folder is adding the record it is named after — first card, so it
    is where the eye lands rather than somewhere to be hunted for. */
 .fcard.newf .fcover{border-style:dashed;border-color:var(--accent);background:#FBEEDF}
 .fcard.newf .fcover:before{border-style:dashed;border-color:var(--accent);background:#FBEEDF}
 .fplus{position:relative;z-index:1;display:grid;place-items:center;height:100%;
   font-size:34px;font-weight:300;color:var(--accent);line-height:1}
 .fcard.newf:hover .fcover{background:#F7E2C8}
 .nfkinds{display:grid;gap:7px}
 .nfkinds button{width:100%;text-align:left}
 #nfold{position:fixed;inset:0;z-index:60;background:rgba(28,24,21,.55);display:grid;
   place-items:center;padding:20px;overflow:auto}
 #nfold .tbox{max-width:340px}

 /* inside one folder */
 .fhead{display:flex;align-items:center;gap:11px;flex-wrap:wrap;margin-bottom:14px;
   padding-bottom:12px;border-bottom:1px solid var(--line)}
 .fhead .fname{font-size:16px;font-weight:700}
 .fhead code{font-size:11.5px;color:var(--muted);background:var(--bg);padding:2px 7px;border-radius:5px}
 #msearch{max-width:280px;margin:0}
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
 <section>
  <div class="toolbar">
   <h2 style="margin:0">The library</h2>
   <input type="search" id="msearch" placeholder="Find a folder…">
   <span style="flex:1"></span>
   <span class="you" id="libcount"></span>
  </div>
  <nav class="mtabs" id="mgroups"></nav>
  <nav class="msubs" id="msubs" hidden></nav>
  <!-- Folders, not photographs. Each one fetches its own pictures when it is
       opened; nothing here loads an image until somebody asks for it. -->
  <div id="libgrid"></div>
 </section>

</div>

<div id="picker" hidden>
 <div class="box">
  <div class="bar" style="margin:0 0 12px">
   <b id="picktitle">In this folder</b>
   <code id="pickwhere"></code>
   <span style="flex:1"></span>
   <button class="ghost sm" type="button" data-pall hidden></button>
   <button class="ghost" type="button" data-pclose>Done</button>
  </div>
  <div class="grid" id="pickgrid"></div>
 </div>
</div>

<!-- What the new folder is going to be about. A folder IS a record, so this
     opens a blank one of whatever is chosen, on its Photographs step. -->
<div id="nfold" hidden>
 <div class="tbox">
  <h3 style="margin:0 0 4px;font-size:16px">What is the folder for?</h3>
  <p class="muted" style="margin:0 0 14px;font-size:13px">A folder is named after the thing it holds
   photographs of, so making one means adding that thing. It is saved when you save the record.</p>
  <div class="nfkinds" id="nfkinds"></div>
  <div class="tbar"><button type="button" class="ghost" data-nfcancel>Cancel</button></div>
 </div>
</div>

<!-- The app's clock, in the dashboard. One face for the whole page, opened
     against whichever field asked. Above the editor, like the picker. -->
<div id="tdial" hidden>
 <div class="tbox">
  <div class="clockread">
   <button type="button" class="cr-part on" id="tread-h" data-ring="h">9</button>
   <span class="cr-sep">:</span>
   <button type="button" class="cr-part" id="tread-m" data-ring="m">00</button>
   <span class="cr-ap" id="tread-ap">am</span>
  </div>
  <div class="dial" id="tface"></div>
  <p class="thint" id="thint"></p>
  <div class="tsegs">
   <button type="button" data-ap="am">AM</button>
   <button type="button" data-ap="pm">PM</button>
  </div>
  <div class="tbar">
   <button type="button" class="primary" id="tset">Set</button>
   <button type="button" class="ghost" data-tcancel>Cancel</button>
  </div>
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
