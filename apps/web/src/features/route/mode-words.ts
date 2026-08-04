// How to say "go" and "leave the vehicle" for whichever way the visitor is
// travelling. Pure — no storage, no DOM — so it can be checked without a
// browser, which matters because getting it wrong is invisible in a
// screenshot: "leave the car and walk" reads perfectly well right up until
// the person reading it is on a bus.
import { S } from "@/app/state";
import { t, nm } from "@/shared/i18n/i18n";

const mode = () => (S.plan && S.plan.mode) || "car";

/** "drive there" / "ride there" / "walk there" — the verb for a travel leg. */
export const modeWord = () => {
  const m = mode();
  return m === "walking" ? t("walkThere") : m === "public" ? t("rideThere") : t("driveThere");
};

/**
 * "Leave the car and walk" — but only if there is a car.
 *
 * A walk pocket means the vehicle stays put while you go round on foot, and
 * saying which vehicle is what makes the instruction actionable.
 */
export const leaveVehicle = (): string => {
  switch (mode()) {
    case "walking":
      return nm({ en: "Walk on", hi: "आगे पैदल" });
    case "public":
      return nm({ en: "Get off and walk", hi: "उतरकर पैदल चलें" });
    case "twowheeler":
      return nm({ en: "Leave the bike and walk", hi: "गाड़ी वहीं छोड़कर पैदल" });
    case "erickshaw":
      return nm({ en: "Step down and walk", hi: "उतरकर पैदल चलें" });
    default:
      return nm({ en: "Leave the car and walk", hi: "गाड़ी वहीं छोड़कर पैदल" });
  }
};

/** The same thing said shortly, for the one-line leg between two stops. */
export const leaveVehicleShort = (): string => {
  switch (mode()) {
    case "walking":
      return nm({ en: "Walk on", hi: "आगे पैदल" });
    case "public":
      return nm({ en: "Get off here", hi: "यहाँ उतरें" });
    case "twowheeler":
      return nm({ en: "Leave the bike", hi: "गाड़ी वहीं छोड़ें" });
    case "erickshaw":
      return nm({ en: "Step down here", hi: "यहाँ उतरें" });
    default:
      return nm({ en: "Leave the car", hi: "गाड़ी वहीं छोड़ें" });
  }
};
