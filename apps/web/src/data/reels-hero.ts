import reels from "@/content/data/reels.json";
import hero from "@/content/data/hero.json";
import { S } from "@/app/state";
import { cityOf } from "@/data/cities";
import { byId } from "@/shared/lib/geo";
import type { ReelItem, HeroItem } from "@/shared/types";

// Home hero carousel + visitor reels. Source: src/content/data/*.json. See docs/04.
export const REELS = reels as unknown as ReelItem[];
export const HERO = hero as unknown as HeroItem[];

/**
 * The hero photographs of the town on screen.
 *
 * Home opens on a photograph captioned "Kurukshetra today". Showing Brahma
 * Sarovar under a header that says Pehowa is the one thing this screen must
 * not do — it is the app's answer to "why did I come here", and the answer has
 * to be about where the visitor actually is.
 *
 * Falls back to the whole set rather than to nothing: a town with no hero
 * photographs yet should still open on a picture.
 */
export const heroFor = (): HeroItem[] => {
  const mine = HERO.filter((h) => cityOf(h) === S.city);
  return mine.length ? mine : HERO;
};

/** Reels filmed in the town on screen. Same argument, and the same fallback. */
export const reelsFor = (): ReelItem[] => {
  const mine = REELS.filter((r) => {
    const d = byId(r.place);
    return d && cityOf(d) === S.city;
  });
  return mine.length ? mine : REELS;
};
