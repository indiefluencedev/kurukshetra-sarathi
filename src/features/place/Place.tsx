import { useParams } from "react-router-dom";
import { S, store } from "@/app/state";
import { track } from "@/app/nav";
import { t, nm } from "@/shared/i18n/i18n";
import { dur } from "@/shared/lib/format";
import { distTo, byId, navTo } from "@/shared/lib/geo";
import { theme, shownThemes, PHOTO_CREDIT } from "@/data/config";
import { Icon } from "@/shared/icons/Icon";
import { Photo } from "@/shared/ui/Photo";
import { StatusPill, Fcard } from "@/shared/ui/PlaceCard";
import { ReelsRail } from "@/features/home/ReelsRail";
import { FAC, DY, near, flipFav, addTo } from "./place-actions";
import type { ReactNode } from "react";

export function Place() {
  const { id = "" } = useParams();
  const d = byId(id);
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
  const row = (k: string, v: ReactNode) => (
    <div className="frow">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
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
        <h1 lang={S.lang}>{S.lang === "hi" ? d.name.hi : d.name.en}</h1>
        <div className="alt" lang={S.lang === "hi" ? "en" : "hi"}>
          {S.lang === "hi" ? d.name.en : d.name.hi}
        </div>
        <div className="dmeta">
          <StatusPill d={d} />
          <span className="tag">
            <Icon name="clock" />
            {dur(d.visit.rec)}
          </span>
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

      <div className="card" style={{ padding: 13, display: "flex", gap: 12, alignItems: "flex-start", marginTop: 4 }}>
        <span style={{ color: "var(--brass)", flex: "0 0 auto", marginTop: 1 }}>
          <Icon name="surya" style={{ width: 19, height: 19 }} />
        </span>
        <span>
          <b style={{ fontSize: "calc(13px*var(--ts))", display: "block" }}>{t("bestTime")}</b>
          <span className="muted" style={{ fontSize: "calc(13px*var(--ts))" }}>
            {nm(d.best)}
          </span>
        </span>
      </div>

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
        <div className="facts">
          {row(t("hours"), d.hours ? d.hours.o + " – " + d.hours.c : "—")}
          {row(t("closedOn"), shut)}
          {row(t("entry"), nm(d.fee))}
          {row(t("howLong"), dur(d.visit.min) + " – " + dur(d.visit.max))}
          {row(t("bestTime"), nm(d.best))}
          {row(t("parking"), nm(d.parking))}
          {row(t("access"), d.senior ? t("stepFree") : "—")}
        </div>
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
