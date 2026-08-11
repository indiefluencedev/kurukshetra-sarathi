import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { S } from "@/app/state";
import { go } from "@/app/nav";
import { t, nm } from "@/shared/i18n/i18n";
import { Icon } from "@/shared/icons/Icon";
import { Pcard } from "@/shared/ui/PlaceCard";
import { eventById } from "@/data/events";
import { imgUrl } from "@/data/images";
import { byId } from "@/shared/lib/geo";
import { cityOf } from "@/data/cities";
import { setCityQuiet } from "@/app/state";
import { isoToday, daysBetween } from "@/shared/lib/datetime";
import { shortDate, planForEvent } from "@/features/planner/plan";
import type { EventDef } from "@/data/events";

/**
 * One event, and what a visitor can do about it.
 *
 * Tapping an event used to go straight into the planner with the date filled
 * in. That is one of the two things somebody wants, and it was offered as if
 * it were the only one: a person who has just seen "Janmashtami, in 24 days"
 * is deciding *whether* to come, and the app answered by asking how long they
 * have. This screen is the question in between — what it is, where it is, and
 * only then what to do.
 *
 * ── Why the places are cards and not a route ──────────────────────────────
 *
 * An event at five temples is not a journey. There is no road joining them;
 * which ones a visitor picks depends on where they are staying and how long
 * they have, and the planner already works that out properly from the road
 * matrix. Drawing a line through the five would be drawing a road that does
 * not exist — see docs/tasks/2026-08-11.
 *
 * So the places are offered as a choice, each its own card, each one tappable
 * through to the place it names. Choosing is the visitor's job; ordering is
 * the planner's.
 */

/** The countdown, which is the fact that decides anything. */
function when(e: EventDef, today: string): string {
  if (e.from <= today) {
    if (e.to === today) return nm({ en: "Happening now · last day", hi: "अभी चल रहा है · अंतिम दिन" });
    return nm({ en: "Happening now · until ", hi: "अभी चल रहा है · " }) +
      shortDate(e.to) + nm({ en: "", hi: " तक" });
  }
  const d = daysBetween(today, e.from);
  const lead = d === 1 ? nm({ en: "Tomorrow", hi: "कल" }) : nm({ en: "In " + d + " days", hi: d + " दिन में" });
  return lead + " · " + shortDate(e.from);
}

export function Event() {
  const { id = "" } = useParams();
  const e = eventById(id);
  const today = isoToday();

  /* An event reached from a shared link may be in the other town. Follow it
     quietly, exactly as a place does — arriving at a page is not a reason to
     tear up a half-built plan. */
  const first = e && e.places.length ? byId(e.places[0]) : undefined;
  useEffect(() => {
    if (first) setCityQuiet(cityOf(first));
  }, [first]);

  if (!e)
    return (
      <div className="empty">
        <Icon name="search" />
        <p className="t">{t("nothing")}</p>
      </div>
    );

  // The banner if the Board set one, else the face of the place it happens at
  // — the same fallback the home rail uses, so the two never disagree.
  const img = imgUrl(e.img) || imgUrl(first?.img);
  const live = e.from <= today;
  const places = e.places.map((p) => byId(p)).filter(Boolean) as NonNullable<ReturnType<typeof byId>>[];
  const avoid = e.advice === "avoid";

  return (
    <>
      <div className="hero ev-hero">
        <button className="back fbtn" onClick={() => history.back()} aria-label={t("back")}>
          <Icon name="back" />
        </button>
        {img && <img src={img} alt="" />}
        <span className="grad" />
        <div className="hero-cap">
          <span className="ev-kick">
            {live && <i className="ev-dot" aria-hidden="true" />}
            <span>{when(e, today)}</span>
          </span>
          <h1 lang={S.lang}>{nm(e.name)}</h1>
          <div className="alt" lang={S.lang === "hi" ? "en" : "hi"}>
            {S.lang === "hi" ? e.name.en : e.name.hi}
          </div>
        </div>
      </div>

      <div className="dtitle">
        <p className="lead" lang={S.lang}>
          {nm(e.blurb)}
        </p>

        {/* The warning is the most useful sentence on the page for anyone who
            lives here, so it is not folded into the prose. `avoid` events get
            the shut colour: "stay away from this road" and "worth going to"
            must not look the same. */}
        {e.notice && (
          <div className={"ev-notice" + (avoid ? " avoid" : "")} lang={S.lang}>
            <Icon name={avoid ? "bell" : "info"} />
            <span>{nm(e.notice)}</span>
          </div>
        )}

        {e.window && (
          <p className="muted" lang={S.lang}>
            {nm({ en: "Hours it runs: ", hi: "समय: " })}
            <b>
              {e.window.from}–{e.window.to}
            </b>
          </p>
        )}
      </div>

      {/* The choice. Not a route — see the header of this file. */}
      {places.length > 0 && (
        <div className="sec ev-where">
          {/* Not `.sec-head`: that is a flex row built for "heading … link",
              so a paragraph put in it became a second column and squeezed the
              heading into a stack with a full-size icon on top of it. */}
          <h2 className="ev-wh" lang={S.lang}>
            {nm({ en: "Where it happens", hi: "यह कहाँ होता है" })}
            <span className="n">{places.length}</span>
          </h2>
          <p className="ev-whsub" lang={S.lang}>
            {places.length === 1
              ? nm({
                  en: "Tap to read about it, or add it to your day.",
                  hi: "पढ़ने या अपने दिन में जोड़ने के लिए दबाएँ।",
                })
              : nm({
                  en: "Pick the ones you want. The planner works out the order and the timings.",
                  hi: "जो चाहें चुनें। क्रम और समय योजना खुद तय करेगी।",
                })}
          </p>

          {/* STACKED, not a rail.
              A rail is for browsing, and this is not browsing — it is choosing
              between five temples on one night. A horizontal scroller hides
              options three to five behind a swipe and makes comparing any two
              of them impossible, which is the only thing the reader is here to
              do. Pcard is the card built for that: it carries the distance and
              the open state, which are what actually decide it. */}
          <div className="ev-places">
            {places.map((d) => (
              <Pcard key={d.id} d={d} />
            ))}
          </div>
        </div>
      )}

      {/* The actions, at the bottom: they are the answer to the page, not the
          question. "Plan around it" is exactly what the home card used to do
          on its own — it is still one tap, just one tap later, after the page
          has said what the event is. */}
      <div className="ev-acts">
        <button className="btn primary" onClick={() => planForEvent(e)}>
          <Icon name="cal" />
          {nm({ en: "Plan around it", hi: "इसके अनुसार योजना बनाएँ" })}
        </button>
        <button className="btn ghost" onClick={() => go("/plan")}>
          {nm({ en: "Plan a different day", hi: "किसी और दिन की योजना" })}
        </button>
      </div>
    </>
  );
}
