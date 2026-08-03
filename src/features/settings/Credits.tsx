import { S } from "@/app/state";
import { t } from "@/shared/i18n/i18n";
import { PHOTO_CREDIT } from "@/data/config";
import { Icon } from "@/shared/icons/Icon";

/** Sources and photo credits. */
export function Credits() {
  const keys = Object.keys(PHOTO_CREDIT);
  return (
    <>
      <div className="phead">
        <button className="back" onClick={() => history.back()} aria-label={t("back")}>
          <Icon name="back" />
        </button>
        <h1 className="display" lang={S.lang}>
          {t("credits")}
        </h1>
      </div>

      <div className="blk">
        <h2 style={{ fontSize: "calc(17px*var(--ts))" }} lang={S.lang}>
          <Icon name="granth" />
          {t("srcHead")}
        </h2>
        <p className="prose" style={{ fontSize: "calc(13.5px*var(--ts))" }}>
          {t("srcText")}
        </p>
      </div>

      <div className="blk">
        <h2 style={{ fontSize: "calc(17px*var(--ts))" }} lang={S.lang}>
          <Icon name="eye" />
          {t("photoHead")}
        </h2>
        <p className="prose" style={{ fontSize: "calc(13.5px*var(--ts))", marginBottom: 12 }}>
          {t("photoText")}
        </p>
        <div className="facts">
          {keys.map((k) => {
            const c = PHOTO_CREDIT[k];
            return (
              <div className="frow" key={k}>
                <span className="k" style={{ flex: 1, textAlign: "left" }}>
                  {k.replace(/-/g, " ")}
                </span>
                <span className="v" style={{ fontWeight: 500, fontSize: "calc(13px*var(--ts))" }}>
                  {c.author || "—"}
                  <br />
                  <span className="muted">{c.licence}</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="note" style={{ marginBottom: 12 }}>
        <Icon name="info" />
        <span>
          {t("estimates")} {t("gAttr")}
        </span>
      </div>
    </>
  );
}
