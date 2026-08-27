import { useState, useEffect, useRef } from "react";
import { S, newPlan } from "@/app/state";
import { go } from "@/app/nav";
import { t, nm } from "@/shared/i18n/i18n";
import { clock, isToday, fromISO, nowM } from "@/shared/lib/datetime";
import { dur } from "@/shared/lib/format";
import { bump } from "@/app/state";
import { Icon } from "@/shared/icons/Icon";
import { THEMES } from "@/data/config";
import { theme } from "@/data/config";
import { WINDOWS, CUSTOM, DAYNAMES, dayLabel, longDate, shortDate, lastDay, valid, missing, pNext, pBack, setWin, pickStart, pickEnd, setStartPoint, setEndPoint, flipTheme, buildRoute, runEngine } from "./plan";
import { openPlan } from "./persist";
import { PlacePicker, PinMap, PickedLine } from "./LocationPicker";
import { openPlaceSheet } from "./PlaceSheet";
import { openDateSheet, openTimeSheet } from "./DateTimeSheets";
import { refreshLoc, LOC_HELP } from "@/features/location/location";
import type { PlaceKind } from "@/data/places-index";
import type { GeoPoint, Loc } from "@/shared/types";

/**
 * Day and start time, each as one summary row that opens a real picker in the
 * sheet: a month calendar for the day, a clock dial for the time. The row shows
 * the current value so the step reads at a glance.
 */
function DayTimeRows() {
  const p = S.plan!;
  const tod = isToday(p.date);
  const multi = p.days > 1;
  // A stay of several days has to show both ends of it, or "3 days" is a number
  // the traveller has to work out a date from.
  const dateLine = multi
    ? shortDate(p.date) + " → " + shortDate(lastDay(p))
    : (tod ? dayLabel(p.date) + " · " : "") + longDate(p.date);
  const dateSub = multi
    ? p.days + nm({ en: " days · arriving " + DAYNAMES[S.lang === "hi" ? "hi" : "en"][fromISO(p.date).getDay()], hi: " दिन · " + DAYNAMES.hi[fromISO(p.date).getDay()] + " को पहुँचना" })
    : t("dayOfVisit");
  const startsNow = p.startClock == null && tod;
  const timeLine = clock(p.startClock != null ? p.startClock : tod ? nowM() : 9 * 60);

  return (
    <>
      <button className="when pickrow" onClick={openDateSheet}>
        <span className="ic">
          <Icon name="cal" />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <b lang={S.lang}>{dateLine}</b>
          <span className="sub">{dateSub}</span>
        </span>
        <span className="chev">
          <Icon name="fwd" />
        </span>
      </button>

      <button className="when pickrow" onClick={openTimeSheet}>
        <span className="ic">
          <Icon name="clock" />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <b lang={S.lang}>{timeLine}</b>
          <span className="sub">{startsNow ? t("startNow") : t("startAt")}</span>
        </span>
        <span className="chev">
          <Icon name="fwd" />
        </span>
      </button>
    </>
  );
}

/**
 * Any length that is not one of the five presets.
 *
 * It used to be a number field behind a disclosure triangle — two taps, a
 * keyboard, and a free-text box that happily accepted "0". A pair of large
 * −/+ buttons needs no keyboard, cannot be given a nonsense value, and reads
 * its own answer out loud in the middle.
 */
function CustomLength({ mins }: { mins: number }) {
  const set = (v: number) => {
    const m = Math.max(CUSTOM.min, Math.min(CUSTOM.max, v));
    setWin(m, dur(m), 1);
  };
  const atMin = mins <= CUSTOM.min,
    atMax = mins >= CUSTOM.max;
  return (
    <div className="lenwrap">
      <div className="lenstep">
        <button
          className="lb"
          onClick={() => set(mins - CUSTOM.step)}
          disabled={atMin}
          aria-label={nm({ en: "Half an hour less", hi: "आधा घंटा कम" })}
        >
          <Icon name="minus" />
        </button>
        <span className="lv" role="status" aria-live="polite">
          <b className="tnum">{dur(mins)}</b>
          <small>{nm({ en: "in Kurukshetra", hi: "कुरुक्षेत्र में" })}</small>
        </span>
        <button
          className="lb"
          onClick={() => set(mins + CUSTOM.step)}
          disabled={atMax}
          aria-label={nm({ en: "Half an hour more", hi: "आधा घंटा अधिक" })}
        >
          <Icon name="plus" />
        </button>
      </div>
      <p className="lenhint" lang={S.lang}>
        {nm({
          en: "Staying more than a day? Tap the date above and pick the day you leave as well.",
          hi: "एक दिन से अधिक रुक रहे हैं? ऊपर दिनांक दबाकर जाने का दिन भी चुनें।",
        })}
      </p>
    </div>
  );
}

