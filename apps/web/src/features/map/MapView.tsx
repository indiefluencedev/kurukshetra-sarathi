import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { S, useApp, bump, city } from "@/app/state";
import { go } from "@/app/nav";
import { t, nm } from "@/shared/i18n/i18n";
import { dur } from "@/shared/lib/format";
import { distTo, byId, navTo } from "@/shared/lib/geo";
import { THEMES, theme } from "@/data/config";
import { DC } from "@/data/destinations";
import { ICON } from "@/shared/icons/icons";
import { openSheet, closeSheet } from "@/shared/ui/overlays";
import { StatusPill, Pcard } from "@/shared/ui/PlaceCard";
import { Photo } from "@/shared/ui/Photo";
import { Icon } from "@/shared/icons/Icon";
import { askLoc } from "@/features/location/location";
import { PlaceDeck } from "./PlaceDeck";
import { roadGeometry } from "@/features/planner/routing/osrm";
import { routePoints } from "@/features/route/route-line";
import { startGo } from "@/features/route/route-actions";
import type { Destination } from "@/shared/types";

/**
 * Leaflet wants a literal, so read the colour off its token at draw time.
 * The drawn route is navigation, so it takes the reserved indigo — the saffron
 * accent stays on the numbered stop badges, which are things you tap.
 */
const navColour = () =>
  getComputedStyle(document.documentElement).getPropertyValue("--nav").trim() || "#24486E";

const mapPts = () =>
  DC().filter((p) => p.lat && p.lng && (S.mapTheme === "all" || p.themes.indexOf(S.mapTheme) >= 0));

/** ~4.5 km from the town centre — what counts as "in Kurukshetra" for framing. */
const CORE_DEG = 0.045;

/* `tapMap` used to open a full bottom sheet here. It covered the map it was
   opened from, so comparing two pins was open-read-dismiss, three times over.
   The same content is now a deck inside the map — see PlaceDeck. */

/**
 * Real slippy map — OpenStreetMap tiles via Leaflet, every tirtha pinned, the
 * planned route drawn over it, and the visitor's own position if allowed.
 */
