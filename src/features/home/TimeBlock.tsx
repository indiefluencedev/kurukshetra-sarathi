import { S } from "@/app/state";
import { nm } from "@/shared/i18n/i18n";
import { isoToday } from "@/shared/lib/datetime";
import { Icon } from "@/shared/icons/Icon";
import { quick, homeDate, dayLabel, setDay } from "@/features/planner/plan";
import type { Loc } from "@/shared/types";

const WSHORT: [string, number][] = [["1h", 60], ["2h", 120], ["3h", 180], ["4h", 240], ["6h", 360]];
const WLONG: [Loc, number][] = [
  [{ en: "½ day", hi: "आधा दिन" }, 300],
  [{ en: "Full day", hi: "पूरा दिन" }, 480],
  [{ en: "2 days", hi: "2 दिन" }, 960],
  [{ en: "3 days", hi: "3 दिन" }, 1440],
];

/** First thing on the screen: how long, and which day. Two fixed rows of pills. */
export function TimeBlock() {
  const iso = homeDate();
  const pill = (l: string | Loc, m: number) => {
    const label = typeof l === "string" ? l : nm(l);
    return (
      <button key={label} className="tpill" onClick={() => quick(m, label)}>
        {label}
      </button>
    );
  };

  return (
    <section className="tblock">
      <div className="tb-head">
        <h1 className="display" lang={S.lang}>
          {nm({ en: "How long do you have in Kurukshetra?", hi: "कुरुक्षेत्र में आपके पास कितना समय है?" })}
        </h1>
        <label className="daypick">
          <Icon name="cal" />
          <span>{dayLabel(iso)}</span>
          <input
            type="date"
            value={iso}
            min={isoToday()}
            onChange={(e) => setDay(e.target.value)}
            aria-label={nm({ en: "Day of visit", hi: "यात्रा का दिन" })}
          />
        </label>
      </div>
      <div className="tp-row a">{WSHORT.map((w) => pill(w[0], w[1]))}</div>
      <div className="tp-row b">{WLONG.map((w) => pill(w[0], w[1]))}</div>
      <p className="tb-note">
        {nm({ en: "Pick one and a route is built for that day — opening hours and Monday closures included.", hi: "एक चुनिए, उसी दिन का मार्ग बन जाएगा — खुलने का समय और सोमवार की बंदी सहित।" })}
      </p>
    </section>
  );
}
