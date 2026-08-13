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
import { toast } from "@/shared/ui/overlays";
import { addTo } from "@/features/place/AddSheet";
import { Engine } from "@/features/planner/engine";
import { haversine } from "@/features/planner/routing/estimate";
import { roadGeometry } from "@/features/planner/routing/osrm";
import { passingPlaces, progressAlong, type Passing } from "./corridor";
import { due, markSaid, speak, resetGuide, voiceOn, setVoiceOn, speechAvailable } from "./guide";
import { openStopSheet } from "./StopSheet";
import { watchPermission, LOC_HELP } from "@/features/location/location";
import type { LatLng } from "@/features/planner/routing/provider";

const navColour = () =>
  getComputedStyle(document.documentElement).getPropertyValue("--nav").trim() || "#1E3A5F";

/** Where you are, and — when the device knows — which way you face. */
const meIcon = (aim: number | null) =>
  L.divIcon({
    html:
      aim == null
        ? '<span class="lme"></span>'
        : '<span class="lme aim" style="transform:rotate(' + aim + 'deg)"></span>',
    className: "lmk-wrap",
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });

/** Close enough to be there. A pin is a gate, not a car park, so this is
 *  generous — 130 m is the far end of a temple compound, not the next street. */
const ARRIVED_M = 130;
/** Recompute "how far, how long" no more often than this. The fix arrives about
 *  once a second and the answer does not change that fast. */
const ETA_MS = 4000;

/**
 * Driving the day, in the app. The whole of it — this is the journey screen.
 *
 * "Start the route" used to hand the visitor to Google Maps in a new tab, which
 * ends the journey as far as this app is concerned: the moment they leave, the
 * guide stops, the day's order is gone, and nothing can announce what they are
 * passing. That is the one thing this app has that a general-purpose maps app
 * does not, and it was being given away at exactly the moment it became useful.
 *
 * So: a map that follows the fix, with the day drawn on it, the next stop named,
 * and the corridor announced as it goes past. Turn-by-turn stays Google's job —
 * one button, always there. This screen answers "where am I in my day", which is
 * a different question and nobody else is answering it.
 *
 * It used to answer that question twice. There was a card view of the same drive
 * with its own copy of the guide and its own geolocation watch, and a button in
 * the corner to swap between them; two watches on one device announce everything
 * twice, so the screen that was not showing had to be unmounted to keep it quiet.
 * One screen, one watch, and the things that are not "where am I" — how long to
 * stay, skip, running late — are in a panel over the map. See StopSheet.
 */
