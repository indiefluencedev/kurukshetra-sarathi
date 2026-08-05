import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { S, store, setCityQuiet } from "@/app/state";
import { track } from "@/app/nav";
import { t, nm } from "@/shared/i18n/i18n";
import { dur } from "@/shared/lib/format";
import { distTo, byId, navTo } from "@/shared/lib/geo";
import { theme, shownThemes, PHOTO_CREDIT } from "@/data/config";
import { cityOf } from "@/data/cities";
import { Icon } from "@/shared/icons/Icon";
import { Photo } from "@/shared/ui/Photo";
import { StatusPill, Fcard } from "@/shared/ui/PlaceCard";
import { ReelsRail } from "@/features/home/ReelsRail";
import { eventsAt } from "@/data/events";
import { isoToday } from "@/shared/lib/datetime";
import { shortDate, planForEvent } from "@/features/planner/plan";
import { FAC, DY, near, flipFav } from "./place-actions";
import { addTo } from "./AddSheet";
import type { ReactNode } from "react";

/**
 * The fee as one word.
 *
 * `d.fee` is a full sentence — "No entry fee", "Ticketed; rates vary by day,
 * book online", "Free; the tomb next door is ticketed". Useful, and far too
 * long to set as a headline number, so the strip says which of the two things
 * it is and the table below keeps every word.
 */
const feeShort = (fee?: { en: string; hi: string }): string => {
  if (!fee) return "—";
  const free = /^(free|no entry|no charge)/i.test(fee.en);
  return nm(free ? { en: "Free", hi: "निःशुल्क" } : { en: "Ticketed", hi: "टिकट" });
};

/** Opening hours, minus the leading zeros. "00:00–23:59" means all day. */
const hoursShort = (h?: { o: string; c: string }): string => {
  if (!h) return "—";
  if (h.o === "00:00" && h.c === "23:59") return nm({ en: "All day", hi: "पूरे दिन" });
  const trim = (s: string) => s.replace(/^0/, "");
  return trim(h.o) + "–" + trim(h.c);
};

