import { S } from "@/app/state";
import { go } from "@/app/nav";
import { t } from "@/shared/i18n/i18n";
import { Icon } from "@/shared/icons/Icon";
import { openSheet, closeSheet } from "@/shared/ui/overlays";
import { currentUser, sessionKnown } from "./auth";

/**
 * The hamburger menu.
 *
 * It reuses the app's bottom sheet rather than introducing a drawer: the sheet
 * is already a correct modal — focus trapped, Escape closes, focus returns to
 * the button — and a second overlay pattern would be a second one to get
 * wrong. On a phone held one-handed it also opens where the thumb is, which a
 * top-anchored dropdown does not.
 *
 * Only the things that are *not* already a tab belong here. Home, Plan, Map
 * and Saved have the bottom bar; duplicating them would make the menu look
 * like the real navigation and the bar like decoration.
 */
function MenuBody() {
  const user = currentUser();

  const item = (icon: string, label: string, to: string, sub?: string) => (
    <button
      className="menurow"
      onClick={() => {
        closeSheet();
        go(to);
      }}
    >
      <Icon name={icon} />
      <span className="menutext">
        <b lang={S.lang}>{label}</b>
        {sub && <small>{sub}</small>}
      </span>
      <Icon name="chev" />
    </button>
  );

  return (
    <div className="menu">
      <h2 className="sheet-title" lang={S.lang}>
        {t("menu")}
      </h2>

      {/* Rendered only once the session is known. Flashing "Sign in" at
          someone who is already signed in, for the half second before the
          session resolves, reads as having been logged out. */}
      {sessionKnown() &&
        (user
          ? item("user", t("account"), "/account", user.email)
          : item("user", t("signIn"), "/account", t("accountWhy")))}

      {item("gear", t("settings"), "/settings")}
      {item("search", t("search"), "/explore")}
      {item("info", t("credits"), "/credits")}
    </div>
  );
}

export const openMenu = () => openSheet(<MenuBody />);
