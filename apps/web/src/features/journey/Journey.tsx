import { S } from "@/app/state";
import { go } from "@/app/nav";
import { t, nm } from "@/shared/i18n/i18n";
import { Icon } from "@/shared/icons/Icon";
import { startGo } from "@/features/route/route-actions";
import { DriveMap } from "./DriveMap";

/**
 * The day, while it is happening.
 *
 * Three states and no choices: nothing to drive yet, the drive itself, and the
 * day finished. The drive is the map — see DriveMap — and this file is only the
 * two ends of it, because a journey that has not started and a journey that has
 * ended are not places for a live map to be.
 */
export function Journey() {
  const j = S.journey;
  if (!j) {
    // A built-but-not-started route is not "no route". Tapping through to this
    // screen right after building one used to answer "No route yet" and offer
    // to plan another — the visitor's actual itinerary was sitting one tab
    // away, unmentioned. Offer to start it.
    const it = S.plan && S.plan.res;
    const ready = !!(it && it.stops.length);
    return (
      <div className="empty">
        <Icon name="play" />
        <p className="t">
          {ready ? nm({ en: "Your route is ready", hi: "आपका मार्ग तैयार है" }) : t("noRoute")}
        </p>
        {ready && (
          <p style={{ maxWidth: "22em", margin: "6px auto 0" }} lang={S.lang}>
            {nm({
              en: `${it!.stops.length} stops, starting at ${nm(it!.stops[0].d.name)}.`,
              hi: `${it!.stops.length} पड़ाव, ${nm(it!.stops[0].d.name)} से आरंभ।`,
            })}
          </p>
        )}
        <button
          className="btn primary"
          style={{ maxWidth: 240, margin: "18px auto 0" }}
          onClick={() => (ready ? startGo() : go("/plan"))}
        >
          <Icon name={ready ? "play" : "route"} />
          {ready ? nm({ en: "Start the route", hi: "मार्ग शुरू करें" }) : t("planVisit")}
        </button>
        {ready && (
          <button
            className="link"
            style={{ margin: "10px auto 0" }}
            onClick={() => go("/route")}
          >
            {nm({ en: "See the plan first", hi: "पहले योजना देखें" })}
          </button>
        )}
      </div>
    );
  }
  if (j.i >= j.stops.length)
    return (
      <div className="empty" style={{ paddingTop: 60 }}>
        <Icon name="check" />
        <p className="t" style={{ fontSize: "calc(21px*var(--ts))" }}>
          {t("done")}
        </p>
        <p style={{ maxWidth: "22em", margin: "6px auto 0" }}>{t("doneD")}</p>
        <button className="btn primary" style={{ maxWidth: 240, margin: "22px auto 0" }} onClick={() => go("/home")}>
          {t("home")}
        </button>
      </div>
    );

  return <DriveMap />;
}