export function Place() {
  const { id = "" } = useParams();
  const d = byId(id);
  /* A place reached from search, from a saved list, or from a shared link may
     belong to the other town. Follow it, rather than showing its page under a
     header that names somewhere else — and quietly, because arriving at a page
     is not a reason to tear up a half-built plan. */
  useEffect(() => {
    if (d) setCityQuiet(cityOf(d));
  }, [d]);
  if (!d)
    return (
      <div className="empty">
        <Icon name="search" />
        <p className="t">{t("nothing")}</p>
      </div>
    );

  const fav = store.favs.indexOf(id) >= 0;
  const on = !!(S.plan && S.plan.res && (S.plan.res.stops as any[]).some((s) => s.d.id === id));
  const shut =
    d.closed && d.closed.length
      ? d.closed.map((i) => (S.lang === "hi" ? DY[i][1] : DY[i][0])).join(", ")
      : t("openAll");
  const cr = d.img ? PHOTO_CREDIT[d.img] : undefined;
  // a real <dl>: each fact is a term and its value, not two spans that happen
  // to sit next to each other
  const row = (k: string, v: ReactNode) => (
    <div className="frow">
      <dt className="k">{k}</dt>
      <dd className="v">{v}</dd>
    </div>
  );
  track("place", { id });

  return (
    <>
      <div className="hero">
        <Photo d={d} />
        <div className="grad" />
        <button className="fbtn b-back" onClick={() => history.back()} aria-label={t("back")}>
          <Icon name="back" />
        </button>
        <button className="fbtn b-fav" onClick={() => flipFav(id)} aria-label={t("save")}>
          <Icon name={fav ? "heartf" : "heart"} />
        </button>
        {cr && (
          <span className="credit">
            {t("photoBy")}: {cr.author} · {cr.licence}
          </span>
        )}

        {/* The name belongs ON the photograph. 06-design-system.md asks for
            "title inside image" over a bottom gradient and `.hero .grad` was
            already drawing that gradient — the title just wasn't using it, so
            the most photographic screen in the app opened on a cropped picture
            followed by a heading floating on cream. */}
        <div className="hero-cap">
          <h1 lang={S.lang}>{S.lang === "hi" ? d.name.hi : d.name.en}</h1>
          <div className="alt" lang={S.lang === "hi" ? "en" : "hi"}>
            {S.lang === "hi" ? d.name.en : d.name.hi}
          </div>
        </div>
      </div>

      <div className="dtitle">
        <div className="wrap" style={{ marginBottom: 10 }}>
          {shownThemes(d.themes)
            .slice(0, 3)
            .map((x) => {
              const th = theme(x)!;
              return (
                <span className="tag" key={x}>
                  <Icon name={th.icon} />
                  {nm(th)}
                </span>
              );
            })}
        </div>
        <div className="dmeta">
          <StatusPill d={d} />
          <span className="tag">
            <Icon name="pin" />
            {distTo(d)} {t("km")} {t("away")}
          </span>
          {on && (
            <span className="tag brass">
              <Icon name="check" />
              {t("inRoute")}
            </span>
          )}
          {d.pending && (
            <span className="tag brass">
              <Icon name="info" />
              {t("pinPending")}
            </span>
          )}
        </div>
      </div>

      {/* An event at this place, near the top, because it changes everything
          the rest of the page says — how long the visit takes, how the road
          behaves, whether it is worth coming at all on that day. Tapping it
          starts a plan built around it. */}
      {eventsAt(id, isoToday()).map((e) => {
        const live = e.from <= isoToday();
        return (
          <button key={e.id} className={"evcard" + (live ? " live" : "")} onClick={() => planForEvent(e)}>
            <span className="ic">
              <Icon name="diya" />
            </span>
            <span className="bd">
              <b lang={S.lang}>{nm(e.name)}</b>
              <i lang={S.lang}>
                {live
                  ? nm({ en: "Happening now · until " + shortDate(e.to), hi: "अभी चल रहा है · " + shortDate(e.to) + " तक" })
                  : shortDate(e.from) + (e.from === e.to ? "" : " – " + shortDate(e.to))}
              </i>
              <span lang={S.lang}>{nm(e.notice)}</span>
            </span>
            <span className="go">
              <Icon name="fwd" />
            </span>
          </button>
        );
      })}

      {/* The three numbers that decide whether you go, and when.
          They were scattered: how-long was a 13px grey pill in the tag row,
          entry was row three of a seven-row table two screens down, and the
          hours were row one of it. A visitor standing at the gate wants
          exactly these, and they are the substance of the page — so they are
          set like it. The full sentences ("Ticketed; rates vary by day, book
          online") stay in the table below; this is the headline. */}
      <div className="pfacts">
        <div className="pf">
          <b className="tnum">{dur(d.visit.rec)}</b>
          {/* not t("howLong") — "How long to spend" wraps to two lines here and
              leaves this cell taller than its neighbours */}
          <span>{nm({ en: "How long", hi: "कितना समय" })}</span>
        </div>
        <div className="pf">
          <b>{feeShort(d.fee)}</b>
          <span>{t("entry")}</span>
        </div>
        <div className="pf">
          <b className="tnum">{hoursShort(d.hours)}</b>
          <span>{t("hours")}</span>
        </div>
      </div>

      {/* "Late afternoon into the evening aarti" — a time said as an event
          rather than a clock reading, which is the most relatable line on the
          page. It was a whole card; it only ever needed to be a sentence, and
          it no longer repeats itself in the table below. */}
      <p className="pbest" lang={S.lang}>
        <Icon name="surya" />
        <span>
          <b>{t("bestTime")}:</b> {nm(d.best)}
        </span>
      </p>

      <div className="blk">
        <h2 lang={S.lang}>
          <Icon name="granth" />
          {t("whyMatters")}
        </h2>
        <div className="prose" lang={S.lang}>
          <p>{nm(d.why)}</p>
        </div>
      </div>

      {d.inside && d.inside.length > 0 && (
        <div className="blk">
          <h2 lang={S.lang}>
            <Icon name="kila" />
            {t("within")}
          </h2>
          <div className="inside">
            {d.inside.map((x, i) => (
              <div className="ins" key={i}>
                <span className="n">{i + 1}</span>
                <span>
                  <b lang={S.lang}>{nm(x.n)}</b>
                  <p>{nm(x.d)}</p>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {d.notice && d.notice.length > 0 && (
        <div className="blk">
          <h2 lang={S.lang}>
            <Icon name="eye" />
            {t("worthKnowing")}
          </h2>
          <div className="ncards">
            {d.notice.map((x, i) => (
              <div className="ncard" key={i}>
                <b>{nm(x.t)}</b>
                <p>{nm(x.d)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="blk">
        <h2 lang={S.lang}>
          <Icon name="clock" />
          {t("planning")}
        </h2>
        <dl className="facts">
          {row(t("hours"), d.hours ? d.hours.o + " – " + d.hours.c : "—")}
          {row(t("closedOn"), shut)}
          {row(t("entry"), nm(d.fee))}
          {row(t("howLong"), dur(d.visit.min) + " – " + dur(d.visit.max))}
          {/* best time is said once, above, in words — not repeated here */}
          {row(t("parking"), nm(d.parking))}
          {row(t("access"), d.senior ? t("stepFree") : "—")}
        </dl>
      </div>

      {d.facilities && d.facilities.length > 0 && (
        <div className="blk">
          <h2 lang={S.lang}>
            <Icon name="check" />
            {t("facilities")}
          </h2>
          <div className="wrap">
            {d.facilities.map((f) => (
              <span className="tag" key={f}>
                <Icon name="check" />
                {nm(FAC[f] || { en: f, hi: f })}
              </span>
            ))}
          </div>
        </div>
      )}

      <ReelsRail pid={d.id} />

      <div className="blk">
        <h2 lang={S.lang}>
          <Icon name="pin" />
          {t("nearby")}
        </h2>
        <div className="rail">
          {near(d).map((x) => (
            <Fcard key={x.id} d={x} />
          ))}
        </div>
      </div>

      <div className="dockbar-space" />
      <div className="dockbar">
        {d.pending ? (
          <div className="note" style={{ flex: 1 }}>
            <Icon name="info" />
            <span>{t("pinPendingD")}</span>
          </div>
        ) : (
          <>
            <button className="btn nav" style={{ flex: 1 }} onClick={() => navTo(id)}>
              <Icon name="navigate" />
              {t("navigate")}
            </button>
            <button className="btn primary" style={{ flex: 1 }} onClick={() => addTo(id)}>
              <Icon name={on ? "check" : "route"} />
              {on ? t("inPlan") : t("addPlan")}
            </button>
          </>
        )}
      </div>
    </>
  );
}
