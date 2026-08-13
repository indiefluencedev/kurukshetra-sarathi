// The dashboard's form engine is a STRING. Nothing type-checks it.
//
// admin-forms.ts exports the whole of the admin's JavaScript inside a
// String.raw template, which is what lets the Worker serve a dashboard with no
// build step — and the price is that a typo in two hundred lines of form logic
// is a valid TypeScript file that ships and then throws in someone's browser.
// It has already happened once: a stray backtick in a COMMENT closed the
// template early, and tsc's only complaint was three parse errors sixty lines
// further down.
//
// So: parse it, and check the handful of SPEC invariants that break silently
// rather than loudly. Not a test suite. The smallest thing that fails if the
// engine is broken.
//
//   node check-forms.mjs
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(HERE, "src", "admin-forms.ts"), "utf8");

/** Pull one exported String.raw block back out of the module source. */
function block(name) {
  const m = src.match(new RegExp("export const " + name + " = String.raw`([\\s\\S]*?)\\n`;"));
  assert.ok(m, name + " is missing, or no longer a String.raw block");
  return m[1];
}

const JS = block("FORMS_JS");
const CSS = block("FORMS_CSS");
const HTML = block("FORMS_HTML") + block("EDITOR_HTML");

/* 1. It is JavaScript. `new Function` parses without running — which is the
      point, since every line of it wants a browser. */
try {
  new Function(JS);
} catch (e) {
  console.error("FORMS_JS does not parse: " + e.message);
  process.exit(1);
}

/* 1b. No backtick anywhere inside the blocks, and no ${ outside the two the
       vocabulary hints use.

       This is the failure that actually happened, and note that check 1 cannot
       see it: a backtick inside a // comment is perfectly good JavaScript. The
       damage is done a level up — it closes the String.raw template, so the
       REST of the file becomes TypeScript. tsc then reports parse errors tens
       of lines away from the character that caused them, in code that is not
       wrong. Nothing about the message points at the comment.

       Prose wants backticks around identifiers and this file is mostly prose,
       so the rule has to be enforced rather than remembered. */
for (const [name, text] of [["FORMS_JS", JS], ["FORMS_CSS", CSS], ["FORMS_HTML", HTML]]) {
  const at = text.indexOf("`");
  assert.equal(at, -1, name + ' contains a backtick, which ends the String.raw block early. Use " or \' instead.\n  ' +
    text.slice(Math.max(0, at - 60), at + 60).replace(/\n/g, " "));
}

/* 2. The specs say what they mean. Evaluated out of the source rather than
      duplicated here, so this cannot drift from the thing it checks. */
const SPEC = new Function(JS.match(/const SPEC = \{[\s\S]*?\n\};/)[0] + "\nreturn SPEC;")();
const KINDS = new Function(JS.match(/const KINDS = \[[\s\S]*?\n\];/)[0] + "\nreturn KINDS;")();

const walk = (fields, fn) => fields.forEach((f) => { fn(f); if (f.of) walk(f.of, fn); });

for (const k of KINDS) assert.ok(SPEC[k.k], "the sidebar offers " + k.k + " but SPEC has no such kind");

/* The field types fieldHtml can actually draw, read off fieldHtml itself.
   A type it does not know is the quietest possible mistake: no error, no
   warning, just a label with nothing underneath it, and a field that can
   never be filled in or saved. */
const TYPES = new Set([...JS.match(/function fieldHtml[\s\S]*?\n}/)[0].matchAll(/t === "(\w+)"/g)].map((m) => m[1]));
assert.ok(TYPES.size > 10, "could not read the field types out of fieldHtml");

