import type { ReactNode } from "react";
import { bump } from "@/app/state";

// Bottom-sheet + toast state. In the demo these poked the DOM directly
// (openSheet/closeSheet/toast); here they hold React content and re-render.
let sheet: ReactNode | null = null;
let toastMsg = "";
let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const getSheet = () => sheet;
export const getToast = () => toastMsg;

export function openSheet(node: ReactNode) {
  sheet = node;
  bump();
}
export function closeSheet() {
  sheet = null;
  bump();
}
export function toast(m: string) {
  toastMsg = m;
  bump();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastMsg = "";
    bump();
  }, 2200);
}
