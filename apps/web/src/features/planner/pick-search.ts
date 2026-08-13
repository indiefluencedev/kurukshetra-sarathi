import type { Loc } from "@/shared/types";

/**
 * Ranking the picker's list as it is typed into.
 *
 * Separate from the sheet that draws it, and pure, because this is the part
 * that can be wrong in a way nobody notices: a search that quietly ranks the
 * dharamshala a pilgrim asked for below one that merely mentions it in its
 * locality is still a working screen. tools/check-search.mjs is the judge.
 *
 * Every name is already in the bundle — 80 stays, a dozen terminals — so a
 * keystroke is a substring scan over ~90 short strings. No network, no
 * debounce, no spinner, and the same answer on a train with no signal.
 */

export interface Named {
  kind: string;
  name: Loc;
  area?: Loc;
  code?: string;
}

/** What the app calls a stay, said back under its name. */
export const KIND_WORD: Record<string, Loc> = {
  hotel: { en: "Hotel", hi: "होटल" },
  dharamshala: { en: "Dharamshala", hi: "धर्मशाला" },
  guesthouse: { en: "Guest house", hi: "गेस्ट हाउस" },
  homestay: { en: "Homestay", hi: "होमस्टे" },
};

/** name in both languages, the locality, the kind and the station code */
export const haystack = (p: Named): string =>
  [p.name.en, p.name.hi, p.area?.en, p.area?.hi, p.code, KIND_WORD[p.kind]?.en]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

/** 3 at the start of the string, 2 at the start of a word, 1 anywhere, -1 never. */
export function termScore(hay: string, term: string): number {
  const i = hay.indexOf(term);
  if (i < 0) return -1;
  if (i === 0) return 3;
  return /[\s·,(–-]/.test(hay[i - 1]) ? 2 : 1;
}

/** Every word must match somewhere, so "gita bhawan" narrows rather than widens. */
export function score(hay: string, terms: string[]): number {
  let sum = 0;
  for (const t of terms) {
    const s = termScore(hay, t);
    if (s < 0) return -1;
    sum += s;
  }
  return sum;
}

export const terms = (q: string): string[] => {
  const n = q.trim().toLowerCase();
  return n ? n.split(/\s+/) : [];
};

/**
 * The list, in the order it should be read.
 *
 * `home` is the town in scope: it breaks a tie, and never filters. Someone
 * visiting Pehowa still arrives at Kurukshetra Junction — there is no station
 * in Pehowa town — so hiding the other town's terminals would remove the only
 * correct answer.
 */
export function rank<T extends Named>(
  pool: { p: T; hay: string }[],
  q: string,
  home: (p: T) => boolean,
): T[] {
  const ts = terms(q);
  return pool
    .map(({ p, hay }) => ({ p, s: ts.length ? score(hay, ts) : 0 }))
    .filter((r) => r.s >= 0)
    .sort(
      (a, b) =>
        b.s - a.s ||
        Number(home(b.p)) - Number(home(a.p)) ||
        a.p.name.en.localeCompare(b.p.name.en),
    )
    .map((r) => r.p);
}
