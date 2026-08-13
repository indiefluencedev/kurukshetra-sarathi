import { S, bump } from "@/app/state";
import { t, nm } from "@/shared/i18n/i18n";
import { openSheet, closeSheet, toast } from "@/shared/ui/overlays";
import { Icon } from "@/shared/icons/Icon";

/** Ask for location once; run cb when a fix is available (or declined). */
export function askLoc(cb?: () => void) {
  const done = cb || (() => {});
  if (S.userLoc) {
    done();
    return;
  }
  openSheet(
    <>
      <h2 className="display" style={{ fontSize: "calc(19px*var(--ts))" }} lang={S.lang}>
        {t("permTitle")}
      </h2>
      <p className="muted" style={{ margin: "7px 0 15px", fontSize: "calc(14px*var(--ts))", lineHeight: 1.55 }}>
        {t("permD")}
      </p>
      <button className="btn primary" onClick={() => grantLoc(done)}>
        <Icon name="pin" />
        {t("allow")}
      </button>
      <button className="btn ghost" style={{ marginTop: 9 }} onClick={() => denyLoc(done)}>
        {t("notNow")}
      </button>
    </>,
  );
}

export type Fix = { lat: number; lng: number; acc?: number };

/** the mark on a start point the app placed rather than the visitor. Not an id
 *  in any catalogue, so the road matrix misses it and estimates — correct. */
export const FIX = "fix";
export const MY_LOCATION = { en: "My location", hi: "मेरा स्थान" };

/** One getCurrentPosition, as a promise. Records why it failed. */
function ask(opts: PositionOptions): Promise<Fix | null> {
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }),
      (e) => {
        // A denial is the user's answer and outranks a timeout from the other
        // attempt; anything else is the device having no idea where it is.
        if (e.code === e.PERMISSION_DENIED) S.locErr = "denied";
        else if (!S.locErr) S.locErr = "unavailable";
        resolve(null);
      },
      opts,
    );
  });
}

/** The first of these to answer with a fix wins; null only once all have failed. */
function firstOf(ps: Promise<Fix | null>[]): Promise<Fix | null> {
  return new Promise((resolve) => {
    let left = ps.length;
    ps.forEach((p) =>
      p.then((f) => {
        if (f) resolve(f);
        else if (--left === 0) resolve(null);
      }),
    );
  });
}

/** Keep a fix if it is the sharpest this run has seen. */
let sharpest = Infinity;
function keep(f: Fix) {
  if ((f.acc ?? 1e9) > sharpest) return;
  sharpest = f.acc ?? 1e9;
  S.userLoc = f;
  S.locErr = "";
  /* The plan's start follows the fix only while the fix is still what it is.
     `ref: "fix"` is the mark pickStart puts on a point it placed; the moment
     the visitor taps the map to correct it that mark is gone, and a precise
     reading arriving twenty seconds later must not drag their pin back. The
     label is written too — it used to be dropped here, which un-answered step
     2 and greyed out Continue. */
  if (S.plan && S.plan.startType === "useLoc" && S.plan.start.ref === FIX)
    S.plan.start = { lat: f.lat, lng: f.lng, label: nm(MY_LOCATION), ref: FIX };
  bump();
}

/**
 * Ask the device where we are. No sheet, no toast — just the fix, or null.
 *
 * Split out of grantLoc because a caller that is ITSELF a sheet cannot use
 * grantLoc: its first act is closeSheet(), which would close the very sheet
 * asking the question. The add-to-plan sheet needs a fix while staying open.
 *
 * Two requests, fired together, because one was the bug: a lone
 * `enableHighAccuracy` call with an eight-second timeout is a coin toss on a
 * phone that has to wake its GPS and a near-certain failure on a laptop, and
 * every failure landed silently on "using the town centre". The coarse request
 * answers from wifi in about a second so a pin appears; the precise one is
 * given the twenty-five seconds a cold GPS actually needs and replaces it when
 * it lands. Whichever arrives first is what the caller waits for.
 */
export async function locate(): Promise<Fix | null> {
  if (!navigator.geolocation) {
    S.locErr = "unavailable";
    bump();
    return null;
  }
  // Geolocation is a secure-context API. Over http://192.168.x.x — which is how
  // `npm run dev` is reached from a phone — it is not merely denied, it is
  // absent, and that deserves its own sentence rather than "we couldn't find you".
  if (!window.isSecureContext) {
    S.locErr = "insecure";
    bump();
    return null;
  }

  sharpest = Infinity;
  S.locBusy = true;
  S.locErr = "";
  bump();

  const coarse = ask({ enableHighAccuracy: false, timeout: 10000, maximumAge: 120000 });
  const fine = ask({ enableHighAccuracy: true, timeout: 25000, maximumAge: 0 });
  coarse.then((f) => f && keep(f));
  fine.then((f) => f && keep(f));

  const first = await firstOf([coarse, fine]);
  // Busy stays true while the precise one is still out, so "finding you" does
  // not disappear the moment a 2 km wifi guess arrives.
  Promise.all([coarse, fine]).then(() => {
    S.locBusy = false;
    bump();
  });
  return first;
}

/** Re-ask, having already been given permission once — the Try again button. */
export const refreshLoc = () => locate();

/**
 * Watch the browser's own permission switch.
 *
 * Once a site has been refused, asking again changes nothing: the call fails
 * immediately, with no prompt, until the visitor flips the switch themselves in
 * the browser's site settings. The app cannot open that panel — but it can
 * notice the moment it changes, which is the difference between a screen that
 * comes back to life on its own and one that has to be reloaded by somebody who
 * does not know that is what is needed.
 *
 * Firefox has no Permissions entry for geolocation; the callback simply never
 * fires there and the Try again button is the fallback. Returns an unsubscribe.
 */
export function watchPermission(cb: (state: PermissionState) => void): () => void {
  let stop = () => {};
  navigator.permissions
    ?.query({ name: "geolocation" as PermissionName })
    .then((p) => {
      cb(p.state);
      const on = () => cb(p.state);
      p.addEventListener("change", on);
      stop = () => p.removeEventListener("change", on);
    })
    .catch(() => {});
  return () => stop();
}

/** Why location is not working, in words a visitor can act on. */
export const LOC_HELP = {
  denied: {
    en: "Location is blocked for this site. Tap the icon beside the web address, allow Location, then tap Try again.",
    hi: "इस साइट के लिए स्थान अवरुद्ध है। पते के पास वाले चिह्न को दबाएँ, स्थान की अनुमति दें, फिर ‘फिर कोशिश करें’ दबाएँ।",
  },
  insecure: {
    en: "Location needs a secure (https) address, and this one is not.",
    hi: "स्थान हेतु सुरक्षित (https) पता चाहिए, जो यह नहीं है।",
  },
  unavailable: {
    en: "The device cannot get a fix here. Open sky helps, and so does turning GPS on.",
    hi: "यहाँ स्थान नहीं मिल पा रहा। खुला आसमान और GPS चालू होना मदद करता है।",
  },
};

export function grantLoc(cb: () => void) {
  closeSheet();
  locate().then((fix) => {
    // No fix is not the same as no permission. Only a refusal gets the refusal
    // toast; a timeout or a laptop with no wifi lookup says so where the
    // question was asked, and the caller carries on with its fallback.
    if (!fix && S.locErr === "denied") S.userLoc = null;
    cb();
    bump();
  });
}

export function denyLoc(cb: () => void) {
  closeSheet();
  S.userLoc = null;
  S.locErr = "denied";
  toast(t("denied"));
  cb();
  bump();
}
