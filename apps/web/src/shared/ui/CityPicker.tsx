import { S, city, setCity, allTowns } from "@/app/state";
import { ALL, CITIES, cityOf } from "@/data/cities";
import { D } from "@/data/destinations";
import { t, nm, nPlaces } from "@/shared/i18n/i18n";
import { Icon } from "@/shared/icons/Icon";
import { openSheet, closeSheet, toast } from "@/shared/ui/overlays";

/**
 * Which town the app is showing — one of them, or both at once.
 *
 * It sits in the header rather than on Home because it is not a Home question:
 * someone reading the map, or looking at what they have saved, is exactly the
 * person who needs to notice they are looking at the wrong town. A chip that
 * *states* the scope is also the cheapest way to answer "why can't I find
 * Jyotisar" — the answer is on screen before the question is asked.
 *
 * "Both towns" leads, because it is the answer for anyone who does not yet
 * know the district well enough for the question to mean anything.
 */
const scopes = () => [
  { id: ALL, label: { en: "Both towns", hi: "दोनों नगर" }, sub: null },
  ...CITIES.map((c) => ({ id: c.id, label: c, sub: c.region })),
];

function CityBody() {
  return (
    <div className="menu">
      <h2 className="sheet-title" lang={S.lang}>
        {t("cityPick")}
      </h2>
      <p className="muted" style={{ margin: "2px 0 10px", fontSize: "calc(13px*var(--ts))" }} lang={S.lang}>
        {t("cityPickD")}
      </p>
      {scopes().map((sc) => {
        const on = sc.id === S.city;
        const n = sc.id === ALL ? D.length : D.filter((d) => cityOf(d) === sc.id).length;
        return (
          <button
            key={sc.id}
            className="menurow"
            aria-current={on ? "true" : undefined}
            onClick={() => {
              closeSheet();
              if (!on) {
                setCity(sc.id);
                toast(nm(sc.label));
              }
            }}
          >
            <Icon name={on ? "check" : sc.id === ALL ? "compass" : "pin"} />
            <span className="menutext">
              <b lang={S.lang}>{nm(sc.label)}</b>
              <small>{nPlaces(n) + (sc.sub ? " · " + nm(sc.sub) : "")}</small>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export const openCitySheet = () => openSheet(<CityBody />);

/** What the header chip says: the town, or that both are showing. */
export const scopeName = (): string =>
  allTowns() ? nm({ en: "Both towns", hi: "दोनों नगर" }) : nm(city());

/** Header chip: the scope you are browsing, and the way to change it. */
export function CityChip() {
  return (
    <button className="citybtn" onClick={openCitySheet} aria-haspopup="dialog" aria-label={t("cityPick")}>
      <Icon name={allTowns() ? "compass" : "pin"} />
      <span lang={S.lang}>{scopeName()}</span>
    </button>
  );
}