for (const [kind, fields] of Object.entries(SPEC)) {
  const keys = new Set();
  walk(fields, (f) => {
    assert.ok(f.k && f.t && f.lb, kind + ": a field is missing k, t or lb");
    assert.ok(TYPES.has(f.t), kind + "." + f.k + ': fieldHtml cannot draw type "' + f.t + '"');
    // A repeating group with nothing in it renders an Add button that adds
    // nothing — a dead control, which is worse than a missing one.
    if (f.t === "list" || f.t === "obj") assert.ok(f.of?.length, kind + "." + f.k + ": " + f.t + " needs `of`");
    if (f.t === "sel") assert.ok(f.opts?.length, kind + "." + f.k + ": a dropdown needs opts");
    // THE one that would fail quietly. A map field writes lat and lng onto the
    // document, so it is keyed "lat" for the sole reason that cSave's required
    // check reads doc[f.k] — key it "geo" or "where" and the form cheerfully
    // saves a place with no coordinates at all.
    if (f.t === "geo") assert.equal(f.k, "lat", kind + ": a geo field must be keyed \"lat\"");
  });

  fields.forEach((f) => {
    assert.ok(!keys.has(f.k), kind + ": two top-level fields both keyed " + f.k);
    keys.add(f.k);
  });

  // Every kind is looked up by id, and the id is what the app's documents
  // point at. A kind that cannot be keyed is not editable.
  assert.ok(fields.some((f) => f.k === "id" && f.req), kind + ": needs a required id");

  // Coordinates come from the map now. A leftover pair of number boxes would
  // sit next to the map's own pair, both writing lat, and the last one read
  // would win — see readGroup.
  const geo = fields.some((f) => f.t === "geo");
  if (geo) assert.ok(!fields.some((f) => f.k === "lng"), kind + ": has a map AND a separate longitude field");
}

/* 3. The three parts are one page. Every id the script reaches for has to be
      in the markup it is served with; a $("#thing") that finds nothing throws
      on the line that uses it, which in a delegated click handler means a
      button that does nothing and says nothing. */
// From the static blocks AND from the markup the script builds itself — some
// controls only exist once a screen has been drawn (the loose pile's name box
// is one), and those are just as real as the ones written out by hand.
const ids = new Set([...(HTML + JS).matchAll(/id="([\w-]+)"/g)].map((m) => m[1]));
// Ids that live in admin.ts's own shell rather than in these blocks.
const SHELL = new Set(["gate", "gform", "gu", "gp", "gm", "nojs", "app", "you", "audit",
  "sidenav", "signout", "testpush", "ptitle", "pane-events"]);
for (const [, id] of JS.matchAll(/\$\("#([\w-]+)"\)/g))
  assert.ok(ids.has(id) || SHELL.has(id), "the script uses #" + id + ", which no markup defines");

/* 4. Anything the script gives a class to, the stylesheet should know about.
      Only checked for the map and section classes — the ones added last and
      the ones whose absence is invisible (a map with no height is a map that
      renders as nothing at all, with no error anywhere). */
for (const c of ["gmap", "gsearch", "gres", "gnum", "gwarn", "cbar", "craw", "sec", "wrongar",
  "ctl", "steprail", "jed", "jhl", "jk", "imgbar", "nothumbs", "upnote", "idraw", "rm",
  "boolrow", "foldnote", "thmove", "mainbadge", "pkviews", "pkloose", "pkdel", "pkface",
  "tpick", "tbtn", "tclear", "clockread", "cr-part", "dial", "dial-hand", "dial-h", "dial-tip",
  "tsegs", "thint", "tbox"])
  // The boundary matters: without it ".gmapX" satisfies a check for ".gmap".
  assert.match(CSS, new RegExp("[.\\s]" + c + "[^\\w-]"), "no style for ." + c);

/* 5. It renders.
      Everything above the "content screens" marker is pure string work — no
      DOM, no fetch — so the actual form can be drawn here and looked at. This
      is the only check that exercises the engine rather than describing it. */
const RENDER = new Function(
  JS.split("/* ---- the content screens")[0] + "\nreturn { groupHtml, SPEC };",
)();

// One document with every field populated, built from the spec itself.
const sample = (fields) => {
  const o = {};
  for (const f of fields) {
    if (f.t === "geo") { o.lat = 29.9613554; o.lng = 76.8285533; continue; }
    o[f.k] =
      f.t === "loc" || f.t === "locarea" ? { en: "En", hi: "हि" } :
      f.t === "num" ? 7 : f.t === "bool" ? true :
      f.t === "mins" ? 1080 : f.t === "minspan" ? [1020, 1110] :
      f.t === "csv" || f.t === "imgs" ? ["a", "b"] :
      f.t === "places" ? ["brahma-sarovar", "jyotisar"] :
      f.t === "days" ? [1, 3] : f.t === "sel" ? f.opts[0] :
      f.t === "time" ? "06:30" : f.t === "date" ? "2026-08-05" :
      f.t === "pts" ? [{ lat: 29.97, lng: 76.83 }, { lat: 29.96, lng: 76.84 }] :
      f.t === "obj" ? sample(f.of) : f.t === "list" ? [sample(f.of), sample(f.of)] :
      "x";
  }
  return o;
};

