import { useEffect, useRef } from "react";
import { S } from "@/app/state";
import { go } from "@/app/nav";
import { t, nm } from "@/shared/i18n/i18n";
import { heroFor } from "@/data/reels-hero";
import { imgUrl } from "@/data/images";
import { byId } from "@/shared/lib/geo";
import { isoToday } from "@/shared/lib/datetime";
import { Icon } from "@/shared/icons/Icon";
import { useRail } from "./useRail";

/**
 * The eight must-see places, as a carousel that opens on a different one
 * each day.
 *
 * It was one photograph, chosen by the date. That was a deliberate move away
 * from an eight-slide auto-advancing rail — and it went a step too far: with
 * a single still image there was nothing on screen to say the other seven
 * existed, so seven-eighths of the curation was invisible and the picture read
 * as decoration rather than as something to look through.
 *
 * The compromise keeps both halves. The DATE still chooses, so the app opens
 * on a different place every morning and "Kurukshetra today" stays true — but
 * it chooses the starting slide of a rail you can swipe, with dots that say how
 * many there are. Nobody has to swipe; the day has already picked one.
 *
 * `useRail` is the same swipe / auto-advance / dots implementation the event
 * banner uses, including the rule that matters most here: once a finger has
 * touched the rail the auto-advance stops for good.
 */
export function HomeHero() {
  const trackRef = useRef<HTMLDivElement>(null);
  const dotsRef = useRef<HTMLDivElement>(null);
  useRail(trackRef, dotsRef, 7000);

  // Which one the day lands on. Stable for the whole day — a re-render must not
  // reshuffle the page under someone's thumb.
  const dayNo = Math.floor(Date.parse(isoToday() + "T00:00") / 864e5);
  // The town's own photographs, resolved once per render so the rail, the dots
  // and the day's starting slide all count the same list.
  const hero = heroFor();
  const start = ((dayNo % hero.length) + hero.length) % hero.length;

  // Open on the day's slide without animating there: jump before first paint,
  // so it is where the visitor finds it rather than something that slid past.
  useEffect(() => {
    const tr = trackRef.current;
    if (!tr || !start) return;
    tr.scrollLeft = start * tr.getBoundingClientRect().width;
  }, [start]);

  return (
    <div className="hh-c">
      <div className="hh-track" ref={trackRef}>
        {hero.map((h, i) => {
          const d = byId(h.id);
          if (!d) return null;
          return (
            <button
              key={h.id}
              className="hhero"
              onClick={() => go("/place/" + h.id)}
              aria-label={nm(d.name)}
            >
              <span className="hh-img">
                <img
                  src={imgUrl(h.img)}
                  alt=""
                  loading={i === start ? undefined : "lazy"}
                  onLoad={(e) => e.currentTarget.classList.add("in")}
                />
              </span>
              <span className="hh-scrim" />
              <span className="hh-body">
                <span className="hh-kick">
                  <Icon name="tara" />
                  {t("heroKick")}
                </span>
                <span className="hh-name" lang={S.lang}>
                  {nm(d.name)}
                </span>
                <span className="hh-fact" lang={S.lang}>
                  {nm(h.fact)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {/* Over the photograph, not under it: the plate below overlaps the foot of
          the hero, so dots beneath the image would sit behind the card. */}
      <div className="hh-dots" ref={dotsRef} aria-hidden="true">
        {hero.map((_, i) => (
          <i key={i} className={i === start ? "on" : ""} />
        ))}
      </div>
    </div>
  );
}