function StepTime() {
  const p = S.plan!;
  const preset = WINDOWS.find((w) => w.mins === p.mins && w.days === p.days);
  // A length that matches no preset is, by definition, a custom one — so the
  // panel is open because of the answer, not because of a remembered tap.
  const [asked, setAsked] = useState(false);
  const multi = p.days > 1;
  const custom = !multi && p.mins != null && !preset;
  const showCustom = custom || asked;
  const tod = isToday(p.date);
  const startsAt = clock(p.startClock != null ? p.startClock : tod ? nowM() : 9 * 60);

  return (
    <>
      <h2 className="q" lang={S.lang}>
        {nm({ en: "When are you going?", hi: "आप कब जा रहे हैं?" })}
      </h2>
      <p className="qs">
        {nm({ en: "Today and now, unless you pick another day. Opening hours and Monday closures are checked against the day you choose.", hi: "जब तक आप कोई और दिन न चुनें, आज और अभी। खुलने का समय और सोमवार की बंदी आपके चुने दिन के अनुसार जाँची जाती है।" })}
      </p>
      <DayTimeRows />

      <div className="qsplit" />

      {/* A stay of more than one day HAS no "how long do you have" — the stay is
          the window. Asking it anyway offered "1h" against a three-day trip and
          left an answered question looking unanswered. So the whole block goes,
          and its place is taken by what the dates already decided. */}
      {multi ? (
        <div className="answered">
          <span className="ic">
            <Icon name="cal" />
          </span>
          <span>
            <b lang={S.lang}>
              {nm({ en: `${p.days} days in Kurukshetra`, hi: `कुरुक्षेत्र में ${p.days} दिन` })}
            </b>
            <span className="sub" lang={S.lang}>
              {nm({
                en: `${longDate(p.date)} to ${longDate(lastDay(p))}. Each day is planned from ${startsAt}. Tap the dates above to change either end.`,
                hi: `${longDate(p.date)} से ${longDate(lastDay(p))} तक। हर दिन ${startsAt} से नियोजित। बदलने के लिए ऊपर दिनांक दबाएँ।`,
              })}
            </span>
          </span>
        </div>
      ) : (
        <>
          <h2 className="q" lang={S.lang}>
            {t("q_time")}
          </h2>
          <p className="qs">{t("q_time_s")}</p>
          <div className="tgrid">
            {WINDOWS.map((w) => {
              const l = typeof w.lb === "string" ? w.lb : nm(w.lb);
              return (
                <button
                  key={l}
                  className={"chip warm" + (preset === w ? " on" : "")}
                  aria-pressed={preset === w}
                  onClick={() => {
                    setAsked(false);
                    setWin(w.mins, w.lb, w.days);
                  }}
                >
                  {l}
                </button>
              );
            })}
            <button
              className={"chip warm" + (showCustom ? " on" : "")}
              aria-pressed={showCustom}
              onClick={() => {
                setAsked(true);
                if (!custom) setWin(240, dur(240), 1); // open on 4h — the gap the presets leave
              }}
            >
              {nm({ en: "Custom", hi: "अन्य" })}
            </button>
          </div>

          {showCustom && <CustomLength mins={p.mins || 240} />}

          {/* The multi-day branch above has always confirmed itself in words.
              A single day answered nothing back, so the chosen length, the date
              and the hour lived in three different places on the screen and
              never in one sentence. */}
          {p.mins != null && (
            <div className="answered">
              <span className="ic">
                <Icon name="clock" />
              </span>
              <span>
                <b lang={S.lang}>
                  {nm({
                    en: `${dur(p.mins)} on ${longDate(p.date)}`,
                    hi: `${longDate(p.date)} को ${dur(p.mins)}`,
                  })}
                </b>
                <span className="sub" lang={S.lang}>
                  {nm({
                    en: `Starting at ${startsAt}. Everything suggested will fit inside this window.`,
                    hi: `${startsAt} से शुरू। सुझाया गया सब कुछ इसी अवधि में समाएगा।`,
                  })}
                </span>
              </span>
            </div>
          )}
        </>
      )}
    </>
  );
}

