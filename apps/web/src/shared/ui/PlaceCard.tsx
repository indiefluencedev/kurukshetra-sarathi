import { S, allTowns } from "@/app/state";
import { go } from "@/app/nav";
import { t, nm } from "@/shared/i18n/i18n";
import { dur } from "@/shared/lib/format";
import { isOpen, distTo } from "@/shared/lib/geo";
import { cityById, cityOf } from "@/data/cities";
import { addTo, inPlan } from "@/features/place/place-actions";
import { Icon } from "@/shared/icons/Icon";
import { Photo } from "./Photo";
import type { Destination } from "@/shared/types";

/** open/closed status chip. */
export function StatusPill({ d }: { d: Destination }) {
  const o = isOpen(d);
  return <span className={"status " + (o ? "open" : "shut")}>{o ? t("open") : t("shut")}</span>;
}

/** Compact feature card (theme rails, explore). */
export function Fcard({ d }: { d: Destination }) {
  return (
    <button className="fcard" onClick={() => go("/place/" + d.id)}>
      <Photo d={d} />
      <span className="in" style={{ display: "block" }}>
        <h3 lang={S.lang}>{nm(d.name)}</h3>
        <p>{nm(d.short)}</p>
        <span className="meta">
          <StatusPill d={d} />
          <span className="tag">
            <Icon name="clock" />
            {dur(d.visit.rec)}
          </span>
        </span>
      </span>
    </button>
  );
}

/**
 * The plus in the corner of every card.
 *
 * One control, two states: it puts the place in the day, and tapping it again
 * takes it back out. Nothing to choose, nothing to name, no second screen — on
 * a list of thirty-six that is the difference between building a day as you
 * read and remembering four names to type in later.
 *
 * `stopPropagation` because the card itself opens the place page, and a plus
 * that also navigated away would be a button that does two things.
 */
function QuickAdd({ d }: { d: Destination }) {
  const on = inPlan(d.id);
  const label = on ? t("itRemove") : t("addToIt");
  return (
    <button
      type="button"
      className={"qadd" + (on ? " on" : "")}
      aria-pressed={on}
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        addTo(d.id);
      }}
    >
      <Icon name={on ? "check" : "plus"} />
    </button>
  );
}

/** Full-width list card (explore list, near-me) with distance. */
export function Pcard({ d }: { d: Destination }) {
  // Which town, but only when both are showing — a label that reads
  // "Kurukshetra" on every card of a Kurukshetra list is noise.
  const town = allTowns() ? cityById(cityOf(d)) : null;
  const open = () => go("/place/" + d.id);
  /* A div with button semantics, not a <button>: the quick-add is a real
     button and nesting one inside another is invalid HTML — browsers recover
     from it by dropping the inner one, which is the control the whole feature
     depends on. Keyboard behaviour is restored by hand below. */
  return (
    <div
      className="card pcard"
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
    >
      <Photo d={d} />
      <span className="body">
        <h3 lang={S.lang}>{nm(d.name)}</h3>
        <span className="alt" lang={S.lang === "hi" ? "en" : "hi"}>
          {S.lang === "hi" ? d.name.en : d.name.hi}
        </span>
        <span className="sub">{nm(d.short)}</span>
        <span className="meta">
          <StatusPill d={d} />
          <span className="tag">
            <Icon name="clock" />
            {dur(d.visit.rec)}
          </span>
          <span className="tag">
            <Icon name="pin" />
            {distTo(d)} {t("km")}
          </span>
          {town && (
            <span className="tag town" lang={S.lang}>
              {nm(town)}
            </span>
          )}
        </span>
      </span>
      <QuickAdd d={d} />
    </div>
  );
}
