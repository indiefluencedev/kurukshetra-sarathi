import { useParams } from "react-router-dom";
import { S } from "@/app/state";
import { t, nm } from "@/shared/i18n/i18n";
import { D } from "@/data/destinations";
import { theme } from "@/data/config";
import { Pcard } from "@/shared/ui/PlaceCard";
import { Icon } from "@/shared/icons/Icon";
import { quickTheme } from "@/features/planner/plan";
import { Explore } from "./Explore";

/** One interest group's places, ranked, with a "plan a visit" call to action. */
export function Theme() {
  const { id = "" } = useParams();
  const th = theme(id);
  if (!th) return <Explore />;
  const list = D.filter((d) => d.themes.indexOf(id) >= 0).sort((a, b) => (b.rank || 0) - (a.rank || 0));
  return (
    <>
      <div className="phead">
        <button className="back" onClick={() => history.back()} aria-label={t("back")}>
          <Icon name="back" />
        </button>
        <h1 className="display" lang={S.lang}>
          {nm(th)}
        </h1>
      </div>
      <div className="plist stagger">
        {list.map((d) => (
          <Pcard key={d.id} d={d} />
        ))}
      </div>
      <button className="btn primary" style={{ margin: "20px 0 6px" }} onClick={() => quickTheme(id)}>
        <Icon name="route" />
        {t("planVisit")}
      </button>
    </>
  );
}
