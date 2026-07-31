import { useEffect } from "react";
import { S, store } from "@/app/state";
import { go } from "@/app/nav";
import { t, nm, nPlaces } from "@/shared/i18n/i18n";
import { THEMES } from "@/data/config";
import { D } from "@/data/destinations";
import { imgUrl } from "@/data/images";
import { Icon } from "@/shared/icons/Icon";
import { loadWeather } from "@/features/weather/weather";
import { WeatherChip } from "@/features/weather/WeatherChip";
import { TimeBlock } from "./TimeBlock";
import { HeroRail } from "./HeroRail";
import { HowToCard } from "./HowToCard";

export function Home() {
  useEffect(() => {
    loadWeather();
  }, []);

  return (
    <>
      <TimeBlock />

      {/* Search reads as the field it leads to, not as a 21px icon in the
          header. The weather + clock sit beside it — one row, both large. */}
      <div className="homerow">
        <button className="searchrow" onClick={() => go("/search")}>
          <Icon name="search" />
          <span lang={S.lang}>{nm({ en: "Search places", hi: "स्थान खोजें" })}</span>
        </button>
        <WeatherChip />
      </div>

      <HeroRail />

      <div className="sec">
        <div className="sec-head">
          <h2 lang={S.lang}>{t("themes")}</h2>
          <button className="link" onClick={() => go("/explore")}>
            {t("allPlaces")}
            <Icon name="fwd" />
          </button>
        </div>
        <div className="themes stagger">
          {THEMES.map((th) => {
            const n = D.filter((d) => d.themes.indexOf(th.id) >= 0).length;
            return (
              <button key={th.id} className="tile" onClick={() => go("/theme/" + th.id)}>
                <span className="tbg">
                  <img src={imgUrl(th.img)} alt="" loading="lazy" />
                </span>
                <span className="tveil" />
                <span className="ti">
                  <Icon name={th.icon} />
                </span>
                <span className="tl" lang={S.lang}>
                  {nm(th)}
                </span>
                <span className="tc">{nPlaces(n)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Reels are contextual — they live on the place they were filmed at, not
          here. The install prompt lives in Settings. The walkthrough shows only
          until the visitor has built their first route. */}
      {!store.routes.length && <HowToCard />}

      <div className="note" style={{ marginBottom: 10, alignItems: "center" }}>
        <Icon name="info" />
        <span>
          {t("estimates")}{" "}
          <button className="link" onClick={() => go("/credits")}>
            {t("srcHead")}
          </button>
        </span>
      </div>
    </>
  );
}
