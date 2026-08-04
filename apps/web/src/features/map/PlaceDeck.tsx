import { S } from "@/app/state";
import { go } from "@/app/nav";
import { t, nm } from "@/shared/i18n/i18n";
import { dur } from "@/shared/lib/format";
import { distTo, navTo } from "@/shared/lib/geo";
import { Icon } from "@/shared/icons/Icon";
import { Photo } from "@/shared/ui/Photo";
import type { Destination } from "@/shared/types";

/**
 * The card a pin opens: a photograph, a name, and the two things you do next.
 *
 * It sits INSIDE the map rather than in a bottom sheet. A sheet covers the map
 * it was opened from, so comparing two pins meant open, read, dismiss, open,
 * read, dismiss — and on the route map the pins were not tappable at all, so a
 * numbered circle was the only thing identifying a stop.
 *
 * `n` is the stop number when the place is on the planned route, so a pin that
 * is "3" on the line says so in the deck too.
 */
export function PlaceDeck({
  d,
  n,
  onClose,
}: {
  d: Destination;
  n?: number;
  onClose: () => void;
}) {
  return (
    <div className="mdeck" role="dialog" aria-label={nm(d.name)}>
      <button className="mdeck-x" onClick={onClose} aria-label={nm({ en: "Close", hi: "बंद करें" })}>
        <Icon name="close" />
      </button>

      <button className="mdeck-main" onClick={() => go("/place/" + d.id)}>
        <span className="mdeck-ph">
          <Photo d={d} />
          {n != null && <span className="mdeck-n tnum">{n}</span>}
        </span>
        <span className="mdeck-bd">
          <span className="mdeck-name" lang={S.lang}>
            {nm(d.name)}
          </span>
          <span className="mdeck-meta">
            <span className="tnum">{dur(d.visit.rec)}</span>
            <i />
            <span className="tnum">
              {distTo(d)} {t("km")}
            </span>
          </span>
          <span className="mdeck-short" lang={S.lang}>
            {nm(d.short)}
          </span>
        </span>
      </button>

      <div className="mdeck-acts">
        <button className="btn nav sm" onClick={() => navTo(d.id)}>
          <Icon name="navigate" />
          {t("navigate")}
        </button>
        <button className="btn ghost sm" onClick={() => go("/place/" + d.id)}>
          {t("details")}
        </button>
      </div>
    </div>
  );
}
