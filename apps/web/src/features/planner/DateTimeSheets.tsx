import { useRef, useState } from "react";
import { S } from "@/app/state";
import { t, nm } from "@/shared/i18n/i18n";
import { clock, isoToday, isoDate, fromISO, isToday, nowM, addDays, daysBetween } from "@/shared/lib/datetime";
import { openSheet, closeSheet } from "@/shared/ui/overlays";
import { Icon } from "@/shared/icons/Icon";
import { activeEvent, eventsBetween } from "@/data/events";
import { DYS, MONS, setDay, setStartClock, shortDate } from "./plan";

/* ================= DAY: a month calendar that takes a range =================
   One tap sets the day you arrive; a second tap on a later day sets the day you
   leave, and the number of days between them becomes the length of the visit —
   so the calendar and the "how long do you have" chips can never disagree.
   Nothing commits until Done, so a mis-tap costs nothing. */
function DateSheet() {
  const p = S.plan!;
  const [from, setFrom] = useState(p.date);
  const [to, setTo] = useState(() => addDays(p.date, Math.max(1, p.days) - 1));
  const [picking, setPicking] = useState<"from" | "to">("from");
  const [shown, setShown] = useState(() => fromISO(p.date));
  const y = shown.getFullYear(),
    m = shown.getMonth();

  const lead = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const today = fromISO(isoToday());
  today.setHours(0, 0, 0, 0);
  const limit = new Date(today);
  limit.setFullYear(limit.getFullYear() + 1);
  const atFirstMonth = y === today.getFullYear() && m === today.getMonth();
  const span = daysBetween(from, to) + 1;

  const shift = (n: number) => {
    const d = new Date(y, m, 1);
    d.setMonth(d.getMonth() + n);
    setShown(d);
  };

  const tap = (iso: string) => {
    // Tapping before the arrival day means you meant a new arrival day, not an
    // impossible backwards range.
    if (picking === "from" || iso < from) {
      setFrom(iso);
      setTo(iso);
      setPicking("to");
    } else {
      setTo(iso);
      setPicking("from");
    }
  };

  const done = () => {
    setDay(from, daysBetween(from, to) + 1);
    closeSheet();
  };

  return (
    <>
      <h2 className="display" style={{ fontSize: "calc(20px*var(--ts))", marginBottom: 4 }} lang={S.lang}>
        {t("pickDay")}
      </h2>
      <p className="qs" style={{ marginBottom: 10 }} lang={S.lang}>
        {picking === "from"
          ? nm({ en: "Tap the day you arrive.", hi: "जिस दिन आप पहुँच रहे हैं वह दबाएँ।" })
          : nm({ en: "Now tap the last day — or press Done for a single day.", hi: "अब अंतिम दिन दबाएँ — एक ही दिन के लिए ‘हो गया’ दबाएँ।" })}
      </p>

      {/* the running answer, always visible, so the range is never a guess */}
      <div className="rangebar">
        <span className={picking === "from" ? "on" : ""}>
          <i>{nm({ en: "From", hi: "से" })}</i>
          <b>{shortDate(from)}</b>
        </span>
        <Icon name="fwd" />
        <span className={picking === "to" ? "on" : ""}>
          <i>{nm({ en: "To", hi: "तक" })}</i>
          <b>{shortDate(to)}</b>
        </span>
        <em>{span === 1 ? nm({ en: "1 day", hi: "1 दिन" }) : span + nm({ en: " days", hi: " दिन" })}</em>
      </div>

      <div className="cal">
        <div className="cal-h">
          <button onClick={() => shift(-1)} disabled={atFirstMonth} aria-label={nm({ en: "Previous month", hi: "पिछला माह" })}>
            <Icon name="back" />
          </button>
          <b lang={S.lang}>
            {MONS[S.lang === "hi" ? "hi" : "en"][m]} {y}
          </b>
          <button onClick={() => shift(1)} aria-label={nm({ en: "Next month", hi: "अगला माह" })}>
            <Icon name="fwd" />
          </button>
        </div>
        <div className="cal-w">
          {DYS[S.lang === "hi" ? "hi" : "en"].map((x, i) => (
            <i key={i}>{x}</i>
          ))}
        </div>
        <div className="cal-g">
          {Array.from({ length: lead }, (_, i) => (
            <button key={"b" + i} className="mut" disabled />
          ))}
          {Array.from({ length: days }, (_, i) => {
            const dnum = i + 1;
            const dt = new Date(y, m, dnum);
            const iso = isoDate(dt);
            const off = dt < today || dt > limit;
            const edge = iso === from || iso === to;
            // A festival day is the single biggest thing that changes what a
            // visit is like, and it was invisible here — the calendar is where
            // the choice is actually made, so it has to be said here.
            const fest = activeEvent(iso);
            const cls = [
              edge ? "on" : "",
              !edge && iso > from && iso < to ? "mid" : "",
              iso === isoToday() ? "today" : "",
              off ? "mut" : "",
              fest ? "fest" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <button
                key={iso}
                className={cls}
                disabled={off}
                onClick={() => tap(iso)}
                aria-current={edge ? "date" : undefined}
                aria-label={fest ? dnum + " — " + nm(fest.name) : undefined}
                title={fest ? nm(fest.name) : undefined}
              >
                {dnum}
                {fest && <i className="festdot" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* The dot on the grid is a marker, not a message — colour alone never
          carries meaning in this app. Whatever the chosen range actually lands
          on gets named, in words, before Done is pressed. */}
      {eventsBetween(from, to).map((e) => (
        <div className="note" key={e.id} style={{ marginTop: 12 }}>
          <Icon name="diya" />
          <span lang={S.lang}>
            <b>{nm(e.name)}</b>
            {" — "}
            {e.from === e.to ? shortDate(e.from) : shortDate(e.from) + " – " + shortDate(e.to)}. {nm(e.blurb)}
          </span>
        </div>
      ))}

      <button className="btn primary" style={{ marginTop: 14 }} onClick={done}>
        <Icon name="check" />
        {nm({ en: "Done", hi: "हो गया" })}
      </button>
      <button className="btn ghost" style={{ marginTop: 9 }} onClick={closeSheet}>
        {nm({ en: "Cancel", hi: "रद्द करें" })}
      </button>
    </>
  );
}

/* ================= TIME: a clock dial =================
   Two turns of the same face, the way a real clock is read: the hour first,
   then the minute. The minute ring is labelled every five, but a tap anywhere
   on it lands on the exact minute — nobody is pushed onto a quarter hour they
   didn't mean. Nothing commits until "Set time". */
const R = 39; // ring radius, % of the face

/** Where on the face was that tap? → degrees clockwise from 12. */
function faceAngle(el: HTMLElement, cx: number, cy: number): number {
  const b = el.getBoundingClientRect();
  const dx = cx - (b.left + b.width / 2);
  const dy = cy - (b.top + b.height / 2);
  return ((Math.atan2(dy, dx) * 180) / Math.PI + 450) % 360;
}

function TimeSheet() {
  const p = S.plan!;
  const initial = p.startClock != null ? p.startClock : isToday(p.date) ? nowM() : 9 * 60;
  const h24 = Math.floor(initial / 60);
  const [h12, setH12] = useState(h24 % 12 || 12);
  const [min, setMin] = useState(initial % 60);
  const [pm, setPm] = useState(h24 >= 12);
  const [ring, setRing] = useState<"h" | "m">("h");
  const dragging = useRef(false);

  const total = ((h12 % 12) + (pm ? 12 : 0)) * 60 + min;

  const fromPoint = (el: HTMLElement, x: number, y: number) => {
    const deg = faceAngle(el, x, y);
    if (ring === "h") setH12(Math.round(deg / 30) || 12);
    else setMin(Math.round(deg / 6) % 60);
  };
  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    fromPoint(e.currentTarget, e.clientX, e.clientY);
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragging.current) fromPoint(e.currentTarget, e.clientX, e.clientY);
  };
  const onUp = () => {
    if (dragging.current && ring === "h") setRing("m"); // hour chosen → hand it the minutes
    dragging.current = false;
  };

  // 12 labels: hours 1–12, or minutes every five.
  const marks = Array.from({ length: 12 }, (_, i) =>
    ring === "h" ? { v: i + 1, deg: (i + 1) * 30, lb: String(i + 1) } : { v: i * 5, deg: i * 30, lb: String(i * 5).padStart(2, "0") },
  );
  const handDeg = ring === "h" ? h12 * 30 : min * 6;

  return (
    <>
      <h2 className="display" style={{ fontSize: "calc(20px*var(--ts))" }} lang={S.lang}>
        {t("pickTime")}
      </h2>

      {/* the readout is also the switch — tap the hour or the minute to edit it */}
      <div className="clockread">
        <button className={"cr-part" + (ring === "h" ? " on" : "")} onClick={() => setRing("h")} aria-label={t("hourLb")}>
          {h12}
        </button>
        <span className="cr-sep">:</span>
        <button className={"cr-part" + (ring === "m" ? " on" : "")} onClick={() => setRing("m")} aria-label={t("minuteLb")}>
          {String(min).padStart(2, "0")}
        </button>
        <span className="cr-ap">{pm ? "pm" : "am"}</span>
      </div>

      <div
        className="dial"
        role="group"
        aria-label={ring === "h" ? t("hourLb") : t("minuteLb")}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <div className="dial-hand" style={{ transform: `rotate(${handDeg}deg)` }} aria-hidden="true" />
        <div className="dial-hub" aria-hidden="true" />
        {marks.map((mk) => {
          const a = ((mk.deg - 90) * Math.PI) / 180;
          const on = ring === "h" ? h12 === mk.v : min === mk.v;
          return (
            <button
              key={mk.v}
              className={"dial-h" + (on ? " on" : "")}
              style={{ left: `${50 + R * Math.cos(a)}%`, top: `${50 + R * Math.sin(a)}%` }}
              onClick={() => (ring === "h" ? (setH12(mk.v), setRing("m")) : setMin(mk.v))}
              aria-pressed={on}
            >
              {mk.lb}
            </button>
          );
        })}
        {/* off-label minutes still need a marker, or the hand looks broken */}
        {ring === "m" && min % 5 !== 0 && (
          <div
            className="dial-tip"
            style={{
              left: `${50 + R * Math.cos(((min * 6 - 90) * Math.PI) / 180)}%`,
              top: `${50 + R * Math.sin(((min * 6 - 90) * Math.PI) / 180)}%`,
            }}
            aria-hidden="true"
          />
        )}
      </div>

      <p className="qs" style={{ textAlign: "center", marginTop: 10 }} lang={S.lang}>
        {ring === "h"
          ? nm({ en: "Tap the hour.", hi: "घंटा दबाएँ।" })
          : nm({ en: "Tap or drag around the ring for any minute.", hi: "किसी भी मिनट के लिए रिंग पर दबाएँ या घुमाएँ।" })}
      </p>

      <div className="tsegs" style={{ marginTop: 10 }}>
        <button className={!pm ? "on" : ""} onClick={() => setPm(false)} aria-pressed={!pm}>
          AM
        </button>
        <button className={pm ? "on" : ""} onClick={() => setPm(true)} aria-pressed={pm}>
          PM
        </button>
      </div>

      <button
        className="btn primary"
        style={{ marginTop: 18 }}
        onClick={() => {
          setStartClock(total);
          closeSheet();
        }}
      >
        <Icon name="check" />
        {t("setTime")} · {clock(total)}
      </button>
      {isToday(p.date) && (
        <button
          className="btn ghost"
          style={{ marginTop: 9 }}
          onClick={() => {
            setStartClock(null);
            closeSheet();
          }}
        >
          {t("startNow")}
        </button>
      )}
    </>
  );
}

export const openDateSheet = () => openSheet(<DateSheet />);
export const openTimeSheet = () => openSheet(<TimeSheet />);
