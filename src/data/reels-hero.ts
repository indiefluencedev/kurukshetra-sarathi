import reels from "@/content/data/reels.json";
import hero from "@/content/data/hero.json";
import type { ReelItem, HeroItem } from "@/shared/types";

// Home hero carousel + visitor reels. Source: src/content/data/*.json. See docs/04.
export const REELS = reels as unknown as ReelItem[];
export const HERO = hero as unknown as HeroItem[];
