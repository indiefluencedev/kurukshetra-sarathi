import type { ReactNode } from "react";
import { S, flipLang } from "@/app/state";
import { go } from "@/app/nav";
import { t } from "@/shared/i18n/i18n";
import { CONFIG } from "@/data/config";
import { Icon } from "@/shared/icons/Icon";
import { askLoc } from "@/features/location/location";

/** The hub: how the visitor wants to begin (plan / highlights / browse / near me). */
export function Begin() {
  const card = (ic: string, cls: string, ti: string, de: string, fn: () => void): ReactNode => (
    <button className="hubcard" onClick={fn}>
      <span className={"ic " + cls}>
        <Icon name={ic} />
      </span>
      <span style={{ minWidth: 0 }}>
        <h3 lang={S.lang}>{ti}</h3>
        <p>{de}</p>
      </span>
      <span className="go">
        <Icon name="fwd" />
      </span>
    </button>
  );

  return (
    <div className="screen" style={{ padding: "18px 16px calc(30px + env(safe-area-inset-bottom))" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 26 }}>
        <span className="seal" style={{ width: 40, height: 40 }}>
          <Icon name="rath" />
        </span>
        <div>
          <div className="eyebrow">{CONFIG.brand.sub}</div>
          <div className="display" style={{ fontSize: "calc(19px*var(--ts))" }} lang={S.lang}>
            {S.lang === "hi" ? CONFIG.brand.hi : CONFIG.brand.en}
          </div>
        </div>
        <span style={{ flex: 1 }} />
        <button className="langbtn" onClick={flipLang}>
          {S.lang === "hi" ? "हिन्दी" : "ENG"}
        </button>
      </div>
      <h1 className="display" style={{ fontSize: "calc(25px*var(--ts))", lineHeight: 1.22, marginBottom: 20 }} lang={S.lang}>
        {t("howExplore")}
      </h1>
      <div className="hub stagger">
        {card("route", "", t("planVisit"), t("planVisitD"), () => go("/plan"))}
        {card("tara", "brass", t("highlights"), t("highlightsD"), () => go("/explore"))}
        {card("compass", "slate", t("browse"), t("browseD"), () => go("/explore"))}
        {card("pin", "slate", t("nearMe"), t("nearMeD"), () => askLoc(() => go("/map")))}
      </div>
    </div>
  );
}