export function DriveMap() {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const meRef = useRef<L.Marker | null>(null);
  const ringRef = useRef<L.Circle | null>(null);
  const legRef = useRef<L.Polyline | null>(null);
  const dayRef = useRef<L.LayerGroup | null>(null);
  const wake = useRef<any>(null);

  /* The watch is registered ONCE and never re-registered, so everything it
     reads while running is a ref rather than a dependency. It used to depend on
     the leg's geometry, which meant every arrival tore the watch down and asked
     the device for a cold fix again — on the one screen where the position is
     the entire point. */
  const followRef = useRef(true);
  const lineRef = useRef<LatLng[]>([]);
  const aheadRef = useRef<Passing[]>([]);
  const targetRef = useRef<any>(null);
  const etaAtRef = useRef(0);
  const arrivedRef = useRef(false);
  const aimRef = useRef<number | null>(null);

  const watchRef = useRef<number | null>(null);

  const [card, setCard] = useState<Passing | null>(null);
  const [voice, setVoice] = useState(voiceOn());
  const [trouble, setTrouble] = useState<"" | keyof typeof LOC_HELP>("");
  const [follow, setFollow] = useState(true);
  const [live, setLive] = useState<{ km: number; min: number } | null>(null);
  const [near, setNear] = useState(false);
  followRef.current = follow;

  const j = S.journey!;
  const target = j.stops[j.i] as any;
  const prev = j.i === 0 ? S.plan?.start : (j.stops[j.i - 1] as any)?.d;
  targetRef.current = target;

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
    dayRef.current = L.layerGroup().addTo(map);
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
      ringRef.current = null;
      legRef.current = null;
      dayRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- the leg we are on: its road, what sits beside it, and the day ahead ---- */
  useEffect(() => {
    resetGuide();
    setCard(null);
    setNear(false);
    setLive(null);
    arrivedRef.current = false;
    lineRef.current = [];
    aheadRef.current = [];
    // The previous leg's road comes off FIRST. It used to be removed only when
    // the next one arrived, so a failed or aborted geometry call left the road
    // to the last stop drawn over the drive to this one.
    legRef.current?.remove();
    legRef.current = null;
    drawDay();

    // Arriving somewhere is the moment to say where you are going next — the
    // visitor is looking at the road, not at this screen.
    if (j.i > 0) speak(nm({ en: `Next stop, ${target.d.name.en}.`, hi: `अगला पड़ाव, ${target.d.name.hi}।` }));

    if (!prev || !target) return;
    if (prev.lat === target.d.lat && prev.lng === target.d.lng) return;

    let dead = false;
    const ac = new AbortController();
    roadGeometry(
      [{ lat: prev.lat, lng: prev.lng }, { lat: target.d.lat, lng: target.d.lng }],
      ac.signal,
    ).then((geo) => {
      if (dead) return;
      const pts = geo.map(([lat, lng]) => ({ lat, lng }));
      lineRef.current = pts;
      const skip = new Set([(prev as any).id, target.d.id].filter(Boolean) as string[]);
      aheadRef.current = passingPlaces(pts, D, skip);
      const map = mapRef.current;
      if (!map) return;
      try {
        legRef.current?.remove();
        legRef.current = L.polyline(geo, {
          color: navColour(),
          weight: 6,
          opacity: 0.9,
          lineCap: "round",
          lineJoin: "round",
        }).addTo(map);
        if (!followRef.current) map.fitBounds(geo, { padding: [50, 90], maxZoom: 16 });
      } catch {
        /* the screen moved on */
      }
    });
    return () => {
      dead = true;
      ac.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [j.i, target?.d?.id]);

  /**
   * The rest of the day, as pins.
   *
   * The map used to show one marker — where you are going next — which answers
   * "what now" and not "where am I in my day". Every stop still to come is
   * numbered and dimmed, joined by a hairline, so the shape of the afternoon is
   * on screen without a second screen to hold it. The hairline is deliberately
   * straight: these are not roads and must not be mistaken for the route.
   */
  function drawDay() {
    const g = dayRef.current;
    if (!g) return;
    g.clearLayers();
    const rest = j.stops.slice(j.i) as any[];
    rest.forEach((s, n) => {
      L.marker([s.d.lat, s.d.lng], {
        icon: L.divIcon({
          html: '<span class="rmk' + (n ? " later" : "") + '">' + (j.i + n + 1) + "</span>",
          className: "lmk-wrap",
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        }),
        title: nm(s.d.name),
      }).addTo(g);
    });
    if (rest.length > 1)
      L.polyline(
        rest.map((s) => [s.d.lat, s.d.lng] as [number, number]),
        { color: navColour(), weight: 2, opacity: 0.35, dashArray: "3 7" },
      ).addTo(g);
  }

  /* ---- one watch: the dot, the follow, the guide, the arrival ---- */
  useEffect(() => {
    if (!navigator.geolocation) {
      setTrouble("unavailable");
      return;
    }
    if (!window.isSecureContext) {
      setTrouble("insecure");
      return;
    }
    takeWake();
    // A wake lock is dropped when the tab is hidden — coming back to a screen
    // that will dim again in fifteen seconds is worse than never having it.
    const onShow = () => document.visibilityState === "visible" && takeWake();
    document.addEventListener("visibilitychange", onShow);
    startWatch();

    // The visitor allows it in the browser's own panel, which this app cannot
    // open and is not told about — unless it asks to be. Then the screen comes
    // back to life on its own instead of needing a reload nobody knows to do.
    const off = watchPermission((state) => {
      if (state === "granted") {
        setTrouble("");
        startWatch();
      } else if (state === "denied") setTrouble("denied");
    });

    return () => {
      stopWatch();
      off();
      document.removeEventListener("visibilitychange", onShow);
      wake.current?.release?.().catch(() => {});
      wake.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startWatch() {
    stopWatch();
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        // watchPosition reports a timeout before the permission prompt is
        // answered; a fix arriving means whatever went wrong is over.
        setTrouble("");
        const c = pos.coords;
        const fix = { lat: c.latitude, lng: c.longitude };
        S.userLoc = { ...fix, acc: c.accuracy };
        drawMe(fix, c.accuracy, c.heading);
        announce(fix, c.speed);
        eta(fix);
      },
      (err) => {
        // A timeout is "not yet" and says nothing; only a refusal and a device
        // that cannot answer are worth putting on the screen.
        if (err.code === err.PERMISSION_DENIED) setTrouble("denied");
        else if (err.code === err.POSITION_UNAVAILABLE) setTrouble("unavailable");
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
    );
  }

  function stopWatch() {
    if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = null;
  }

  function takeWake() {
    if (wake.current) return;
    (navigator as any).wakeLock?.request?.("screen").then(
      (l: any) => {
        wake.current = l;
        l.addEventListener?.("release", () => (wake.current = null));
      },
      () => {},
    );
  }

  /** The dot, its accuracy, and which way it is pointing. */
  function drawMe(fix: LatLng, acc?: number, heading?: number | null) {
    const map = mapRef.current;
    if (!map) return;
    const ll: [number, number] = [fix.lat, fix.lng];
    // A heading only exists while actually moving; when it is null the dot must
    // stay a dot rather than keep pointing wherever it last happened to face.
    // Rounded to 5°, because the icon is rebuilt when this changes and a fix a
    // second would otherwise replace the marker's DOM a second.
    const aim = heading == null || Number.isNaN(heading) ? null : Math.round(heading / 5) * 5;
    if (!meRef.current) {
      meRef.current = L.marker(ll, { icon: meIcon(aim), zIndexOffset: 1000 }).addTo(map);
      aimRef.current = aim;
    } else {
      meRef.current.setLatLng(ll);
      if (aim !== aimRef.current) {
        aimRef.current = aim;
        meRef.current.setIcon(meIcon(aim));
      }
    }
    // Only when it is wide enough to matter: a ring around a 10 m fix is noise
    // drawn over the street you are being asked to look at.
    if (acc && acc > 60) {
      if (ringRef.current) ringRef.current.setLatLng(ll).setRadius(acc);
      else
        ringRef.current = L.circle(ll, {
          radius: acc,
          color: "#2F5D8C",
          weight: 1,
          fillColor: "#2F5D8C",
          fillOpacity: 0.08,
        }).addTo(map);
    } else {
      ringRef.current?.remove();
      ringRef.current = null;
    }
    if (followRef.current) map.setView(ll, Math.max(map.getZoom(), 15), { animate: true });
  }

  /** What is going past, said once, and only while actually going past it. */
  function announce(fix: LatLng, speed: number | null) {
    const line = lineRef.current,
      ahead = aheadRef.current;
    if (!line.length || !ahead.length) return;
    const at = progressAlong(fix, line);
    const now = Date.now();
    for (const p of ahead) {
      if (!due(p.id, at, p.along, speed, now)) continue;
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
  }

  /** How far the next stop is from HERE, rather than from where the day began. */
  function eta(fix: LatLng) {
    const now = Date.now();
    if (now - etaAtRef.current < ETA_MS) return;
    etaAtRef.current = now;
    const to = targetRef.current?.d;
    if (!to) return;
    const metres = haversine(fix, to) * 1000;
    setLive({
      km: +(Engine.roadKm(fix, to) || 0).toFixed(1),
      min: Engine.travelMin(fix, to, (S.plan && S.plan.mode) || "car"),
    });
    if (metres > ARRIVED_M) {
      if (metres > ARRIVED_M * 2) arrivedRef.current = false; // left again, so it can fire next time
      setNear(false);
      return;
    }
    setNear(true);
    if (arrivedRef.current) return;
    arrivedRef.current = true;
    speak(nm({ en: `You have reached ${to.name.en}.`, hi: `आप ${to.name.hi} पहुँच गए हैं।` }));
  }

  const passed = card ? byId(card.id) : null;
  const flipVoice = () => {
    setVoiceOn(!voice);
    setVoice(!voice);
  };

  /** Arrived: on to the next one, with the one fact you need on the way in. */
  const arrive = () => {
    const s = j.stops[j.i] as any;
    toast(
      nm({
        en: `${nm(s.d.name)} · leave by ${clock(s.depart)}`,
        hi: `${nm(s.d.name)} · ${clock(s.depart)} तक निकलें`,
      }),
    );
    j.i++;
    bump();
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
        <button className="drive-x" onClick={() => go("/route")} aria-label={t("back")}>
          <Icon name="back" />
        </button>
        <button className="drive-next" onClick={openStopSheet} lang={S.lang}>
          <span className="dn-k">
            {nm({ en: `Stop ${j.i + 1} of ${j.stops.length}`, hi: `पड़ाव ${j.i + 1} / ${j.stops.length}` })}
          </span>
          <b>{nm(target.d.name)}</b>
          <span className="dn-m tnum">
            {/* the live figures the moment there are any — the planned ones are
                about a day that started an hour ago */}
            {live
              ? nm({
                  en: `${live.km} km · about ${dur(live.min)} · arrive ${clock(target.arrive)}`,
                  hi: `${live.km} किमी · लगभग ${dur(live.min)} · ${clock(target.arrive)} पहुँच`,
                })
              : `${t("arriveBy")} ${clock(target.arrive)} · ${dur(target.travel || 10)}`}
          </span>
        </button>
        {speechAvailable() && (
          <button className={"drive-v" + (voice ? " on" : "")} onClick={flipVoice} aria-pressed={voice}
            aria-label={nm({ en: "Voice", hi: "आवाज़" })}>
            <Icon name={voice ? "surya" : "close"} />
          </button>
        )}
      </div>

      {/* Not just "location is off". That sentence was a dead end: it named a
          switch the visitor could not find and offered nothing to press. */}
      {trouble && (
        <div className="drive-warn" lang={S.lang} role="status">
          <b>{nm({ en: "The map cannot see where you are", hi: "नक्शा आपका स्थान नहीं देख पा रहा" })}</b>
          <p>{nm(LOC_HELP[trouble])}</p>
          {trouble !== "insecure" && (
            <button className="btn sm ghost" onClick={startWatch}>
              <Icon name="navigate" />
              {nm({ en: "Try again", hi: "फिर कोशिश करें" })}
            </button>
          )}
        </div>
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

      {/* the three things you do while driving, in the order you need them */}
      <div className="drive-bar">
        <button className="drive-more" onClick={openStopSheet} aria-label={nm({ en: "This stop", hi: "यह पड़ाव" })}>
          <Icon name="menu" />
        </button>
        <button className="btn nav" onClick={() => navTo(target.d.id)}>
          <Icon name="navigate" />
          {nm({ en: "Turn-by-turn", hi: "मोड़-दर-मोड़" })}
        </button>
        <button className={"btn primary" + (near ? " here" : "")} onClick={arrive}>
          <Icon name="check" />
          {t("arrived")}
        </button>
      </div>
    </div>,
    document.body,
  );
}