for (const [kind, fields] of Object.entries(SPEC)) {
  const doc = sample(fields);
  const html = RENDER.groupHtml(fields, doc);

  // "undefined" reaching the page means a field type fell through fieldHtml
  // without producing an input — it renders as a label above nothing.
  assert.ok(!html.includes("undefined"), kind + ": renders the word undefined");
  for (const f of fields)
    assert.ok(html.includes('data-k="' + f.k + '"'), kind + "." + f.k + ": did not render");

  // An empty document must render too — this is the "+ Add new" path, and it
  // is the one that reads every field as undefined.
  assert.doesNotThrow(() => RENDER.groupHtml(fields, {}), kind + ": cannot render a blank form");

  if (fields.some((f) => f.t === "geo")) {
    assert.match(html, /data-i="lat"[^>]*value="29.9613554"/, kind + ": the map field lost its latitude");
    assert.match(html, /data-i="lng"[^>]*value="76.8285533"/, kind + ": the map field lost its longitude");
  }
  if (fields.some((f) => f.t === "pts"))
    assert.match(html, /data-cmap/, kind + ": the route field has no map");

  /* The places picker must survive the round trip through the raw id box.
     That box is the value — the chips and the pins are drawn from it — so if
     the ids do not reach it, the picker renders empty over a document that
     had five places tagged, and saving then wipes them. */
  if (fields.some((f) => f.t === "places")) {
    assert.match(html, /data-rmap/, kind + ": the places field has no map to show the tags on");
    assert.match(html, /data-i[^>]*value="brahma-sarovar, jyotisar"/,
      kind + ": the places picker lost the ids it was given");
  }
}

// The two kinds whose photograph is a banner say so, in words, on the field.
for (const k of ["events", "hero"])
  assert.match(SPEC[k].find((f) => f.t === "img").hint, /16:9/, k + ": the banner field must state its shape");

