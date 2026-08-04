import { S, city, setCity } from "@/app/state";
import { CITIES, cityOf } from "@/data/cities";
import { D } from "@/data/destinations";
import { t, nm, nPlaces } from "@/shared/i18n/i18n";
import { Icon } from "@/shared/icons/Icon";
import { openSheet, closeSheet, toast } from "@/shared/ui/overlays";

/**
 * Which town the app is showing.
 *
 * It sits in the header rather than on Home because it is not a Home question:
 * someone reading the map, or looking at what they have saved, is exactly the
 * person who needs to notice they are looking at the wrong town. A chip that
 * *states* the town is also the cheapest way to answer "why can't I find
 * Jyotisar" — the answer is on screen before the question is asked.
 *
 * The rows reuse `.menurow`, which is already the app's list-inside-a-sheet.
 */
function CityBody() {
  return (
    <div className="menu">
      <h2 className="sheet-title" lang={S.lang}>
        {t("cityPick")}
      </h2>
      <p className="muted" style={{ margin: "2px 0 10px", fontSize: "calc(13px*var(--ts))" }} lang={S.lang}>
        {t("cityPickD")}
      </p>
      {CITIES.map((c) => {
        const on = c.id === S.city;
        const n = D.filter((d) => cityOf(d) === c.id).length;
        return (
          <button
            key={c.id}
            className="menurow"
            aria-current={on ? "true" : undefined}
            onClick={() => {
              closeSheet();
              if (!on) {
                setCity(c.id);
                toast(nm(c));
              }
            }}
          >
            <Icon name={on ? "check" : "pin"} />
            <span className="menutext">
              <b lang={S.lang}>{nm(c)}</b>
              <small>
                {nPlaces(n)} · {nm(c.region)}
              </small>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export const openCitySheet = () => openSheet(<CityBody />);

/** Header chip: the town you are in, and the way to change it. */
export function CityChip() {
  return (
    <button className="citybtn" onClick={openCitySheet} aria-haspopup="dialog" aria-label={t("cityPick")}>
      <Icon name="pin" />
      <span lang={S.lang}>{nm(city())}</span>
    </button>
  );
}
