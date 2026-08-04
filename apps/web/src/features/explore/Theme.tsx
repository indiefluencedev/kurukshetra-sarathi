import { useParams } from "react-router-dom";
import { S } from "@/app/state";
import { t, nm, nPlaces } from "@/shared/i18n/i18n";
import { DC } from "@/data/destinations";
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
  const list = DC().filter((d) => d.themes.indexOf(id) >= 0).sort((a, b) => (b.rank || 0) - (a.rank || 0));
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
      {/* The call to action sits ABOVE the list. Someone who has opened a
          theme has already decided they are interested in it; making them
          scroll past twelve cards before they can act on that is the wrong
          order, and on a long theme the button was simply never seen. */}
      <button className="btn primary" style={{ marginBottom: 6 }} onClick={() => quickTheme(id)}>
        <Icon name="route" />
        {nm({ en: "Plan a day around this", hi: "इसी के आसपास दिन बनाएँ" })}
      </button>
      <p className="themecount" lang={S.lang}>
        {nPlaces(list.length)}
      </p>
      <div className="plist stagger">
        {list.map((d) => (
          <Pcard key={d.id} d={d} />
        ))}
      </div>
    </>
  );
}
