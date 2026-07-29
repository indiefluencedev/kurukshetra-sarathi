import { S } from "@/app/state";
import { I18N } from "./strings";
import type { Loc } from "@/shared/types";

/** Translate a UI string key for the current language (falls back to English, then the key). */
export const t = (k: string): string =>
  I18N[S.lang] && I18N[S.lang][k] != null
    ? I18N[S.lang][k]
    : I18N.en[k] != null
      ? I18N.en[k]
      : k;

/** Pick the current language from a bilingual object. */
export const nm = (o?: Loc | null): string => (o ? (o[S.lang] != null ? o[S.lang] : o.en) : "");

/** HTML-escape (retained for the few ported spots that build markup strings). */
export const esc = (s: unknown): string =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
