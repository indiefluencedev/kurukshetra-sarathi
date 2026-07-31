import themesData from "@/content/data/themes.json";
import type { ThemeDef, Loc } from "@/shared/types";

export const PHOTO_CREDIT: Record<string, { author?: string; licence: string }> = {};
export const PHOTO_SOURCE: Loc = {
  en: "All photographs supplied by the Kurukshetra Development Board.",
  hi: "सभी छायाचित्र कुरुक्षेत्र विकास बोर्ड द्वारा उपलब्ध कराए गए।",
};

export const CONFIG = {
  brand: { en: "Kurukshetra Saarthi", hi: "कुरुक्षेत्र सारथी", sub: "48 KOS TIRTHA" },
  contingency: { fast: 0.05, balanced: 0.1, relaxed: 0.15 },
  speed: { car: 24, taxi: 24, twowheeler: 26, erickshaw: 18, public: 15, walking: 4.5 },
  roadFactor: 1.35,
  parkingBufferMin: 6,
  mealBreakMin: 40,
  mealWindow: [13, 14],
  paceVisitFactor: { fast: 0.8, balanced: 1, relaxed: 1.25 },
  centre: { lat: 29.9614, lng: 76.8286 },
  places: {
    /**
     * Whether the start/end pickers fall back to live OpenStreetMap search.
     *
     * The curated list in content/data/places-index.json is the source of
     * truth: hand-checked coordinates, bilingual names, and it works with the
     * aeroplane mode on — which matters, because this is a PWA a pilgrim opens
     * on patchy rural data. OSM is only here to cover what the list is still
     * missing. Once the list covers the district's stays and terminals, set
     * this to false: no network calls, no rate limits, no third-party outage,
     * nothing to attribute. Run `npm run harvest-places` to gather candidates.
     */
    useOSM: true,
  },
  // Live weather, Open-Meteo — no key needed. Thanesar, Kurukshetra 136118.
  weather: {
    lat: 29.9732,
    lng: 76.8343,
    place: { en: "Thanesar, Kurukshetra", hi: "थानेसर, कुरुक्षेत्र" },
    api: "https://api.open-meteo.com/v1/forecast",
  },
};

// Interest groups, each carrying a Mahabharata-era icon.
// Source of truth: src/content/data/themes.json.
export const THEMES = themesData as ThemeDef[];

export const theme = (id: string): ThemeDef | null => THEMES.find((t) => t.id === id) || null;
export const shownThemes = (list?: string[]): string[] => (list || []).filter((x) => !!theme(x));
