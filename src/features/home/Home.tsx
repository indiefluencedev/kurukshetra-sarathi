import { useEffect } from "react";
import { S } from "@/app/state";
import { go } from "@/app/nav";
import { t, nm } from "@/shared/i18n/i18n";
import { THEMES } from "@/data/config";
import { D } from "@/data/destinations";
import { imgUrl } from "@/data/images";
import { Icon } from "@/shared/icons/Icon";
import { loadWeather } from "@/features/weather/weather";
import { TimeBlock } from "./TimeBlock";
import { HeroRail } from "./HeroRail";
import { ReelsRail } from "./ReelsRail";
import { HowToCard } from "./HowToCard";
import { InstallCard } from "./install";

export function Home() {
  useEffect(() => {
    loadWeather();
  }, []);

  return (
    <>
      <TimeBlock />
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
                <span className="tc">
                  {n} {t("places")}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <ReelsRail pid={null} />
      <HowToCard />
      <InstallCard />

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
