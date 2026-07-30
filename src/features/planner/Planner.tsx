import { S, newPlan } from "@/app/state";
import { t, nm } from "@/shared/i18n/i18n";
import { clock, isoToday, isToday, pad2, nowM } from "@/shared/lib/datetime";
import { planDate } from "@/app/nav";
import { bump } from "@/app/state";
import { Icon } from "@/shared/icons/Icon";
import { THEMES } from "@/data/config";
import { MONS, WINDOWS, setDay, valid, pNext, pBack, setWin, pickStart, pickEnd, setStartPoint, setEndPoint, flipTheme, buildRoute } from "./plan";
import { PlacePicker, PinMap, PickedLine } from "./LocationPicker";
import type { Loc } from "@/shared/types";

const DAYNAMES: Record<string, string[]> = {
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  hi: ["रविवार", "सोमवार", "मंगलवार", "बुधवार", "गुरुवार", "शुक्रवार", "शनिवार"],
};

function WhenLine() {
  const p = S.plan!;
  const d = planDate();
  const tod = isToday(p.date);
  const dn = DAYNAMES[S.lang === "hi" ? "hi" : "en"][d.getDay()];
  const date = d.getDate() + " " + MONS[S.lang === "hi" ? "hi" : "en"][d.getMonth()] + " " + d.getFullYear();
  const cl = p.startClock == null ? (tod ? clock(nowM()) : "9:00am") : clock(p.startClock);
  return (
    <label className="when">
      <span className="ic">
        <Icon name="cal" />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <b lang={S.lang}>
          {tod ? nm({ en: "Today", hi: "आज" }) + " · " : ""}
          {dn}, {date}
        </b>
        <p>
          {nm({ en: "Starting around", hi: "आरंभ लगभग" })} {cl} ·{" "}
          {nm({ en: "tap to change the day", hi: "दिन बदलने हेतु दबाएँ" })}
        </p>
      </span>
      <span className="chev">
        <Icon name="fwd" />
      </span>
      <input type="date" value={p.date} min={isoToday()} onChange={(e) => setDay(e.target.value)} />
    </label>
  );
}

