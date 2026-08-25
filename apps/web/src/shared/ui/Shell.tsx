import { Outlet, useLocation, Navigate } from "react-router-dom";
import { S, useApp, flipLang } from "@/app/state";
import { go } from "@/app/nav";
import { t, nm } from "@/shared/i18n/i18n";
import { CONFIG } from "@/data/config";
import { LOGO_SM } from "@/data/images";
import { Icon } from "@/shared/icons/Icon";
import { openMenu } from "@/features/account/Menu";
import { CityChip } from "@/shared/ui/CityPicker";
import { ongoing } from "@/data/events";
import { isoToday } from "@/shared/lib/datetime";

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

  const todayEvents = ongoing(isoToday());
  const activeEv = todayEvents.length > 0 ? todayEvents[0] : null;

  const fmtDate = (iso: string) => {
    if (!iso) return "";
    const p = iso.split("-");
    if (p.length < 3) return iso;
    return `${p[2]}/${p[1]}`;
  };

  return (
    <>
      <header>
        <div className="hbar">
          <button className="brand" onClick={() => go("/home")}>
            <span className="seal">
              <img src={LOGO_SM} alt="" decoding="async" />
            </span>
            <span className="wordmark">
              <b lang={S.lang}>{S.lang === "hi" ? CONFIG.brand.hi : CONFIG.brand.en}</b>
            </span>
          </button>
          <span className="hspace" />
          {/* Three controls, in ONE object.
              They used to float as three separate pills of three different
              shapes, which is what made the bar read as unfinished — and
              because each sized itself independently, the two that carried
              words both ran out of room and truncated: "Kurukshetra Saar…"
              beside "Kurukshet…", so the one thing the chip exists to tell you
              was the thing it cut off. Grouped, they share one border and one
              shadow, the separators do the work three outlines were doing, and
              the scope chip is the member that never shrinks.

              What is in the group: the scope, the language, the menu. The
              first two are switches rather than destinations — burying a
              one-tap toggle two taps deep in a bilingual app is a downgrade,
              and a scope buried in a menu leaves "why can't I find Jyotisar"
              with no answer on screen. */}
          <div className="hgroup">
            <CityChip />
            <span className="hsep" aria-hidden="true" />
            <button
              className="langbtn"
              onClick={flipLang}
              aria-label={S.lang === "hi" ? "Switch to English" : "हिन्दी में बदलें"}
            >
              {S.lang === "hi" ? "हिन्दी" : "ENG"}
            </button>
            <span className="hsep" aria-hidden="true" />
            <button className="iconbtn" onClick={openMenu} aria-label={t("menu")} aria-haspopup="dialog">
              <Icon name="menu" />
            </button>
          </div>
        </div>
      </header>
      {activeEv && (
        <div
          className="live-event-banner"
          onClick={() => go(`/event/${activeEv.id}`)}
          style={{
            background: "linear-gradient(135deg, oklch(65% 0.25 36) 0%, oklch(55% 0.23 34) 100%)",
            color: "#fff",
            padding: "10px 16px",
            fontSize: "13.5px",
            fontWeight: "600",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            cursor: "pointer",
            boxShadow: "inset 0 -1px 0 rgba(255,255,255,0.2), 0 4px 12px rgba(0, 0, 0, 0.05)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", overflow: "hidden" }}>
            <span style={{
              display: "inline-block",
              width: "8px",
              height: "8px",
              background: "#fff",
              borderRadius: "50%",
              boxShadow: "0 0 8px #fff",
              flexShrink: 0
            }} />
            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              📢 <strong>Live Event:</strong> {nm(activeEv.name)} ({activeEv.from === activeEv.to ? fmtDate(activeEv.from) : `${fmtDate(activeEv.from)} – ${fmtDate(activeEv.to)}`})
            </span>
          </div>
          <Icon name="fwd" style={{ width: "16px", height: "16px", flexShrink: 0 }} />
        </div>
      )}
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
