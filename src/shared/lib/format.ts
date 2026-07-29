import { t } from "@/shared/i18n/i18n";

/** minutes → human duration using the current language's hr/min words. */
export function dur(m: number): string {
  m = Math.round(m);
  const h = Math.floor(m / 60),
    x = m % 60;
  if (h && x) return h + t("hr") + " " + x + t("min");
  if (h) return h + t("hr");
  return x + " " + t("min");
}
