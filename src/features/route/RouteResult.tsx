import { S, bump } from "@/app/state";
import { go } from "@/app/nav";
import { t, nm } from "@/shared/i18n/i18n";
import { dur } from "@/shared/lib/format";
import { clock } from "@/shared/lib/datetime";
import { navTo, byId } from "@/shared/lib/geo";
import { CONFIG, theme } from "@/data/config";
import { Icon } from "@/shared/icons/Icon";
import { Photo } from "@/shared/ui/Photo";
import { StatusPill } from "@/shared/ui/PlaceCard";
import { calSheet } from "./calendar";
import { saveRoute, shareRoute, startGo, useAlt, modeWord } from "./route-actions";
import { addTo } from "@/features/place/place-actions";
import type { Stop } from "@/shared/types";

function TlItem({ s, i, n }: { s: Stop; i: number; n: number }) {
  const d = s.d;
  const km = (s as any).km,
    travel = (s as any).travel,
    wait = (s as any).wait as number;
  return (
    <>
      {i > 0 && (
        <div className="leg">
          <Icon name="navigate" />
          {dur(travel)} {modeWord()} · {km} {t("km")}
        </div>
      )}
      <div className="tl-item">
        <div className="tl-gut">
          <div className="tl-dot">{i + 1}</div>
          {i < n - 1 && <div className="tl-bar" />}
        </div>
        <div className="card tl-card" onClick={() => go("/place/" + d.id)}>
          <div className="tl-top">
            <Photo d={d} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <h3 lang={S.lang}>{nm(d.name)}</h3>
              <div className="tl-when">
                <span>
                  {t("arrive")} <b>{clock(s.arrive)}</b>
                </span>
                <span>
                  · {t("spend")} <b>{dur((s as any).visit)}</b>
                </span>
                <span>
                  · {t("leave")} <b>{clock(s.depart)}</b>
                </span>
              </div>
              <div style={{ marginTop: 7, display: "flex", gap: 6, flexWrap: "wrap" }}>
                <StatusPill d={d} />
                <span className="tag brass">
                  <Icon name="surya" />
                  {nm(d.best)}
                </span>
              </div>
            </div>
          </div>
          <div className="tl-why">
            {nm(d.short)}
            {wait > 2 && (
              <span className="muted">
                {" "}
                ({t("openingAt")} {clock(s.arrive)})
              </span>
            )}
          </div>
          <div className="tl-btns">
            <button
              className="btn nav sm"
              onClick={(e) => {
                e.stopPropagation();
                navTo(d.id);
              }}
            >
              <Icon name="navigate" />
              {t("navigate")}
            </button>
            <button
              className="btn ghost sm"
              onClick={(e) => {
                e.stopPropagation();
                go("/place/" + d.id);
              }}
            >
              {t("details")}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function AltRow({ a, i }: { a: any; i: number }) {
  const lb = a.tag === "relaxed" ? t("relaxed") : nm(theme(a.tag) || { en: a.tag, hi: a.tag });
  return (
    <button className="card rcard" onClick={() => useAlt(i)}>
      <span className="ic">
        <Icon name="route" />
      </span>
      <span style={{ flex: 1 }}>
        <h3>{lb}</h3>
        <p>
          {a.it.stops.length} {t("stops")} · {dur(a.it.totals.total)} · {a.it.totals.km} {t("km")}
        </p>
      </span>
      <span style={{ color: "var(--stone-2)", display: "grid", placeItems: "center" }}>
        <Icon name="fwd" />
      </span>
    </button>
  );
}

const QUIET = { background: "rgba(255,255,255,.13)", color: "#EDE9E0" } as const;

export function RouteResult() {
  const it = S.plan && S.plan.res;
  if (!it)
    return (
      <div className="empty">
        <Icon name="route" />
        <p className="t">{t("noRoute")}</p>
        <p>{t("noRouteD")}</p>
        <button className="btn primary" style={{ maxWidth: 240, margin: "18px auto 0" }} onClick={() => go("/plan")}>
          {t("planVisit")}
        </button>
      </div>
    );
  if (!it.stops.length)
    return (
      <>
        <div className="phead">
          <button className="back" onClick={() => go("/plan")}>
            <Icon name="back" />
          </button>
          <h1 className="display" lang={S.lang}>
            {t("yourRoute")}
          </h1>
        </div>
        <div className="empty">
          <Icon name="clock" />
          <p className="t">{t("noFit")}</p>
          <p style={{ maxWidth: "24em", margin: "0 auto" }}>{t("noFitD")}</p>
          <button className="btn primary" style={{ maxWidth: 240, margin: "18px auto 0" }} onClick={() => go("/plan")}>
            {t("edit")}
          </button>
        </div>
      </>
    );

  const p = S.plan!;
  const T = it.totals as any;
  const M = p.multi;
  const th = p.themes.length && p.themes[0] !== "any" ? nm(theme(p.themes[0]) || { en: "", hi: "" }) : "";
  const label = typeof p.label === "string" ? p.label : nm(p.label);
  const title = (label || dur(p.mins!)) + (th ? " · " + th : "");
  const totals = (M ? M.totals : T) as any;
  const dropped = (it as any).dropped as { d: any; why: string }[] | undefined;

  return (
    <>
      <div className="phead">
        <button className="back" onClick={() => go("/plan")} aria-label={t("back")}>
          <Icon name="back" />
        </button>
        <h1 className="display" style={{ fontSize: "calc(19px*var(--ts))" }} lang={S.lang}>
          {t("yourRoute")}
        </h1>
      </div>

      <div className="summ">
        <div className="eyebrow">
          {CONFIG.brand.sub}
          {M ? " · " + M.days.length + (S.lang === "hi" ? " दिन" : " DAYS") : ""}
        </div>
        <h2 lang={S.lang}>{title}</h2>
        <div className="mgrid">
          <div className="mcell">
            <b className="tnum">{M ? (M.totals as any).stops : it.stops.length}</b>
            <span>{t("stops")}</span>
          </div>
          <div className="mcell">
            <b className="tnum">{dur(totals.travel)}</b>
            <span>{t("onRoad")}</span>
          </div>
          <div className="mcell">
            <b className="tnum">{dur(totals.visit)}</b>
            <span>{t("atPlaces")}</span>
          </div>
          <div className="mcell">
            <b className="tnum">
              {totals.km} {t("km")}
            </b>
            <span>{t("distance")}</span>
          </div>
        </div>
        <div className="fin">
          <Icon name="check" />
          {t("doneBy")} {clock(T.finish)}
          {M ? " · " + (S.lang === "hi" ? "दिन " + (p.day! + 1) : "Day " + (p.day! + 1)) : ""}
        </div>
        {M && (
          <div className="hscroll" style={{ paddingTop: 12 }}>
            {M.days.map((dd, i) => (
              <button
                key={i}
                className={"chip" + (p.day === i ? " on warm" : "")}
                onClick={() => {
                  p.day = i;
                  p.res = p.multi!.days[i];
                  bump();
                  window.scrollTo(0, 0);
                }}
              >
                {S.lang === "hi" ? "दिन " + (i + 1) : "Day " + (i + 1)} · {dd.stops.length}
              </button>
            ))}
          </div>
        )}
        <div className="acts">
          <button className="btn primary" style={{ flex: 1, minWidth: 170 }} onClick={startGo}>
            <Icon name="play" />
            {t("startTour")}
          </button>
          <button className="btn quiet sm" style={QUIET} onClick={() => go("/map")}>
            <Icon name="mapi" />
            {t("onMap")}
          </button>
          <button className="btn quiet sm" style={QUIET} onClick={saveRoute}>
            <Icon name="saved" />
            {t("save")}
          </button>
          <button className="btn quiet sm" style={QUIET} onClick={calSheet}>
            <Icon name="calplus" />
            {nm({ en: "Calendar", hi: "कैलेंडर" })}
          </button>
          <button className="btn quiet sm" style={QUIET} onClick={shareRoute}>
            <Icon name="share" />
            {t("share")}
          </button>
        </div>
      </div>

      <div className="tl">
        {it.stops.map((s, i) => (
          <TlItem key={i} s={s} i={i} n={it.stops.length} />
        ))}
      </div>

      {(it as any).suggest && (it as any).suggest.length > 0 && (
        <div className="sec">
          <div className="sec-head">
            <h2 style={{ fontSize: "calc(16px*var(--ts))" }} lang={S.lang}>
              {nm({ en: "Also fits your time", hi: "आपके समय में यह भी" })}
            </h2>
          </div>
          <div className="plist">
            {((it as any).suggest as { id: string; addMin: number }[]).map((s) => {
              const d = byId(s.id);
              if (!d) return null;
              return (
                <button key={s.id} className="card rcard" onClick={() => addTo(s.id)}>
                  <span className="ic">
                    <Icon name="pin" />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <h3 lang={S.lang}>{nm(d.name)}</h3>
                    <p>
                      +{dur(s.addMin)} · {nm({ en: "tap to add", hi: "जोड़ने हेतु दबाएँ" })}
                    </p>
                  </span>
                  <span style={{ color: "var(--stone-2)", display: "grid", placeItems: "center" }}>
                    <Icon name="route" />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {dropped && dropped.length > 0 && (
        <div className="sec">
          <div className="sec-head">
            <h2 style={{ fontSize: "calc(16px*var(--ts))" }} lang={S.lang}>
              {t("leftOut")}
            </h2>
          </div>
          <div className="dropped">
            {dropped.map((x, i) => (
              <span key={i}>
                {i > 0 && <br />}· {nm(x.d.name)}{" "}
                <span className="muted">
                  — {x.why === "time" ? t("noTime") : x.why === "closed" ? t("closedToday") : t("noTheme")}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {p.alts && p.alts.length > 0 && (
        <div className="sec">
          <div className="sec-head">
            <h2 style={{ fontSize: "calc(16px*var(--ts))" }} lang={S.lang}>
              {t("otherWays")}
            </h2>
          </div>
          <div className="plist">
            {p.alts.map((a, i) => (
              <AltRow key={i} a={a} i={i} />
            ))}
          </div>
        </div>
      )}

      <div className="note" style={{ margin: "16px 0 8px" }}>
        <Icon name="info" />
        <span>{t("estimates")}</span>
      </div>
    </>
  );
}
