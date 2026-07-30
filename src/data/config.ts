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
  // Live weather, Open-Meteo — no key needed. Thanesar, Kurukshetra 136118.
  weather: {
    lat: 29.9732,
    lng: 76.8343,
    place: { en: "Thanesar, Kurukshetra", hi: "थानेसर, कुरुक्षेत्र" },
    api: "https://api.open-meteo.com/v1/forecast",
  },
};

// Interest groups, each carrying a Mahabharata-era icon.
export const THEMES: ThemeDef[] = [
  { id: "mahabharata", en: "Mahabharat", hi: "महाभारत", icon: "rath", img: "jyotisar" },
  { id: "spiritual", en: "Temples", hi: "मंदिर", icon: "kalash", img: "bhadrakali" },
  { id: "sarovar", en: "Sarovars", hi: "सरोवर", icon: "ghat", img: "brahma-sarovar" },
  { id: "museums", en: "Museums", hi: "संग्रहालय", icon: "sangrah", img: "krishna-museum" },
  { id: "heritage", en: "Heritage", hi: "धरोहर", icon: "kila", img: "sheikh-chilli" },
  { id: "archaeology", en: "Archaeology", hi: "पुरातत्व", icon: "granth", img: "harsh-ka-tila" },
  { id: "shows", en: "Shows", hi: "शो", icon: "surya", img: "jyotisar-virat" },
  { id: "aarti", en: "Aarti", hi: "आरती", icon: "deep", img: "brahma-sarovar-1" },
];

export const theme = (id: string): ThemeDef | null => THEMES.find((t) => t.id === id) || null;
export const shownThemes = (list?: string[]): string[] => (list || []).filter((x) => !!theme(x));
