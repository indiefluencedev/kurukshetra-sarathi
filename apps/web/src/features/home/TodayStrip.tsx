import { S } from "@/app/state";
import { go } from "@/app/nav";
import { nm } from "@/shared/i18n/i18n";
import { Icon } from "@/shared/icons/Icon";
import { isoToday, fromISO } from "@/shared/lib/datetime";
import { DAYNAMES, MONS } from "@/features/planner/plan";
import { wcode } from "@/features/weather/weather";
import { WxGlyph, openWxSheet } from "@/features/weather/WeatherChip";

/**
 * The state of today, in one line.
 *
 * This used to be three separate things: a weather chip beside the search box,
 * a clock inside it, and the aarti timing buried on each place page. Split up,
 * none of them told a visitor what kind of day they had walked into. Together
 * they are the most relatable thing on the screen — a pilgrim standing at the
 * bus stand wants to know the date, the heat and when the light goes, and all
 * three are already in the app.
 *
 * Renders the date alone until the forecast lands, rather than a skeleton: the
 * date is real immediately and never needs replacing.
 */
export function TodayStrip() {
  const w = S.wx;
  const iso = isoToday();
  const d = fromISO(iso);
  const lang = S.lang === "hi" ? "hi" : "en";
  const dateLine = DAYNAMES[lang][d.getDay()] + ", " + d.getDate() + " " + MONS[lang][d.getMonth()];
  const [kind, word] = w ? wcode(w.code) : ["sun", { en: "", hi: "" }];

  return (
    <div className="today">
      <button className="tdy-main" onClick={openWxSheet} lang={S.lang}>
        <span className="tdy-date" lang={S.lang}>
          {dateLine}
        </span>
        {w && (
          <span className="tdy-wx">
            <span className="tdy-glyph">
              <WxGlyph kind={kind} day={w.day ? 1 : 0} />
            </span>
            <b className="tnum">{Math.round(w.temp)}°</b>
            <span className="tdy-word" lang={S.lang}>
              {nm(word)}
            </span>
            {w.sunset && (
              <>
                <i className="tdy-sep" />
                <Icon name="sunset" />
                <span className="tnum">{w.sunset}</span>
              </>
            )}
          </span>
        )}
      </button>
      <button
        className="tdy-search"
        onClick={() => go("/explore")}
        aria-label={nm({ en: "Search places", hi: "स्थान खोजें" })}
      >
        <Icon name="search" />
      </button>
    </div>
  );
}
