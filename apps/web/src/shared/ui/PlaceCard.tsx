import { S } from "@/app/state";
import { go } from "@/app/nav";
import { t, nm } from "@/shared/i18n/i18n";
import { dur } from "@/shared/lib/format";
import { isOpen, distTo } from "@/shared/lib/geo";
import { Icon } from "@/shared/icons/Icon";
import { Photo } from "./Photo";
import type { Destination } from "@/shared/types";

/** open/closed status chip. */
export function StatusPill({ d }: { d: Destination }) {
  const o = isOpen(d);
  return <span className={"status " + (o ? "open" : "shut")}>{o ? t("open") : t("shut")}</span>;
}

/** Compact feature card (theme rails, explore). */
export function Fcard({ d }: { d: Destination }) {
  return (
    <button className="fcard" onClick={() => go("/place/" + d.id)}>
      <Photo d={d} />
      <span className="in" style={{ display: "block" }}>
        <h3 lang={S.lang}>{nm(d.name)}</h3>
        <p>{nm(d.short)}</p>
        <span className="meta">
          <StatusPill d={d} />
          <span className="tag">
            <Icon name="clock" />
            {dur(d.visit.rec)}
          </span>
        </span>
      </span>
    </button>
  );
}

/** Full-width list card (explore list, search, near-me) with distance. */
export function Pcard({ d }: { d: Destination }) {
  return (
    <button className="card pcard" onClick={() => go("/place/" + d.id)}>
      <Photo d={d} />
      <span className="body">
        <h3 lang={S.lang}>{nm(d.name)}</h3>
        <span className="alt" lang={S.lang === "hi" ? "en" : "hi"}>
          {S.lang === "hi" ? d.name.en : d.name.hi}
        </span>
        <span className="sub">{nm(d.short)}</span>
        <span className="meta">
          <StatusPill d={d} />
          <span className="tag">
            <Icon name="clock" />
            {dur(d.visit.rec)}
          </span>
          <span className="tag">
            <Icon name="pin" />
            {distTo(d)} {t("km")}
          </span>
        </span>
      </span>
    </button>
  );
}