function Opt({
  on, ic, lb, sub, onClick,
}: { on: boolean; ic: string; lb: string; sub?: string; onClick: () => void }) {
  return (
    <button className={"opt" + (on ? " on" : "")} onClick={onClick}>
      <span className="oi">
        <Icon name={ic} />
      </span>
      <span>
        <b>{lb}</b>
        {sub ? <small>{sub}</small> : null}
      </span>
      <span className="chk" />
    </button>
  );
}

/** The place list for a chosen option, nested under it so the hierarchy reads. */
function SubPick({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="subpick">
      <span className="lb">{label}</span>
      {children}
    </div>
  );
}

const WHICH_ONE = { en: "Which one?", hi: "कौन सा?" };
const DROP_PIN = { en: "Drop a pin", hi: "पिन लगाएँ" };
const KINDS: Record<string, PlaceKind[]> = {
  hotel: ["hotel", "dharamshala"],
  station: ["station"],
  bus: ["busstand"],
};
/** the sheet asks the question in full, because it covers the step that asked it */
const SHEET_TITLE: Record<string, Loc> = {
  hotel: { en: "Which stay?", hi: "कौन सा ठहराव?" },
  station: { en: "Which station?", hi: "कौन सा स्टेशन?" },
  bus: { en: "Which bus stand?", hi: "कौन सा बस अड्डा?" },
};

/**
 * The picker that belongs to whichever option is selected, rendered directly
 * under it — a list to search, or a map to pin. Both steps use the same body,
 * so "where from" and "where to" behave identically.
 */
function WhereBody({ type, point, onPick }: { type: string; point: GeoPoint; onPick: (g: GeoPoint) => void }) {
  if (KINDS[type])
    return (
      <SubPick label={nm(WHICH_ONE)}>
        <PlacePicker kinds={KINDS[type]} value={point} onPick={onPick} title={nm(SHEET_TITLE[type])} />
      </SubPick>
    );
  // A pin is the answer for "somewhere else" and for a location fix alike — the
  // fix is only ever an estimate, and seeing it on a map is how you check it.
  if (type === "other" || type === "anywhere" || type === "useLoc")
    return (
      <SubPick label={nm(type === "useLoc" ? { en: "Where we think you are", hi: "हमारे अनुसार आप यहाँ हैं" } : DROP_PIN)}>
        {type === "useLoc" && <LocStatus />}
        <PinMap
          value={point}
          onPin={onPick}
          height={type === "useLoc" ? 200 : 260}
          search={type !== "useLoc"}
          accuracy={type === "useLoc" && S.userLoc ? S.userLoc.acc : undefined}
          hint={
            type === "useLoc"
              ? nm({ en: "This is where we think you are. Tap the map if it's off.", hi: "हमारे अनुसार आप यहाँ हैं। गलत हो तो नक्शे पर दबाएँ।" })
              : undefined
          }
        />
      </SubPick>
    );
  return null;
}

/**
 * What the location attempt actually produced — and the way to ask again.
 *
 * "Using the town centre" was said in the same quiet grey whether the device
 * had refused, timed out, or was never asked, and there was no way back from
 * any of them: the only escape from a wrong pin was to tap the map. A failure
 * that cannot be retried is a failure the visitor has to work around.
 */
