import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { S, bump } from "@/app/state";
import { go } from "@/app/nav";
import { nm, t } from "@/shared/i18n/i18n";
import { dur } from "@/shared/lib/format";
import { byId, navTo } from "@/shared/lib/geo";
import { clock } from "@/shared/lib/datetime";
import { D } from "@/data/destinations";
import { Icon } from "@/shared/icons/Icon";
import { Photo } from "@/shared/ui/Photo";
import { addTo } from "@/features/place/AddSheet";
import { roadGeometry } from "@/features/planner/routing/osrm";
import { passingPlaces, progressAlong, type Passing } from "./corridor";
import { due, markSaid, speak, resetGuide, voiceOn, setVoiceOn, speechAvailable } from "./guide";

const navColour = () =>
  getComputedStyle(document.documentElement).getPropertyValue("--nav").trim() || "#1E3A5F";

/**
 * Driving the day, in the app.
 *
 * "Start the trip" used to hand the visitor to Google Maps in a new tab, which
 * ends the journey as far as this app is concerned: the moment they leave, the
 * guide stops, the day's order is gone, and nothing can announce what they are
 * passing. That is the one thing this app has that a general-purpose maps app
 * does not, and it was being given away at exactly the moment it became useful.
 *
 * So the map is here, full screen, following the fix: the day drawn on real
 * roads, the next stop named, and the corridor announced as it goes past.
 * Turn-by-turn is still Google's job — the "Directions" button is one tap away
 * and always was. This screen answers "where am I in my day", which is a
 * different question and nobody else is answering it.
 *
 * It owns the ONE geolocation watch. DriveGuide keeps its own for the list
 * view; rendering both at once would open two watches on the same device and
 * double every announcement, so Journey shows one or the other, never both.
 */