/* 6. The one dependency, and the reason it is safe to have. */
const admin = readFileSync(join(HERE, "src", "admin.ts"), "utf8");
assert.ok(/unpkg\.com\/leaflet@\d+\.\d+\.\d+\//.test(admin), "Leaflet must be pinned to an exact version");
assert.ok(JS.includes("if (!window.L) return"), "map code must degrade when the CDN is unreachable");

/* 7. Steps, JSON and the preview.
 *
 * Nothing at the top level of FORMS_JS touches the DOM — every $() is inside a
 * function — so the whole engine can be evaluated here and the pure half of it
 * called for real. That is worth more than it sounds: the step rail, the JSON
 * template and the preview are three renderers that share one SPEC, and the
 * way they break is by rendering nothing at all rather than by throwing.
 */
const ENGINE = new Function(JS + "\nreturn { groupHtml, stepsOf, jsonTemplate, refHtml, keySet," +
  " checksHtml, pvBody, jHighlight, nextKey, slug, makeId, folderOf, clock12," +
  " minsToClock, clockToMins, asPoint," +
  " setKind: function (k) { CKIND = k; }, setMedia: function (m) { MEDIA = m; }," +
  " setRecs: function (r) { RECS = r; } };")();

for (const [kind, fields] of Object.entries(SPEC)) {
  ENGINE.setKind(kind);
  const doc = sample(fields);

  // Every top-level field belongs to exactly one step, and the first step is
  // NAMED — a spec whose first field has no `sec` falls back to "Details",
  // which is the label you get when nobody chose one.
  const steps = ENGINE.stepsOf(fields);
  assert.ok(steps.length, kind + ": no steps at all");
  assert.notEqual(steps[0].lb, "Details", kind + ": the first field needs a sec, or step one is unnamed");
  assert.equal(steps.reduce((n, s) => n + s.fs.length, 0), fields.length,
    kind + ": the steps do not add up to the fields");

  const html = ENGINE.groupHtml(fields, doc, true);
  assert.equal((html.match(/class="step"/g) || []).length, steps.length,
    kind + ": rendered a different number of steps than stepsOf counted");
  assert.ok(!html.includes("undefined"), kind + ": the stepped form renders the word undefined");

  /* THE one that would fail quietly. readGroup finds a top-level field at
     ':scope > .step > .sfields > .fld' — change the wrapper groupHtml emits
     and every field reads back as undefined, which is a form that saves an
     empty record and says nothing on its way out.

     There is no DOM here, so this proves the two halves of that agree rather
     than querying the result: the wrapper is emitted in the exact shape the
     selector describes, and each field lands in its own step.

     What it must NOT pin is anything between the heading and the fields. It
     used to require the two be adjacent, so adding a line of explanation under
     a step heading failed this with "no longer emits the wrapper" — which is
     not what had happened and sends you looking in the wrong place. `.sfields`
     is a CHILD of `.step`, and that is the whole of what readGroup needs. */
  const wrap = html.match(/<div class="step" data-step="\d+" hidden><h3 class="sec">[^<]*<\/h3>(?:<p class="sechint">[^<]*<\/p>)?<div class="sfields">/g) || [];
  assert.equal(wrap.length, steps.length,
    kind + ": groupHtml no longer emits the step > sfields wrapper readGroup selects through");

  const chunks = html.split(/<div class="step" data-step="\d+" hidden>/).slice(1);
  steps.forEach((s, i) => {
    for (const f of s.fs)
      assert.ok(chunks[i].includes('data-k="' + f.k + '"'),
        kind + "." + f.k + ": did not render into step " + (i + 1) + " (" + s.lb + ")");
  });

  assert.doesNotThrow(() => ENGINE.groupHtml(fields, {}, true), kind + ": cannot render a blank stepped form");

  // The empty template is the whole point of JSON mode: every key, valid JSON.
  const tpl = ENGINE.jsonTemplate(fields);
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(tpl)), kind + ": the JSON template is not serialisable");
  for (const k of Object.keys(ENGINE.keySet(fields)))
    assert.ok(k in tpl, kind + ": the JSON template is missing " + k);
  // A template that comes back through the form must survive the round trip,
  // which means its keys are the ones the form actually saves.
  const known = ENGINE.keySet(fields);
  for (const k of Object.keys(tpl))
    assert.ok(known[k], kind + ": the JSON template offers " + k + ", which nothing can save");
  assert.ok(ENGINE.refHtml(fields, "").includes("<code>id</code>"), kind + ": the key reference is empty");

  // The preview draws from the same document, for every kind.
  const pv = ENGINE.pvBody(doc);
  assert.ok(pv.length > 200, kind + ": the preview rendered almost nothing");
  assert.ok(!pv.includes("undefined"), kind + ": the preview renders the word undefined");
  assert.doesNotThrow(() => ENGINE.pvBody({}), kind + ": the preview cannot draw an empty record");

  // A complete record has nothing BLOCKING to say about it; an empty one has
  // plenty. If these two ever agree, the checks are not reading the document.
  const full = ENGINE.checksHtml(doc);
  assert.ok(!full.includes('class="ck bad"'), kind + ": a fully populated record reports a blocking problem\n  " + full);
  // "Hidden from the app" is said even about a complete record, and should be —
  // it is the one flag that is about intent rather than about a gap.
  const live = { ...doc };
  delete live.pending;
  assert.match(ENGINE.checksHtml(live), /Everything the app needs/,
    kind + ": a complete, visible record still reports problems");
  const empty = ENGINE.checksHtml({});
  assert.match(empty, /class="ck bad"/, kind + ": an empty record reports no problems");
  for (const f of fields.filter((f) => f.req && f.t !== "geo"))
    assert.ok(empty.includes("Missing: " + f.lb), kind + ": an empty record does not mention " + f.k);
}

/* 8. The two halves of the top-level read/write agree by name, not by luck. */
const groupSrc = JS.match(/function groupHtml[\s\S]*?\n}/)[0];
const readSrc = JS.match(/function readGroup[\s\S]*?\n}/)[0];
for (const c of ["step", "sfields"]) {
  assert.ok(groupSrc.includes('class="' + c), "groupHtml no longer wraps top-level fields in ." + c);
  assert.ok(readSrc.includes("." + c + " >"), "readGroup no longer looks through ." + c);
}

/* 8b. .ctl is load-bearing twice over, and neither is obvious.
       It is what makes each field a two-row subgrid — take it away and every
       control in a row goes back to starting at its own height. And readField
       reaches THROUGH it for list rows, so a rename here empties every
       repeating group on save while the form still looks right. */
const fieldSrc = JS.match(/function fieldHtml[\s\S]*?\n}/)[0];
const readFieldSrc = JS.match(/function readField[\s\S]*?\n  return undefined;\n}/)[0];
assert.ok(fieldSrc.includes('<div class="ctl">'), "fieldHtml no longer wraps its control in .ctl");
assert.ok(readFieldSrc.includes(":scope > .ctl > [data-rows]"),
  "readField does not read list rows through .ctl, so repeating groups will save empty");
