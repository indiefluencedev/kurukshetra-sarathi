import { bump } from "@/app/state";
import { S } from "@/app/state";
import { track } from "@/app/nav";
import { t, nm } from "@/shared/i18n/i18n";
import { openSheet, closeSheet, toast } from "@/shared/ui/overlays";
import { Icon } from "@/shared/icons/Icon";

// Chrome/Android fires this before offering install; stash it for installApp().
let installEvt: any = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installEvt = e;
});

export function isStandalone(): boolean {
  try {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true
    );
  } catch {
    return false;
  }
}
export function isIOS(): boolean {
  try {
    return (
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    );
  } catch {
    return false;
  }
}

export function installApp() {
  track("install_tapped");
  if (installEvt) {
    // Android / Chrome: real install prompt
    installEvt.prompt();
    installEvt.userChoice
      .then((c: any) => {
        installEvt = null;
        if (c && c.outcome === "accepted") toast(t("dlDone"));
        bump();
      })
      .catch(() => {});
    return;
  }
  howToInstall(); // iOS Safari, or a browser with no prompt
}

function howToInstall() {
  const ios = isIOS();
  const step = (n: number, b: string, d: React.ReactNode) => (
    <div className="step-io" key={n}>
      <span className="n">{n}</span>
      <span>
        <b lang={S.lang}>{b}</b>
        <p>{d}</p>
      </span>
    </div>
  );
  const shareIcon = (
    <span className="mini">
      <Icon name="share" />
    </span>
  );
  // dlIos1d contains a {icon} placeholder — splice the share glyph in where it sits.
  const ios1Parts = t("dlIos1d").split("{icon}");
  const ios1d = (
    <>
      {ios1Parts[0]}
      {ios1Parts.length > 1 ? shareIcon : null}
      {ios1Parts[1]}
    </>
  );
  const body = ios
    ? [
        step(1, t("dlIos1"), ios1d),
        step(2, t("dlIos2"), t("dlIos2d")),
        step(3, t("dlIos3"), t("dlIos3d")),
      ]
    : [step(1, t("dlAnd1"), t("dlAnd1d")), step(2, t("dlAnd2"), t("dlAnd2d"))];
  openSheet(
    <>
      <h2 className="display" style={{ fontSize: "calc(20px*var(--ts))" }} lang={S.lang}>
        {t("dlHow")}
      </h2>
      <p className="muted" style={{ margin: "7px 0 14px", fontSize: "calc(13.5px*var(--ts))", lineHeight: 1.55 }}>
        {ios ? t("dlIosIntro") : t("dlAndIntro")}
      </p>
      <div className="steps-io">{body}</div>
      <button className="btn primary" style={{ marginTop: 16 }} onClick={closeSheet}>
        {t("gotIt")}
      </button>
    </>,
  );
}

/**
 * The install prompt, where someone will actually meet it.
 *
 * Everything needed to install has existed since the port — the
 * `beforeinstallprompt` capture above, the iOS Add-to-Home-Screen steps, the
 * card — but all of it lived on the Settings screen, which a visitor reaches
 * by tapping a sliders glyph in the corner of the header. In other words the
 * app was installable and never said so. This is the same `installApp()`, on
 * Home, as one slim line.
 *
 * It sits below the "how long do you have?" plate rather than above it: being
 * an app is not what anyone opened this to do. Dismissal is permanent, because
 * a banner that returns after being refused is an advert.
 */
const DISMISSED = "k_install_off";

export function dismissInstall() {
  try {
    localStorage.setItem(DISMISSED, "1");
  } catch {
    /* private mode — the bar simply comes back next launch */
  }
  bump();
}

export function InstallBar() {
  if (isStandalone()) return null;
  try {
    if (localStorage.getItem(DISMISSED)) return null;
  } catch {
    /* ignore — show it */
  }
  return (
    <div className="installbar">
      <span className="ic">
        <Icon name="download" />
      </span>
      {/* dlSub / dlBtn are the full-sentence strings the Settings card uses;
          in a 34px-tall strip they wrapped to four lines. A bar gets bar copy. */}
      <span className="tx" lang={S.lang}>
        {nm({ en: "Install it — works without a signal", hi: "इंस्टॉल करें — बिना नेटवर्क चलता है" })}
      </span>
      <button className="go" onClick={installApp} lang={S.lang}>
        {nm({ en: "Install", hi: "इंस्टॉल" })}
      </button>
      <button className="x" onClick={dismissInstall} aria-label={nm({ en: "Dismiss", hi: "हटाएँ" })}>
        <Icon name="close" />
      </button>
    </div>
  );
}

export function InstallCard() {
  if (isStandalone()) return null;
  return (
    <div className="dl">
      <div className="row">
        <span className="ic">
          <Icon name="download" />
        </span>
        <span style={{ minWidth: 0 }}>
          <h3 lang={S.lang}>{t("dlTitle")}</h3>
          <p>{t("dlSub")}</p>
        </span>
      </div>
      <button className="go" onClick={installApp}>
        <Icon name="share" />
        {t("dlBtn")}
      </button>
      <div className="plats">Android · iPhone · iPad</div>
    </div>
  );
}