function LocStatus() {
  const { locBusy, locErr, userLoc } = S;
  if (locBusy)
    return (
      <p className="pickhint" style={{ paddingTop: 0 }}>
        {nm({ en: "Finding you…", hi: "आपको खोज रहे हैं…" })}
      </p>
    );
  if (userLoc)
    return (
      <p className="pickhint" style={{ paddingTop: 0 }}>
        {userLoc.acc
          ? nm({
              en: "Located to about " + Math.round(userLoc.acc) + " m.",
              hi: "लगभग " + Math.round(userLoc.acc) + " मीटर तक सटीक।",
            })
          : nm({ en: "Located.", hi: "स्थान मिल गया।" })}
        {userLoc.acc && userLoc.acc > 500 ? (
          <>
            {" "}
            {nm({ en: "That is a wide guess — tap the map to place it exactly.", hi: "यह मोटा अनुमान है — सटीक स्थान हेतु नक्शे पर दबाएँ।" })}{" "}
            <button className="linkish" onClick={() => refreshLoc()}>
              {nm({ en: "Try again", hi: "फिर कोशिश करें" })}
            </button>
          </>
        ) : null}
      </p>
    );
  // One wording for why location is not working, shared with the drive map —
  // see LOC_HELP. What is added here is the way out this screen has and that
  // one does not: the map underneath, which never stopped working.
  return (
    <p className="pickhint" style={{ paddingTop: 0 }}>
      {nm(LOC_HELP[locErr || "unavailable"])}{" "}
      {nm({
        en: "Until then this is the town centre — tap the map to place it yourself.",
        hi: "तब तक यह नगर केंद्र है — स्वयं रखने हेतु नक्शे पर दबाएँ।",
      })}{" "}
      {locErr !== "insecure" && (
        <button className="linkish" onClick={() => refreshLoc()}>
          {nm({ en: "Try again", hi: "फिर कोशिश करें" })}
        </button>
      )}
    </p>
  );
}

type WhereOpt = { type: string; ic: string; lb: string; sub?: string };

/**
 * Choosing an option that has a list behind it opens that list at once.
 *
 * The alternative is a tap that answers nothing: the option ticks, a field
 * appears under it, and the visitor has to find and tap that too before the
 * question they came to answer is on screen. One tap, one list.
 */
const pickAnd = (pick: (t: string) => void, onPoint: (g: GeoPoint) => void) => (ty: string) => {
  pick(ty);
  if (KINDS[ty])
    openPlaceSheet({
      title: nm(SHEET_TITLE[ty]),
      kinds: KINDS[ty],
      chosen: undefined,
      onPick: onPoint,
    });
};

/**
 * "Where from" and "where to" are the same question asked twice, so they are
 * one component with two lists.
 *
 * The picker for a chosen option is rendered **directly beneath that option**,
 * not after the whole list. It used to sit below all five: you tapped the third
 * row and the answer to your tap appeared off-screen under the fifth, which
 * asks the visitor to re-find their place in a list they just answered.
 */
function WhereStep({
  q, qs, opts, sel, point, pick, setPoint, lead, tail,
}: {
  q: string; qs: string; opts: WhereOpt[]; sel: string; point: GeoPoint;
  pick: (t: string) => void; setPoint: (g: GeoPoint) => void;
  lead?: React.ReactNode; tail?: React.ReactNode;
}) {
  return (
    <>
      <h2 className="q" lang={S.lang}>{q}</h2>
      <p className="qs">{qs}</p>
      {lead}
      <div className="opts">
        {opts.map((o) => (
          <div key={o.type} className={"optwrap" + (sel === o.type ? " on" : "")}>
            <Opt on={sel === o.type} ic={o.ic} lb={o.lb} sub={o.sub} onClick={() => pick(o.type)} />
            {sel === o.type && <WhereBody type={o.type} point={point} onPick={setPoint} />}
          </div>
        ))}
      </div>
      {tail}
    </>
  );
}

/** Step 2 — where the route begins. */
function StepStart() {
  const p = S.plan!;
  // "My location" states what it actually has — it never implies a fix it lacks.
  const locSub =
    p.startType !== "useLoc"
      ? undefined
      : S.locBusy
        ? nm({ en: "Finding you…", hi: "आपको खोज रहे हैं…" })
        : S.userLoc
          ? nm({ en: "Using your location", hi: "आपके स्थान से" })
          : nm({ en: "Not found — using the town centre", hi: "नहीं मिला — नगर केंद्र से" });

  return (
    <WhereStep
      q={t("q_start")}
      qs={t("q_start_s")}
      sel={p.startType}
      point={p.start}
      pick={pickAnd(pickStart, setStartPoint)}
      setPoint={setStartPoint}
      opts={[
        { type: "useLoc", ic: "pin", lb: t("useLoc"), sub: locSub },
        { type: "hotel", ic: "home", lb: t("hotel"), sub: nm({ en: "Search any stay by name", hi: "किसी भी ठहराव को नाम से खोजें" }) },
        { type: "station", ic: "mapi", lb: t("station") },
        { type: "bus", ic: "bus", lb: t("bus") },
        { type: "other", ic: "compass", lb: t("elsewhere"), sub: nm({ en: "Pin it on a map", hi: "नक्शे पर पिन करें" }) },
      ]}
      tail={p.startType !== "useLoc" ? <PickedLine point={p.start} prefix={nm({ en: "Starting at", hi: "आरंभ" })} /> : null}
    />
  );
}

