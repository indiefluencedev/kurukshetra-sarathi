import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { S } from "@/app/state";
import { t, nm } from "@/shared/i18n/i18n";
import { CONFIG } from "@/data/config";
import { Icon } from "@/shared/icons/Icon";
import { PLACES_INDEX, type IndexPlace, type PlaceKind } from "@/data/places-index";
import type { GeoPoint } from "@/shared/types";

/** Searchable list of curated start/end places of the given kinds. */
export function PlacePicker({
  kinds,
  value,
  onPick,
}: {
  kinds: PlaceKind[];
  value: GeoPoint;
  onPick: (g: GeoPoint) => void;
}) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const list = PLACES_INDEX.filter((p) => kinds.includes(p.kind)).filter(
    (p) => !needle || (p.name.en + " " + p.name.hi).toLowerCase().includes(needle),
  );
  const pick = (p: IndexPlace) => onPick({ lat: p.lat, lng: p.lng, label: nm(p.name), ref: p.id });

  return (
    <div style={{ marginTop: 10 }}>
      {/* only show the search field when there are enough options to filter */}
      {PLACES_INDEX.filter((p) => kinds.includes(p.kind)).length > 4 && (
        <div className="search" style={{ marginBottom: 8 }}>
          <Icon name="search" />
          <input
            type="search"
            placeholder={nm({ en: "Search…", hi: "खोजें…" })}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      )}
      <div className="opts">
        {list.map((p) => (
          <button key={p.id} className={"opt" + (value.ref === p.id ? " on" : "")} onClick={() => pick(p)}>
            <span className="oi">
              <Icon name={p.kind === "busstand" ? "bus" : p.kind === "station" ? "mapi" : "home"} />
            </span>
            <span>
              <b lang={S.lang}>{nm(p.name)}</b>
            </span>
            <span className="chk" />
          </button>
        ))}
        {!list.length && (
          <p className="muted" style={{ fontSize: "calc(13px*var(--ts))", padding: "4px 2px" }}>
            {nm({ en: "No matches — try a different spelling.", hi: "कोई मिलान नहीं — दूसरी वर्तनी आज़माएँ।" })}
          </p>
        )}
      </div>
    </div>
  );
}

/** Tap-to-pin a location on a small Leaflet map (for "somewhere else"). */
export function PinMap({ value, onPin }: { value: GeoPoint; onPin: (g: GeoPoint) => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const start: [number, number] =
      value.ref || value.label ? [value.lat, value.lng] : [CONFIG.centre.lat, CONFIG.centre.lng];
    const map = L.map(host, { zoomControl: true, attributionControl: true }).setView(start, 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
    const place = (lat: number, lng: number) => {
      if (markerRef.current) markerRef.current.setLatLng([lat, lng]);
      else markerRef.current = L.marker([lat, lng]).addTo(map);
    };
    if (value.label) place(value.lat, value.lng);
    map.on("click", (e: L.LeafletMouseEvent) => {
      place(e.latlng.lat, e.latlng.lng);
      onPin({ lat: +e.latlng.lat.toFixed(6), lng: +e.latlng.lng.toFixed(6), label: nm({ en: "Pinned location", hi: "चिह्नित स्थान" }) });
    });
    setTimeout(() => map.invalidateSize(false), 150);
    return () => {
      map.off();
      map.remove();
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ marginTop: 10 }}>
      <div className="mapwrap" style={{ height: 260 }}>
        <div ref={hostRef} style={{ width: "100%", height: "100%" }} />
      </div>
      <p className="muted" style={{ fontSize: "calc(12.5px*var(--ts))", marginTop: 6 }}>
        {nm({ en: "Tap the map to drop a pin where you're starting from.", hi: "जहाँ से आरंभ कर रहे हैं वहाँ नक्शे पर पिन लगाएँ।" })}
      </p>
    </div>
  );
}

/** A small "Selected: …" / "Ending at: …" confirmation line. */
export function PickedLine({ point, prefix }: { point: GeoPoint; prefix?: string }) {
  if (!point.label) return null;
  return (
    <div className="note" style={{ marginTop: 10, alignItems: "center" }}>
      <Icon name="check" />
      <span>
        {prefix || t("save")}: <b>{point.label}</b>
      </span>
    </div>
  );
}
