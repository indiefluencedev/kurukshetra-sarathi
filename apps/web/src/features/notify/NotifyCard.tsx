import { useState } from "react";
import { S, useApp } from "@/app/state";
import { t } from "@/shared/i18n/i18n";
import { Icon } from "@/shared/icons/Icon";
import { toast } from "@/shared/ui/overlays";
import { shouldOffer, markAsked, enablePush } from "./push";

/**
 * The first-visit ask, shown on Home.
 *
 * A card, not an immediate `requestPermission()`. The browser permits that
 * question once — "Block" is permanent and unaskable-again from the page — so
 * spending it on someone who has been in the app for four seconds and does not
 * yet know what it does is how an app ends up permanently unable to notify
 * anyone.
 *
 * So this says what the notifications actually are first. "Not now" is a real
 * answer that can be revisited from Settings; only a tap on "Yes" reaches the
 * browser prompt.
 */
export function NotifyCard() {
  useApp();
  const [gone, setGone] = useState(false);
  const [busy, setBusy] = useState(false);

  if (gone || !shouldOffer()) return null;

  return (
    <section className="card notifycard" aria-labelledby="nc-title">
      <div className="nc-head">
        <span className="nc-ic" aria-hidden="true">
          <Icon name="bell" />
        </span>
        <b id="nc-title" lang={S.lang}>
          {t("notifyTitle")}
        </b>
      </div>
      <p className="nc-body" lang={S.lang}>
        {t("notifyBody")}
      </p>
      <div className="nc-acts">
        <button
          className="btn quiet sm"
          onClick={() => {
            markAsked();
            setGone(true);
          }}
        >
          {t("notifyNo")}
        </button>
        <button
          className="btn primary sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const ok = await enablePush();
            setBusy(false);
            setGone(true);
            // Only claims success when the Worker accepted the subscription —
            // permission granted but never registered would mean silence, and
            // a promise of notifications that never come is worse than none.
            toast(ok ? t("notifyOn") : t("notifyOff"));
          }}
        >
          {busy ? t("working") : t("notifyYes")}
        </button>
      </div>
    </section>
  );
}