assert.match(CSS, /\.fld,\.sub > \.fld\{[^}]*subgrid/,
  "the fields are no longer a subgrid, so controls in a row will not line up");

/* 8c. A photograph field can still be read, and can still be filled.
       The value moved into a <details> when the field became a picture manager;
       it is the one part of it readField actually looks at. */
for (const [kind, fields] of Object.entries(SPEC)) {
  ENGINE.setKind(kind);
  for (const f of fields.filter((x) => x.t === "img" || x.t === "imgs")) {
    const one = ENGINE.groupHtml([f], { [f.k]: f.t === "imgs" ? ["a", "b"] : "a" });
    assert.match(one, /data-i /, kind + "." + f.k + ": has no value input, so nothing can be saved");
    assert.match(one, /data-file/, kind + "." + f.k + ": has no file input, so nothing can be uploaded");
    assert.match(one, /data-thumbs/, kind + "." + f.k + ": has nowhere to show the photographs");
    assert.match(one, /data-up\b/, kind + "." + f.k + ": has no upload button");
    if (f.t === "imgs")
      assert.match(one, /data-file[^>]*multiple|multiple[^>]*data-file/,
        kind + "." + f.k + ": a gallery must take more than one file at a time");
  }
}

/* 8d. Naming an upload. THE one that loses work quietly: hand back a name
       something already uses and the PUT overwrites that photograph in the
       bucket, for every record pointing at it, with no error anywhere. */
ENGINE.setMedia([{ key: "brahma-sarovar.webp" }, { key: "brahma-sarovar-2.webp" }, { key: "jyotisar.jpg" }]);
assert.equal(await ENGINE.nextKey("brahma-sarovar"), "brahma-sarovar-3", "nextKey would overwrite a photograph");
assert.equal(await ENGINE.nextKey("jyotisar"), "jyotisar-2", "nextKey ignores a non-webp extension");
assert.equal(await ENGINE.nextKey("bhishma-kund"), "bhishma-kund", "nextKey renames a free name");
ENGINE.setMedia(null);

assert.equal(ENGINE.slug("IMG_4821.JPG"), "img-4821-jpg", "slug leaves characters a key cannot hold");
assert.equal(ENGINE.slug("  Brahma Sarovar  "), "brahma-sarovar", "slug does not trim to a clean key");
assert.equal(ENGINE.slug(""), "", "slug should pass an empty string straight through");

/* 8e. Minutes in the document, a clock on the screen.
       The planner does arithmetic on these, so a wrong conversion does not
       throw — it moves an aarti by an hour and builds somebody's day around it. */
for (const n of [0, 1, 59, 60, 599, 600, 1080, 1439])
  assert.equal(ENGINE.clockToMins(ENGINE.minsToClock(n)), n, "the clock does not round-trip " + n);
assert.equal(ENGINE.minsToClock(1080), "18:00", "1080 is 6pm");
assert.equal(ENGINE.minsToClock(0), "00:00", "midnight is 00:00, not blank");
assert.equal(ENGINE.minsToClock(null), "", "an unset time must render empty, not 00:00");
assert.equal(ENGINE.minsToClock(undefined), "", "an unset time must render empty");
assert.equal(ENGINE.clockToMins("18:00"), 1080, "6pm is 1080");
assert.equal(ENGINE.clockToMins("00:00"), 0, "midnight reads as 0, and 0 is not nothing");
for (const bad of ["", "  ", "25:00", "12:60", "abc", "12", null, undefined])
  assert.equal(ENGINE.clockToMins(bad), null, "a bad clock value must be null, not a number: " + bad);

/* 8e2. The dial replaced <input type="time">, so the value now lives in a
        hidden input behind a button. If that input ever stops being rendered,
        every opening hour and every aarti time saves as nothing — and the
        button would still show the right time while it happened. */
