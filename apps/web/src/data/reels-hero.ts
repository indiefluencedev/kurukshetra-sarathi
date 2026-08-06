import reels from "@/content/data/reels.json";
import hero from "@/content/data/hero.json";
import { register } from "@/content/live";
import { S } from "@/app/state";
import { cityOf } from "@/data/cities";
import { byId } from "@/shared/lib/geo";
import type { ReelItem, HeroItem } from "@/shared/types";

// Home hero carousel + visitor reels. Source: src/content/data/*.json. See docs/04.
export const REELS = reels as unknown as ReelItem[];

/**
 * `let`, and updatable, for the same reason as the calendar and the catalogue.
 *
 * This is the first thing anyone sees of the app, and it was the one screen
 * nobody could change without a release — which also meant its photographs
 * were the ones the dashboard's library kept calling unused. Bundled copy is
 * still the floor: it renders first and stands if the network never answers.
 * See content/live.ts and docs/13.
 */
export let HERO = hero as unknown as HeroItem[];
register<HeroItem>("hero", (items) => {
  // A hero with no picture is a blank screen where the app opens. Rather than
  // trust the feed, keep only the entries that can actually draw.
  const ok = items.filter((h) => h && h.img && h.fact);
  if (ok.length) HERO = ok;
});

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
