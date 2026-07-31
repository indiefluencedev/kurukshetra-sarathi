import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { S } from "@/app/state";
import { t, nm } from "@/shared/i18n/i18n";
import { CONFIG } from "@/data/config";
import { Icon } from "@/shared/icons/Icon";
import { PLACES_INDEX, type IndexPlace, type PlaceKind } from "@/data/places-index";
import { browseNearby, searchNearby, type FoundPlace } from "./places-search";
import type { GeoPoint } from "@/shared/types";

const ICON_FOR: Record<string, string> = { busstand: "bus", station: "mapi", hotel: "home", dharamshala: "home" };

/**
 * Search a kind of place — stays, stations, bus stands. The curated list
 * answers first and offline; OpenStreetMap fills in everything else, so the
 * traveller can name the actual lodge they booked instead of settling for the
 * nearest thing on our list.
 */
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
  const [live, setLive] = useState<FoundPlace[]>([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const needle = q.trim().toLowerCase();
  const curated = PLACES_INDEX.filter((p) => kinds.includes(p.kind)).filter(
    (p) => !needle || (p.name.en + " " + p.name.hi).toLowerCase().includes(needle),
  );

  // Typing searches OSM by name; an empty box lists what's nearby. Debounced
  // and aborted on every keystroke — these are community-run, rate-limited APIs.
  // Skipped entirely when the curated list is the only source (CONFIG.places).
  useEffect(() => {
    if (!CONFIG.places.useOSM) return;
    const ac = new AbortController();
    setBusy(true);
    setFailed(false);
    const wait = needle ? 550 : 0;
    const timer = setTimeout(() => {
      (needle ? searchNearby(needle, ac.signal, kinds[0]) : browseNearby(kinds, ac.signal))
        .then((r) => setLive(r))
        .catch((e) => {
          if (e.name !== "AbortError") setFailed(true);
        })
        .finally(() => setBusy(false));
    }, wait);
    return () => {
      clearTimeout(timer);
      ac.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needle, kinds.join(",")]);

  // Never show the same place twice because it's both curated and in OSM.
  const names = new Set(curated.flatMap((p) => [p.name.en.toLowerCase(), p.name.hi.toLowerCase()]));
  const extra = live.filter((p) => !names.has(p.name.toLowerCase())).slice(0, 12);

  const pickCurated = (p: IndexPlace) => onPick({ lat: p.lat, lng: p.lng, label: nm(p.name), ref: p.id });
  /** the locality, or the station code — whichever the curated entry carries */
  const curatedDetail = (p: IndexPlace) => [p.code, p.area && nm(p.area)].filter(Boolean).join(" · ") || undefined;
  const pickLive = (p: FoundPlace) => onPick({ lat: p.lat, lng: p.lng, label: p.name });

  const row = (key: string, kind: string, label: string, sub: string | undefined, on: boolean, go: () => void) => (
    <button key={key} className={"opt" + (on ? " on" : "")} onClick={go}>
      <span className="oi">
        <Icon name={ICON_FOR[kind] || "pin"} />
      </span>
      <span style={{ minWidth: 0 }}>
        <b lang={S.lang}>{label}</b>
        {sub ? <small>{sub}</small> : null}
      </span>
      <span className="chk" />
    </button>
  );

  return (
    <div style={{ marginTop: 10 }}>
      <div className="search" style={{ marginBottom: 8 }}>
        <Icon name="search" />
        <input
          type="search"
          placeholder={nm({ en: "Search by name…", hi: "नाम से खोजें…" })}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="opts">
        {curated.map((p) => row(p.id, p.kind, nm(p.name), curatedDetail(p), value.ref === p.id, () => pickCurated(p)))}
        {extra.length > 0 && (
          <div className="srcnote">
            <Icon name="mapi" />
            {nm({ en: "From OpenStreetMap", hi: "OpenStreetMap से" })}
          </div>
        )}
        {extra.map((p) =>
          row(p.id, p.kind, p.name, p.detail, !value.ref && value.label === p.name, () => pickLive(p)),
        )}
      </div>

      {busy && CONFIG.places.useOSM && (
        <p className="muted" style={{ fontSize: "calc(13px*var(--ts))", padding: "8px 2px" }}>
          {nm({ en: "Looking…", hi: "खोज रहे हैं…" })}
        </p>
      )}
      {!busy && !curated.length && !extra.length && (
        <p className="muted" style={{ fontSize: "calc(13px*var(--ts))", padding: "4px 2px" }}>
          {failed
            ? nm({ en: "Search is offline. Pick from the list, or drop a pin below.", hi: "खोज उपलब्ध नहीं। सूची से चुनें, या नीचे पिन लगाएँ।" })
            : nm({ en: "Not on our list. Try a different spelling, or choose “Somewhere else” to pin it on the map.", hi: "हमारी सूची में नहीं। दूसरी वर्तनी आज़माएँ, या “कोई और जगह” चुनकर नक्शे पर पिन लगाएँ।" })}
        </p>
      )}

      {/* whatever was chosen, show it on a map — a name is not a location */}
      {value.label && <PinMap value={value} onPin={onPick} height={190} hint={nm({ en: "Not quite right? Tap the map to correct it.", hi: "सही नहीं है? सुधारने हेतु नक्शे पर दबाएँ।" })} />}
    </div>
  );
}

/** Tap-to-pin a location on a small Leaflet map. */
export function PinMap({
  value,
  onPin,
  height = 260,
  hint,
}: {
  value: GeoPoint;
  onPin: (g: GeoPoint) => void;
  height?: number;
  hint?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const onPinRef = useRef(onPin);
  onPinRef.current = onPin;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const start: [number, number] = value.label ? [value.lat, value.lng] : [CONFIG.centre.lat, CONFIG.centre.lng];
    const map = L.map(host, { zoomControl: true, attributionControl: true }).setView(start, value.label ? 15 : 13);
    mapRef.current = map;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
    map.on("click", (e: L.LeafletMouseEvent) => {
      onPinRef.current({
        lat: +e.latlng.lat.toFixed(6),
        lng: +e.latlng.lng.toFixed(6),
        label: nm({ en: "Pinned location", hi: "चिह्नित स्थान" }),
      });
    });
    setTimeout(() => map.invalidateSize(false), 150);
    return () => {
      map.off();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The point can arrive late (a location fix) or change (a different hotel) —
  // follow it, or the map shows the last place the user looked at.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !value.label) return;
    const ll: [number, number] = [value.lat, value.lng];
    if (markerRef.current) markerRef.current.setLatLng(ll);
    else markerRef.current = L.marker(ll).addTo(map);
    markerRef.current.bindTooltip(value.label, { permanent: false });
    map.setView(ll, Math.max(map.getZoom(), 15));
  }, [value.lat, value.lng, value.label]);

  return (
    <div style={{ marginTop: 10 }}>
      <div className="mapwrap" style={{ height, margin: 0 }}>
        <div ref={hostRef} style={{ width: "100%", height: "100%" }} />
      </div>
      <p className="muted" style={{ fontSize: "calc(13px*var(--ts))", marginTop: 6 }}>
        {hint || nm({ en: "Tap the map to drop a pin where you're starting from.", hi: "जहाँ से आरंभ कर रहे हैं वहाँ नक्शे पर पिन लगाएँ।" })}
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
