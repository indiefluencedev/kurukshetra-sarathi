import { useRef } from "react";
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
  /**
   * The day's pick is put FIRST, rather than the rail being scrolled to it.
   *
   * This used to open at index 0 and then set `scrollLeft` in a mount effect to
   * land on the day's slide. The effect's own comment promised a jump "before
   * first paint" — but `.hh-track` carries `scroll-behavior:smooth`, which
   * applies to programmatic scrolling too, so the assignment ANIMATED. Every
   * cold open raced the rail from the first photograph to the day's one; on a
   * day that landed near the end of the list that read as the app scrolling
   * itself to the last slide for no reason, which is exactly what it looked
   * like because that is what it was doing.
   *
   * Rotating the list is the same feature with nothing to animate: the day
   * still chooses which photograph greets you, the rail opens at rest at
   * scrollLeft 0, the first dot is lit, and a swipe walks forward through all
   * of them. The smooth behaviour stays where it was wanted — the 7-second
   * auto-advance.
   */
  const all = heroFor();
  const pick = ((dayNo % all.length) + all.length) % all.length;
  const hero = all.slice(pick).concat(all.slice(0, pick));

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
                  loading={i === 0 ? undefined : "lazy"}
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
          <i key={i} className={i === 0 ? "on" : ""} />
        ))}
      </div>
    </div>
  );
}
