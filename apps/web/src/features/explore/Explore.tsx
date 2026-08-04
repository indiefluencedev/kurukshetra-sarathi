import { useState } from "react";
import { S } from "@/app/state";
import { t, nm, nPlaces } from "@/shared/i18n/i18n";
import { THEMES } from "@/data/config";
import { DC } from "@/data/destinations";
import { Icon } from "@/shared/icons/Icon";
import { Pcard } from "@/shared/ui/PlaceCard";

/** Every place, most essential first — filterable, because thirty-six of them
    is four screens of scrolling and "all of it" is not a way to find one. The
    chip row sticks under the header so the filter is still reachable from the
    bottom of the list rather than only from the top. */
export function Explore() {
  const [th, setTh] = useState("");
  const all = DC().sort((a, b) => (b.first || 0) - (a.first || 0));
  const list = th ? all.filter((d) => d.themes.indexOf(th) >= 0) : all;

  return (
    <>
      <div className="phead">
        <h1 className="display" lang={S.lang}>
          {t("allPlaces")}
        </h1>
      </div>

      <div className="filterbar">
        <div className="hscroll">
          <button className={"chip" + (th ? "" : " on")} onClick={() => setTh("")} lang={S.lang}>
            {nm({ en: "All", hi: "सभी" })}
          </button>
          {THEMES.map((x) => (
            <button
              key={x.id}
              className={"chip" + (th === x.id ? " on" : "")}
              onClick={() => setTh(th === x.id ? "" : x.id)}
              lang={S.lang}
            >
              <Icon name={x.icon} />
              {nm(x)}
            </button>
          ))}
        </div>
      </div>

      <p className="themecount">{nPlaces(list.length)}</p>

      <div className="plist stagger">
        {list.map((d) => (
          <Pcard key={d.id} d={d} />
        ))}
      </div>
    </>
  );
}
