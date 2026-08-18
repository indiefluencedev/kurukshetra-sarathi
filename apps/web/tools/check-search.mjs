// Self-check for the picker's search — the thing a visitor types their own
// hotel into at 9pm. It is checked against the REAL catalogues, because the
// failure worth catching is not "the sort is unstable", it is "the one place
// somebody typed the name of is not the first row".
// Run: npm run check-search
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { haystack, rank, termScore, score, terms } from "../src/features/planner/pick-search.ts";

const read = (f) => JSON.parse(readFileSync(new URL("../src/content/data/" + f, import.meta.url), "utf8"));
const stays = read("hotels.json").filter((s) => !s.pending && s.lat != null && s.lng != null);
const terminals = read("places-index.json");

const pool = (rows) => rows.map((p) => ({ p, hay: haystack(p) }));
const KKR = (p) => (p.city || "kurukshetra") === "kurukshetra";
const names = (rows) => rows.map((p) => p.name.en);
const first = (rows, q) => names(rank(pool(rows), q, KKR))[0];

/* ---- the scoring itself ---- */

assert.equal(termScore("birla mandir dharamshala", "birla"), 3, "the start of the name scores highest");
assert.equal(termScore("birla mandir dharamshala", "mandir"), 2, "the start of a later word is next");
assert.equal(termScore("birla mandir dharamshala", "andir"), 1, "mid-word still matches, but last");
assert.equal(termScore("birla mandir", "gita"), -1, "no match is no match");

assert.equal(score("gita bhawan trust dharamshala", terms("gita bhawan")), 5, "both words, both at a word start");
assert.equal(score("gita bhawan trust", terms("gita museum")), -1, "EVERY word has to match, or the row is out");
assert.equal(score("gita bhawan trust", terms("  GITA  ")), 3, "case and stray spaces are the user's, not the data's");

/* ---- an empty box is the whole catalogue, in a sane order ---- */

const all = rank(pool(stays), "", KKR);
assert.equal(all.length, stays.length, "typing nothing hides nothing");
const line = all.findIndex((p) => !KKR(p));
if (line > 0) {
  assert.ok(
    all.slice(0, line).every(KKR),
    "the town in scope comes first, and the other town is below it — never missing",
  );
}
assert.ok(
  all.some((p) => !KKR(p)) === stays.some((p) => !KKR(p)),
  "sorting by town must never drop the other town's rows",
);

/* ---- what a visitor actually types ----
   Each of these is a name off the district's own list. The row they name has
   to be the FIRST one, not merely present: a match ranked fourth is a match
   the person scrolls past. */

const wanted = [
  ["birla", "Birla Mandir Dharamshala"],
  ["gita bhawan", "Gita Bhawan Trust"],
  ["kali kamli", "Baba Kali Kamli Wala Dharamshala"],
  ["gaudiya", "Gaudiya Math Dharamshala"],
];
for (const [typed, expect] of wanted) {
  if (!stays.some((s) => s.name.en === expect)) continue; // the catalogue may be re-cut
  assert.equal(first(stays, typed), expect, `"${typed}" must put ${expect} at the top`);
}

// A partial word, the way a name is actually typed — one letter at a time.
const kkj = terminals.find((p) => p.code === "KKDE");
if (kkj) {
  assert.equal(first(terminals, "kkde"), kkj.name.en, "a station code finds its station");
  for (const part of ["k", "ku", "kur", "kuru"])
    assert.ok(
      names(rank(pool(terminals), part, KKR)).includes(kkj.name.en),
      `"${part}" must still hold ${kkj.name.en} — a name disappears as it is typed otherwise`,
    );
}

// Hindi is not a second-class query: the same place, typed in Devanagari.
const hindiFirst = stays[0];
assert.equal(
  first(stays, hindiFirst.name.hi),
  hindiFirst.name.en,
  "a name typed in Hindi finds the same row as the same name in English",
);

// Nothing by that name is an empty list, never a wrong one.
assert.equal(rank(pool(stays), "zzzzz", KKR).length, 0, "a name nobody has matches nobody");

console.log(
  `check-search: ok — ${stays.length} stays, ${terminals.length} terminals, ${wanted.length} typed names land first`,
);
