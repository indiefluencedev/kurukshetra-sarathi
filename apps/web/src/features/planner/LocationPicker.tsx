import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { S, city } from "@/app/state";
import { t, nm } from "@/shared/i18n/i18n";
import { Icon } from "@/shared/icons/Icon";
import { type PlaceKind } from "@/data/places-index";
import { openPlaceSheet, poolFor, rowById, detailOf, ICON_FOR } from "./PlaceSheet";
import type { GeoPoint } from "@/shared/types";

/**
 * The answer to "which one?", and the way back into the list.
 *
 * The list itself lives in a sheet — see PlaceSheet. What stays in the step is
 * one row: the place chosen, or an invitation to choose. Twelve stays rendered
 * inline pushed the map, the hint and Continue below the fold and turned a
 * one-line question into a page of scrolling.
 */
export function PlacePicker({
  kinds,
  value,
  onPick,
  title,
}: {
  kinds: PlaceKind[];
  value: GeoPoint;
  onPick: (g: GeoPoint) => void;
  title: string;
}) {
  const open = () => openPlaceSheet({ title, kinds, chosen: value.ref, onPick });
  const chosen = rowById(kinds, value.ref);
  // A pick from OpenStreetMap has no row in the catalogue, so the label it came
  // with is all there is — and it is enough.
  const label = chosen ? nm(chosen.name) : value.label;
  const sub = chosen ? detailOf(chosen) : undefined;
  const count = poolFor(kinds).length;

  return (
    <div style={{ marginTop: 10 }}>
      <button className={"pickfield" + (label ? " on" : "")} onClick={open}>
        <span className="oi">
          <Icon name={label ? ICON_FOR[chosen?.kind || ""] || "pin" : "search"} />
        </span>
        <span style={{ minWidth: 0 }}>
          <b lang={S.lang}>{label || nm({ en: "Search or choose from the list", hi: "खोजें या सूची में से चुनें" })}</b>
          <small>
            {sub ||
              (label
                ? nm({ en: "Tap to change", hi: "बदलने हेतु दबाएँ" })
                : nm({ en: count + " to choose from · or type any name", hi: count + " में से चुनें · या कोई भी नाम लिखें" }))}
          </small>
        </span>
        <span className="chev">
          <Icon name="chev" />
        </span>
      </button>

      {/* whatever was chosen, show it on a map — a name is not a location */}
      {value.label && (
        <PinMap
          value={value}
          onPin={onPick}
          height={190}
          search={false}
          hint={nm({ en: "Not quite right? Tap the map to correct it.", hi: "सही नहीं है? सुधारने हेतु नक्शे पर दबाएँ।" })}
        />
      )}
    </div>
  );
}

/*
 * The app's own pin, not Leaflet's.
 *
 * `L.marker(ll)` with no icon asks for marker-icon.png through Leaflet's CSS,
 * which Vite does not bundle — it rendered as a broken-image box on the built
 * app. Every other map here (MapView, RouteMap, DriveMap) already draws its
 * markers as divIcons for exactly this reason; this was the one that did not.
 */
const PIN = L.divIcon({
  html: '<span class="rmk start"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg></span>',
  className: "lmk-wrap",
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

/**
 * Tap-to-pin a location on a small Leaflet map, with a box to search it.
 *
 * `search` is off wherever something above has already searched. Two search
 * boxes stacked on one step is not two ways in, it is a question about which
 * box is the real one — and the map underneath a chosen hotel is there to
 * CONFIRM the choice, not to reopen it.
 */
export function PinMap({
  value,
  onPin,
  height = 260,
  hint,
  search = true,
  accuracy,
}: {
  value: GeoPoint;
  onPin: (g: GeoPoint) => void;
  height?: number;
  hint?: string;
  search?: boolean;
  /** metres the device claims for this fix — drawn as the circle it really is */
  accuracy?: number;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const ringRef = useRef<L.Circle | null>(null);
  const onPinRef = useRef(onPin);
  onPinRef.current = onPin;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const start: [number, number] = value.label ? [value.lat, value.lng] : [city().centre.lat, city().centre.lng];
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
      try {
        map.off();
        map.remove();
      } catch {
        /* the container went first — same race as RouteMap's */
      }
      mapRef.current = null;
      markerRef.current = null;
      ringRef.current = null;
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
    else markerRef.current = L.marker(ll, { icon: PIN }).addTo(map);
    markerRef.current.bindTooltip(value.label, { permanent: false });

    /* A fix is a circle, not a point, and drawing it as a point is the lie the
       old panel told: a 2 km wifi guess and a 12 m GPS lock looked identical.
       Seeing the circle is what tells a visitor whether tapping to correct it
       is worth their while. */
    if (accuracy && accuracy > 25) {
      if (ringRef.current) ringRef.current.setLatLng(ll).setRadius(accuracy);
      else
        ringRef.current = L.circle(ll, {
          radius: accuracy,
          color: "#2F5D8C",
          weight: 1,
          fillColor: "#2F5D8C",
          fillOpacity: 0.1,
        }).addTo(map);
      map.fitBounds(ringRef.current.getBounds(), { padding: [12, 12], maxZoom: 17 });
    } else {
      ringRef.current?.remove();
      ringRef.current = null;
      map.setView(ll, Math.max(map.getZoom(), 15));
    }
  }, [value.lat, value.lng, value.label, accuracy]);

  return (
    <div style={{ marginTop: 10 }}>
      {/* Searching for a street is the same question as searching for a stay,
          so it is the same sheet — never a second box competing with the one
          above it. */}
      {search && (
        <button
          className="pickfield"
          style={{ marginBottom: 8 }}
          onClick={() =>
            openPlaceSheet({
              title: nm({ en: "Find a place or street", hi: "जगह या सड़क खोजें" }),
              kinds: [],
              onPick: onPin,
            })
          }
        >
          <span className="oi">
            <Icon name="search" />
          </span>
          <span style={{ minWidth: 0 }}>
            <b lang={S.lang}>{nm({ en: "Search for a place or street", hi: "जगह या सड़क खोजें" })}</b>
            <small>{nm({ en: "Or tap the map below", hi: "या नीचे नक्शे पर दबाएँ" })}</small>
          </span>
          <span className="chev">
            <Icon name="chev" />
          </span>
        </button>
      )}

      <div className="mapwrap" style={{ height, margin: 0 }}>
        <div ref={hostRef} style={{ width: "100%", height: "100%" }} />
      </div>
      <p className="muted" style={{ fontSize: "calc(13px*var(--ts))", marginTop: 6 }}>
        {hint || nm({ en: "Tap the map to drop a pin where you're starting from.", hi: "जहाँ से आरंभ कर रहे हैं वहाँ नक्शे पर पिन लगाएँ।" })}
      </p>
    </div>
  );
}

/**
 * "Starting from: …" / "Ending at: …" — the step's answer, said back.
 *
 * Was a `.note`, which is the app's style for a caveat or a footnote. An
 * answered question is not a footnote, and steps 1 and 4 now both close with
 * `.answered`; this makes all four steps end the same way.
 */
export function PickedLine({ point, prefix }: { point: GeoPoint; prefix?: string }) {
  if (!point.label) return null;
  return (
    <div className="answered">
      <span className="ic">
        <Icon name="check" />
      </span>
      <span>
        <b lang={S.lang}>{point.label}</b>
        <span className="sub" lang={S.lang}>
          {prefix || t("save")}
        </span>
      </span>
    </div>
  );
}