/** Step 3 — where it ends. Separate, because the return leg costs real time. */
function StepEnd() {
  const p = S.plan!;
  return (
    <WhereStep
      q={t("q_end")}
      qs={t("q_end_s")}
      sel={p.endType}
      point={p.end}
      pick={pickAnd(pickEnd, setEndPoint)}
      setPoint={setEndPoint}
      lead={
        p.start.label ? (
          <div className="note" style={{ marginBottom: 12 }}>
            <Icon name="pin" />
            <span lang={S.lang}>
              {nm({ en: "You start at", hi: "आप आरंभ करते हैं" })} <b>{p.start.label}</b>
            </span>
          </div>
        ) : null
      }
      opts={[
        { type: "backToStart", ic: "pin", lb: t("backToStart"), sub: p.start.label },
        { type: "hotel", ic: "home", lb: t("hotel"), sub: nm({ en: "Search any stay by name", hi: "किसी भी ठहराव को नाम से खोजें" }) },
        { type: "station", ic: "mapi", lb: t("station") },
        { type: "bus", ic: "bus", lb: t("bus") },
        { type: "anywhere", ic: "compass", lb: t("anywhere"), sub: nm({ en: "Optional — pin a spot", hi: "वैकल्पिक — कोई स्थान पिन करें" }) },
      ]}
      tail={p.endType !== "backToStart" ? <PickedLine point={p.end} prefix={nm({ en: "Ending at", hi: "समाप्ति" })} /> : null}
    />
  );
}