for (const [kind, fields] of Object.entries(SPEC)) {
  ENGINE.setKind(kind);
  const walkT = (fs, obj) => {
    for (const f of fs) {
      if (f.t === "time" || f.t === "mins") {
        const h = ENGINE.groupHtml([f], obj);
        assert.match(h, /type="hidden" data-i/, kind + "." + f.k + ": the clock lost its value input");
        assert.match(h, /data-topen/, kind + "." + f.k + ": the clock cannot be opened");
      }
      if (f.t === "minspan") {
        const h = ENGINE.groupHtml([f], obj);
        for (const side of ["from", "to"])
          assert.ok(h.indexOf('data-i="' + side + '"') >= 0,
            kind + "." + f.k + ": the window lost its " + side + " value");
      }
      if (f.of) walkT(f.of, {});
    }
  };
  walkT(fields, {});
}
assert.equal(ENGINE.clock12("18:00"), "6:00 pm", "the readout is not the app's format");
assert.equal(ENGINE.clock12("00:30"), "12:30 am", "midnight reads as 12, not 0");
assert.equal(ENGINE.clock12("12:05"), "12:05 pm", "noon is pm");
assert.equal(ENGINE.clock12(""), "", "an unset time has no readout");

/* 8f. The id written from the name. A bare "p-" is a real, saveable id that
       belongs to nothing, and it is what an empty name would produce. */
assert.equal(ENGINE.makeId("Brahma Sarovar", "pehowa"), "p-brahma-sarovar", "Pehowa ids carry a p-");
assert.equal(ENGINE.makeId("Brahma Sarovar", "kurukshetra"), "brahma-sarovar", "Kurukshetra ids do not");
assert.equal(ENGINE.makeId("Brahma Sarovar", ""), "brahma-sarovar", "no town yet means no prefix");
assert.equal(ENGINE.makeId("", "pehowa"), "", "an empty name must not become a bare p-");
assert.equal(ENGINE.makeId("  ", "pehowa"), "", "whitespace is not a name");
assert.equal(ENGINE.makeId("Shri Vyas Gaudiya Math!", "kurukshetra"), "shri-vyas-gaudiya-math",
  "punctuation must not reach an id");

/* 8g. Which folder a photograph falls in — longest id wins.
       Real ids nest: p-saraswati-tirth and p-saraswati-van both begin with
       p-saraswati. Match the short one first and a place's photographs are
       filed under its neighbour, silently and for ever. */
ENGINE.setRecs([
  { id: "p-saraswati-tirth", label: "Saraswati Tirth", group: "places" },
  { id: "p-saraswati", label: "Saraswati", group: "places" },
  { id: "bhadrakali", label: "Bhadrakali", group: "places" },
].sort((a, b) => b.id.length - a.id.length));
assert.equal(ENGINE.folderOf("p-saraswati-tirth-2").id, "p-saraswati-tirth", "the longest matching id must win");
assert.equal(ENGINE.folderOf("p-saraswati-tirth").id, "p-saraswati-tirth", "an exact id is its own folder");
assert.equal(ENGINE.folderOf("p-saraswati-3").id, "p-saraswati", "a shorter id still matches its own keys");
assert.equal(ENGINE.folderOf("bhadrakali-1").id, "bhadrakali", "a numbered photograph belongs to its place");
assert.equal(ENGINE.folderOf("logo"), null, "a key matching no record belongs to no folder");
// "bhadrakali2" is not in bhadrakali's folder — only an exact id or id + "-".
assert.equal(ENGINE.folderOf("bhadrakalix"), null, "a prefix without a hyphen is a different name");
ENGINE.setRecs([]);

/* 9. The JSON pane colours its own text, and escapes it on the way.
      The <pre> under the textarea is real markup built from whatever is typed,
      so a place description containing a tag is an injection into the
      dashboard unless every piece is escaped. */
const hl = ENGINE.jHighlight('{\n  "id": "x", "n": 12, "ok": true, "no": null\n}');
// &quot; because every piece goes through ek() on the way into the <pre>.
assert.match(hl, /<b class="jk">&quot;id&quot;<\/b>/, "keys are not coloured");
assert.match(hl, /<span class="js">&quot;x&quot;<\/span>/, "strings are not coloured");
assert.match(hl, /<span class="jn">12<\/span>/, "numbers are not coloured");
assert.match(hl, /<span class="jl">true<\/span>/, "true\/false\/null are not coloured");
assert.match(hl, /<span class="jl">null<\/span>/, "null is not coloured");

