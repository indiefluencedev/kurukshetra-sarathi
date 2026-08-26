import { useState } from "react";
import { S, bump } from "@/app/state";
import { go } from "@/app/nav";
import { t, nm } from "@/shared/i18n/i18n";
import { dur } from "@/shared/lib/format";
import { clock } from "@/shared/lib/datetime";
import { navTo, byId } from "@/shared/lib/geo";
import { nearStays, nearFood } from "@/features/place/place-actions";
import { CONFIG, theme } from "@/data/config";
import { Icon } from "@/shared/icons/Icon";
import { Photo } from "@/shared/ui/Photo";
import { calSheet } from "./calendar";
import { saveRoute, shareRoute, startGo } from "./route-actions";
import { modeWord, leaveVehicleShort } from "./mode-words";
import { addTo } from "@/features/place/AddSheet";
import { applyFix, longDate } from "@/features/planner/plan";
import { RouteMap } from "./RouteMap";
import { explain, gist } from "./explain";
import { eventById, affects, type EventDef } from "@/data/events";
import type { Stop } from "@/shared/types";

function TlItem({ s, i, n, ev }: { s: Stop; i: number; n: number; ev: EventDef | null }) {
  const d = s.d;
  const hit = affects(ev, d.id);
  const km = (s as any).km,
    travel = (s as any).travel,
    wait = (s as any).wait as number;
  const [showNearby, setShowNearby] = useState(false);

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
      {/* The clock lives in the GUTTER, under the stop number.
          It used to run inside the card as "Arrive 1:50pm · Spend 15 min ·
          Leave 2:05pm" at 13px, wrapping to two lines — which buried the one
          number a visitor scans for and repeated a third that arrive+spend
          already gives. In a column beside the dots the times read down the
          page the way an itinerary is actually read. */}
      <div className="tl-item">
        <div className="tl-gut">
          <div className={"tl-dot" + (s.anchor ? " walked" : "")}>{i + 1}</div>
          <time className="tl-at tnum">{clock(s.arrive)}</time>
          {i < n - 1 && <div className="tl-bar" />}
        </div>
        <div className="card tl-card" onClick={() => go("/place/" + d.id)}>
          <div className="tl-top">
            <Photo d={d} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <h3 lang={S.lang}>{nm(d.name)}</h3>
              <div className="tl-when">
                <b className="tnum">{dur((s as any).visit)}</b>
                <span>{nm({ en: "here", hi: "यहाँ" })}</span>
                {wait > 2 && (
                  <span className="tl-wait">
                    · {t("openingAt")} {clock(s.arrive)}
                  </span>
                )}
              </div>
              {/* No open/closed pill here, and not for room: StatusPill asks
                  "is this open RIGHT NOW", which is a different question from
                  the one this card raises. The visit may be four days away, and
                  the engine has already checked the place is open at `arrive` —
                  that is what schedule.ts exists for. A green "Open now" beside
                  a Thursday-afternoon arrival was answering about today. */}
              <div className="tl-tags">
                <span className="tag brass">
                  <Icon name="surya" />
                  {nm(d.best)}
                </span>
                {/* Why this stop is longer than the place page says it takes.
                    Without the badge the extra minutes look like a mistake. */}
                {hit && (
                  <span className="tag ev">
                    <Icon name="diya" />
                    {nm(ev!.name)}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="tl-why">{nm(d.short)}</div>

          {/* Expandable Proximity Section for Stays & Food */}
          <div style={{ marginTop: "10px", borderTop: "1px solid var(--stone)", paddingTop: "8px" }} onClick={(e) => e.stopPropagation()}>
            <button
              className="btn sm"
              style={{
                padding: "4px 10px",
                minHeight: "32px",
                fontSize: "12.5px",
                gap: "6px",
                color: "var(--nav)",
                background: "var(--nav-wash)",
                borderRadius: "8px",
                border: "1px solid var(--nav-line)",
                fontWeight: "600",
                cursor: "pointer",
                width: "auto",
                display: "inline-flex",
                alignItems: "center"
              }}
              onClick={() => setShowNearby(!showNearby)}
            >
              {showNearby ? "✕ " + nm({ en: "Hide near spots", hi: "आसपास के स्थल छिपाएँ" }) : "📍 " + nm({ en: "Stays & Food nearby", hi: "आसपास ठहरने और भोजन की जगह" })}
            </button>
            {showNearby && (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "10px", padding: "4px 2px" }}>
                <div style={{ fontSize: "11px", fontWeight: "800", textTransform: "uppercase", color: "var(--muted)", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: "4px" }}>
                  🛌 {nm({ en: "Stays Nearby", hi: "नज़दीकी ठहरने के स्थान" })}
                </div>
                {nearStays(d).slice(0, 2).map(({ s, k }) => (
                  <div key={s.id} style={{ fontSize: "12.5px", padding: "6px 10px", background: "var(--surface-2)", borderRadius: "8px", border: "1px solid var(--stone)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "6px" }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      <strong>{nm(s.name)}</strong> <span style={{ color: "var(--muted)", fontSize: "11.5px" }}>({nm(s.area)})</span>
                    </span>
                    <span style={{ fontWeight: "700", color: "var(--accent-deep)", flexShrink: 0 }}>
                      {k.toFixed(1)} km
                    </span>
                  </div>
                ))}
                
                <div style={{ fontSize: "11px", fontWeight: "800", textTransform: "uppercase", color: "var(--muted)", letterSpacing: "0.05em", marginTop: "6px", display: "flex", alignItems: "center", gap: "4px" }}>
                  🍽️ {nm({ en: "Food & Dining Nearby", hi: "आसपास भोजन स्थान" })}
                </div>
                {nearFood(d).slice(0, 2).map(({ f, k }) => (
                  <div key={f.id} style={{ fontSize: "12.5px", padding: "6px 10px", background: "var(--surface-2)", borderRadius: "8px", border: "1px solid var(--stone)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "6px" }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      <strong>{nm(f.name)}</strong> <span style={{ color: "var(--muted)", fontSize: "11.5px" }}>({nm(f.speciality)})</span>
                    </span>
                    <span style={{ fontWeight: "700", color: "var(--accent-deep)", flexShrink: 0 }}>
                      {k.toFixed(1)} km
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* One quiet icon, not two filled buttons.
              "Directions" was a filled indigo button on every card — fifteen of
              them down the page, which made a secondary action the loudest
              thing on the screen a visitor came here to read. "Details" was
              worse than redundant: the whole card already opens the place. */}
          <button
            className="tl-nav"
            aria-label={t("navigate") + " — " + nm(d.name)}
            onClick={(e) => {
              e.stopPropagation();
              navTo(d.id);
            }}
          >
            <Icon name="navigate" />
          </button>
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

const QUIET = { background: "rgba(255,255,255,.13)", color: "#EDE9E0" } as const;

/** What the engine found that would work, when the asked-for day would not. */
interface Fix {
  key: "earlier" | "longer" | "afterEvent" | "otherDay";
  stops: number;
  patch: { startClock?: number; budgetMin?: number; date?: string; weekday?: number };
}

const fits = (n: number) =>
  nm({ en: ` — that fits ${n} ${n === 1 ? "stop" : "stops"}.`, hi: ` — इसमें ${n} पड़ाव समाते हैं।` });

/** The remedy, in one sentence, naming the actual number rather than a hedge. */
function fixLine(f: Fix, ev: EventDef | null): string {
  switch (f.key) {
    case "earlier":
      return (
        nm({
          en: `Set off at ${clock(f.patch.startClock!)} instead`,
          hi: `इसके बजाय ${clock(f.patch.startClock!)} पर निकलें`,
        }) + fits(f.stops)
      );
    case "longer":
      return (
        nm({ en: `Allow ${dur(f.patch.budgetMin!)} instead`, hi: `इसके बजाय ${dur(f.patch.budgetMin!)} रखें` }) +
        fits(f.stops)
      );
    case "afterEvent":
      return (
        nm({
          en: `${ev ? nm(ev.name) : "The festival"} makes this day tight. Plan for ${longDate(f.patch.date!)} instead`,
          hi: `${ev ? nm(ev.name) : "उत्सव"} के कारण यह दिन कठिन है। इसके बजाय ${longDate(f.patch.date!)} की योजना बनाएँ`,
        }) + fits(f.stops)
      );
    default:
      return (
        nm({ en: `Try ${longDate(f.patch.date!)} instead`, hi: `इसके बजाय ${longDate(f.patch.date!)} आज़माएँ` }) +
        fits(f.stops)
      );
  }
}

const fixAction = (f: Fix): string =>
  f.key === "earlier"
    ? nm({ en: "Start earlier", hi: "जल्दी शुरू करें" })
    : f.key === "longer"
      ? nm({ en: "Allow more time", hi: "अधिक समय दें" })
      : nm({ en: "Use that day", hi: "वह दिन चुनें" });

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
  if (!it.stops.length) {
    const fix = (it as any).fix as Fix | null;
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
          {/* The engine already tried the alternatives, so offer the one that
              worked instead of handing three guesses back to the person with
              the least information. See docs/10 §5 step 6. */}
          {fix ? (
            <>
              <p style={{ maxWidth: "26em", margin: "0 auto" }} lang={S.lang}>
                {fixLine(fix, eventById((it.meta as any).event))}
              </p>
              <button
                className="btn primary"
                style={{ maxWidth: 280, margin: "18px auto 0" }}
                onClick={() => applyFix(fix)}
              >
                <Icon name="check" />
                {fixAction(fix)}
              </button>
              <button className="btn ghost" style={{ maxWidth: 280, margin: "9px auto 0" }} onClick={() => go("/plan")}>
                {t("edit")}
              </button>
            </>
          ) : (
            <>
              <p style={{ maxWidth: "24em", margin: "0 auto" }}>{t("noFitD")}</p>
              <button className="btn primary" style={{ maxWidth: 240, margin: "18px auto 0" }} onClick={() => go("/plan")}>
                {t("edit")}
              </button>
            </>
          )}
        </div>
      </>
    );
  }

  const p = S.plan!;
  const T = it.totals as any;
  const M = p.multi;
  const th = p.themes.length && p.themes[0] !== "any" ? nm(theme(p.themes[0]) || { en: "", hi: "" }) : "";
  const label = typeof p.label === "string" ? p.label : nm(p.label);
  const title = (label || dur(p.mins!)) + (th ? " · " + th : "");
  const totals = (M ? M.totals : T) as any;
  const dropped = (it as any).dropped as { d: any; why: string }[] | undefined;
  const breaks = ((it as any).breaks || []) as any[];
  // the event the engine planned around, if any — it already bent the timings,
  // and this is where the visitor finds out why
  const ev = eventById((it.meta as any).event);

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

      {/* Said once, above the timeline, rather than repeated on every stop:
          the crowds and the diversions are a fact about the day, not about
          each place in turn. */}
      {ev && (
        <div className="evnote">
          <span className="evnote-h">
            <Icon name="diya" />
            <b lang={S.lang}>{nm(ev.name)}</b>
          </span>
          <p lang={S.lang}>{nm(ev.notice)}</p>
        </div>
      )}

      <RouteMap it={it} start={p.start} end={p.endType === "backToStart" ? p.start : p.end} />

      <Walkthrough it={it} p={p} />

      {/* A real ordered list: a screen reader then says "3 of 11" for every
          stop, which is the single most useful thing it can say about a
          timeline and cost nothing but the right element. */}
      <ol className="tl">
        {it.stops.map((s, i) => (
          <li key={i}>
            <TlItem s={s} i={i} n={it.stops.length} ev={ev} />
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

      <div className="note" style={{ margin: "16px 0 8px" }}>
        <Icon name="info" />
        <span>{t("estimates")}</span>
      </div>
    </>
  );
}
