import { Outlet, useLocation, Navigate } from "react-router-dom";
import { S, useApp, flipLang } from "@/app/state";
import { go } from "@/app/nav";
import { t } from "@/shared/i18n/i18n";
import { CONFIG } from "@/data/config";
import { LOGO_SM } from "@/data/images";
import { Icon } from "@/shared/icons/Icon";
import { openMenu } from "@/features/account/Menu";

// Five tabs. Explore had been folded into Home on the argument that browsing
// is the same job as arriving — but Home is a long scroll, and "see every
// place" was reachable only by finding a card partway down it. A tab is one
// tap from anywhere, which is what that job deserves.
//
// The bar's CSS derives the sliding pill's width from --tabs, so this array is
// the single place the count lives. It was hardcoded to /5 while this held
// four, which is why the pill never lined up with the active tab.
const TABS = ["home", "explore", "plan", "map", "saved"];

/**
 * Which tab owns this route, or -1 for the screens that belong to none of them
 * (settings, search, a place, credits).
 *
 * This used to fall back to 0, so opening Settings lit up "Home" — the bar
 * claimed you were somewhere you were not, which is worse than claiming
 * nothing. On those screens the pill now slides out of sight instead.
 */
function tabIndex(r: string): number {
  if (r === "/route" || r === "/go") return 2; // both are the planner's output
  if (r.indexOf("/theme/") === 0) return 1; // a theme is a filtered Explore
  return TABS.indexOf(r.slice(1));
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
      <button key={id} className={on ? "on" : ""} onClick={() => go("/" + id)} aria-current={on ? "page" : undefined}>
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
          {/* Three targets, not five. Search and the weather/clock moved onto
              Home, where they can be full-width and labelled instead of being
              two more small icons competing in the bar. */}
          <button className="langbtn" onClick={flipLang} aria-label={S.lang === "hi" ? "Switch to English" : "हिन्दी में बदलें"}>
            {S.lang === "hi" ? "हिन्दी" : "ENG"}
          </button>
          {/* One button, not two. Settings used to sit here on its own; now it
              is one row inside the menu alongside the account, so adding a
              destination later costs a row rather than another icon competing
              in a bar that only has room for three. Language keeps its own
              button because it is a *switch*, not a destination — burying a
              one-tap toggle two taps deep in a bilingual app is a downgrade. */}
          <button className="iconbtn" onClick={openMenu} aria-label={t("menu")} aria-haspopup="dialog">
            <Icon name="menu" />
          </button>
        </div>
      </header>
      <main className="screen">
        <Outlet />
      </main>
      {/* The planner's WIZARD keeps the bar hidden: it owns the bottom of the
          screen for Back / Continue, and a half-answered form is not a place to
          be tempted sideways out of. Its own Back reaches Home from the first
          step.

          Once a plan is built, /plan shows that plan instead of the form — and
          that screen is a destination like any other, so hiding the bar there
          would strand the visitor on it with no way to the map or to Saved. */}
      {!(r === "/plan" && !S.plan?.res) && r !== "/go" && (
        <nav
          className={"tab" + (tabIndex(r) < 0 ? " off" : "")}
          style={{ ["--i" as string]: Math.max(tabIndex(r), 0), ["--tabs" as string]: TABS.length }}
        >
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
