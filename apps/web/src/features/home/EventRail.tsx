import { useRef } from "react";
import { S } from "@/app/state";
import { nm } from "@/shared/i18n/i18n";
import { ongoing, upcoming, type EventDef } from "@/data/events";
import { imgUrl } from "@/data/images";
import { byId } from "@/shared/lib/geo";
import { isoToday, daysBetween } from "@/shared/lib/datetime";
import { shortDate, planForEvent } from "@/features/planner/plan";
import { Icon } from "@/shared/icons/Icon";
import { useRail } from "./useRail";

/** The icon each kind of event wears. */
const KIND_ICON: Record<string, string> = {
  festival: "diya",
  snan: "kalash",
  show: "reel",
  mela: "chakra",
};

/**
 * The kicker: what this event is, in time, right now.
 *
 * A countdown rather than a date on its own, because "in 3 days" is a decision
 * and "10 December" is homework. The date is still there — a pilgrim booking a
 * train needs it — just second.
 */
function kicker(e: EventDef, today: string): string {
  if (e.from <= today) {
    if (e.to === today) return nm({ en: "Happening now · last day", hi: "अभी चल रहा है · अंतिम दिन" });
    const end = shortDate(e.to);
    return nm({ en: "Happening now · until " + end, hi: "अभी चल रहा है · " + end + " तक" });
  }
  const d = daysBetween(today, e.from);
  const when =
    d === 1 ? nm({ en: "Tomorrow", hi: "कल" }) : nm({ en: "In " + d + " days", hi: d + " दिन में" });
  return when + " · " + shortDate(e.from);
}

/**
 * Events on the home screen — ongoing first, then upcoming, nearest first.
 *
 * It sits above the must-see carousel because a mela happening this week
 * outranks the evergreen list, and it renders nothing at all when the calendar
 * is empty: an empty rail with a heading is worse than no rail.
 */
export function EventRail() {
  const trackRef = useRef<HTMLDivElement>(null);
  const dotsRef = useRef<HTMLDivElement>(null);
  useRail(trackRef, dotsRef, 6500);

  const today = isoToday();
  const list = [...ongoing(today), ...upcoming(today)];
  if (!list.length) return null;

  return (
    <div className="sec ev-sec">
      <div className="sec-head">
        <h2 lang={S.lang}>{nm({ en: "What's on", hi: "क्या चल रहा है" })}</h2>
      </div>

      <div className="ev-c">
        <div className="ev-track" ref={trackRef}>
          {list.map((e) => {
            const live = e.from <= today;
            // no event photos yet, so the card wears the face of the place it
            // happens at — the ghat the visitor will actually be standing on
            const img = imgUrl(e.img) || imgUrl(byId(e.places[0])?.img);
            return (
              <button
                key={e.id}
                className={"ev-slide" + (live ? " live" : "")}
                onClick={() => planForEvent(e)}
                aria-label={
                  nm(e.name) + " — " + kicker(e, today) + ". " + nm({ en: "Plan a visit", hi: "यात्रा की योजना बनाएँ" })
                }
              >
                <span className="ev-img">{img && <img src={img} alt="" loading="lazy" />}</span>
                <span className="ev-scrim" />
                <span className="ev-body">
                  <span className="ev-kick">
                    {live && <i className="ev-dot" aria-hidden="true" />}
                    <Icon name={KIND_ICON[e.kind] || "diya"} />
                    <span>{kicker(e, today)}</span>
                  </span>
                  <span className="ev-name" lang={S.lang}>
                    {nm(e.name)}
                  </span>
                  <span className="ev-blurb" lang={S.lang}>
                    {nm(e.blurb)}
                  </span>
                  <span className="ev-cta">
                    {nm({ en: "Plan around it", hi: "इसके अनुसार योजना बनाएँ" })}
                    <Icon name="fwd" />
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        {list.length > 1 && (
          <div className="ev-dots" ref={dotsRef}>
            {list.map((e, i) => (
              <i key={e.id} className={i ? "" : "on"} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
