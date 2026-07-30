import { useEffect, useRef } from "react";
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
import { StatusPill } from "@/shared/ui/PlaceCard";
import { Photo } from "@/shared/ui/Photo";
import { Icon } from "@/shared/icons/Icon";
import { askLoc } from "@/features/location/location";

const mapPts = () =>
  D.filter((p) => p.lat && p.lng && (S.mapTheme === "all" || p.themes.indexOf(S.mapTheme) >= 0));

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
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap",
    }).addTo(map);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    drawMap(true);
    setTimeout(() => {
      try {
        map.invalidateSize(false);
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

  // redraw markers/route when theme, plan or location change
  useEffect(() => {
    drawMap(false);
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
        L.polyline(line, { color: "#9A4A33", weight: 3, opacity: 0.85, dashArray: "2 7", lineCap: "round" }).addTo(layer);
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
          map.fitBounds(bounds, { padding: [34, 34], maxZoom: 14, animate: false });
        } catch {
          /* ignore */
        }
    } catch {
      /* the screen moved on mid-draw */
    }
  }

  const setTheme = (id: string) => {
    S.mapTheme = id;
    bump(); // re-renders chips and triggers the redraw effect (tick)
  };

  return (
    <>
      <div className="phead">
        <h1 className="display" lang={S.lang}>
          {t("map")}
        </h1>
        <span style={{ flex: 1 }} />
        <button className="btn ghost sm" onClick={() => askLoc(() => drawMap(true))}>
          <Icon name="pin" />
          {t("myLoc")}
        </button>
      </div>
      <div className="mfilter">
        <button className={"chip" + (S.mapTheme === "all" ? " on warm" : "")} style={{ flex: "0 0 auto" }} onClick={() => setTheme("all")}>
          {t("all")}
        </button>
        {THEMES.map((th) => (
          <button
            key={th.id}
            className={"chip" + (S.mapTheme === th.id ? " on warm" : "")}
            style={{ flex: "0 0 auto" }}
            onClick={() => setTheme(th.id)}
          >
            {nm(th)}
          </button>
        ))}
      </div>
      <div className="mapwrap">
        <div id="leaf" ref={hostRef} />
      </div>
      <div className="note" style={{ margin: "12px 0 8px" }}>
        <Icon name="info" />
        <span>{t("mapNote")}</span>
      </div>
    </>
  );
}