const nasty = ENGINE.jHighlight('{ "why": "<img src=x onerror=alert(1)> & \'quoted\'" }');
assert.ok(!nasty.includes("<img"), "jHighlight lets a tag through — that is an injection into the dashboard");
assert.ok(nasty.includes("&lt;img"), "jHighlight is not escaping angle brackets");
assert.ok(nasty.includes("&amp;"), "jHighlight is not escaping ampersands");
// Colouring must not change what is there. Strip the markup back off and the
// original text has to survive character for character, or the pane is lying
// about what will be parsed.
const round = (s) =>
  ENGINE.jHighlight(s).replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&amp;/g, "&");
for (const s of ['{"a":1}', '{ "s": "a \\" b", "n": -2.5e3 }', "", "{ broken", '{"u":"कुरु"}'])
  assert.equal(round(s), s, "jHighlight changed the text it was colouring: " + s);

/* 8b. The coordinate the editor pasted is the coordinate that gets pinned.

       asPoint is the one piece of parsing in the geo field, and every way it
       can be wrong is silent: a URL it fails to read falls through to a name
       search that finds nothing, and — worse — reading the wrong number pair
       out of a Google link pins the map view centre instead of the place,
       which saves, renders, and is off by a street. */
const pt = (s) => ENGINE.asPoint(s);
const near = (p, lat, lng, why) => {
  assert.ok(p, why + " — parsed nothing at all");
  assert.equal(p.lat, lat, why);
  assert.equal(p.lng, lng, why);
};

near(pt("29.961355, 76.828553"), 29.961355, 76.828553, "a plain pasted pair");
near(pt("29.961355,76.828553"), 29.961355, 76.828553, "a pair with no space");
near(pt("29.961355 76.828553"), 29.961355, 76.828553, "a space-separated pair");
// The place's own pin, and the map view centre, in one URL. !3d/!4d is the
// place; @ is wherever the map was scrolled. Taking @ here is the off-by-a-
// street bug, so it is asserted rather than assumed.
near(pt("https://www.google.com/maps/place/Brahma+Sarovar/@29.9600,76.8200,17z/data=!3m1!4b1!4m6!3d29.961355!4d76.828553"),
  29.961355, 76.828553, "a full Google place URL must use the pin, not the view centre");
near(pt("https://www.google.com/maps/@29.961355,76.828553,17z"), 29.961355, 76.828553, "a bare Google view URL");
near(pt("-29.961355, -76.828553"), -29.961355, -76.828553, "negative coordinates");

assert.equal(pt("Brahma Sarovar"), null, "a place name must not parse as a coordinate");
assert.equal(pt(""), null, "an empty box must not parse as a coordinate");
assert.equal(pt("https://maps.app.goo.gl/aBcDeF12345"), null, "a short link carries no coordinate to find");
assert.equal(pt("Sector 13"), null, "a sector number must not parse as a coordinate");
// Out of range is not a coordinate. A transposed pair still lands in the
// district check downstream; this one catches the string that was never a
// point to begin with.
assert.equal(pt("129.5, 76.8"), null, "a latitude past the pole must be refused");
assert.equal(pt("29.9, 276.8"), null, "a longitude past the antimeridian must be refused");

/* 8f. Every field the DATA carries, the form can edit.
 *
 * This is the one that had already gone wrong, and it goes wrong silently in
 * the worst direction: a saved document is built by readGroup from SPEC alone,
 * so a key no field owns is not preserved, it is DROPPED. Nineteen places
 * carried "the opening hours are an estimate" and eleven carried "the pin is
 * approximate"; one edit each in the dashboard would have deleted the caveat
 * and left the guess reading as a fact. Nothing would have said so — the form
 * saves happily, the app renders happily, and the record is quietly poorer.
 *
 * Checked against the bundled catalogues, which are the same documents the
 * database holds (import-content.mjs writes one from the other). Direction
 * matters: a key in the data with no field is a fault, a field no record
 * happens to use yet is just an empty column.
 */
const FEEDS = {
  places: "destinations.json",
  startpoints: "places-index.json",
  hotels: "hotels.json",
  erickshaw: "erickshaw.json",
  hero: "hero.json",
};
for (const [kind, file] of Object.entries(FEEDS)) {
  const path = join(HERE, "..", "web", "src", "content", "data", file);
  if (!existsSync(path)) continue; // a catalogue that does not exist yet
  const items = JSON.parse(readFileSync(path, "utf8"));
  // "lng" is the one key with no field of its own: the map writes the pair.
  const editable = new Set([...SPEC[kind].map((f) => f.k), "lng"]);
  const orphans = new Map();
  for (const it of items)
    for (const k of Object.keys(it))
      if (!editable.has(k)) orphans.set(k, (orphans.get(k) || 0) + 1);
  assert.deepEqual([...orphans], [],
    kind + ": the data carries key(s) no field owns, so an edit in the dashboard would drop them: " +
    [...orphans].map(([k, n]) => k + " (on " + n + ")").join(", "));
}

