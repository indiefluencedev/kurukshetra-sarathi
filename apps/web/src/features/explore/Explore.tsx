import { useEffect, useRef, useState } from "react";
import { S, allTowns, city } from "@/app/state";
import { t, nm, nPlaces } from "@/shared/i18n/i18n";
import { DC, themesHere } from "@/data/destinations";
import { isOpen } from "@/shared/lib/geo";
import { savedCount } from "@/features/place/place-actions";
import { quickTheme, quick } from "@/features/planner/plan";
import { Icon } from "@/shared/icons/Icon";
import { Pcard } from "@/shared/ui/PlaceCard";

type Filters = Record<string, boolean>;

/**
 * Every place, and the one place you look for one.
 *
 * Explore and Search used to be two screens rendering the same list off the
 * same data with the same cards — the only difference being that Search had a
 * text box and four filter chips, and Explore had the theme chips. Two screens
 * for one job, and whichever one you were on, the control you wanted was on
 * the other. They are one screen now: the box and the chips narrow the same
 * list, and a theme is one more way of narrowing it.
 *
 * The text box sits under the theme row, not above it. Someone arriving here
 * is browsing; someone typing already knows what they want and will find a box
 * wherever it is. Leading with it asks the harder question first.
 */
export function Explore({ theme: fixedTheme }: { theme?: string } = {}) {
  const [q, setQ] = useState(S.sq);
  const [th, setTh] = useState(fixedTheme || "");
  const [sf, setSf] = useState<Filters>(S.sf);
  const boxRef = useRef<HTMLInputElement>(null);

  // A theme reached by URL wins over whatever was last chosen here.
  useEffect(() => {
    if (fixedTheme) setTh(fixedTheme);
  }, [fixedTheme]);

  // Coming back should find the screen as it was left — the query and the
  // filters were already global state for exactly this reason.
  useEffect(() => {
    S.sq = q;
    S.sf = sf;
  }, [q, sf]);

  const here = DC();
  const themes = themesHere();
  // A theme this scope cannot fill is not a filter, it is an empty list.
  const active = th && themes.some((x) => x.th.id === th) ? th : "";
  const query = q.trim().toLowerCase();

  const list = here
    .filter((d) => {
      if (active && d.themes.indexOf(active) < 0) return false;
      if (query) {
        const hay = (d.name.en + " " + d.name.hi + " " + nm(d.short) + " " + d.themes.join(" ")).toLowerCase();
        if (hay.indexOf(query) < 0) return false;
      }
      if (sf.open && !isOpen(d)) return false;
      if (sf.free && !d.free) return false;
      if (sf.indoor && !d.indoor) return false;
      if (sf.short && d.visit.rec > 40) return false;
      return true;
    })
    // Typing is a search, so the best match leads; browsing is a tour, so the
    // place a first-time visitor should not miss leads.
    .sort((a, b) => (query ? (b.rank || 0) - (a.rank || 0) : (b.first || 0) - (a.first || 0)));

  const anyFilter = Object.values(sf).some(Boolean);
  const toggle = (k: string) => setSf((p) => ({ ...p, [k]: !p[k] }));
  const fchip = (k: string, lb: string) => (
    <button className={"chip sm" + (sf[k] ? " on" : "")} aria-pressed={!!sf[k]} onClick={() => toggle(k)} lang={S.lang}>
      {lb}
    </button>
  );

  const inIt = savedCount();
  const head = active ? nm(themes.find((x) => x.th.id === active)!.th) : t("allPlaces");
  const scope = allTowns() ? nm({ en: "Both towns", hi: "दोनों नगर" }) : nm(city());

  return (
    <>
      <div className="phead">
        <h1 className="display" lang={S.lang}>
          {head}
        </h1>
      </div>
      <p className="scopeline" lang={S.lang}>
        {scope} · {nPlaces(here.length)}
      </p>

      <div className="filterbar">
        <div className="hscroll cats">
          <button className={"chip" + (active ? "" : " on")} onClick={() => setTh("")} lang={S.lang}>
            <Icon name="compass" />
            {t("all")}
            <i className="cn">{here.length}</i>
          </button>
          {themes.map(({ th: x, n }) => (
            <button
              key={x.id}
              className={"chip" + (active === x.id ? " on" : "")}
              onClick={() => setTh(active === x.id ? "" : x.id)}
              lang={S.lang}
            >
              <Icon name={x.icon} />
              {nm(x)}
              <i className="cn">{n}</i>
            </button>
          ))}
        </div>
      </div>

      <div className="search" style={{ marginTop: 10 }}>
        <Icon name="search" />
        <input
          ref={boxRef}
          type="search"
          placeholder={t("searchPh")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {q && (
          <button
            className="iconbtn"
            style={{ width: 32, minWidth: 32 }}
            onClick={() => setQ("")}
            aria-label={nm({ en: "Clear", hi: "साफ़ करें" })}
          >
            <Icon name="close" />
          </button>
        )}
      </div>

      <div className="hscroll" style={{ marginTop: 9 }}>
        {fchip("open", t("fOpen"))}
        {fchip("free", t("fFree"))}
        {fchip("indoor", t("fIndoor"))}
        {fchip("short", t("fShort"))}
      </div>

      {/* What the plus on every card is for. Said once, at the top, rather than
          repeated as a label on thirty-six buttons. */}
      <div className="note exnote">
        <Icon name="plus" />
        <span lang={S.lang}>
          {t("exHint")}
          {inIt ? " " + t("itHas").replace("{n}", String(inIt)) : ""}
        </span>
      </div>

      <p className="srescount" role="status" aria-live="polite" lang={S.lang}>
        {list.length !== here.length ? nPlaces(list.length) : ""}
      </p>

      {list.length ? (
        // No .stagger while filtering: the list changes on every keystroke, and
        // an entrance animation on a live filter is a flicker, not a flourish.
        <div className={query || anyFilter ? "plist" : "plist stagger"}>
          {list.map((d) => (
            <Pcard key={d.id} d={d} />
          ))}
        </div>
      ) : (
        <div className="empty">
          <Icon name="search" />
          <p className="t">{t("nothing")}</p>
          <p>{t("nothingD")}</p>
          {anyFilter && (
            <button className="btn ghost" style={{ maxWidth: 230, margin: "16px auto 0" }} onClick={() => setSf({})}>
              {nm({ en: "Clear filters", hi: "फ़िल्टर हटाएँ" })}
            </button>
          )}
        </div>
      )}

      {list.length > 0 && (
        <button
          className="btn primary"
          style={{ margin: "18px 0 6px" }}
          onClick={() => (active ? quickTheme(active) : quick(240, { en: "Half a day", hi: "आधा दिन" }))}
        >
          <Icon name="route" />
          {t("planVisit")}
        </button>
      )}
    </>
  );
}
