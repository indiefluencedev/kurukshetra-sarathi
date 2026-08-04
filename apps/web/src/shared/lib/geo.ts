import { D } from "@/data/destinations";
import { Engine } from "@/features/planner/engine";
import { S, city } from "@/app/state";
import { track } from "@/app/nav";
import type { Destination } from "@/shared/types";

export const byId = (id: string): Destination | undefined => D.find((x) => x.id === id);

export const isOpen = (d: Destination): boolean => {
  const n = new Date();
  return Engine.openAt(d, n.getDay(), n.getHours() * 60 + n.getMinutes());
};

export const distTo = (d: Destination): number =>
  Engine.roadKm(S.userLoc || city().centre, d);

/** Open Google Maps directions to a destination (was navTo). */
export function navTo(id: string) {
  const d = byId(id);
  if (!d) return;
  const o = S.userLoc || city().centre;
  const mm: Record<string, string> = {
    car: "driving",
    taxi: "driving",
    twowheeler: "two-wheeler",
    public: "transit",
    walking: "walking",
  };
  const m = mm[(S.plan && S.plan.mode) || "car"] || "driving";
  const dst = d.placeId
    ? "&destination=" + encodeURIComponent(d.name.en) + "&destination_place_id=" + d.placeId
    : "&destination=" + d.lat + "," + d.lng;
  track("nav", { id });
  window.open(
    "https://www.google.com/maps/dir/?api=1&origin=" + o.lat + "," + o.lng + dst + "&travelmode=" + m,
    "_blank",
    "noopener",
  );
}
