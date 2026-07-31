import { useEffect, useRef, useState } from "react";
import { S } from "@/app/state";
import { go } from "@/app/nav";
import { nm } from "@/shared/i18n/i18n";
import { dur } from "@/shared/lib/format";
import { byId } from "@/shared/lib/geo";
import { D } from "@/data/destinations";
import { Icon } from "@/shared/icons/Icon";
import { Photo } from "@/shared/ui/Photo";
import { addTo } from "@/features/place/place-actions";
import { roadGeometry } from "@/features/planner/routing/osrm";
import { passingPlaces, progressAlong, type Passing } from "./corridor";
import { due, markSaid, speak, resetGuide, voiceOn, setVoiceOn, speechAvailable } from "./guide";
import type { Stop } from "@/shared/types";

/**
 * The drive guide.
 *
 * While the visitor is being driven between two stops, it watches their
 * position against the road the route actually takes and names the places
 * going past — "on your left is the Krishna Museum" — with the choice to add
 * one to the day. It is a companion, not a satnav: it never gives directions,
 * because the phone's own maps app is already doing that far better, and it
 * says each thing once.
 *
 * Deliberate limits, because this is a web app in a moving car:
 *  · the screen must stay awake, so it takes a wake lock where one exists
 *  · iOS suspends geolocation when the screen locks, so this is a screen-on
 *    feature and the card says so rather than failing silently
 *  · nothing here ever requires a tap while moving — the offer stays until
 *    the next stop
 */
export function DriveGuide({ stop, next }: { stop: Stop; next?: Stop }) {
  const [line, setLine] = useState<{ lat: number; lng: number }[]>([]);
  const [ahead, setAhead] = useState<Passing[]>([]);
  const [card, setCard] = useState<Passing | null>(null);
  const [voice, setVoice] = useState(voiceOn());
  const [denied, setDenied] = useState(false);
  const wake = useRef<any>(null);

  const from = stop.d;
  const to = next?.d;

  /* ---- the road we are actually on, and what sits beside it ---- */
  useEffect(() => {
    resetGuide();
    setCard(null);
    if (!to) {
      setAhead([]);
      return;
    }
    let live = true;
    const ac = new AbortController();
    roadGeometry([from, to], ac.signal).then((geo) => {
      if (!live) return;
      const pts = geo.map(([lat, lng]) => ({ lat, lng }));
      setLine(pts);
      // never announce somewhere the day is already taking you
      const onRoute = new Set(D.filter((d) => d.id === from.id || d.id === to.id).map((d) => d.id));
      setAhead(passingPlaces(pts, D, onRoute));
    });
    return () => {
      live = false;
      ac.abort();
    };
  }, [from.id, to?.id]);

  /* ---- follow the car ---- */
  useEffect(() => {
    if (!line.length || !ahead.length || !navigator.geolocation) return;

    // A guide that goes quiet because the screen dimmed is worse than no
    // guide. Not available in every browser; the card explains when it isn't.
    (navigator as any).wakeLock?.request?.("screen").then(
      (l: any) => (wake.current = l),
      () => {},
    );

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        // A fix arrived, so whatever went wrong earlier is over. watchPosition
        // reports a timeout before the permission prompt is answered, and the
        // bar was left claiming location was off while it was actively using it.
        setDenied(false);
        const fix = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const at = progressAlong(fix, line);
        const now = Date.now();
        for (const p of ahead) {
          if (!due(p.id, at, p.along, pos.coords.speed, now)) continue;
          const d = byId(p.id);
          if (!d) continue;
          markSaid(p.id, now);
          speak(
            nm({
              en: `On your ${p.side} is ${d.name.en}.`,
              hi: `आपकी ${p.side === "left" ? "बाईं" : "दाईं"} ओर ${d.name.hi} है।`,
            }),
          );
          setCard(p);
          break;
        }
      },
      (err) => {
        // A timeout is "not yet", not "no". Only a refusal is permanent.
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

  if (!to) return null;

  const flipVoice = () => {
    setVoiceOn(!voice);
    setVoice(!voice);
  };

  const d = card ? byId(card.id) : null;

  return (
    <>
      <div className="guidebar">
        <span className="gi">
          <Icon name="navigate" />
        </span>
        <span className="gt" lang={S.lang}>
          <b>{nm({ en: "Guide is listening out", hi: "मार्गदर्शक साथ है" })}</b>
          <small>
            {denied
              ? nm({ en: "Location is off — turn it on to hear what you pass", hi: "स्थान बंद है — सुनने के लिए चालू करें" })
              : nm({
                  en: `${ahead.length} places along this stretch. Keep the screen on.`,
                  hi: `इस रास्ते पर ${ahead.length} स्थान। स्क्रीन चालू रखें।`,
                })}
          </small>
        </span>
        {speechAvailable() && (
          <button
            className={"gv" + (voice ? " on" : "")}
            onClick={flipVoice}
            aria-pressed={voice}
            aria-label={nm({ en: "Voice", hi: "आवाज़" })}
          >
            <Icon name={voice ? "surya" : "close"} />
          </button>
        )}
      </div>

      {d && card && (
        <div className="passcard" role="status">
          <Photo d={d} />
          <div className="pc-body">
            <span className="pc-side" lang={S.lang}>
              {nm({
                en: card.side === "left" ? "On your left" : "On your right",
                hi: card.side === "left" ? "आपकी बाईं ओर" : "आपकी दाईं ओर",
              })}
            </span>
            <h3 lang={S.lang}>{nm(d.name)}</h3>
            <p lang={S.lang}>{nm(d.short)}</p>
            <div className="pc-btns">
              <button
                className="btn primary sm"
                onClick={() => {
                  addTo(d.id);
                  setCard(null);
                }}
              >
                <Icon name="route" />
                {nm({ en: "Add to my day", hi: "मेरे दिन में जोड़ें" })}
                {" · +" + dur(d.visit.rec)}
              </button>
              <button className="btn ghost sm" onClick={() => go("/place/" + d.id)}>
                {nm({ en: "Read", hi: "पढ़ें" })}
              </button>
              <button className="btn ghost sm" onClick={() => setCard(null)}>
                {nm({ en: "Not now", hi: "अभी नहीं" })}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
