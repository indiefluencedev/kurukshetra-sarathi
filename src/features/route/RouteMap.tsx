import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { S } from "@/app/state";
import { nm } from "@/shared/i18n/i18n";
import { Icon } from "@/shared/icons/Icon";
import { roadGeometry } from "@/features/planner/routing/osrm";
import { PlaceDeck } from "@/features/map/PlaceDeck";
import type { Itinerary, GeoPoint, Destination } from "@/shared/types";

/**
 * Leaflet wants a literal, so read the colour off its token at draw time.
 * A drawn route is navigation, so it takes the reserved indigo — never the
 * saffron the rest of the app uses for things you tap.
 */
const navColour = () =>
  getComputedStyle(document.documentElement).getPropertyValue("--nav").trim() || "#24486E";

/**
 * The day drawn: where you start, every stop in order, where you finish, and
 * the road between them. The order is the whole point — a list of times is
 * abstract, a line you can trace is not.
 */
export function RouteMap({ it, start, end }: { it: Itinerary; start: GeoPoint; end: GeoPoint }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [real, setReal] = useState(false);
  // which pin is open. Kept out of the Leaflet effect so opening a deck never
  // rebuilds the map underneath it.
  const [sel, setSel] = useState<{ d: Destination; n: number } | null>(null);

  const stops = it.stops as any[];
  const via = [
    { lat: start.lat, lng: start.lng },
    ...stops.map((s) => ({ lat: s.d.lat, lng: s.d.lng })),
    { lat: end.lat, lng: end.lng },
  ];
  const key = via.map((p) => p.lat.toFixed(4) + "," + p.lng.toFixed(4)).join("|");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const ac = new AbortController();
    // set on cleanup: see the roadGeometry callback below
    let dead = false;
    const map = L.map(host, { zoomControl: true, attributionControl: true, scrollWheelZoom: false });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);

    const pin = (lat: number, lng: number, html: string, size: number, title: string) =>
      L.marker([lat, lng], {
        icon: L.divIcon({ html, className: "lmk-wrap", iconSize: [size, size], iconAnchor: [size / 2, size / 2] }),
        title,
      }).addTo(map);

    pin(start.lat, start.lng, '<span class="rmk start">A</span>', 28, start.label || "Start");
    // Every numbered pin opens its place. Until now the stops were drawn and
    // nothing more: a circle with a "3" in it, on a map, identifying nothing.
    stops.forEach((s, i) => {
      const m = pin(s.d.lat, s.d.lng, '<span class="rmk">' + (i + 1) + "</span>", 28, nm(s.d.name));
      m.on("click", () => setSel({ d: s.d, n: i + 1 }));
    });
    // "back where you started" would stack two pins on one spot — say so once
    const sameEnd = Math.abs(end.lat - start.lat) < 1e-5 && Math.abs(end.lng - start.lng) < 1e-5;
    if (!sameEnd) pin(end.lat, end.lng, '<span class="rmk end">B</span>', 28, end.label || "End");

    let line = L.polyline(via.map((p) => [p.lat, p.lng] as [number, number]), {
      color: navColour(),
      weight: 4,
      opacity: 0.75,
      dashArray: "3 8",
      lineCap: "round",
    }).addTo(map);

    map.fitBounds(via.map((p) => [p.lat, p.lng] as [number, number]), { padding: [36, 36], maxZoom: 14 });
    setTimeout(() => map.invalidateSize(false), 180);

    // Swap the straight line for the actual roads once OSRM answers.
    //
    // `dead` is not belt-and-braces. roadGeometry resolves even when the
    // request is aborted — it falls back to the straight segments rather than
    // rejecting — so leaving this screen mid-flight ran the callback against a
    // map that had already been removed. Adding a polyline to a dead map sends
    // Leaflet to getRenderer() for a pane that no longer exists, and it throws
    // "Cannot read properties of undefined (reading 'appendChild')" from inside
    // a promise nobody is catching. Reproduced by going route → map while the
    // road geometry was still loading.
    roadGeometry(via, ac.signal).then((geo) => {
      if (dead || geo.length <= via.length) return; // gone, or the fallback came back
      try {
        map.removeLayer(line);
        line = L.polyline(geo, { color: navColour(), weight: 5, opacity: 0.85, lineCap: "round", lineJoin: "round" }).addTo(map);
        line.bringToBack();
        setReal(true);
      } catch {
        /* the map went between the check and the draw */
      }
    });

    return () => {
      dead = true;
      ac.abort();
      // Guarded, like MapView's. Navigating away while OSRM is still in flight
      // lets React drop the container before Leaflet tears itself down, and
      // map.remove() then throws "appendChild of undefined" from inside a
      // cleanup nobody can catch. Reproduced by tapping through
      // route → map → route quickly.
      try {
        map.off();
        map.remove();
      } catch {
        /* the container went first */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <div className="routemap">
      <div className="mapwrap mapdeck-host" style={{ margin: 0, height: 300 }}>
        <div ref={hostRef} style={{ width: "100%", height: "100%" }} />
        {sel && <PlaceDeck d={sel.d} n={sel.n} onClose={() => setSel(null)} />}
      </div>
      <p className="muted rm-note" lang={S.lang}>
        <Icon name="route" />
        {real
          ? nm({ en: "A is where you start. Follow the numbers in order.", hi: "A से आप आरंभ करते हैं। क्रम से संख्याओं का अनुसरण करें।" })
          : nm({ en: "A is where you start. Follow the numbers in order — the dashes show direction, not the exact road.", hi: "A से आप आरंभ करते हैं। क्रम से संख्याओं का अनुसरण करें — बिंदु दिशा दर्शाते हैं, सटीक सड़क नहीं।" })}
      </p>
    </div>
  );
}
