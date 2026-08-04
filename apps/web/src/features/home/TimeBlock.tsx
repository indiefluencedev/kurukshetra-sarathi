import { S } from "@/app/state";
import { t, nm } from "@/shared/i18n/i18n";
import { isoToday } from "@/shared/lib/datetime";
import { Icon } from "@/shared/icons/Icon";
import { quick, homeDate, dayLabel, setDay, WINDOWS, go2plan } from "@/features/planner/plan";
import type { Loc } from "@/shared/types";

/**
 * First thing on the screen: how long, and which day.
 *
 * The lengths come from WINDOWS — the same list the planner's first step
 * offers — because these pills *are* that step, answered early. When the two
 * were separate lists Home could hand the planner a "2 days" it had no chip
 * for, and the step opened showing "Custom · 16h".
 */
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
          {t("greeting")}
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
      <div className="tp-row a">{WINDOWS.map((w) => pill(w.lb, w.mins))}</div>
      {/* anything the five presets don't cover — including a stay of several
          days — is one tap away in the step itself, where it has room */}
      <button className="tpill more" onClick={go2plan}>
        {nm({ en: "Another length, or more than a day", hi: "कोई और अवधि, या एक से अधिक दिन" })}
      </button>
      <p className="tb-note">
        {nm({ en: "Pick one and a route is built for that day — opening hours and Monday closures included.", hi: "एक चुनिए, उसी दिन का मार्ग बन जाएगा — खुलने का समय और सोमवार की बंदी सहित।" })}
      </p>
    </section>
  );
}
