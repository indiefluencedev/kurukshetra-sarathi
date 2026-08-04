import { imgUrl } from "@/data/images";
import { theme } from "@/data/config";
import { nm } from "@/shared/i18n/i18n";
import { Icon } from "@/shared/icons/Icon";
import type { Destination } from "@/shared/types";

/** Place photo; falls back to a themed plate when no image is set. */
export function Photo({ d, cls }: { d: Destination; cls?: string }) {
  const src = d.img ? imgUrl(d.img) : undefined;
  if (src)
    return (
      <span className={"ph " + (cls || "")}>
        <img
          src={src}
          alt={nm(d.name)}
          loading="lazy"
          onLoad={(e) => e.currentTarget.classList.add("in")}
        />
      </span>
    );
  const ic = (theme(d.themes[0]) || { icon: "pin" }).icon;
  return (
    <span
      className={"ph " + (cls || "")}
      style={{ display: "grid", placeItems: "center", background: "#DED7C8", color: "#9A8F7C" }}
    >
      <Icon name={ic} style={{ width: "34%", height: "34%" }} />
    </span>
  );
}
