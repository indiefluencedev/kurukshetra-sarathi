import { S, bump } from "@/app/state";
import { go, track } from "@/app/nav";
import { t, nm } from "@/shared/i18n/i18n";
import { dur } from "@/shared/lib/format";
import { clock } from "@/shared/lib/datetime";
import { openSheet, closeSheet, toast } from "@/shared/ui/overlays";
import { Icon } from "@/shared/icons/Icon";
import { Photo } from "@/shared/ui/Photo";
import { StatusPill } from "@/shared/ui/PlaceCard";
import { Engine } from "@/features/planner/engine";

/**
 * Everything about the stop you are driving to, in a panel over the map.
 *
 * This is what is left of the journey's second screen. There used to be a card
 * view and a map view of the same drive, each with its own copy of the guide
 * and its own geolocation watch, and the visitor toggled between them with a
 * button in the corner. Driving is one screen — the map — and the handful of
 * things that are not "where am I" are here, one tap away and gone again:
 * how long to stay, what is worth knowing, and the three ways a day changes
 * shape once it is under way.
 */
export function openStopSheet() {
  openSheet(<StopSheet />);
}

function StopSheet() {
  const j = S.journey!;
  const s = j.stops[j.i] as any;
  const d = s.d;
  const notices = d.notice || [];

  return (
    <>
      <div className="stopsheet-head">
        <Photo d={d} />
        <div>
          <span className="dn-k">
            {nm({ en: `Stop ${j.i + 1} of ${j.stops.length}`, hi: `पड़ाव ${j.i + 1} / ${j.stops.length}` })}
          </span>
          <h2 className="display" style={{ fontSize: "calc(19px*var(--ts))" }} lang={S.lang}>
            {nm(d.name)}
          </h2>
          <StatusPill d={d} />
        </div>
      </div>

      <p className="muted" style={{ margin: "10px 0 12px", fontSize: "calc(13.5px*var(--ts))", lineHeight: 1.55 }} lang={S.lang}>
        {nm(d.short)}
      </p>

      <div className="ncard">
        <b>{t("howLong")}</b>
        <p>
          {dur(d.visit.rec)} · {t("leave")} {clock(s.depart)}
        </p>
      </div>

      {notices.map((x: any, i: number) => (
        <div className="ncard" key={i}>
          <b>{nm(x.t)}</b>
          <p>{nm(x.d)}</p>
        </div>
      ))}

      {/* The three things that change a day once it has started. They were four
          buttons under a card nobody could see while driving; they are here
          because they are decisions, not controls — you stop the car to make
          one. */}
      <div className="stopsheet-acts">
        <button className="btn ghost" onClick={skipIt}>
          <Icon name="fwd" />
          {t("skipIt")}
        </button>
        <button className="btn ghost" onClick={late}>
          <Icon name="clock" />
          {t("late")}
        </button>
      </div>
      <button className="btn quiet" style={{ marginTop: 9 }} onClick={endRoute}>
        {t("endTour")}
      </button>
    </>
  );
}

/** Not going in after all — drop it and re-time everything after it. */
function skipIt() {
  const j = S.journey!;
  const c = j.stops[j.i] as any;
  const rem = j.stops.slice(j.i + 1).map((s) => s.d.id);
  if (rem.length && S.plan && S.plan.res) {
    const r = Engine.recalc(S.plan.res, S.userLoc || { lat: c.d.lat, lng: c.d.lng }, c.arrive, rem);
    if (r.stops.length) j.stops = j.stops.slice(0, j.i).concat(r.stops.map((s: any) => Object.assign({}, s)));
  }
  j.i++;
  track("skip");
  closeSheet();
  bump();
  toast(t("removedT"));
}

/** Twenty minutes behind: rebuild the rest of the day from here and now. */
function late() {
  const j = S.journey!;
  const c = j.stops[j.i] as any;
  const from = c.arrive + 20;
  const rem = j.stops.slice(j.i).map((s) => s.d.id);
  const r = Engine.recalc(S.plan!.res!, S.userLoc || { lat: c.d.lat, lng: c.d.lng }, from, rem);
  j._r = r;
  track("recalc");
  openSheet(
    <>
      <h2 className="display" style={{ fontSize: "calc(19px*var(--ts))" }} lang={S.lang}>
        {t("recalc")}
      </h2>
      <p className="muted" style={{ margin: "6px 0 13px", fontSize: "calc(13.5px*var(--ts))" }}>
        {t("recalcD")}
      </p>
      {r.stops.length ? (
        r.stops.map((s: any, i: number) => (
          <div className="ncard" key={i}>
            <b>
              {i + 1}. {nm(s.d.name)}
            </b>
            <p>
              {t("arrive")} {clock(s.arrive)} · {t("leave")} {clock(s.depart)}
            </p>
          </div>
        ))
      ) : (
        <p className="muted">{t("noFitD")}</p>
      )}
      {r.stops.length < rem.length && (
        <div className="note" style={{ marginTop: 11 }}>
          <Icon name="info" />
          <span>{t("trimmed")}</span>
        </div>
      )}
      <button className="btn primary" style={{ marginTop: 15 }} onClick={applyLate}>
        <Icon name="check" />
        {t("apply")}
      </button>
    </>,
  );
}

function applyLate() {
  const j = S.journey!;
  if (j._r) {
    j.stops = j.stops.slice(0, j.i).concat((j._r as any).stops.map((s: any) => Object.assign({}, s)));
    j._r = null;
  }
  closeSheet();
  bump();
}

function endRoute() {
  closeSheet();
  go("/route");
}
