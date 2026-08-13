import { useEffect, useState } from "react";
import { S, city } from "@/app/state";
import { nm, t } from "@/shared/i18n/i18n";
import { clock12 } from "@/shared/lib/datetime";
import { openSheet, closeSheet } from "@/shared/ui/overlays";
import { Icon } from "@/shared/icons/Icon";
import { loadWeather, wcode, glyphBody, advice } from "./weather";

/**
 * Animated weather glyph — the rays turn, the cloud drifts, the rain falls.
 *
 * `wxg` is what the animations hang off. They used to hang off `.wx-ic`, the
 * container on Home, so the same glyph at 62px in the weather sheet had no
 * animation rules of its own — and picked up an unrelated global `.spin`
 * instead. The class belongs to the drawing, not to whatever is holding it.
 */
export function WxGlyph({ kind, day }: { kind: string; day: number }) {
  return (
    <svg
      className="wxg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: glyphBody(kind, day) }}
    />
  );
}

/* The header chip that used to live here is gone: Home now carries the
   weather inside TodayStrip, and nothing else ever rendered it. WxGlyph and
   openWxSheet below are still used from there. */

export function openWxSheet() {
  const w = S.wx;
  if (!w) {
    loadWeather(true);
    openSheet(null);
    closeSheet();
    return;
  }
  const d = wcode(w.code);
  const a = advice(w)[0];
  openSheet(
    <>
      <div className="wxsheet">
        <span className="wxbig">
          <WxGlyph kind={d[0]} day={w.day ? 1 : 0} />
        </span>
        <span>
          <b className="display">{w.temp}°C</b>
          <p lang={S.lang}>
            {nm(d[1])} · {nm({ en: "feels", hi: "अनुभव" })} {w.feels}°
          </p>
          <p className="muted" style={{ fontSize: "calc(11.5px*var(--ts))", marginTop: 3 }}>
            {nm(city().wxPlace)} {city().pin}
            {w.live ? "" : " · " + nm({ en: "offline estimate", hi: "ऑफ़लाइन अनुमान" })}
          </p>
        </span>
      </div>
      <div className="wxrow">
        <span>
          <Icon name="umbrella" />
          {w.pop}%
        </span>
        <span>
          <Icon name="wind" />
          {w.wind} km/h
        </span>
        <span>
          <Icon name="drop" />
          {w.rh}%
        </span>
        <span>
          <Icon name="sunset" />
          {w.sunset || "—"}
        </span>
      </div>
      <div className="wx-adv" style={{ padding: "14px 0 0" }}>
        <div className="a">
          <span className="ai">
            <Icon name={a[0]} />
          </span>
          <p dangerouslySetInnerHTML={{ __html: nm(a[1]) }} />
        </div>
      </div>
      <button className="btn ghost" style={{ marginTop: 14 }} onClick={closeSheet}>
        {t("gotIt")}
      </button>
    </>,
  );
}
