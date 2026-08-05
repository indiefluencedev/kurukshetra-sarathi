import { S, bump } from "@/app/state";
import { t } from "@/shared/i18n/i18n";
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

/**
 * Ask the device where we are. No sheet, no toast — just the fix, or null.
 *
 * Split out of grantLoc because a caller that is ITSELF a sheet cannot use
 * grantLoc: its first act is closeSheet(), which would close the very sheet
 * asking the question. The add-to-plan sheet needs a fix while staying open.
 */
export function locate(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        S.userLoc = { lat: p.coords.latitude, lng: p.coords.longitude };
        if (S.plan && S.plan.startType === "useLoc")
          S.plan.start = { lat: S.userLoc.lat, lng: S.userLoc.lng };
        bump();
        resolve(S.userLoc);
      },
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
  });
}

export function grantLoc(cb: () => void) {
  closeSheet();
  locate().then((fix) => {
    if (fix) cb();
    else denyLoc(cb);
  });
}

export function denyLoc(cb: () => void) {
  closeSheet();
  S.userLoc = null;
  toast(t("denied"));
  cb();
  bump();
}