export function DriveMap({ onClose }: { onClose: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const meRef = useRef<L.Marker | null>(null);
  const lineRef = useRef<L.Polyline | null>(null);
  const wake = useRef<any>(null);
  const followRef = useRef(true);

  const [line, setLine] = useState<{ lat: number; lng: number }[]>([]);
  const [ahead, setAhead] = useState<Passing[]>([]);
  const [card, setCard] = useState<Passing | null>(null);
  const [voice, setVoice] = useState(voiceOn());
  const [denied, setDenied] = useState(false);
  const [follow, setFollow] = useState(true);
  followRef.current = follow;

  const j = S.journey!;
  const target = j.stops[j.i] as any;
  const prev = j.i === 0 ? S.plan?.start : (j.stops[j.i - 1] as any)?.d;

  /* ---- the map, once ---- */
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const map = L.map(host, { zoomControl: false, attributionControl: true }).setView(
      [target.d.lat, target.d.lng],
      14,
    );
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap",
    }).addTo(map);
    // any manual pan drops the follow lock, the way every maps app behaves
    map.on("dragstart", () => setFollow(false));
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(false), 160);
    return () => {
      try {
        map.off();
        map.remove();
      } catch {
        /* container went first */
      }
      mapRef.current = null;
      meRef.current = null;
      lineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- the leg we are on: its road, and what sits beside it ---- */
  useEffect(() => {
    resetGuide();
    setCard(null);
    if (!prev || !target) return;
    if (prev.lat === target.d.lat && prev.lng === target.d.lng) {
      setAhead([]);
      setLine([]);
      return;
    }
    let dead = false;
    const ac = new AbortController();
    roadGeometry([{ lat: prev.lat, lng: prev.lng }, { lat: target.d.lat, lng: target.d.lng }], ac.signal).then(
      (geo) => {
        if (dead) return;
        const pts = geo.map(([lat, lng]) => ({ lat, lng }));
        setLine(pts);
        const skip = new Set([(prev as any).id, target.d.id].filter(Boolean) as string[]);
        setAhead(passingPlaces(pts, D, skip));
        const map = mapRef.current;
        if (!map) return;
        try {
          lineRef.current?.remove();
          lineRef.current = L.polyline(geo, {
            color: navColour(),
            weight: 6,
            opacity: 0.9,
            lineCap: "round",
            lineJoin: "round",
          }).addTo(map);
          L.marker([target.d.lat, target.d.lng], {
            icon: L.divIcon({
              html: '<span class="rmk">' + (j.i + 1) + "</span>",
              className: "lmk-wrap",
              iconSize: [28, 28],
              iconAnchor: [14, 14],
            }),
            title: nm(target.d.name),
          }).addTo(map);
          if (!followRef.current) map.fitBounds(geo, { padding: [50, 90], maxZoom: 16 });
        } catch {
          /* the screen moved on */
        }
      },
    );
    return () => {
      dead = true;
      ac.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [j.i, target?.d?.id]);

  /* ---- follow the fix, and announce what goes past ---- */
  useEffect(() => {
    if (!navigator.geolocation) return;
    (navigator as any).wakeLock?.request?.("screen").then(
      (l: any) => (wake.current = l),
      () => {},
    );
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setDenied(false);
        const fix = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const map = mapRef.current;
        if (map) {
          if (!meRef.current)
            meRef.current = L.marker([fix.lat, fix.lng], {
              icon: L.divIcon({ html: '<span class="lme"></span>', className: "lmk-wrap", iconSize: [18, 18], iconAnchor: [9, 9] }),
              zIndexOffset: 1000,
            }).addTo(map);
          else meRef.current.setLatLng([fix.lat, fix.lng]);
          if (followRef.current) map.setView([fix.lat, fix.lng], Math.max(map.getZoom(), 15), { animate: true });
        }
        if (!line.length || !ahead.length) return;
        const at = progressAlong(fix, line);
        const now = Date.now();
        for (const p of ahead) {
          if (!due(p.id, at, p.along, pos.coords.speed, now)) continue;
          const d = byId(p.id);
          if (!d) continue;
          markSaid(p.id, now);
          speak(
            nm({
              en: `On your ${p.side} is ${d.name.en}. ${d.short.en}`,
              hi: `आपकी ${p.side === "left" ? "बाईं" : "दाईं"} ओर ${d.name.hi} है। ${d.short.hi}`,
            }),
          );
          setCard(p);
          break;
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setDenied(true);
      },
      { enableHighAccuracy: true, maximumAge: 4000, timeout: 15000 },
    );
    return () => {
      navigator.geolocation.clearWatch(id);
      wake.current?.release?.().catch(() => {});
      wake.current = null;
    };
  }, [line, ahead]);

  const passed = card ? byId(card.id) : null;
  const flipVoice = () => {
    setVoiceOn(!voice);
    setVoice(!voice);
  };

  /* Portalled to <body>, not rendered in place.
     `main` is an ancestor with its own stacking context (the page-in animation),
     so a position:fixed child of it is laid out against MAIN's box rather than
     the viewport — inset:0 became "the full height of a scrolling page", which
     put the top bar behind the header and the action bar a screen and a half
     below the fold. The map filled the space so the screen looked almost right,
     which is the worst way for this to present. Same trap global.css warns
     about for the planner's action bar; a portal steps outside it entirely. */
  return createPortal(
    <div className="drive">
      <div ref={hostRef} className="drive-map" />

      {/* where you are going, over the map */}
      <div className="drive-top">
        <button className="drive-x" onClick={onClose} aria-label={t("back")}>
          <Icon name="back" />
        </button>
        <div className="drive-next" lang={S.lang}>
          <span className="dn-k">
            {nm({ en: `Stop ${j.i + 1} of ${j.stops.length}`, hi: `पड़ाव ${j.i + 1} / ${j.stops.length}` })}
          </span>
          <b>{nm(target.d.name)}</b>
          <span className="dn-m tnum">
            {t("arriveBy")} {clock(target.arrive)} · {dur(target.travel || 10)}
          </span>
        </div>
        {speechAvailable() && (
          <button className={"drive-v" + (voice ? " on" : "")} onClick={flipVoice} aria-pressed={voice}
            aria-label={nm({ en: "Voice", hi: "आवाज़" })}>
            <Icon name={voice ? "surya" : "close"} />
          </button>
        )}
      </div>

      {denied && (
        <p className="drive-warn" lang={S.lang}>
          {nm({
            en: "Location is off — turn it on to be guided as you go.",
            hi: "स्थान बंद है — मार्गदर्शन हेतु चालू करें।",
          })}
        </p>
      )}

      {!follow && (
        <button className="drive-recentre" onClick={() => setFollow(true)}>
          <Icon name="navigate" />
          {nm({ en: "Re-centre", hi: "पुनः केंद्रित" })}
        </button>
      )}

      {/* what just went past */}
      {passed && card && (
        <div className="drive-pass" role="status">
          <Photo d={passed} />
          <div className="dp-body">
            <span className="dp-side" lang={S.lang}>
              {nm({
                en: card.side === "left" ? "On your left" : "On your right",
                hi: card.side === "left" ? "आपकी बाईं ओर" : "आपकी दाईं ओर",
              })}
            </span>
            <h3 lang={S.lang}>{nm(passed.name)}</h3>
            <p lang={S.lang}>{nm(passed.short)}</p>
            <div className="dp-btns">
              <button className="btn primary sm" onClick={() => { addTo(passed.id); setCard(null); }}>
                <Icon name="route" />
                {nm({ en: "Add", hi: "जोड़ें" })} · +{dur(passed.visit.rec)}
              </button>
              <button className="btn ghost sm" onClick={() => go("/place/" + passed.id)}>
                {nm({ en: "Read", hi: "पढ़ें" })}
              </button>
              <button className="btn ghost sm" onClick={() => setCard(null)}>
                {nm({ en: "Not now", hi: "अभी नहीं" })}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* the two things you do while driving */}
      <div className="drive-bar">
        <button className="btn nav" onClick={() => navTo(target.d.id)}>
          <Icon name="navigate" />
          {nm({ en: "Turn-by-turn", hi: "मोड़-दर-मोड़" })}
        </button>
        <button
          className="btn primary"
          onClick={() => {
            j.i++;
            resetGuide();
            setCard(null);
            bump();
          }}
        >
          <Icon name="check" />
          {t("arrived")}
        </button>
      </div>
    </div>,
    document.body,
  );
}