function StepHow() {
  const p = S.plan!;
  // pace and company are one-of; modes and themes are any-of. That difference
  // was invisible to a screen reader and only weakly visible to anyone else,
  // so it is now in the role AND in the hint on every card.
  const seg = (f: "mode" | "pace" | "who", v: string, ic: string | undefined, lb: string) => (
    <button
      key={f + v}
      role="radio"
      aria-checked={p[f] === v}
      className={"chip" + (p[f] === v ? " on" : "")}
      onClick={() => {
        p[f] = v;
        bump();
      }}
    >
      {ic ? <Icon name={ic} /> : null}
      <span lang={S.lang}>{lb}</span>
    </button>
  );
  const chk = (k: string, lb: string) => (
    <button
      key={k}
      className={"opt" + (p.opts[k] ? " on" : "")}
      style={{ padding: 12 }}
      onClick={() => {
        p.opts[k] = !p.opts[k];
        bump();
      }}
    >
      <span>
        <b style={{ fontSize: "calc(14px*var(--ts))", fontWeight: 600 }} lang={S.lang}>
          {lb}
        </b>
      </span>
      <span className="chk" />
    </button>
  );
  // Modes are multi-select (pick ≥1; e.g. bus + walk). p.mode stays = modes[0] for the engine.
  const toggleMode = (v: string) => {
    const has = p.modes.indexOf(v) >= 0;
    let next = has ? p.modes.filter((m) => m !== v) : p.modes.concat([v]);
    if (!next.length) next = [v]; // never empty
    p.modes = next;
    p.mode = next[0];
    bump();
  };
  const modeChip = (v: string, ic: string, lb: string) => (
    <button
      key={v}
      aria-pressed={p.modes.indexOf(v) >= 0}
      className={"chip" + (p.modes.indexOf(v) >= 0 ? " on" : "")}
      onClick={() => toggleMode(v)}
    >
      <Icon name={ic} />
      <span lang={S.lang}>{lb}</span>
    </button>
  );
  const themeChip = (id: string, lb: string, ic?: string) => (
    <button
      key={id}
      aria-pressed={p.themes.indexOf(id) >= 0}
      className={"chip" + (p.themes.indexOf(id) >= 0 ? " on" : "")}
      onClick={() => flipTheme(id)}
      lang={S.lang}
    >
      {ic ? <Icon name={ic} /> : null}
      {lb}
    </button>
  );
  // This step used to be one unbroken wall of chips — four questions with only
  // a label between them. Each question is its own plate now, so the eye can
  // tell where one ends, and a half-finished step is obvious at a glance.
  // The pick-one / pick-any hint sits ON the heading line rather than under it.
  // As its own paragraph it was a fourth repeated brass line down the step,
  // which read as decoration; beside the question it reads as part of it.
  const QCard = ({
    lb, hint, one, children,
  }: { lb: string; hint?: string; one?: boolean; children: React.ReactNode }) => (
    <section className="qcard">
      <h3 lang={S.lang}>
        {lb}
        <span className="pick">
          {one ? nm({ en: "one", hi: "एक" }) : nm({ en: "any", hi: "कोई भी" })}
        </span>
      </h3>
      {hint && (
        <p className="qc-hint" lang={S.lang}>
          {hint}
        </p>
      )}
      <div className="wrap" role={one ? "radiogroup" : undefined} aria-label={lb}>
        {children}
      </div>
    </section>
  );

  /** The four answers as one sentence — the same closing move as step 1. */
  const chosenThemes = p.themes.length
    ? p.themes.map((id) => nm(theme(id) || { en: id, hi: id })).join(", ")
    : "";
  const MODE_LB: Record<string, string> = {
    car: t("car"), taxi: t("taxi"), twowheeler: t("twowheeler"),
    erickshaw: nm({ en: "E-rickshaw", hi: "ई-रिक्शा" }),
    public: t("public"), walking: t("walking"),
  };
  const summary = [
    chosenThemes,
    p.modes.map((m) => MODE_LB[m] || m).join(" + "),
    t(p.pace),
    t(p.who),
  ].filter(Boolean).join(" · ");

  return (
    <>
      {/* Interests and transport are both "shape the route" — one step. The
          stepper above names it and every card asks its own question, so there
          is no step title here: it only ever repeated the first card. */}
      <QCard lb={t("q_theme")}>
        {THEMES.map((th) => themeChip(th.id, nm(th), th.icon))}
        {themeChip("any", t("anyTheme"))}
      </QCard>

      <QCard
        lb={t("mode")}
        hint={nm({ en: "e.g. bus to the area, then walk.", hi: "जैसे क्षेत्र तक बस, फिर पैदल।" })}
      >
        {modeChip("car", "car", t("car"))}
        {modeChip("taxi", "car", t("taxi"))}
        {modeChip("twowheeler", "bike", t("twowheeler"))}
        {modeChip("erickshaw", "car", nm({ en: "E-rickshaw", hi: "ई-रिक्शा" }))}
        {modeChip("public", "bus", t("public"))}
        {modeChip("walking", "walk", t("walking"))}
      </QCard>

      <QCard lb={t("pace")} one>
        {seg("pace", "relaxed", undefined, t("relaxed"))}
        {seg("pace", "balanced", undefined, t("balanced"))}
        {seg("pace", "fast", undefined, t("fast"))}
      </QCard>

      <QCard lb={t("who")} one>
        {seg("who", "solo", undefined, t("solo"))}
        {seg("who", "couple", undefined, t("couple"))}
        {seg("who", "family", undefined, t("family"))}
        {seg("who", "seniors", undefined, t("seniors"))}
        {seg("who", "group", undefined, t("group"))}
      </QCard>

      <details className="more">
        <summary>
          <Icon name="fwd" />
          {t("more")}
        </summary>
        <div className="opts" style={{ marginTop: 6 }}>
          {chk("meal", t("optMeal"))}
          {chk("free", t("optFree"))}
          {chk("indoor", t("optIndoor"))}
          {chk("walk", t("optWalk"))}
          {chk("access", t("optAccess"))}
        </div>
      </details>

      {/* Four questions answered across four plates, said back as one line —
          the last thing read before "Build the route", so what is about to be
          built is legible without scrolling back up through all of it. */}
      {p.themes.length > 0 && (
        <div className="answered">
          <span className="ic">
            <Icon name="route" />
          </span>
          <span>
            <b lang={S.lang}>{nm({ en: "Your day", hi: "आपका दिन" })}</b>
            <span className="sub" lang={S.lang}>
              {summary}
            </span>
          </span>
        </div>
      )}
    </>
  );
}

