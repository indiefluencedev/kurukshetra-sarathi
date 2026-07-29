import { S } from "@/app/state";
import { t } from "@/shared/i18n/i18n";
import { D } from "@/data/destinations";
import { Pcard } from "@/shared/ui/PlaceCard";

/** Every place, most essential first. */
export function Explore() {
  const list = D.slice().sort((a, b) => (b.first || 0) - (a.first || 0));
  return (
    <>
      <div className="phead">
        <h1 className="display" lang={S.lang}>
          {t("allPlaces")}
        </h1>
      </div>
      <p className="muted" style={{ fontSize: "calc(13px*var(--ts))", margin: "-6px 0 16px" }}>
        {list.length} {t("places")}
      </p>
      <div className="plist stagger">
        {list.map((d) => (
          <Pcard key={d.id} d={d} />
        ))}
      </div>
    </>
  );
}
