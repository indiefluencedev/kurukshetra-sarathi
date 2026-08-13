import { useEffect } from "react";
import { S } from "@/app/state";
import { go } from "@/app/nav";
import { t, nm, nPlaces } from "@/shared/i18n/i18n";
import { themesHere } from "@/data/destinations";
import { imgUrl } from "@/data/images";
import { Icon } from "@/shared/icons/Icon";
import { loadWeather } from "@/features/weather/weather";
import { HomeHero } from "./HomeHero";
import { TodayStrip } from "./TodayStrip";
import { TimeBlock } from "./TimeBlock";
import { StartHere } from "./StartHere";
import { EventRail } from "./EventRail";
import { EventAlert } from "./EventAlert";
import { HowToCard } from "./HowToCard";
import { InstallCard } from "./install";
import { NotifyCard } from "@/features/notify/NotifyCard";

/**
 * Home, in the order a visit actually happens.
 *
 * The old order opened on a form — "How long do you have in Kurukshetra?" with
 * six pills — then stacked two carousels on top of a theme grid. It was the
 * right question asked before any reason to answer it, and two carousels is
 * roughly seven swipes of decoration between the visitor and what they came for.
 *
 *   1  one photograph of Kurukshetra today          — why you came
 *   2  the question, overlapping it                 — the app's one job
 *   3  today: date, heat, when the light goes       — where you are standing
 *   4  what is on, only when something is           — news, if there is news
 *   5  three routes a guide would suggest           — the recommendation
 *   6  browse by theme                              — the escape hatch
 *
 * The plate at (2) sits half on the photograph deliberately: the image earns
 * the screen, and the primary action still lands above the fold on a small
 * phone. Someone standing at a bus stand must not have to scroll to plan.
 */
export function Home() {
  useEffect(() => {
    loadWeather();
  }, []);

  return (
    <>
      <div className="hh-wrap">
        <HomeHero />
        <TimeBlock />
      </div>

      <TodayStrip />

      {/* Directly above "Start here", because for someone who lives here the
          question is not "what is Kurukshetra" — it is "what is on". Ninety
          days, not three weeks: a resident plans around a mela weeks out, and
          the rail sorts ongoing first so today always leads. */}
      <EventAlert />

      {/* Under the event surfaces on purpose: by this point the visitor has
          seen what "an event" means here, so the offer to be told about them
          is a follow-on rather than a cold interruption. Renders nothing after
          it has been answered once. */}
      <NotifyCard />

      <EventRail />

      <StartHere />

      <div className="sec">
        <div className="sec-head">
          <h2 lang={S.lang}>{t("themes")}</h2>
          <button className="link" onClick={() => go("/explore")}>
            {t("allPlaces")}
            <Icon name="fwd" />
          </button>
        </div>
        <div className="themes stagger">
          {themesHere().map(({ th, n }) => {
            return (
              <button key={th.id} className="tile" onClick={() => go("/theme/" + th.id)}>
                <span className="tbg">
                  <img src={imgUrl(th.img)} alt="" loading="lazy" decoding="async" />
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

      {/* Two install prompts on one screen is one too many. The slim bar that
          used to take this slot after a route was saved has gone: the card
          below says the same thing, permanently and better, so the bar was
          only ever going to appear beneath it and repeat it. */}
      <HowToCard />
      <InstallCard />
    </>
  );
}
