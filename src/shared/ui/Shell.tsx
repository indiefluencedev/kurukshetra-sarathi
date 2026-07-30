import { Outlet, useLocation, Navigate } from "react-router-dom";
import { S, useApp, flipLang } from "@/app/state";
import { go } from "@/app/nav";
import { t } from "@/shared/i18n/i18n";
import { CONFIG } from "@/data/config";
import { LOGO_SM } from "@/data/images";
import { Icon } from "@/shared/icons/Icon";
import { WeatherChip } from "@/features/weather/WeatherChip";

const TABS = ["home", "explore", "plan", "map", "saved"];
function tabIndex(r: string): number {
  if (r === "/route" || r === "/go") return 2;
  if (r.indexOf("/theme/") === 0) return 1;
  const i = TABS.indexOf(r.slice(1));
  return i < 0 ? 0 : i;
}

/** App chrome: header + scrolling main + bottom tab bar (hidden on the planner). */
export function Shell() {
  useApp();
  const r = useLocation().pathname;
  if (!S.lang) return <Navigate to="/start" replace />;

  const tab = (id: string, ic: string, lb: string) => {
    const on =
      r === "/" + id ||
      (id === "plan" && (r === "/route" || r === "/go")) ||
      (id === "explore" && r.indexOf("/theme/") === 0);
    return (
      <button className={on ? "on" : ""} onClick={() => go("/" + id)} aria-current={on ? "page" : undefined}>
        <Icon name={ic} />
        <span>{lb}</span>
      </button>
    );
  };

  return (
    <>
      <header>
        <div className="hbar">
          <button className="brand" onClick={() => go("/home")}>
            <span className="seal">
              <img src={LOGO_SM} alt="" />
            </span>
            <span className="wordmark">
              <b lang={S.lang}>{S.lang === "hi" ? CONFIG.brand.hi : CONFIG.brand.en}</b>
            </span>
          </button>
          <span className="hspace" />
          <WeatherChip />
          <button className="iconbtn" onClick={() => go("/search")} aria-label="Search">
            <Icon name="search" />
          </button>
          <button className="langbtn" onClick={flipLang}>
            {S.lang === "hi" ? "हिन्दी" : "ENG"}
          </button>
          <button className="iconbtn" onClick={() => go("/settings")} aria-label="Settings">
            <Icon name="gear" />
          </button>
        </div>
      </header>
      <main className="screen">
        <Outlet />
      </main>
      {r !== "/plan" && (
        <nav className="tab" style={{ ["--i" as string]: tabIndex(r) }}>
          {tab("home", "home", t("home"))}
          {tab("explore", "compass", t("explore"))}
          {tab("plan", "route", t("plan"))}
          {tab("map", "mapi", t("map"))}
          {tab("saved", "saved", t("saved"))}
        </nav>
      )}
    </>
  );
}