function StepTime() {
  const p = S.plan!;
  const startVal =
    p.startClock == null
      ? isToday(p.date)
        ? pad2(Math.floor(nowM() / 60)) + ":" + pad2(nowM() % 60)
        : "09:00"
      : pad2(Math.floor(p.startClock / 60)) + ":" + pad2(p.startClock % 60);
  return (
    <>
      <h2 className="q" lang={S.lang}>
        {nm({ en: "When are you going?", hi: "आप कब जा रहे हैं?" })}
      </h2>
      <p className="qs">
        {nm({ en: "Today and now, unless you pick another day. Opening hours and Monday closures are checked against the day you choose.", hi: "जब तक आप कोई और दिन न चुनें, आज और अभी। खुलने का समय और सोमवार की बंदी आपके चुने दिन के अनुसार जाँची जाती है।" })}
      </p>
      <WhenLine />
      {/* Start time is now visible at step 1 (not hidden) — date is set via the line above. */}
      <div className="field" style={{ marginTop: 12 }}>
        <label lang={S.lang}>{t("startAt")}</label>
        <input
          type="time"
          value={startVal}
          onChange={(e) => {
            const q = e.target.value.split(":");
            p.startClock = +q[0] * 60 + +q[1];
            bump();
          }}
        />
      </div>
      <h2 className="q" style={{ marginTop: 22 }} lang={S.lang}>
        {t("q_time")}
      </h2>
      <p className="qs">{t("q_time_s")}</p>
      <div className="tgrid">
        {WINDOWS.map((w) => {
          const l = typeof w[0] === "string" ? w[0] : nm(w[0]);
          return (
            <button
              key={l}
              className={"chip warm" + (p.mins === w[1] && p.label === l ? " on" : "")}
              onClick={() => setWin(w[1], l)}
            >
              {l}
            </button>
          );
        })}
      </div>
      <details className="more">
        <summary>
          <Icon name="fwd" />
          {t("exact")}
        </summary>
        <div className="field">
          <label>{t("hrsHave")}</label>
          <input
            type="number"
            min={1}
            max={24}
            inputMode="numeric"
            placeholder="4"
            onInput={(e) => {
              const v = +(e.target as HTMLInputElement).value || 1;
              p.mins = Math.max(1, v) * 60;
              p.label = v + "h";
            }}
          />
        </div>
      </details>
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

function StepStart() {
  const p = S.plan!;
  return (
    <>
      <h2 className="q" lang={S.lang}>{t("q_start")}</h2>
      <p className="qs">{t("q_start_s")}</p>
      <div className="opts">
        <Opt on={p.startType === "useLoc"} ic="pin" lb={t("useLoc")} sub={S.userLoc ? "✓" : ""} onClick={() => pickStart("useLoc")} />
        <Opt on={p.startType === "hotel"} ic="home" lb={t("hotel")} onClick={() => pickStart("hotel")} />
        <Opt on={p.startType === "station"} ic="mapi" lb={t("station")} onClick={() => pickStart("station")} />
        <Opt on={p.startType === "bus"} ic="bus" lb={t("bus")} onClick={() => pickStart("bus")} />
        <Opt on={p.startType === "other"} ic="compass" lb={t("elsewhere")} onClick={() => pickStart("other")} />
      </div>
      {p.startType === "hotel" && <PlacePicker kinds={["hotel", "dharamshala"]} value={p.start} onPick={setStartPoint} />}
      {p.startType === "station" && <PlacePicker kinds={["station"]} value={p.start} onPick={setStartPoint} />}
      {p.startType === "bus" && <PlacePicker kinds={["busstand"]} value={p.start} onPick={setStartPoint} />}
      {p.startType === "other" && <PinMap value={p.start} onPin={setStartPoint} />}
      {p.startType !== "useLoc" && p.startType !== "other" && (
        <PickedLine point={p.start} prefix={nm({ en: "Starting from", hi: "आरंभ" })} />
      )}
    </>
  );
}

function StepEnd() {
  const p = S.plan!;
  const endPrefix = nm({ en: "Ending at", hi: "समाप्ति" });
  return (
    <>
      <h2 className="q" lang={S.lang}>{t("q_end")}</h2>
      <p className="qs">{t("q_end_s")}</p>
      <div className="opts">
        <Opt on={p.endType === "backToStart"} ic="pin" lb={t("backToStart")} onClick={() => pickEnd("backToStart")} />
        <Opt on={p.endType === "hotel"} ic="home" lb={t("hotel")} onClick={() => pickEnd("hotel")} />
        <Opt on={p.endType === "station"} ic="mapi" lb={t("station")} onClick={() => pickEnd("station")} />
        <Opt on={p.endType === "bus"} ic="bus" lb={t("bus")} onClick={() => pickEnd("bus")} />
        <Opt on={p.endType === "anywhere"} ic="compass" lb={t("anywhere")} onClick={() => pickEnd("anywhere")} />
      </div>
      {p.endType === "hotel" && <PlacePicker kinds={["hotel", "dharamshala"]} value={p.end} onPick={setEndPoint} />}
      {p.endType === "station" && <PlacePicker kinds={["station"]} value={p.end} onPick={setEndPoint} />}
      {p.endType === "bus" && <PlacePicker kinds={["busstand"]} value={p.end} onPick={setEndPoint} />}
      {p.endType !== "anywhere" && <PickedLine point={p.end} prefix={endPrefix} />}
    </>
  );
}

function StepTheme() {
  const p = S.plan!;
  const chip = (id: string, lb: string, ic?: string) => (
    <button
      key={id}
      className={"chip" + (p.themes.indexOf(id) >= 0 ? " on" : "")}
      onClick={() => flipTheme(id)}
      lang={S.lang}
    >
      {ic ? <Icon name={ic} /> : null}
      {lb}
    </button>
  );
  return (
    <>
      <h2 className="q" lang={S.lang}>{t("q_theme")}</h2>
      <p className="qs">{t("q_theme_s")}</p>
      <div className="wrap">
        {THEMES.map((th) => chip(th.id, nm(th), th.icon))}
        {chip("any", t("anyTheme"))}
      </div>
    </>
  );
}

function StepHow() {
  const p = S.plan!;
  const seg = (f: "mode" | "pace" | "who", v: string, ic: string | undefined, lb: string) => (
    <button
      key={f + v}
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
    <button key={v} className={"chip" + (p.modes.indexOf(v) >= 0 ? " on" : "")} onClick={() => toggleMode(v)}>
      <Icon name={ic} />
      <span lang={S.lang}>{lb}</span>
    </button>
  );
  return (
    <>
      <h2 className="q" lang={S.lang}>{t("q_how")}</h2>
      <p className="qs">{t("q_how_s")}</p>
      <div className="field">
        <label lang={S.lang}>{t("mode")}</label>
        <p className="qs" style={{ margin: "0 0 8px" }}>
          {nm({ en: "Pick any that apply — e.g. bus to the area, then walk.", hi: "जो लागू हों चुनें — जैसे क्षेत्र तक बस, फिर पैदल।" })}
        </p>
        <div className="wrap">
          {modeChip("car", "car", t("car"))}
          {modeChip("taxi", "car", t("taxi"))}
          {modeChip("twowheeler", "bike", t("twowheeler"))}
          {modeChip("erickshaw", "car", nm({ en: "E-rickshaw", hi: "ई-रिक्शा" }))}
          {modeChip("public", "bus", t("public"))}
          {modeChip("walking", "walk", t("walking"))}
        </div>
      </div>
      <div className="field">
        <label lang={S.lang}>{t("pace")}</label>
        <div className="wrap">
          {seg("pace", "relaxed", undefined, t("relaxed"))}
          {seg("pace", "balanced", undefined, t("balanced"))}
          {seg("pace", "fast", undefined, t("fast"))}
        </div>
      </div>
      <div className="field">
        <label lang={S.lang}>{t("who")}</label>
        <div className="wrap">
          {seg("who", "solo", undefined, t("solo"))}
          {seg("who", "couple", undefined, t("couple"))}
          {seg("who", "family", undefined, t("family"))}
          {seg("who", "seniors", undefined, t("seniors"))}
          {seg("who", "group", undefined, t("group"))}
        </div>
      </div>
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
    </>
  );
}

const STEPS = [StepTime, StepStart, StepEnd, StepTheme, StepHow];

/** 5-step visit planner. */
export function Planner() {
  if (!S.plan) S.plan = newPlan();
  const p = S.plan;
  const i = Math.min(p.step, 4);
  const last = i === 4;
  const ok = valid(i);
  const CurrentStep = STEPS[i];

  return (
    <>
      <div className="phead" style={{ paddingBottom: 6 }}>
        <button className="back" onClick={pBack} aria-label={t("back")}>
          <Icon name="back" />
        </button>
        <h1 className="display" style={{ fontSize: "calc(19px*var(--ts))" }} lang={S.lang}>
          {t("planVisit")}
        </h1>
      </div>
      <div className="steps">
        {STEPS.map((_, n) => (
          <i key={n} className={n <= i ? "on" : ""} />
        ))}
      </div>
      <CurrentStep />
      <div style={{ height: 76 }} />
      <div className="planbar">
        <button className="btn ghost" onClick={pBack}>
          {t("back")}
        </button>
        <button className="btn primary" disabled={!ok} onClick={last ? buildRoute : pNext}>
          {last ? (
            <>
              <Icon name="route" />
              {t("build")}
            </>
          ) : (
            t("next")
          )}
        </button>
      </div>
    </>
  );
}
