import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { S, useApp, bump } from "@/app/state";
import { go } from "@/app/nav";
import { t, nm } from "@/shared/i18n/i18n";
import { dur } from "@/shared/lib/format";
import { distTo, byId, navTo } from "@/shared/lib/geo";
import { CONFIG, THEMES, theme } from "@/data/config";
import { D } from "@/data/destinations";
import { ICON } from "@/shared/icons/icons";
import { openSheet, closeSheet } from "@/shared/ui/overlays";
import { StatusPill, Pcard } from "@/shared/ui/PlaceCard";
import { Photo } from "@/shared/ui/Photo";
import { Icon } from "@/shared/icons/Icon";
import { askLoc } from "@/features/location/location";

/**
 * Leaflet wants a literal, so read the colour off its token at draw time.
 * The drawn route is navigation, so it takes the reserved indigo — the saffron
 * accent stays on the numbered stop badges, which are things you tap.
 */
const navColour = () =>
  getComputedStyle(document.documentElement).getPropertyValue("--nav").trim() || "#24486E";

const mapPts = () =>
  D.filter((p) => p.lat && p.lng && (S.mapTheme === "all" || p.themes.indexOf(S.mapTheme) >= 0));

/** ~4.5 km from the town centre — what counts as "in Kurukshetra" for framing. */
const CORE_DEG = 0.045;

function tapMap(id: string) {
  const d = byId(id);
  if (!d) return;
  openSheet(
    <>
      <style>{`.sheet .ph{width:86px;height:86px;border-radius:12px;flex:0 0 auto}`}</style>
      <div style={{ display: "flex", gap: 13 }}>
        <Photo d={d} />
        <div style={{ minWidth: 0 }}>
          <h2 className="display" style={{ fontSize: "calc(18px*var(--ts))" }} lang={S.lang}>
            {nm(d.name)}
          </h2>
          <div className="wrap" style={{ margin: "7px 0" }}>
            <StatusPill d={d} />
            <span className="tag">{dur(d.visit.rec)}</span>
            <span className="tag">
              {distTo(d)} {t("km")}
            </span>
          </div>
        </div>
      </div>
      <p className="muted" style={{ fontSize: "calc(13.5px*var(--ts))", margin: "11px 0 8px" }}>
        {nm(d.short)}
      </p>
      <div className="note" style={{ marginBottom: 14 }}>
        <Icon name="surya" />
        <span>{nm(d.best)}</span>
      </div>
      <div style={{ display: "flex", gap: 9 }}>
        <button className="btn nav" style={{ flex: 1 }} onClick={() => navTo(id)}>
          <Icon name="navigate" />
          {t("navigate")}
        </button>
        <button
          className="btn primary"
          style={{ flex: 1 }}
          onClick={() => {
            closeSheet();
            go("/place/" + id);
          }}
        >
          {t("details")}
        </button>
      </div>
    </>,
  );
}

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
  const tileErrs = useRef(0);

  // create the map once
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const map = L.map(host, {
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: true,
      fadeAnimation: false,
      zoomAnimation: false,
      markerZoomAnimation: false,
    }).setView([CONFIG.centre.lat, CONFIG.centre.lng], 13, { animate: false });
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
  }, [tick]);

  function drawMap(fit: boolean) {
    const map = mapRef.current,
      layer = layerRef.current;
    if (!map || !layer) return;
    try {
      layer.clearLayers();
      const pts = mapPts();
      const bounds: [number, number][] = [];
      const plan = S.plan;
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
        m.on("click", () => tapMap(p.id));
        m.addTo(layer);
        bounds.push([p.lat, p.lng]);
      });
      if (plan && plan.res && plan.res.stops.length) {
        const line = (plan.res.stops as any[]).map((x) => [x.d.lat, x.d.lng] as [number, number]);
        L.polyline(line, { color: navColour(), weight: 3, opacity: 0.85, dashArray: "2 7", lineCap: "round" }).addTo(layer);
        (plan.res.stops as any[]).forEach((x, n) => {
          L.marker([x.d.lat, x.d.lng], {
            icon: L.divIcon({ html: '<span class="lnum">' + (n + 1) + "</span>", className: "lmk-wrap", iconSize: [22, 22], iconAnchor: [-4, 20] }),
            interactive: false,
          }).addTo(layer);
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
                Math.abs(la - CONFIG.centre.lat) < CORE_DEG && Math.abs(ln - CONFIG.centre.lng) < CORE_DEG,
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

  // Leaflet measured itself against a hidden container while the list was up.
  useEffect(() => {
    if (!list) setTimeout(() => mapRef.current?.invalidateSize(false), 60);
  }, [list]);

  const plan = S.plan;
  const multi = plan?.multi;

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
          <span className="mp-line" lang={S.lang}>
            <Icon name="route" />
            {multi
              ? nm({ en: `Your plan · day ${(plan.day || 0) + 1} of ${multi.days.length}`, hi: `आपकी योजना · दिन ${(plan.day || 0) + 1} / ${multi.days.length}` })
              : nm({ en: "Your plan, drawn in order", hi: "आपकी योजना, क्रम से" })}
          </span>
          {multi && (
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
        {THEMES.map((th) => (
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
      <div className="mapwrap" hidden={list}>
        <div id="leaf" ref={hostRef} />
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
