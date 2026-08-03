import { S } from "@/app/state";
import { nm } from "@/shared/i18n/i18n";
import { Icon } from "@/shared/icons/Icon";
import { byId } from "@/shared/lib/geo";
import { isoToday, nowM } from "@/shared/lib/datetime";
import { liveToday, startingSoon, eventPoints, isOverlay, type EventDef } from "@/data/events";
import { locate, CORRIDOR_M } from "@/features/journey/corridor";
import { planForEvent } from "@/features/planner/plan";

/** How near an event has to be to count as "where you are". */
const NEAR_M = 2500;

/**
 * What is happening right now, and whether it is in your way.
 *
 * This is the piece that makes the app worth opening on a day nobody is
 * sightseeing. The rail below it answers "what is on this season"; this
 * answers "is something on, now, between me and where I am going".
 *
 * The geometry is not new: `locate()` is the same corridor maths the drive
 * guide uses to say "on your left is Nabha House". A procession has a corridor
 * exactly the way a route does, so "is this event on my way" and "what am I
 * passing" are the same question asked of different lines.
 */
export function EventAlert() {
  const iso = isoToday();
  const now = nowM();
  const live = liveToday(iso, now).filter(isOverlay);
  const soon = startingSoon(iso, now, 90).filter(isOverlay);
  const e: EventDef | undefined = live[0] || soon[0];
  if (!e) return null;

  const pts = eventPoints(e, (id) => byId(id));
  const fix = S.userLoc;
  // Distance from the visitor to the procession, when we have a fix at all.
  // No fix is not "far away" — it is "unknown", and the alert still shows,
  // because a road closing at four o'clock matters whether or not the browser
  // has been given permission to say where you are.
  const near = fix && pts.length >= 2 ? (locate(fix, pts)?.offset ?? Infinity) : null;
  const inTheWay = near != null && near <= Math.max(CORRIDOR_M, NEAR_M);
  const starting = !live.length;
  const avoid = e.advice === "avoid";

  return (
    <button
      className={"evalert" + (avoid ? " avoid" : " join")}
      onClick={() => planForEvent(e)}
      lang={S.lang}
    >
      <span className="ea-ic">
        <Icon name={avoid ? "info" : "diya"} />
      </span>
      <span className="ea-bd">
        <span className="ea-k">
          {starting
            ? nm({ en: `From ${e.window!.from} today`, hi: `आज ${e.window!.from} से` })
            : nm({ en: "Happening now", hi: "अभी चल रहा है" })}
          {inTheWay && (
            <span className="ea-near">
              {nm({ en: " · near you", hi: " · आपके पास" })}
            </span>
          )}
        </span>
        <b>{nm(e.name)}</b>
        <span className="ea-note">{nm(e.notice)}</span>
      </span>
      <span className="ea-go">
        <Icon name="fwd" />
      </span>
    </button>
  );
}