export function MapView() {
  const tick = useApp();
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  // A slippy map is unusable by keyboard and screen reader, and useless with
  // the tiles unreachable. Both fall back to the same thing: the list the map
  // was only ever illustrating.
  const [list, setList] = useState(false);
  const [tilesDown, setTilesDown] = useState(false);
  const [sel, setSel] = useState<Destination | null>(null);
  // The planned day drawn over the pins is the point of this screen most of
  // the time, and squarely in the way the rest of it — when you are looking for
  // somewhere the plan does not go. So it is a switch, not a given.
  const [showPlan, setShowPlan] = useState(true);
  // The road the route actually takes, same as the route screen's map. Without
  // it this map drew dashes between the stops — a straight line through fields
  // and across the NH-44 central reservation, which is exactly the impression
  // a map is supposed to correct.
  const [road, setRoad] = useState<[number, number][]>([]);
  // Panning is off until the visitor asks for it — see .maplock in the
  // stylesheet for why. Only on a touch screen: a mouse has no scroll gesture
  // to collide with, so a desktop map that refused to drag would be broken for
  // no reason.
  const coarse = typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches;
  const [panning, setPanning] = useState(!coarse);
  /* drawMap is re-created every render, but it is also called from a 220ms
     setTimeout in the mount effect and from Leaflet callbacks — both of which
     hold whichever closure existed when they were scheduled. When the road
     geometry was already cached it arrived BEFORE that timeout, drew correctly,
     and was then overwritten by the stale closure redrawing the straight line.
     A ref has no version, so there is nothing to go stale. */
  const roadRef = useRef<[number, number][]>([]);
  roadRef.current = road;
  const tileErrs = useRef(0);

  // create the map once
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const map = L.map(host, {
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: true,
      // Dragging off on touch. Leaflet drops `leaflet-touch-drag` from the
      // container when it is disabled, which takes `touch-action` back from
      // `none` to `pan-x pan-y` — that CSS change IS the fix, and it is why
      // this has to be a real Leaflet handler rather than a class of our own.
      dragging: !coarse,
      fadeAnimation: false,
      zoomAnimation: false,
      markerZoomAnimation: false,
    }).setView([city().centre.lat, city().centre.lng], 13, { animate: false });
    const tiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap",
    }).addTo(map);
    // One failed tile is a pothole; several is no connection. Only the second
    // deserves to change what the visitor is looking at.
    tiles.on("tileerror", () => {
      if (++tileErrs.current >= 3) setTilesDown(true);
    });
    tiles.on("tileload", () => {
      tileErrs.current = 0;
      setTilesDown(false);
    });
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    drawMap(true);
    // Re-fit once the container has been measured — the first fit runs against
    // whatever size Leaflet assumed at mount.
    setTimeout(() => {
      try {
        map.invalidateSize(false);
        drawMap(true);
      } catch {
        /* node moved */
      }
    }, 220);
    return () => {
      try {
        map.stop();
        map.off();
        map.remove();
      } catch {
        /* ignore */
      }
      mapRef.current = null;
      layerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redraw markers/route when theme, plan or location change — and re-fit,
  // because filtering to "Sarovars" should take you to the sarovars rather than
  // leave you looking at the same wide view with four pins somewhere in it.
  useEffect(() => {
    drawMap(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, showPlan]);

  function drawMap(fit: boolean) {
    const map = mapRef.current,
      layer = layerRef.current;
    if (!map || !layer) return;
    try {
      layer.clearLayers();
      const pts = mapPts();
      const bounds: [number, number][] = [];
      const plan = showPlan ? S.plan : null;
      pts.forEach((p) => {
        const inR = !!(plan && plan.res && (plan.res.stops as any[]).some((x) => x.d.id === p.id));
        const ic = (theme(p.themes[0]) || { icon: "pin" }).icon;
        const html =
          '<span class="lmk' + (inR ? " on" : "") + '">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" ' +
          'stroke-linecap="round" stroke-linejoin="round">' + (ICON[ic] || ICON.pin) + "</svg></span>";
        const m = L.marker([p.lat, p.lng], {
          icon: L.divIcon({ html, className: "lmk-wrap", iconSize: [30, 30], iconAnchor: [15, 15] }),
          title: nm(p.name),
        });
        m.on("click", () => setSel(p));
        m.addTo(layer);
        bounds.push([p.lat, p.lng]);
      });
      if (plan && plan.res && plan.res.stops.length) {
        const straight = routePoints(plan).map((p) => [p.lat, p.lng] as [number, number]);
        // solid where we know the road, dashes where we are still guessing —
        // the same two states the route screen's map uses, and the dashes are
        // the honest one
        const drawn = roadRef.current;
        L.polyline(drawn.length ? drawn : straight, {
          color: navColour(),
          weight: drawn.length ? 5 : 3,
          opacity: drawn.length ? 0.85 : 0.7,
          dashArray: drawn.length ? undefined : "2 7",
          lineCap: "round",
          lineJoin: "round",
        }).addTo(layer);
        // where the day begins, so the line has a head and not just a first stop
        if (plan.start?.label)
          L.marker([plan.start.lat, plan.start.lng], {
            icon: L.divIcon({ html: '<span class="rmk start">A</span>', className: "lmk-wrap", iconSize: [26, 26], iconAnchor: [13, 13] }),
            title: plan.start.label,
          }).addTo(layer);
        // the number badges were interactive:false, so the one part of the map
        // a visitor most wants to ask about — "what is stop 4?" — was the one
        // part that ignored a tap
        (plan.res.stops as any[]).forEach((x, n) => {
          L.marker([x.d.lat, x.d.lng], {
            icon: L.divIcon({ html: '<span class="lnum">' + (n + 1) + "</span>", className: "lmk-wrap", iconSize: [22, 22], iconAnchor: [-4, 20] }),
            title: nm(x.d.name),
          })
            .on("click", () => setSel(x.d))
            .addTo(layer);
        });
      }
      if (S.userLoc) {
        L.marker([S.userLoc.lat, S.userLoc.lng], {
          icon: L.divIcon({ html: '<span class="lme"></span>', className: "lmk-wrap", iconSize: [18, 18], iconAnchor: [9, 9] }),
          title: "You",
        }).addTo(layer);
        bounds.push([S.userLoc.lat, S.userLoc.lng]);
      }
      if (fit && bounds.length)
        try {
          // If the visitor has a plan, the map is about THAT — open on the
          // day's route, framed to fit, not on a district-wide scatter they
          // then have to find their own route inside.
          const routePts =
            plan && plan.res && plan.res.stops.length
              ? (plan.res.stops as any[]).map((x) => [x.d.lat, x.d.lng] as [number, number])
              : null;
          if (routePts) {
            if (S.userLoc) routePts.push([S.userLoc.lat, S.userLoc.lng]);
            map.fitBounds(routePts, { padding: [46, 46], maxZoom: 15, animate: false });
          } else {
            // Fit the core, not the outliers. The full set spans ~12 km because
            // a handful of tirthas sit well outside town, and a view wide
            // enough to hold them puts the two dozen in the centre in one
            // unreadable pile. The distant pins are still drawn — they are a
            // pan away, and the theme filter re-fits.
            const core = bounds.filter(
              ([la, ln]) =>
                Math.abs(la - city().centre.lat) < CORE_DEG && Math.abs(ln - city().centre.lng) < CORE_DEG,
            );
            map.fitBounds(core.length > 2 ? core : bounds, { padding: [40, 40], maxZoom: 15, animate: false });
          }
        } catch {
          /* ignore */
        }
    } catch {
      /* the screen moved on mid-draw */
    }
  }

  // Fetch the real road for the drawn day. Keyed on the stop ids and the start
  // point, so switching day on a multi-day plan refetches and nothing else does.
  const planKey = (() => {
    const pl = S.plan;
    if (!showPlan || !pl?.res?.stops?.length) return "";
    return (
      (pl.start ? pl.start.lat.toFixed(4) + "," + pl.start.lng.toFixed(4) : "") +
      "|" + (pl.res.stops as any[]).map((x) => x.d.id).join(",")
    );
  })();

  useEffect(() => {
    if (!planKey) {
      setRoad([]);
      return;
    }
    // The SAME points the route screen asks for — see route-line.ts. When
    // these two lists differed, the two maps drew two different journeys.
    const via = routePoints(S.plan);
    let dead = false;
    const ac = new AbortController();
    roadGeometry(via, ac.signal).then((geo) => {
      // same guard as RouteMap's: roadGeometry resolves even when aborted
      if (!dead && geo.length > via.length) setRoad(geo);
    });
    return () => {
      dead = true;
      ac.abort();
    };
  }, [planKey]);

  // redraw once the road arrives
  useEffect(() => {
    drawMap(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [road]);


  // Leaflet measured itself against a hidden container while the list was up.
  useEffect(() => {
    if (!list) setTimeout(() => mapRef.current?.invalidateSize(false), 60);
  }, [list]);

  // Hand panning to Leaflet, or take it back. Toggling the handler is what
  // swaps `touch-action` on the container, so the page becomes scrollable over
  // the map again the moment this goes off.
  useEffect(() => {
    const dr = mapRef.current?.dragging;
    if (!dr) return;
    if (panning) dr.enable();
    else dr.disable();
  }, [panning]);

  const plan = S.plan;
  const multi = plan?.multi;

  /**
   * Which theme chips to offer.
   *
   * All eight, unfiltered, is the right answer when the map is a directory of
   * the district. With a day drawn on it the map is about THAT day, and eight
   * chips — six of which filter to places the plan never goes near — is a
   * choice nobody on a trip is trying to make. So the row narrows to the themes
   * the plan's own stops carry. "All" is always there to widen it again.
   */
  const planThemes = (() => {
    if (!showPlan || !plan?.res?.stops?.length) return THEMES;
    const has = new Set<string>();
    (plan.res.stops as any[]).forEach((x) => x.d.themes.forEach((th: string) => has.add(th)));
    const narrowed = THEMES.filter((th) => has.has(th.id));
    return narrowed.length ? narrowed : THEMES;
  })();

  // Narrowing the row can strand the current selection on a chip that is no
  // longer shown — the filter would keep applying with nothing on screen to
  // turn it off. Fall back to "All".
  useEffect(() => {
    if (S.mapTheme !== "all" && !planThemes.some((th) => th.id === S.mapTheme)) {
      S.mapTheme = "all";
      bump();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planThemes.length]);

  /** the place's number on the drawn route, if it is on it */
  const stopNo = (id: string): number | undefined => {
    if (!showPlan || !plan?.res) return undefined;
    const i = (plan.res.stops as any[]).findIndex((x) => x.d.id === id);
    return i < 0 ? undefined : i + 1;
  };

  const setTheme = (id: string) => {
    S.mapTheme = id;
    bump(); // re-renders chips and triggers the redraw effect (tick)
  };

  return (
    <>
      {/* Title on its own line, actions under it. Three things competing on
          one 390px row left the heading squeezed to "Map" beside two buttons
          that read as more important than the screen they were on. */}
      <div className="phead">
        <h1 className="display" lang={S.lang}>
          {t("map")}
        </h1>
      </div>
      <div className="mapacts">
        <button className="btn ghost sm" onClick={() => setList((v) => !v)} aria-pressed={list}>
          <Icon name={list ? "mapi" : "saved"} />
          {list ? nm({ en: "Show the map", hi: "नक्शा दिखाएँ" }) : nm({ en: "Show a list", hi: "सूची दिखाएँ" })}
        </button>
        <button className="btn ghost sm" onClick={() => askLoc(() => drawMap(true))}>
          <Icon name="pin" />
          {t("myLoc")}
        </button>
      </div>
      {/* A plan on the map is the map's main subject. Say which day is drawn,
          and let the visitor change it here rather than sending them back to
          the route screen to do it. */}
      {plan?.res?.stops?.length ? (
        <div className="mapplan">
          <div className="mp-head">
            <span className="mp-line" lang={S.lang}>
              <Icon name="route" />
              {multi
                ? nm({ en: `Your plan · day ${(plan.day || 0) + 1} of ${multi.days.length}`, hi: `आपकी योजना · दिन ${(plan.day || 0) + 1} / ${multi.days.length}` })
                : nm({ en: "Your plan, drawn in order", hi: "आपकी योजना, क्रम से" })}
            </span>
            {/* The route drawn over every pin is what this screen is for most of
                the time, and squarely in the way the rest of it — when the
                visitor is looking for somewhere the plan does not go. */}
            <label className="mp-toggle">
              <span lang={S.lang}>{nm({ en: "Show", hi: "दिखाएँ" })}</span>
              <input
                type="checkbox"
                className="sw"
                checked={showPlan}
                onChange={(e) => setShowPlan(e.target.checked)}
                aria-label={nm({ en: "Show my plan on the map", hi: "नक्शे पर मेरी योजना दिखाएँ" })}
              />
            </label>
          </div>
          {/* The map is where a visitor decides they are actually going. Until
              now starting the day meant navigating back to the route screen to
              find the button. Same startGo() — it primes speech inside this tap,
              which is the only place iOS will allow it. */}
          <button className="btn primary mp-start" onClick={startGo}>
            <Icon name="play" />
            {nm({ en: "Start the trip", hi: "यात्रा शुरू करें" })}
          </button>
          {multi && showPlan && (
            <div className="daytabs" role="tablist">
              {multi.days.map((dd, i) => (
                <button
                  key={i}
                  role="tab"
                  aria-selected={plan.day === i}
                  className={plan.day === i ? "on" : ""}
                  onClick={() => {
                    plan.day = i;
                    plan.res = multi.days[i];
                    bump();
                  }}
                >
                  <b lang={S.lang}>{S.lang === "hi" ? "दिन " + (i + 1) : "Day " + (i + 1)}</b>
                  <small>{dd.stops.length}</small>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <div className="mfilter">
        <button className={"chip" + (S.mapTheme === "all" ? " on warm" : "")} aria-pressed={S.mapTheme === "all"} style={{ flex: "0 0 auto" }} onClick={() => setTheme("all")}>
          {t("all")}
        </button>
        {planThemes.map((th) => (
          <button
            key={th.id}
            className={"chip" + (S.mapTheme === th.id ? " on warm" : "")}
            aria-pressed={S.mapTheme === th.id}
            style={{ flex: "0 0 auto" }}
            onClick={() => setTheme(th.id)}
          >
            {nm(th)}
          </button>
        ))}
      </div>
      {tilesDown && !list && (
        <div className="mapoff">
          <Icon name="info" />
          <span>
            <b lang={S.lang}>{nm({ en: "The map needs a connection", hi: "नक्शे के लिए संपर्क चाहिए" })}</b>
            {nm({
              en: "Everything else works offline. Tap List to see the same places, nearest first.",
              hi: "बाकी सब बिना संपर्क चलता है। वही स्थान देखने के लिए ‘सूची’ दबाएँ।",
            })}
          </span>
        </div>
      )}
      <div className="mapwrap mapdeck-host" hidden={list}>
        <div id="leaf" ref={hostRef} />
        {/* Hidden while a place is open: the deck sits in this corner, and two
            controls stacked on each other is the kind of overlap that costs a
            mis-tap. */}
        {coarse && !sel && (
          <button
            className={"maplock" + (panning ? " on" : "")}
            aria-pressed={panning}
            onClick={() => setPanning((v) => !v)}
          >
            <Icon name={panning ? "check" : "mapi"} />
            {panning
              ? nm({ en: "Done moving", hi: "हो गया" })
              : nm({ en: "Move the map", hi: "नक्शा खिसकाएँ" })}
          </button>
        )}
        {sel && <PlaceDeck d={sel} n={stopNo(sel.id)} onClose={() => setSel(null)} />}
      </div>
      {list && (
        <div className="plist stagger">
          {mapPts()
            .slice()
            .sort((a, b) => +distTo(a) - +distTo(b))
            .map((d) => (
              <Pcard key={d.id} d={d} />
            ))}
        </div>
      )}
      <div className="note" style={{ margin: "12px 0 8px" }}>
        <Icon name="info" />
        <span>{t("mapNote")}</span>
      </div>
    </>
  );
}