/* 9. Save goes through the preview. The extra click IS the feature — it is the
      only moment anybody sees the record drawn before it is live. */
assert.match(JS, /if \(CSTEP !== "pv"\) \{ showStep\("pv"\)/,
  "cSave no longer routes the first press to the preview");

/* 10. asPoint actually parses what an editor pastes.
 *
 * The one piece of pure logic in the whole blob, and the one whose failure is
 * silent in the worst way: a shape it does not recognise falls through to a
 * name search, which finds nothing, and the editor concludes the box is broken
 * and types six decimal places by hand. A pin in the wrong district is the
 * output of that.
 *
 * `new Function` gives us the real function out of the shipped string — no
 * second copy of the parser to drift from this one.
 */
{
  const { asPoint } = new Function(JS + "\nreturn { asPoint: asPoint };")();
  const KKR = { lat: 29.9695, lng: 76.839 };
  const near = (p, w) => p && Math.abs(p.lat - w.lat) < 0.001 && Math.abs(p.lng - w.lng) < 0.001;

  const good = [
    ["a plain pair", "29.9695, 76.8390"],
    ["no space", "29.9695,76.8390"],
    ["the place's own pin", "https://www.google.com/maps/place/Birla+Mandir/@29.95,76.82,17z/data=!4m6!3m5!1s0x0:0x0!8m2!3d29.9695!4d76.8390"],
    ["a share link's q=", "https://maps.google.com/?q=29.9695,76.8390"],
    ["a view centre", "https://www.google.com/maps/@29.9695,76.8390,15z"],
    ["degrees, minutes, seconds", "29°58'10.2\"N 76°50'20.4\"E"],
  ];
  for (const [what, s] of good)
    assert.ok(near(asPoint(s), KKR), what + " must parse to the Kurukshetra pin, got " + JSON.stringify(asPoint(s)));

  /* The pin beats the view centre when a URL carries both, and this is the
     real link that proved why it matters. Aggarwal Dharamshala at Krishna
     Gate, Thanesar: its pin is !3d29.9689273!4d76.8511361, and the @ in the
     same URL is 29.7794362,75.8209365 — the centre of a zoom-10 window, sixty
     kilometres west and outside the district. An editor reading the address
     bar by hand takes the @, because it is the part that looks like a
     coordinate. That pin was saved, and it is the whole reason this parser
     grew. The base64 blob is kept: it is full of digits, and a lazier regex
     finds a "coordinate" inside it. */
  const REAL = "https://www.google.com/maps/place/Aggarwal+Dhramsala/@29.7794362,75.8209365,10z/data=" +
    "!4m10!1m2!2m1!1saggarwal-dharamshala-krishna-gate+Krishna+Gate,+Thanesar!3m6" +
    "!1s0x390e4738259efaa9:0x3be8f2e10b12bad!8m2!3d29.9689273!4d76.8511361" +
    "!15sCjhhZ2dhcndhbC1kaGFyYW1zaGFsYS1rcmlzaG5hLWdhdGUgS3Jpc2huYSBHYXRlLCBUaGFuZXNhclo5" +
    "!16s%2Fg%2F11f29ntwpg?entry=ttu&g_ep=EgoyMDI2MDgxMC4wIKXMDSoASAFQAw%3D%3D";
  const real = asPoint(REAL);
  assert.ok(real && Math.abs(real.lat - 29.9689273) < 1e-6 && Math.abs(real.lng - 76.8511361) < 1e-6,
    "a real Google place URL must give its PIN, not its view centre — got " + JSON.stringify(real));

  for (const s of ["krishna ghaat", "", "Sector 2", "29.9695"])
    assert.equal(asPoint(s), null, JSON.stringify(s) + " is a name, not a coordinate");
  assert.equal(asPoint("999.5, 76.8"), null, "an impossible latitude is not a coordinate");
}

console.log("admin forms OK — " + Object.keys(SPEC).length + " kinds, " +
  Object.values(SPEC).reduce((n, f) => n + f.length, 0) + " top-level fields, " +
  Object.values(SPEC).reduce((n, f) => n + ENGINE.stepsOf(f).length, 0) + " steps");
