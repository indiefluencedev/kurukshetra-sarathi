import { S, store, bump, setLangStay } from "@/app/state";
import { go } from "@/app/nav";
import { t, nm } from "@/shared/i18n/i18n";
import { Icon } from "@/shared/icons/Icon";
import { isStandalone, installApp } from "@/features/home/install";
import type { Loc } from "@/shared/types";

const SIZES: [number, string, Loc][] = [
  [0, "A", { en: "Normal", hi: "सामान्य" }],
  [1, "A", { en: "Large", hi: "बड़ा" }],
  [2, "A", { en: "Largest", hi: "सबसे बड़ा" }],
];

export function Settings() {
  return (
    <>
      <div className="phead">
        <button className="back" onClick={() => history.back()} aria-label={t("back")}>
          <Icon name="back" />
        </button>
        <h1 className="display" lang={S.lang}>
          {t("settings")}
        </h1>
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <div
          style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: 14, borderBottom: "1px solid var(--stone)", gap: 10,
          }}
        >
          <b style={{ fontSize: "calc(14.5px*var(--ts))" }}>{t("language")}</b>
          <div className="wrap">
            <button className={"chip" + (S.lang === "en" ? " on" : "")} onClick={() => setLangStay("en")}>
              English
            </button>
            <button className={"chip" + (S.lang === "hi" ? " on" : "")} onClick={() => setLangStay("hi")} lang="hi">
              हिन्दी
            </button>
          </div>
        </div>
        <div style={{ padding: 14 }}>
          <b style={{ fontSize: "calc(14.5px*var(--ts))" }} lang={S.lang}>
            {t("bigText")}
          </b>
          <div className="muted" style={{ fontSize: "calc(13px*var(--ts))", marginBottom: 11 }}>
            {t("bigTextD")}
          </div>
          <div className="tsize">
            {SIZES.map((o) => (
              <button
                key={o[0]}
                className={store.ts === o[0] ? "on" : ""}
                onClick={() => {
                  store.ts = o[0];
                  bump();
                }}
              >
                <i style={{ fontSize: 14 + o[0] * 5 }}>{o[1]}</i>
                <span>{nm(o[2])}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {!isStandalone() && (
        <button className="card rcard" style={{ marginTop: 11 }} onClick={installApp}>
          {/* "phone" is not in the icon set — it rendered an empty box */}
          <span className="ic">
            <Icon name="download" />
          </span>
          <span style={{ flex: 1 }}>
            <h3>{t("dlTitle")}</h3>
            <p>{t("dlSub")}</p>
          </span>
          <span style={{ color: "var(--stone-2)", display: "grid", placeItems: "center" }}>
            <Icon name="fwd" />
          </span>
        </button>
      )}

      <button className="card rcard" style={{ marginTop: 11 }} onClick={() => go("/credits")}>
        <span className="ic">
          <Icon name="granth" />
        </span>
        <span style={{ flex: 1 }}>
          <h3>{t("credits")}</h3>
          <p>{t("srcHead")}</p>
        </span>
        <span style={{ color: "var(--stone-2)", display: "grid", placeItems: "center" }}>
          <Icon name="fwd" />
        </span>
      </button>

      <div className="blk">
        <h2 style={{ fontSize: "calc(17px*var(--ts))" }} lang={S.lang}>
          {t("about")}
        </h2>
        <p className="prose" style={{ fontSize: "calc(13.5px*var(--ts))" }}>
          {t("aboutD")}
        </p>
      </div>
    </>
  );
}
