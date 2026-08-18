import { S } from "@/app/state";
import { nm } from "@/shared/i18n/i18n";
import { DC } from "@/data/destinations";
import { imgUrl } from "@/data/images";
import { Icon } from "@/shared/icons/Icon";
import { dur } from "@/shared/lib/format";
import { quickRoute, DAY_MINS } from "@/features/planner/plan";
import type { Loc } from "@/shared/types";

/**
 * Three routes a guide would actually suggest.
 *
 * This is the section the front page was missing. "Temples · 23 places" is a
 * query result: it hands the visitor a filtered list and leaves the actual
 * work — which of the twenty-three, in what order, in the time I have — to
 * them. A named route does that work first and asks one question: does this
 * sound like your day?
 *
 * Nothing here is new machinery. Each row is a themes + minutes pair handed
 * to the same engine the planner uses; the names and the reasons are the only
 * things added, and they are the entire point.
 */
interface Route {
  id: string;
  name: Loc;
  why: Loc;
  themes: string[];
  mins: number;
  img: string;
  icon: string;
}

const ROUTES: Route[] = [
  {
    id: "gita",
    name: { en: "The Gita trail", hi: "गीता पथ" },
    why: { en: "Where the Gita was spoken, and the field it was spoken on.", hi: "जहाँ गीता कही गई, और वह भूमि जिस पर कही गई।" },
    themes: ["mahabharata"],
    mins: 240,
    img: "jyotisar",
    icon: "rath",
  },
  {
    id: "ghats",
    name: { en: "Sarovars and ghats", hi: "सरोवर और घाट" },
    why: { en: "The great tanks, best in the cool of the morning.", hi: "विशाल सरोवर, प्रातःकाल की ठंडक में सर्वोत्तम।" },
    themes: ["sarovar"],
    mins: 180,
    img: "brahma-sarovar",
    icon: "kalash",
  },
  {
    id: "everything",
    name: { en: "One full day", hi: "एक पूरा दिन" },
    why: { en: "The whole tirtha land, paced so it can actually be walked.", hi: "सम्पूर्ण तीर्थ भूमि, ऐसी गति से कि सचमुच घूमी जा सके।" },
    themes: [],
    mins: DAY_MINS,
    img: "sthaneshwar",
    icon: "route",
  },
];

/** How many plannable places a route would draw from — shown, not guessed at. */
const poolSize = (themes: string[]) =>
  themes.length ? DC().filter((d) => themes.some((t) => d.themes.indexOf(t) >= 0)).length : DC().length;

export function StartHere() {
  return (
    <div className="sec">
      <div className="sec-head">
        <h2 lang={S.lang}>{nm({ en: "Start here", hi: "यहाँ से शुरू करें" })}</h2>
      </div>

      <div className="routes stagger">
        {ROUTES.map((r) => (
          <button
            key={r.id}
            className="rt"
            onClick={() => quickRoute(r.themes, r.mins, nm(r.name))}
            lang={S.lang}
          >
            <span className="rt-img">
              <img src={imgUrl(r.img)} alt="" loading="lazy" decoding="async" onLoad={(e) => e.currentTarget.classList.add("in")} />
            </span>
            <span className="rt-body">
              <span className="rt-name" lang={S.lang}>
                {nm(r.name)}
              </span>
              <span className="rt-why" lang={S.lang}>
                {nm(r.why)}
              </span>
              <span className="rt-meta">
                <span className="rt-n tnum">{dur(r.mins)}</span>
                <i />
                <span>{nm({ en: poolSize(r.themes) + " places", hi: poolSize(r.themes) + " स्थान" })}</span>
              </span>
            </span>
            <span className="rt-go">
              <Icon name="fwd" />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
