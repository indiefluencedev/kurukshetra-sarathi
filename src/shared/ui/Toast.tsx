import { useApp } from "@/app/state";
import { getToast } from "./overlays";

/** Transient status message. */
export function Toast() {
  useApp();
  const msg = getToast();
  return (
    <div className={"toast" + (msg ? " on" : "")} role="status" aria-live="polite">
      {msg}
    </div>
  );
}
