import { S, city } from "@/app/state";
import { I18N } from "./strings";
import type { Loc } from "@/shared/types";

const raw = (k: string): string =>
  I18N[S.lang] && I18N[S.lang][k] != null
    ? I18N[S.lang][k]
    : I18N.en[k] != null
      ? I18N.en[k]
      : k;

/**
 * Translate a UI string key for the current language (falls back to English,
 * then the key), and fill in `{city}` with the town on screen.
 *
 * The substitution lives here rather than at each call site because the
 * strings that name the town are scattered — the greeting, the reels heading,
 * the hero's kicker — and every one of them was a hardcoded "Kurukshetra" that
 * would have gone on saying Kurukshetra while the visitor read about Pehowa.
 * One replace on a short string costs nothing and there is nowhere left to
 * forget it.
 */
export const t = (k: string): string => raw(k).replace("{city}", town());

/** Pick the current language from a bilingual object. */
export const nm = (o?: Loc | null): string => (o ? (o[S.lang] != null ? o[S.lang] : o.en) : "");

/** The town on screen, in the current language. A City is already {en,hi}. */
export const town = (): string => nm(city());

/**
 * "1 place" / "23 places" — every count of places went through `n + t("places")`
 * and read "1 places" wherever a theme had exactly one. Hindi has no plural
 * form here, so it just takes the same noun.
 */
export const nPlaces = (n: number): string => n + " " + t(n === 1 ? "place1" : "places");
/** "1 stop" / "4 stops" — same shape as nPlaces, for a day's length in places. */
export const nStops = (n: number): string => n + " " + t(n === 1 ? "stop1" : "stops");

/** HTML-escape (retained for the few ported spots that build markup strings). */
export const esc = (s: unknown): string =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
