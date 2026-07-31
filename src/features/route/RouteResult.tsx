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
import { saveRoute, shareRoute, startGo, useAlt } from "./route-actions";
import { modeWord, leaveVehicleShort } from "./mode-words";
import { addTo } from "@/features/place/place-actions";
import { RouteMap } from "./RouteMap";
import { explain, gist } from "./explain";
import type { Stop } from "@/shared/types";

function TlItem({ s, i, n }: { s: Stop; i: number; n: number }) {
  const d = s.d;
  const km = (s as any).km,
    travel = (s as any).travel,
    wait = (s as any).wait as number;
  return (
    <>
      {/* A leg you walk is a different fact from a leg you drive, and the
          difference is the reason the stop is affordable at all — say it
          plainly rather than showing "2 min · 0.1 km" and letting the visitor
          assume they have to move the car. */}
      {i > 0 &&
        (s.anchor ? (
          <div className="leg walkleg">
            <Icon name="walk" />
            {leaveVehicleShort()} — {dur(travel)} {nm({ en: "on foot", hi: "पैदल" })}
          </div>
        ) : (
          <div className="leg">
            <Icon name="navigate" />
            {dur(travel)} {modeWord()} · {km} {t("km")}
          </div>
        ))}
      <div className="tl-item">
        <div className="tl-gut">
          <div className={"tl-dot" + (s.anchor ? " walked" : "")}>{i + 1}</div>
          {i < n - 1 && <div className="tl-bar" />}
        </div>
        <div className="card tl-card" onClick={() => go("/place/" + d.id)}>
          <div className="tl-top">
            <Photo d={d} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <h3 lang={S.lang}>{nm(d.name)}</h3>
              <div className="tl-when">
                <span>
                  {t("arrive")} <b className="tnum">{clock(s.arrive)}</b>
                </span>
                <span>
                  · {t("spend")} <b className="tnum">{dur((s as any).visit)}</b>
                </span>
                <span>
                  · {t("leave")} <b className="tnum">{clock(s.depart)}</b>
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

/** A meal or a rest, sitting in the timeline exactly where it falls. */
function BreakItem({ b }: { b: any }) {
  return (
    <div className="tl-item">
      <div className="tl-gut">
        <div className="tl-dot rest">
          <Icon name={b.kind === "tea" ? "clock" : "surya"} />
        </div>
        <div className="tl-bar" />
      </div>
      <div className="tl-rest">
        <b lang={S.lang}>
          {nm(b.name)} · {clock(b.at)}–{clock(b.at + b.min)}
        </b>
        <p lang={S.lang}>{nm(b.note)}</p>
      </div>
    </div>
  );
}

/**
 * The route said in sentences.
 *
 * The one-line gist stays visible — it is the sentence that tells a visitor
 * whether the day is the shape they wanted. The step-by-step account folds
 * away behind it: eleven paragraphs is more reading than anyone does before
 * they have decided to go, and it pushed the actual timeline off the screen.
 */
function Walkthrough({ it, p }: { it: any; p: any }) {
  const lines = explain(it, p);
  if (!lines.length) return null;
  return (
    <div className="sec walk">
      <p className="walk-gist" lang={S.lang}>
        {gist(it, p)}
      </p>
      <details className="walkfold">
        <summary>
          <Icon name="fwd" />
          <span lang={S.lang}>
            {nm({ en: "Read it step by step", hi: "चरण दर चरण पढ़ें" })}
          </span>
          <i className="tnum">{lines.length}</i>
        </summary>
      <ol className="walk-list">
        {lines.map((l, i) => (
          <li key={i}>
            <span className="wi">
              <Icon name={l.ic} />
            </span>
            <span>
              {l.time && <b className="tnum">{l.time}</b>}
              <span lang={S.lang}>{l.text}</span>
            </span>
          </li>
        ))}
      </ol>
      </details>
    </div>
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
  const breaks = ((it as any).breaks || []) as any[];

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

      {/* Which day you are looking at, before anything about that day. A
          multi-day plan used to say "3 DAYS" in an eyebrow and hide the
          switcher among the actions inside the dark plate, so the other two
          days were, for most people, not there at all. */}
      {M && (
        <div className="daytabs" role="tablist" aria-label={nm({ en: "Days", hi: "दिन" })}>
          {M.days.map((dd, i) => (
            <button
              key={i}
              role="tab"
              aria-selected={p.day === i}
              className={p.day === i ? "on" : ""}
              onClick={() => {
                p.day = i;
                p.res = p.multi!.days[i];
                bump();
                window.scrollTo(0, 0);
              }}
            >
              <b lang={S.lang}>{S.lang === "hi" ? "दिन " + (i + 1) : "Day " + (i + 1)}</b>
              <small>{dd.stops.length} {t("stops")}</small>
            </button>
          ))}
        </div>
      )}

      <div className="summ">
        <div className="eyebrow">
          {CONFIG.brand.sub}
          {M ? " · " + M.days.length + (S.lang === "hi" ? " दिन" : " DAYS") : ""}
        </div>
        <h2 lang={S.lang}>{title}</h2>
        <div className="mgrid">
          <div className="mcell" role="group" aria-label={t("stops")}>
            <b className="tnum">{M ? (M.totals as any).stops : it.stops.length}</b>
            <span>{t("stops")}</span>
          </div>
          <div className="mcell" role="group" aria-label={t("onRoad")}>
            <b className="tnum">{dur(totals.travel)}</b>
            <span>{t("onRoad")}</span>
          </div>
          <div className="mcell" role="group" aria-label={t("atPlaces")}>
            <b className="tnum">{dur(totals.visit)}</b>
            <span>{t("atPlaces")}</span>
          </div>
          <div className="mcell" role="group" aria-label={t("distance")}>
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

      <RouteMap it={it} start={p.start} end={p.endType === "backToStart" ? p.start : p.end} />

      <Walkthrough it={it} p={p} />

      {/* A real ordered list: a screen reader then says "3 of 11" for every
          stop, which is the single most useful thing it can say about a
          timeline and cost nothing but the right element. */}
      <ol className="tl">
        {it.stops.map((s, i) => (
          <li key={i}>
            <TlItem s={s} i={i} n={it.stops.length} />
            {breaks
              .filter((b) => b.after === i)
              .map((b, k) => (
                <BreakItem key={k} b={b} />
              ))}
          </li>
        ))}
      </ol>

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