// Four steps: when → from → to → what & how. Start and end each get a screen,
// because each of them needs a list to search and a map to check.
const STEPS = [StepTime, StepStart, StepEnd, StepHow];
const LAST = STEPS.length - 1;
// Named, because four anonymous dashes tell a visitor neither where they are
// nor how much is left — the two things a form has to answer to be bearable.
const STEP_NAMES: Loc[] = [
  { en: "When", hi: "कब" },
  { en: "Where from", hi: "कहाँ से" },
  { en: "Where to", hi: "कहाँ तक" },
  { en: "What & how", hi: "क्या और कैसे" },
];

/**
 * What you see when you tap Plan and a plan already exists.
 *
 * Answering four steps is the expensive part of this app. Handing that person
 * a blank form because they tapped the tab again is the one thing the screen
 * must never do — so the built plan is here, whole, and starting over is a
 * deliberate second choice rather than the default.
 */
function ExistingPlan({ onNew, onEdit }: { onNew: () => void; onEdit: () => void }) {
  const p = S.plan!;
  const it = p.res!;
  const label = typeof p.label === "string" ? p.label : nm(p.label);
  const th = p.themes.length && p.themes[0] !== "any" ? nm(theme(p.themes[0]) || { en: "", hi: "" }) : "";
  const days = p.multi ? p.multi.days.length : 1;
  const stops = p.multi ? p.multi.days.reduce((a, d) => a + d.stops.length, 0) : it.stops.length;

  return (
    <>
      <div className="phead">
        <h1 className="display" lang={S.lang}>
          {nm({ en: "Your plan", hi: "आपकी योजना" })}
        </h1>
      </div>

      <div className="planhold">
        <div className="ph-top">
          <span className="ic">
            <Icon name="route" />
          </span>
          <span style={{ minWidth: 0, flex: 1 }}>
            <b className="display" lang={S.lang}>
              {label || dur(p.mins || 0)}
              {th ? " · " + th : ""}
            </b>
            <small>{longDate(p.date)}{days > 1 ? " → " + longDate(lastDay(p)) : ""}</small>
          </span>
          <button
            className="btn ghost sm"
            style={{ flexShrink: 0, padding: "0 8px", minHeight: 32, fontSize: "12px", gap: 6, borderRadius: 8 }}
            onClick={onEdit}
          >
            <Icon name="gear" style={{ width: 14, height: 14 }} />
            {nm({ en: "Edit", hi: "बदलें" })}
          </button>
        </div>

        <div className="ph-facts">
          <span>
            <b className="tnum">{stops}</b>
            {t("stops")}
          </span>
          {days > 1 && (
            <span>
              <b className="tnum">{days}</b>
              {nm({ en: "days", hi: "दिन" })}
            </span>
          )}
          <span>
            <b className="tnum">{clock((it.totals as any).finish)}</b>
            {nm({ en: "done by", hi: "समाप्ति" })}
          </span>
        </div>

        <p className="ph-list" lang={S.lang}>
          {(p.multi ? p.multi.days[0].stops : it.stops).map((s) => nm(s.d.name)).join(" · ")}
        </p>

        <button className="btn primary" onClick={() => go("/route")}>
          <Icon name="fwd" />
          {nm({ en: "Open my plan", hi: "मेरी योजना खोलें" })}
        </button>
      </div>


      <button className="btn ghost" style={{ marginTop: 11 }} onClick={onNew}>
        <Icon name="route" />
        {nm({ en: "Plan a different visit", hi: "कोई और यात्रा बनाएँ" })}
      </button>
      {/* Only claim it is in Saved when it actually is. Deleting it from
          Saved clears savedId (see persist.deletePlan), and this line used to
          go on promising a copy that no longer existed. */}
      <p className="ph-note" lang={S.lang}>
        {S.plan?.savedId
          ? nm({
              en: "Starting a new plan keeps this one — it is in Saved.",
              hi: "नई योजना बनाने पर यह सुरक्षित रहेगी — सहेजे में मिलेगी।",
            })
          : nm({
              en: "This plan is not in Saved. Starting a new one will replace it.",
              hi: "यह योजना सहेजी नहीं गई है। नई बनाने पर यह हट जाएगी।",
            })}
      </p>
    </>
  );
}

