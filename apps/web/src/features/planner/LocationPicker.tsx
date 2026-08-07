import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { S, city } from "@/app/state";
import { t, nm } from "@/shared/i18n/i18n";
import { CONFIG } from "@/data/config";
import { Icon } from "@/shared/icons/Icon";
import { PLACES_INDEX, type IndexPlace, type PlaceKind } from "@/data/places-index";
import { cityOf } from "@/data/cities";
import { searchNearby, type FoundPlace } from "./places-search";
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
  // Sorted by town, not filtered by it. Someone visiting Pehowa still arrives
  // at Kurukshetra Junction — there is no station in Pehowa town — so hiding
  // the other town's terminals would remove the only correct answer. What the
  // active town earns is the top of the list, and `area` says how far out the
  // rest are.
  const curated = PLACES_INDEX.filter((p) => kinds.includes(p.kind))
    .filter((p) => !needle || (p.name.en + " " + p.name.hi).toLowerCase().includes(needle))
    .sort((a, b) => Number(cityOf(b) === S.city) - Number(cityOf(a) === S.city));

  // OSM is queried ONLY when something has been typed.
  //
  // An empty box used to call browseNearby() and pour every lodge, dhaba and
  // banquet hall within a few kilometres into the step — a dozen-odd rows of
  // things nobody asked for, under a heading nobody needed, which had to be
  // scrolled past to reach the two entries that were actually curated. Nothing
  // in that list was an answer to "where are you staying?"; it was a directory.
  //
  // The curated entries still show unprompted, because they are short and
  // authoritative and for a railway station or a bus stand they ARE the answer.
  // Everything else has to be named. Debounced and aborted per keystroke —
  // these are community-run, rate-limited APIs.
  useEffect(() => {
    if (!CONFIG.places.useOSM || needle.length < 2) {
      setLive([]);
      setBusy(false);
      return;
    }
    const ac = new AbortController();
    setBusy(true);
    setFailed(false);
    const timer = setTimeout(() => {
      searchNearby(needle, ac.signal, kinds[0])
        .then((r) => setLive(r))
        .catch((e) => {
          if (e.name !== "AbortError") setFailed(true);
        })
        .finally(() => setBusy(false));
    }, 450);
    return () => {
      clearTimeout(timer);
      ac.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needle, kinds.join(",")]);

  // Never show the same place twice because it's both curated and in OSM.
  // Eight is a screenful; beyond that the answer is a better search term.
  const names = new Set(curated.flatMap((p) => [p.name.en.toLowerCase(), p.name.hi.toLowerCase()]));
  const extra = live.filter((p) => !names.has(p.name.toLowerCase())).slice(0, 8);
  const searching = needle.length >= 2;

  /*
   * Three, until asked for more.
   *
   * Six railway stations is an honest list and a bad question. The step asks
   * "where are you starting?" and answers it with a directory that pushes the
   * map, the hint and the next button off the screen — and the two an actual
   * traveller arrives at are the first two. The rest are a halt at Amin and a
   * platform 11km outside Pehowa, correct and almost never the answer.
   *
   * The order already puts the active town first, so the top three are the
   * ones worth offering. Everything else is one tap away, and typing searches
   * the whole list regardless — nothing is hidden from someone who knows what
   * they want.
   */
  const [all, setAll] = useState(false);
  const top = curated.slice(0, 3);
  // A choice already made is never hidden behind "show more". Returning to the
  // step to find your own answer missing, and the tick gone with it, reads as
  // the app having forgotten it — and the traveller answers a second time.
  const chosenBelow =
    !!value.ref && !top.some((p) => p.id === value.ref) && curated.some((p) => p.id === value.ref);
  const shown = searching || all || chosenBelow ? curated : top;
  const rest = curated.length - shown.length;

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
        {shown.map((p) => row(p.id, p.kind, nm(p.name), curatedDetail(p), value.ref === p.id, () => pickCurated(p)))}
        {rest > 0 && (
          <button className="linkish" style={{ padding: "8px 3px" }} onClick={() => setAll(true)}>
            {nm({ en: "Show " + rest + " more", hi: rest + " और दिखाएँ" })}
          </button>
        )}
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

      {busy && (
        <p className="pickhint">{nm({ en: "Looking…", hi: "खोज रहे हैं…" })}</p>
      )}

      {/* Nothing typed: say what the box is for rather than filling it with a
          directory. This is the whole point of not browsing — the step now
          fits on one screen and asks one question. */}
      {!searching && !busy && (
        <p className="pickhint">
          {nm({
            en: "Staying somewhere else? Type its name above.",
            hi: "कहीं और ठहरे हैं? ऊपर उसका नाम लिखें।",
          })}
        </p>
      )}

      {searching && !busy && !curated.length && !extra.length && (
        <p className="pickhint">
          {failed
            ? nm({ en: "Search is offline. Pick from the list, or choose “Somewhere else” to pin it on the map.", hi: "खोज उपलब्ध नहीं। सूची से चुनें, या “कोई और जगह” चुनकर नक्शे पर पिन लगाएँ।" })
            : nm({ en: "Nothing by that name. Try a shorter word, or choose “Somewhere else” to pin it on the map.", hi: "इस नाम से कुछ नहीं मिला। छोटा शब्द आज़माएँ, या “कोई और जगह” चुनकर नक्शे पर पिन लगाएँ।" })}
        </p>
      )}

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
}: {
  value: GeoPoint;
  onPin: (g: GeoPoint) => void;
  height?: number;
  hint?: string;
  search?: boolean;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<FoundPlace[]>([]);
  const [busy, setBusy] = useState(false);
  const needle = q.trim();

  /*
   * The same search PlacePicker runs, on the map that had none.
   *
   * Panning from the town centre to your own street on a phone is a minute of
   * dragging, and it was the only way in — the pin is still the answer, this
   * just puts the map over the right rooftop first. Debounced and aborted per
   * keystroke, because Nominatim is community-run; silent on failure, because
   * tapping the map never stopped working.
   */
  useEffect(() => {
    if (!search || !CONFIG.places.useOSM || needle.length < 3) {
      setHits([]);
      setBusy(false);
      return;
    }
    const ac = new AbortController();
    setBusy(true);
    const timer = setTimeout(() => {
      searchNearby(needle, ac.signal)
        .then(setHits)
        .catch(() => setHits([]))
        .finally(() => setBusy(false));
    }, 450);
    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }, [needle]);

  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
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

  /* Picking a result only sets the point — the effect above already follows it,
     so the map recentres and the pin lands by the same path a tap takes. */
  const pick = (p: FoundPlace) => {
    onPin({ lat: p.lat, lng: p.lng, label: p.name });
    setQ("");
    setHits([]);
  };

  return (
    <div style={{ marginTop: 10 }}>
      {search && (
        <div className="search" style={{ marginBottom: 8 }}>
          <Icon name="search" />
          <input
            type="search"
            placeholder={nm({ en: "Search for a place or street…", hi: "जगह या सड़क खोजें…" })}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      )}

      {hits.length > 0 && (
        <div className="opts" style={{ marginBottom: 8 }}>
          {hits.slice(0, 6).map((p) => (
            <button key={p.id} className="opt" onClick={() => pick(p)}>
              <span className="oi">
                <Icon name="pin" />
              </span>
              <span style={{ minWidth: 0 }}>
                <b>{p.name}</b>
                {p.detail ? <small>{p.detail}</small> : null}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Silence after a search reads as broken, so say the map still works. */}
      {needle.length >= 3 && !busy && !hits.length && (
        <p className="pickhint">
          {nm({
            en: "Nothing by that name nearby. Tap the map instead.",
            hi: "इस नाम से पास कुछ नहीं मिला। इसके बजाय नक्शे पर दबाएँ।",
          })}
        </p>
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
