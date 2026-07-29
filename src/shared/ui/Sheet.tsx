import { useApp } from "@/app/state";
import { getSheet, closeSheet } from "./overlays";

/** Bottom sheet + scrim. Content is set via openSheet(); tap-out closes. */
export function Sheet() {
  useApp();
  const content = getSheet();
  const on = content != null;
  return (
    <>
      <div className={"scrim" + (on ? " on" : "")} onClick={closeSheet} />
      <div className={"sheet" + (on ? " on" : "")} role="dialog" aria-modal="true">
        {on && <div className="grab" />}
        {content}
      </div>
    </>
  );
}
