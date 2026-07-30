import { useEffect, useState } from "react";
import { S } from "@/app/state";
import { nm, t } from "@/shared/i18n/i18n";
import { clock12 } from "@/shared/lib/datetime";
import { openSheet, closeSheet } from "@/shared/ui/overlays";
import { Icon } from "@/shared/icons/Icon";
import { CONFIG } from "@/data/config";
import { loadWeather, wcode, glyphBody, advice } from "./weather";

/** Animated weather glyph (spins/drifts/falls per CSS). */
export function WxGlyph({ kind, day }: { kind: string; day: number }) {
  return (
    <svg
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

/** Header chip: glyph + temperature + live clock. */
export function WeatherChip() {
  const [clock, setClock] = useState(clock12());
  const w = S.wx;

  useEffect(() => {
    loadWeather();
    const id = setInterval(() => setClock(clock12()), 10000);
    return () => clearInterval(id);
  }, []);

  const d = w ? wcode(w.code) : null;
  return (
    <button
      className="wxchip"
      onClick={() => openWxSheet()}
      aria-label={nm({ en: "Weather and time", hi: "मौसम और समय" })}
    >
      <span className="wxg">{d && w ? <WxGlyph kind={d[0]} day={w.day ? 1 : 0} /> : null}</span>
      <span className="wxn">
        <b>{w ? w.temp + "°" : "··"}</b>
        <i>{clock}</i>
      </span>
    </button>
  );
}

/** One tap: today's reading and the single thing worth knowing. */
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
            {nm(CONFIG.weather.place)} 136118
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
