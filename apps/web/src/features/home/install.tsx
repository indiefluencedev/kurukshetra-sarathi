import { bump } from "@/app/state";
import { S } from "@/app/state";
import { track } from "@/app/nav";
import { t } from "@/shared/i18n/i18n";
import { openSheet, closeSheet, toast } from "@/shared/ui/overlays";
import { Icon } from "@/shared/icons/Icon";

// Chrome/Android fires this before offering install; stash it for installApp().
let installEvt: any = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installEvt = e;
});

/**
 * Remembered once the browser tells us the install went through.
 *
 * `isStandalone()` alone is not enough to answer "is it on their home screen".
 * It reports how THIS window was opened, so someone who installs the app and
 * then goes on browsing in the tab they installed from — which is exactly what
 * happens — reads as not installed, and would be asked to install it again.
 * The `appinstalled` event says it happened; localStorage is what carries that
 * answer into every later tab visit.
 */
const INSTALLED = "k_installed";

window.addEventListener("appinstalled", () => {
  try {
    localStorage.setItem(INSTALLED, "1");
  } catch {
    /* private mode — standalone detection still covers the launched app */
  }
  installEvt = null;
  bump();
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

/** On their home screen — launched from it, or seen to be installed earlier. */
export function isInstalled(): boolean {
  if (isStandalone()) return true;
  try {
    return localStorage.getItem(INSTALLED) === "1";
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
 * The install offer, as a card.
 *
 * This existed, styled and finished, from the port onwards — and was rendered
 * nowhere. The only install surface that ever reached Home was a slim bar,
 * behind `store.routes.length`, i.e. only after someone had already built and
 * saved a route. A first-time visitor standing at the bus stand on a rural
 * signal — the exact person a PWA is for — was never told the app could be
 * installed at all.
 *
 * So it shows from the first visit, and it does not go away for any reason
 * except the one that makes it pointless: the app being on their home screen.
 * There is no dismiss. That is a deliberate reversal — it had a "not now", and
 * a "not now" on the one control that makes this app work on a dead signal is
 * a tap that costs the visitor the offline copy and gives them nothing. The
 * card is small, it is below the fold, and it stops the moment `isInstalled()`
 * says it should.
 */
export function InstallCard() {
  if (isInstalled()) return null;
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
