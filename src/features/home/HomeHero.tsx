import { S } from "@/app/state";
import { go } from "@/app/nav";
import { nm } from "@/shared/i18n/i18n";
import { HERO } from "@/data/reels-hero";
import { imgUrl } from "@/data/images";
import { byId } from "@/shared/lib/geo";
import { isoToday } from "@/shared/lib/datetime";
import { Icon } from "@/shared/icons/Icon";

/**
 * One photograph, chosen by the date. Not a carousel.
 *
 * The must-see rail that used to open Home held eight 4/5 slides on an
 * auto-advance. Two things were wrong with it. A carousel says "we could not
 * decide which of these matters" — the opposite of what a guide is for — and
 * almost nobody swipes past slide two, so seven of the eight were decoration
 * that cost bytes and attention. One image, changing daily, says "this is
 * Kurukshetra today", which is a claim worth making.
 *
 * The rotation is the day-of-year modulo the list, so it is stable for the
 * whole day (a re-render must not reshuffle the page under someone's thumb)
 * and needs no state, no timer and no stored index.
 */
export function HomeHero() {
  const iso = isoToday();
  const dayNo = Math.floor(Date.parse(iso + "T00:00") / 864e5);
  const h = HERO[((dayNo % HERO.length) + HERO.length) % HERO.length];
  const d = h && byId(h.id);
  if (!h || !d) return null;

  return (
    <button className="hhero" onClick={() => go("/place/" + h.id)} aria-label={nm(d.name)}>
      <span className="hh-img">
        <img src={imgUrl(h.img)} alt="" onLoad={(e) => e.currentTarget.classList.add("in")} />
      </span>
      <span className="hh-scrim" />
      <span className="hh-body">
        <span className="hh-kick">
          <Icon name="tara" />
          {nm({ en: "Kurukshetra today", hi: "कुरुक्षेत्र आज" })}
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
}
