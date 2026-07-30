import { S, bump } from "@/app/state";
import { go, track } from "@/app/nav";
import { t, nm } from "@/shared/i18n/i18n";
import { dur } from "@/shared/lib/format";
import { clock } from "@/shared/lib/datetime";
import { distTo, navTo } from "@/shared/lib/geo";
import { openSheet, closeSheet, toast } from "@/shared/ui/overlays";
import { Icon } from "@/shared/icons/Icon";
import { Photo } from "@/shared/ui/Photo";
import { StatusPill } from "@/shared/ui/PlaceCard";
import { modeWord } from "@/features/route/route-actions";
import { Engine } from "@/features/planner/engine";

function here() {
  const j = S.journey!;
  const s = j.stops[j.i] as any;
  const d = s.d;
  const notices = d.notice || [];
  openSheet(
    <>
      <h2 className="display" style={{ fontSize: "calc(20px*var(--ts))" }} lang={S.lang}>
        {nm(d.name)}
      </h2>
      <p className="muted" style={{ margin: "6px 0 13px", fontSize: "calc(13.5px*var(--ts))" }}>
        {nm(d.short)}
      </p>
      <div className="ncard">
        <b>{t("howLong")}</b>
        <p>
          {dur(d.visit.rec)} · {t("leave")} {clock(s.depart)}
        </p>
      </div>
      {notices.length > 0 && (
        <>
          <div style={{ margin: "13px 0 8px" }}>
            <b className="display" style={{ fontSize: "calc(15px*var(--ts))" }}>
              {t("worthKnowing")}
            </b>
          </div>
          {notices.map((x: any, i: number) => (
            <div className="ncard" key={i}>
              <b>{nm(x.t)}</b>
              <p>{nm(x.d)}</p>
            </div>
          ))}
        </>
      )}
      <button
        className="btn primary"
        style={{ marginTop: 15 }}
        onClick={() => {
          closeSheet();
          j.i++;
          bump();
          window.scrollTo(0, 0);
        }}
      >
        <Icon name="fwd" />
        {t("nextStop")}
      </button>
    </>,
  );
}

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
  bump();
  toast(t("removedT"));
}

function late() {
  const j = S.journey!;
  const c = j.stops[j.i] as any;
  const from = c.arrive + 20;
  const rem = j.stops.slice(j.i).map((s) => s.d.id);
  const r = Engine.recalc(S.plan!.res!, { lat: c.d.lat, lng: c.d.lng }, from, rem);
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
      <button className="btn primary" style={{ marginTop: 15 }} onClick={applyR}>
        <Icon name="check" />
        {t("apply")}
      </button>
    </>,
  );
}

function applyR() {
  const j = S.journey!;
  if (j._r) {
    j.stops = j.stops.slice(0, j.i).concat((j._r as any).stops.map((s: any) => Object.assign({}, s)));
    j._r = null;
  }
  closeSheet();
  bump();
}

/** Live, step-through tour with "arrived / skip / running late" controls. */
export function Journey() {
  const j = S.journey;
  if (!j)
    return (
      <div className="empty">
        <Icon name="play" />
        <p className="t">{t("noRoute")}</p>
        <button className="btn primary" style={{ maxWidth: 220, margin: "16px auto 0" }} onClick={() => go("/plan")}>
          {t("planVisit")}
        </button>
      </div>
    );
  if (j.i >= j.stops.length)
    return (
      <div className="empty" style={{ paddingTop: 60 }}>
        <Icon name="check" />
        <p className="t" style={{ fontSize: "calc(21px*var(--ts))" }}>
          {t("done")}
        </p>
        <p style={{ maxWidth: "22em", margin: "6px auto 0" }}>{t("doneD")}</p>
        <button className="btn primary" style={{ maxWidth: 240, margin: "22px auto 0" }} onClick={() => go("/home")}>
          {t("home")}
        </button>
      </div>
    );

  const s = j.stops[j.i] as any;
  const d = s.d;
  return (
    <>
      <div className="phead">
        <button className="back" onClick={() => go("/route")} aria-label={t("back")}>
          <Icon name="back" />
        </button>
        <h1 className="display" style={{ fontSize: "calc(19px*var(--ts))" }} lang={S.lang}>
          {t("startTour")}
        </h1>
      </div>
      <div className="jcard">
        <Photo d={d} />
        <div className="ov">
          <div className="st">
            {t("nextStop")} · {t("stopN")} {j.i + 1} {t("of")} {j.stops.length}
          </div>
          <h2 lang={S.lang}>{nm(d.name)}</h2>
        </div>
        <div className="jmeta">
          <span className="tag">
            <Icon name="clock" />
            {t("arriveBy")} {clock(s.arrive)}
          </span>
          <span className="tag">
            <Icon name="navigate" />
            {dur(s.travel || 10)} {modeWord()}
          </span>
          <span className="tag">
            <Icon name="pin" />
            {s.km || distTo(d)} {t("km")}
          </span>
          <StatusPill d={d} />
        </div>
      </div>
      <button
        className="btn nav"
        style={{ marginTop: 12, minHeight: 58, fontSize: "calc(16.5px*var(--ts))" }}
        onClick={() => navTo(d.id)}
      >
        <Icon name="navigate" style={{ width: 21, height: 21 }} />
        {t("navigate")}
      </button>
      <div className="jsub">
        <button className="btn primary" onClick={here}>
          <Icon name="check" />
          {t("arrived")}
        </button>
        <button className="btn ghost" onClick={skipIt}>
          <Icon name="fwd" />
          {t("skipIt")}
        </button>
        <button className="btn ghost" onClick={late}>
          <Icon name="clock" />
          {t("late")}
        </button>
        <button className="btn ghost" onClick={() => go("/route")}>
          {t("endTour")}
        </button>
      </div>
      <div className="jprog">
        {t("stopN")} {j.i + 1} / {j.stops.length}
      </div>
    </>
  );
}
