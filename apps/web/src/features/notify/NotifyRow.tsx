import { useEffect, useState } from "react";
import { t } from "@/shared/i18n/i18n";
import { Icon } from "@/shared/icons/Icon";
import { toast } from "@/shared/ui/overlays";
import { pushState, enablePush, disablePush, isSubscribed } from "./push";

/**
 * The notification switch in Settings, and the only place it can be undone.
 *
 * It reports the *subscription*, not the permission. Those come apart: a
 * browser can hold "granted" while the subscription was never registered, or
 * was dropped when the push service expired it. Showing "on" in that state
 * would be the app telling a confident lie about something the visitor cannot
 * check for themselves.
 */
export function NotifyRow() {
  const state = pushState();
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    isSubscribed().then(setOn);
  }, []);

  if (state === "unsupported") return null;

  // A browser-level block cannot be undone from here — only in browser
  // settings — so the row says so rather than offering a button that silently
  // does nothing.
  const blocked = state === "denied";

  return (
    <div className="card rcard" style={{ marginTop: 11 }}>
      <span className="ic">
        <Icon name="bell" />
      </span>
      <span style={{ flex: 1 }}>
        <h3>{t("notifications")}</h3>
        <p>{blocked ? t("notifyBlocked") : on ? t("notifyOn") : t("notifyOff")}</p>
      </span>
      {!blocked && on !== null && (
        <button
          className="btn quiet sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            if (on) {
              await disablePush();
              setOn(false);
              toast(t("notifyOff"));
            } else {
              const ok = await enablePush();
              setOn(ok);
              toast(ok ? t("notifyOn") : t("notifyOff"));
            }
            setBusy(false);
          }}
        >
          {busy ? t("working") : on ? t("turnOff") : t("turnOn")}
        </button>
      )}
    </div>
  );
}