/** 4-step visit planner. */
export function Planner() {
  if (!S.plan) S.plan = newPlan();
  let p = S.plan;
  // A built route means there is something to come back to. `fresh` is set by
  // "plan a different visit", so the wizard is reachable without throwing the
  // old plan away first.
  const [fresh, setFresh] = useState(false);

  const pRef = useRef(p);
  pRef.current = p;

  useEffect(() => {
    return () => {
      // If the user navigates away (e.g. browser back, bottom tabs) while on an
      // empty wizard, and they have a backup, restore it so they don't lose it.
      const curr = pRef.current;
      if (S.prevPlan?.res && curr && !curr.res && curr.step === 0) {
        S.plan = S.prevPlan;
        S.prevPlan = null;
      }
    };
  }, []);

  // The engine is synchronous and a three-day plan is real work — long enough
  // that the tap looked ignored. Paint the waiting state first, then build on
  // the next frame, so the button always answers immediately.
  const [building, setBuilding] = useState(false);
  // Keep a reference to whichever plan had a result before the wizard was
  // entered, so the back button on Step 0 can restore it instead of going home.
  if (p.res && !fresh)
    return (
      <ExistingPlan
        onNew={() => {
          S.prevPlan = S.plan;   // ← save before clearing
          S.plan = newPlan();
          setFresh(true);
          bump();
        }}
        onEdit={() => {
          S.plan!.step = 0;
          S.plan!.res = null;
          setFresh(true);
          bump();
        }}
      />
    );

  const i = Math.min(p.step, LAST);
  const last = i === LAST;
  const ok = valid(i);
  const gap = missing(i);
  const CurrentStep = STEPS[i];

  const handleBack = async () => {
    if (i === 0 && fresh) {
      // Try to restore from savedId first (was the old path)
      if (p.savedId) {
        try {
          const opened = await openPlan(p.savedId);
          if (opened) {
            runEngine(S.plan!);
            setFresh(false);
            bump();
            return;
          }
        } catch (e) {}
      }
      // If there was a result-bearing plan before the wizard was started,
      // put it back and return to the ExistingPlan view — don't go home.
      if (S.prevPlan?.res) {
        S.plan = S.prevPlan;
        S.prevPlan = null;
        setFresh(false);
        bump();
        return;
      }
    }
    pBack();
  };



  return (
    <>
      <div className="phead" style={{ paddingBottom: 6 }}>
        <button className="back" onClick={handleBack} aria-label={t("back")}>
          <Icon name="back" />
        </button>
        <h1 className="display" style={{ fontSize: "calc(19px*var(--ts))" }} lang={S.lang}>
          {t("planVisit")}
        </h1>
      </div>

      <div className="stepper">
        <div className="stepper-lb" aria-live="polite">
          <b lang={S.lang}>{nm(STEP_NAMES[i])}</b>
          <span className="tnum">
            {nm({ en: `Step ${i + 1} of ${STEPS.length}`, hi: `चरण ${i + 1} / ${STEPS.length}` })}
          </span>
        </div>
        <div className="steps" role="progressbar" aria-valuenow={i + 1} aria-valuemin={1} aria-valuemax={STEPS.length}>
          {STEPS.map((_, n) => (
            <i key={n} className={n <= i ? "on" : ""} />
          ))}
        </div>
      </div>

      <CurrentStep />
      <div className="planbar-space" />
      <div className="planbar">
        {/* say what is missing where the visitor is already looking, rather
            than greying out the button and explaining nothing */}
        {!ok && (
          <p className="planbar-why" role="status" lang={S.lang}>
            <Icon name="info" />
            {gap}
          </p>
        )}
        <div className="planbar-row">
          <button className="btn ghost" onClick={handleBack}>
            {i === 0 ? t("home") : t("back")}
          </button>
          <button
            className={"btn primary" + (ok ? "" : " waiting") + (building ? " busy" : "")}
            aria-busy={building}
            onClick={
              last && ok
                ? () => {
                    setBuilding(true);
                    setTimeout(buildRoute, 30);
                  }
                : pNext
            }
          >
            {building ? (
              <>
                <span className="btnspin" aria-hidden="true" />
                {nm({ en: "Building your journey…", hi: "आपकी यात्रा बन रही है…" })}
              </>
            ) : last ? (
              <>
                <Icon name="route" />
                {t("build")}
              </>
            ) : (
              t("next")
            )}
          </button>
        </div>
      </div>
    </>
  );
}
