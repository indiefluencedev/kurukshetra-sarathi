# 07 — Screen specifications

Kurukshetra Saarthi · every screen, designed against the brand system.
Written 2026-07-31 against the code on `plan-my-visit-phase-1`.

Companion to `06-design-system.md` (which records what is *built*). This document
records what each screen *should be*, and where the two disagree.

---

## 0. Read this first — the brand system in force

The design brief supplied for this document specifies a system that the shipped
app does not currently implement. This is not drift; it is a real fork, and it
has to be resolved before any of the per-screen colour guidance below is acted
on.

**Brief (governs this document):** Royal Saffron `#D97706` is the primary — every
CTA, active tab, selected chip, progress. Temple Gold `#F4C15D` is decorative
only, never a CTA. Peacock Indigo `#24486E` is reserved *exclusively* for maps,
routes, navigation, links and "you are here" — **never** a primary button.

**Shipped:** there is no saffron anywhere. `--accent` is Peacock Indigo, and it
carries *every* action, every selected state, and "you are here" — precisely the
role the brief forbids it. Brass `#B98F3E` fills the decorative slot Temple Gold
is specified for. This was a deliberate choice recorded in project memory (indigo
was picked over terracotta, green and dark brass), and the entire ~1,270-rule
stylesheet consumes it through `--accent` / `--clay`.

I have written every screen below to the **brief**, because the brief is the
instruction. But the change is a repaint of the whole app, not a screen-level
tweak, so it is isolated in one ledger you can act on or reject in one decision.

### 0.1 Divergence ledger — brief vs. shipped

| # | Brief | Shipped | Where | Cost to reconcile |
|---|---|---|---|---|
| 1 | Primary = Royal Saffron `#D97706` | `--accent:#24486E` (indigo) | `global.css:29` | One token. Every rule follows. |
| 2 | Indigo reserved for map/nav/AI/links only | Indigo *is* the primary; used for CTAs, chips, checkmarks, tab pill, `.link` | throughout | Needs a second token: `--nav` for the reserved role, so map polyline and `.btn.nav` stop sharing the CTA colour. |
| 3 | Secondary = Temple Gold `#F4C15D`, never a CTA | `--brass:#B98F3E` — correct *role*, darker value | `global.css:38` | Value change only. Note `#F4C15D` fails contrast as text on cream; keep `--brass-deep` for any gold that carries words. |
| 4 | Brand Dark = Ancient Maroon `#4A1F16` for large headings / hero overlays / footer | `--umber-deep:#3A3022` (brass-brown) on the route summary plate and journey overlays | `global.css:45` | Value change. Maroon is warmer and more Mahabharata; I recommend taking it. |
| 5 | Background Warm Cream `#FAF6EF` | `--bone:#F6F1E4`, body `#EDE6D6` | `global.css:16` | `#FAF6EF` is lighter — check outdoor glare before adopting; the current darker cream was chosen for sunlight. **Recommend keeping shipped.** |
| 6 | Headings Playfair Display | `--serif` falls back through Baskerville → Playfair → Iowan → Palatino → Georgia; no webfont is loaded | `global.css:66` | Ship Playfair as a subset webfont, or accept the system stack. Devanagari uses Noto Serif Devanagari regardless — Playfair has no Devanagari, so **half the audience never sees it**. Low priority. |
| 7 | Radii 24 / 22 / 16 / 18 / 28 | `--r-xs:6 --r-sm:10 --r:14 --r-lg:18 --r-xl:22` | `global.css:62` | The shipped scale is uniformly tighter. Adopting the brief's radii is a 5-value edit but changes the app's whole character from "manuscript plate" to "consumer app card". **Recommend a middle position:** raise `--r` 14→18 and `--r-lg` 18→22, leave the rest. |
| 8 | Bottom nav floating, 72px, cream, soft shadow, saffron circular pill behind the active icon | Already floating, already has a sliding pill — but the pill was an indigo *wash* with a hairline ring, i.e. a tint | `global.css` `nav.tab:before` | Small. Fill the pill instead of tinting it. A tint is the first thing sunlight erases. |
| 9 | Buttons 54px | `--tap:52px`, `.btn.sm` 40px | `global.css:63` | Raise `--tap` to 54. `.btn.sm` at 40px is below the brief *and* below WCAG 2.2 AA target size — used in `.tl-btns`, `.acts`, map header. Fix. |
| 10 | Page padding 24px, 32px between sections | `main{padding:0 16px}`, `.sec{margin:26px 0}` | `global.css:127,131` | 16→24 costs 16px of line length on a 360px phone. **Recommend 20px** as the compromise; Hindi lines are longer. |
| 11 | Minimum font 14px | Hard floor ~12px (`.tag`, `.eyebrow`, `.hubcard p`, `.mcell span` all at `calc(12px*var(--ts))`) | throughout | The 12px floor was a deliberate concession to fit. At the default `--ts:1.08` these render 12.96px effective. Raising the floor to 14px reflows every meta row. **Recommend: raise to 13px base (14.04px effective at default `--ts`), which satisfies the brief in rendered pixels without a reflow.** |
| 12 | Cards Pure White | `--surface:#FFFCF4` (cream-white) | `global.css:17` | Keep shipped. Pure white next to cream reads as a bug in sunlight. |

### 0.1b Status — implemented 2026-07-31

The ledger above has been **applied**. What shipped:

- `:root` repainted: `--accent` is Royal Saffron `#D97706`; a new `--nav`
  (`#24486E`) holds the reserved indigo; `--gold` / `--brass-soft` are Temple
  Gold `#F4C15D`; `--umber-deep` is Ancient Maroon `#4A1F16`.
- Indigo split out of the action role and applied to its reserved uses only:
  `.btn.nav`, `.link`, disclosure summaries, search glyphs, the focus ring, the
  you-are-here dot, and both Leaflet polylines. `MapView.tsx` and `RouteMap.tsx`
  now read `--nav` off the root element rather than `--accent`.
- Geometry: radii 8/12/16/22/28 + `--r-hero:24`; `--tap:54`; `--pad:20px` as a
  token, with every edge-bleed rail negating it; `.sec` gap 32px.
- Type floor raised to 13px base (14.04px rendered at the default `--ts` of
  1.08), in the stylesheet and in inline styles.
- Sheet is a real modal: focus in, focus trapped, focus returned, Escape closes,
  and the grab handle now actually drags the sheet down.
- Map has a List view and a tile-failure fallback; Saved has a skeleton instead
  of a blank frame; `.btn.sm` and every chip are 54px.

Ledger rows deliberately **not** taken, with reasons in the rows themselves:
#5 (lighter cream — loses in sunlight), #6 (Playfair webfont — invisible to
Devanagari readers), #12 (pure-white cards).

Verified in Chromium at 390×844 across the splash, hub, Home, Explore, Search,
Place, all four planner steps, a built route, the journey card, Map, Map-list,
Saved, Settings — and Home again in Hindi. No console or page errors.

### 0.2 What is already right, and must not be lost in a repaint

The shipped app is tuned for a specific audience — elderly pilgrims, outdoors, on
a phone, half of them reading Devanagari. Several decisions in the code are
*better* than a generic premium-travel brief and should survive:

- `--ts` (text scale) defaults to **1.08, not 1** — the app ships slightly large.
- Colour never carries meaning alone: `.status` has a dot **and** a word;
  `.opt.on` has a border, a wash **and** a checkmark.
- `:lang(hi)` overrides on nearly every type rule — Devanagari gets its own size
  and line-height, not a squeezed Latin one.
- Leaflet can't read CSS variables, so `MapView.tsx:19` and `RouteMap.tsx` read
  `--accent` off the root element at runtime. **Any new map colour must do the
  same.** A repaint that hardcodes a hex into a map file will silently desync.
- `--clay` is kept as an alias of `--accent` so ~60 legacy rules follow the token.
  Don't "clean it up".

---

## 1. Cross-cutting foundations

These apply to every screen. Per-screen sections below state only their
**deviations**, so this section is the one to read carefully.

### 1.1 Spacing

8-point grid. Page padding 20px (see ledger #10). Section gap 32px
(`.sec{margin:32px 0}`). Card padding 20px for content cards, 12px for cards whose
child is a photo (the photo supplies the optical margin). Stack gap inside a card:
8 / 12 / 20 depending on relatedness. Bottom of every scrolling screen reserves
`88px + env(safe-area-inset-bottom)` so the tab bar never covers the last row.

### 1.2 Type scale

Every size is `calc(Npx * var(--ts))`. Never hardcode px in a component.

| Role | Size | Family | Weight |
|---|---|---|---|
| Screen title (`.phead h1`) | 21 | serif | 600 |
| Question / hero headline (`.q`) | 23 | serif | 600 |
| Section head (`.sec-head h2`) | 19.5 | serif | 600 |
| Card title | 15.5–16.5 | serif | 600 |
| Body | 17 (root) | sans | 400 |
| Supporting (`.qs`, `.sub`) | 13.5 | sans | 400 |
| Meta / tag | 13 (raised from 12, ledger #11) | sans | 600 |
| Eyebrow | 13, `.15em` tracking, uppercase | sans | 700 |

Devanagari drops ~0.5px and gains line-height at every step. Numbers that a
traveller compares (times, distances, counts) use `.tnum` — tabular figures, so a
column of clock times doesn't jitter.

### 1.3 Motion

250ms is the brief's figure; the shipped `--t:190ms` with
`cubic-bezier(.22,.61,.36,1)` is better on a low-end Android — keep it. Three
motions only:

- **rise** — screen enter, 5px up + fade, 190ms. Already global on `.screen`.
- **lift** — press feedback, `translateY(1px)` or `scale(.985)`, 140ms.
- **expand** — sheets, `translateY(100%) → 0`, 260ms.

No bounce, no spring, no parallax. `prefers-reduced-motion:reduce` must kill
every one — the stylesheet has 5 such blocks already; any new animation adds a
sixth or extends one.

### 1.4 Accessibility (applies everywhere)

- Touch target 54px minimum (`--tap`). No exceptions, including `.btn.sm`.
- Text floor 13px base → 14.04px rendered at default `--ts`.
- Focus: `:focus-visible{outline:3px solid var(--nav);outline-offset:2px}` —
  outline uses the **navigation indigo**, not the saffron primary, so a focus
  ring is never confusable with a selected state.
- Colour never alone. Every selected, active, open/closed or "in your plan" state
  carries a glyph or a word as well.
- Every icon-only button has `aria-label`. Every screen has exactly one `<h1>`.
- The app is a PWA: every screen must render something useful with the network
  off. Map tiles are the only hard-online element; they get an explicit
  offline state (§2.14).

### 1.5 The three states, by convention

Rather than repeat these 18 times:

- **Loading** — never a spinner on first paint. Use the content's own skeleton:
  photo slots hold `--stone` at the final aspect ratio, text lines hold a 40%-width
  cream bar. `.ph img` already fades in on load (`opacity 0 → 1`, 260ms), which is
  the right pattern; extend it. A spinner is permitted only for an action the user
  just initiated (route build, location fix) and only after 400ms.
- **Empty** — `.empty`: centred icon (48px, `--stone-2`), one sentence in
  `.t` naming what's missing in human language, one sentence of what to do, then
  **one** primary button. Never "No results".
- **Error** — same shape as empty, but the sentence says what failed and the
  button retries. Never surface a status code. Offline is a *state*, not an error:
  say "You're offline — this is the plan you saved", not "Network request failed".

### 1.6 Responsive

Single column, `--maxw:480px`, centred, with a 1px ring so it reads as a device
on desktop. Below 340px: theme tiles collapse 2-col → 1-col, `.mgrid` 2×2 → 1×4,
`.acts` wraps. Above 480px nothing grows — the layout is a phone layout and
stretching it would betray the 20px rhythm. Landscape: the sticky `.dockbar` and
`.planbar` must not consume more than 30vh; below 420px viewport height, they
collapse to the primary action only.

---

## 2. Screens

Each screen follows the 14-point structure. Points that are fully covered by §1
are marked *"per §1.x"* rather than restated.

---

### 2.1 Splash & Language Gate — `/start`

**1. UX reasoning.** The first screen has one job and it is not branding: get the
visitor into a language they can read, in one tap, before they have learned
anything about the app. Everything else on the plate exists to make that one tap
feel like the beginning of a journey rather than a settings prompt. It is also
the only place the Kurukshetra Development Board's authority is asserted — a
government tourism app that never shows its seal is not trusted; one that shows
it on every screen is a government website.

**2. Layout hierarchy.** Full-bleed dark plate. Top 60%: seal → board name (EN) →
board name (HI) → hairline rule → wordmark "Kurukshetra / कुरुक्षेत्र" → "48 Kos
Tirtha Land". Bottom 40%: "Choose your language / अपनी भाषा चुनें" → two equal
cards → "Change it anytime in Settings".

**3. Components.** `.splash`, `.rays`, `.crest`, `.halo`, `.seal`, `.rule`,
`.gate`, `.langs`, `.lang`, `.lang .tick`, `.foot`.

**4. Spacing.** 26px side padding. Seal `min(46vw,178px)`. 20px seal→board, 20px
rule margins, 16px wordmark→kos, 14px ask→cards, 11px between cards, 15px
cards→foot. Bottom padding `30px + safe-area`.

**5. Colour.** The one screen that inverts. Ground: radial Ancient Maroon
`#4A1F16` → deeper maroon (ledger #4 — currently brass-brown `#6B573A→#2A2317`,
which is the weaker choice here; maroon reads as Kurukshetra dusk, brown reads as
sepia). Type `#F2EEE6`. Board name and rule in Temple Gold `#F4C15D` at low
opacity — this is exactly the decorative role Gold is specified for. Language
cards: 7% white fill, 20% white border. Chosen card: gold border + gold tick.
**No saffron on this screen** — the primary is the two language cards, and making
them saffron would fight the gold and the seal.

**6. Interaction.** Tap a card → tick scales in (200ms) and the card fills → 170ms
later the crest lifts and fades → 300ms the plate dissolves → 720ms navigate to
`/begin`. The `gate` ref blocks a double-tap for the whole 720ms. Language is
written to `localStorage` *before* the animation, so a mid-animation kill still
lands correctly on next launch.

**7. Motion.** A staged reveal, 0.1s→1.34s: seal (1.05s) → board (0.7s @ .62s) →
board-hi (@ .72s) → rule scaleX (@ .86s) → wordmark (@ .96s) → kos (@ 1.1s) →
gate (@ 1.34s). Rays fade in over 1.5s and rotate once per 150s — slow enough to
be felt rather than seen. **Under reduced-motion the entire sequence must resolve
to the final frame instantly**, including the exit; the gate must be tappable
within 100ms.

**8. Edge cases.** Language already chosen → `/start` is skipped entirely by the
router (`App.tsx:38,53`); a visitor who wants to change it uses Settings, and the
foot line tells them so before they need it. Very short viewport (<600px): the
crest scales via `vw` units and the gate is `position:relative` at the end of a
flex column, so it never collides. Slow font load: the Devanagari card must not
show a `.notdef` box — preload the Noto Devanagari subset or the Hindi option is
unreadable to exactly the people who need it.

**9. Empty state.** None possible.

**10. Loading state.** This *is* the loading state for the app. The seal is the
only asset on the critical path; inline it or preload it. Nothing waits on
network — the plate must be complete offline.

**11. Error state.** None. If `localStorage` is unavailable (private mode), the
choice is held in memory for the session and the foot line changes to "We'll ask
again next time".

**12. Responsive.** `clamp(34px,10.5vw,46px)` on the wordmark, `min(46vw,178px)`
on the seal, `min(74vw,300px)` on the halo — already correct. Landscape: crest
`flex:1` shrinks and the gate holds; verify at 360×640 landscape that both cards
stay ≥54px.

**13. Accessibility.** Each card is a `<button>` with an explicit `aria-label`
("Continue in English" / "हिन्दी में जारी रखें") because the visible label is a
language name, not an action. `document.documentElement.lang` is set on tap,
before navigation, so the very next screen announces correctly. Contrast: `#F2EEE6`
on the maroon ground exceeds 12:1; the 38%-opacity foot line is the weakest
element at ~4.6:1 — acceptable for a non-essential line, but do not go lower.

**14. Why.** The 720ms delay is unusually long for a tap. It is deliberate: this
is the only ceremony in the app, and it buys the emotional register that the rest
of the product then spends. Every subsequent screen is fast and plain **because**
this one is slow and grand.

---

### 2.2 Begin — the hub — `/begin`

**1. UX reasoning.** Immediately after choosing a language the visitor knows
nothing about the app. Dropping them on Home (which opens with a question about
time budget) assumes they have already decided to plan. This screen asks the
prior question: *how do you want to start?* Four answers, four different mental
models of a tourist — the planner, the highlight-seeker, the browser, and the
person already standing in Kurukshetra.

**2. Layout hierarchy.** Brand row (seal + eyebrow + wordmark + language toggle)
→ headline "How would you like to explore?" (25px serif) → four hub cards.

**3. Components.** `.seal`, `.eyebrow`, `.display`, `.langbtn`, `.hub`,
`.hubcard` (icon plate + title + description + chevron).

**4. Spacing.** 18px top / 16px sides. 26px brand→headline, 20px headline→hub,
10px between cards. Card padding 15px, 14px icon→text.

**5. Colour.** Cream ground. **Card 1 (Plan my visit) is the dominant action** and
takes the saffron icon plate (`#D97706` on a saffron wash). Cards 2–4 take brass
and umber plates — present, quieter, unmistakably secondary. This is the screen's
whole hierarchy: four identical cards where exactly one is warm.

**6. Interaction.** Tap → `scale(.99)` → route. "Near me" is the only one that can
fail: it requests geolocation and routes to `/map` on resolve *or* refusal (the
map is useful either way, centred on the town).

**7. Motion.** `.stagger` — children rise in sequence, ~40ms apart. Per §1.3.

**8. Edge cases.** No language in storage → the router bounces to `/start`
(`App.tsx:38`). Geolocation denied → proceed to `/map` without the "you are here"
dot and without an error dialog; the map's own "My location" button remains as the
retry. Long Hindi strings: `.hubcard h3` drops to 16px and `.hubcard p` wraps to
two lines — the card must grow, never clip.

**9. Empty state.** None — the four options are static.

**10. Loading state.** None; no data.

**11. Error state.** None.

**12. Responsive.** Single column at all widths. Per §1.6.

**13. Accessibility.** This screen has no bottom tab bar and no back button — it
is a root. That is correct, but it means the language toggle in the header is the
only escape; keep it at 44px+ and labelled.

**14. Why.** This screen is a fork, not a menu — the four cards are four different
first sessions, and putting the planner first with the only warm plate makes the
recommendation without removing the other three.

---

### 2.3 Home — `/home`

**1. UX reasoning.** Home's primary action is not "browse" — it is **"tell me how
much time you have"**, because that single answer unlocks the app's actual value
(a built route). Everything else on this screen is there for the visitor who
isn't ready to answer yet. The current implementation gets this right: the time
block is the first thing on the screen, above search, above the carousel.

**2. Layout hierarchy.**
1. `TimeBlock` — headline question + day picker + two rows of duration pills.
2. Search row + weather chip (one row, both large).
3. `HeroRail` — must-see carousel.
4. Themes grid (8 tiles, 2-up).
5. `HowToCard` — only until the first route is built.
6. Estimates disclaimer + credits link.

**3. Components.** `.tblock` / `.tb-head` / `.daypick` / `.tp-row` / `.tpill`,
`.homerow` / `.searchrow`, `.wxchip`, `.hero-c` / `.hero-slide` / `.hero-dots`,
`.sec-head`, `.themes` / `.tile`, `.rcard`, `.note`.

**4. Spacing.** 20px page padding. TimeBlock is a plate with 20px internal
padding; 8px between pills, 10px between the two pill rows. 32px between sections
(`.sec`). Theme grid 10px gutter, `aspect-ratio:1.42/1`.

**5. Colour.** Cream ground throughout. The duration pills are the primary action
and therefore the only saffron on the screen — but they are *nine* pills, so they
cannot all be filled saffron or the screen becomes a wall of orange. Resolution:
pills are white with a brass hairline; **the pill under the finger fills saffron
on press and the screen navigates**. Persisted selection is not shown here (the
selection lives in the planner). Theme tiles: photo + maroon-to-transparent
gradient, white text. Weather chip: cream plate, brass glyph.

**6. Interaction.** Tap a duration pill → `quick(m,label)` seeds a plan and jumps
straight to `/route` with a built itinerary — **one tap from launch to a finished
journey.** That is the app's headline capability and this screen is where it
lives. The day picker is a native `<input type="date">` behind a styled label (the
right call: the OS picker is familiar, localised, and free). Search row navigates
to `/search`. Hero auto-advances every 5s and **stops permanently on first
pointer-down** — never fight a finger.

**7. Motion.** `.stagger` on the theme grid. Hero uses native scroll-snap with
`behavior:smooth`; dots sync on the scroll event, not on a timer. Per §1.3.

**8. Edge cases.** Weather API down or offline → the chip shows the clock and
place only, never a broken glyph or a zero temperature. Hero images missing →
`byId` returns null and the slide is skipped (`HeroRail.tsx:53`), so a bad content
id costs one slide, not the carousel. A theme with zero places still renders its
tile with "0 places" — better to prune it from `themes.json`.

**9. Empty state.** Not reachable — themes and heroes are bundled content. If
`D` is empty the theme counts read 0; treat that as a content-validation failure
(`apps/web/src/content/validate.ts`), not a UI state.

**10. Loading state.** Weather chip has a skeleton (`.wx-skel`, animation-disabled
under reduced motion — already correct). Hero images fade in per §1.5. The
TimeBlock is pure static markup and must paint in the first frame — it is the
LCP element and must never wait on the weather fetch.

**11. Error state.** Weather failure is silent (degrade to clock). No other
network dependency.

**12. Responsive.** Theme grid 2-col; 1-col below 340px. Pill rows scroll
horizontally if they overflow rather than wrapping to a ragged third row.

**13. Accessibility.** The `<h1>` is the TimeBlock question — correct, it names
the screen's job. The hero carousel needs `aria-live="off"` and the auto-advance
must not move focus. Nine duration pills at 13.5px/42px: raise to 54px per ledger
#9. The date input keeps its native semantics; the styled label must not swallow
the input's own accessible name (`aria-label` is present).

**14. Why.** Search was moved out of the header and onto the canvas as a full-width
row because a 21px magnifier in a header is invisible to a 68-year-old outdoors.
The same reasoning demoted the header to three targets. Reels were moved off Home
onto the place they were filmed at — they are context, not content. The How-to
card disappears after the first route (`!store.routes.length`) rather than living
in a permanent "Help" slot, because a permanent help affordance is an admission
the screen didn't work.

---

### 2.4 Explore — all places — `/explore`

**1. UX reasoning.** The complete list, for the visitor who wants to see
everything rather than be curated at. Its only real design decision is the sort
order: `first` descending — an editorial "if you see one thing" ranking — not
alphabetical and not by distance. A tourist doesn't know the names yet, so
alphabetical is noise.

**2. Layout hierarchy.** Title → count → list of `Pcard`.

**3. Components.** `.phead`, `.muted` count line, `.plist`, `.card.pcard`.

**4. Spacing.** 11px between cards; card padding 11px with a 92px square photo.

**5. Colour.** Cream ground, white cards, brass hairline. Status pill is the only
colour: green wash open / red wash shut, each with a dot *and* a word.

**6. Interaction.** Whole card is one tap target → `/place/:id`. No inline
bookmark on this card (the brief asks for one; see §2.4 point 14).

**7. Motion.** `.stagger` on the list. Per §1.3.

**8. Edge cases.** A destination with no photo falls back to a themed icon plate
(`Photo.tsx`) rather than a broken image or a grey box — good. Two-line clamp on
`.sub` prevents a long description from breaking the rhythm.

**9. Empty state.** Not reachable with bundled content.

**10. Loading.** Per §1.5 — photo slots hold their 92px square immediately, so the
list never reflows as images arrive.

**11. Error.** None.

**12. Responsive.** Per §1.6.

**13. Accessibility.** Each card is a `<button>` whose accessible name is the
place name + description; verify it isn't reading the whole meta row. Screen has
one `<h1>`.

**14. Why / open decision.** The brief specifies a bookmark control on every
destination card. It is deliberately absent here: adding a second target inside a
card that is itself one big target creates a 44px hit-slop problem for unsteady
hands, and saving is available one tap deeper on the place screen where it has
room. **Recommendation: keep it off the list card.** If it must exist, it goes
top-right of the photo, 54px, with a 6px inset so it never overlaps the card's own
press area.

---

### 2.5 Theme — `/theme/:id`

**1. UX reasoning.** A theme is a *reason to go*, so the screen must end in an
action, not a list. Its one meaningful addition over Explore is the CTA at the
bottom: "Plan my visit" seeded with this theme.

**2. Layout hierarchy.** Back + theme name → ranked place list → full-width
primary CTA.

**3. Components.** `.phead` + `.back`, `.plist` / `.pcard`, `.btn.primary`.

**4. Spacing.** 20px above the CTA, 6px below it before the tab bar reserve.

**5. Colour.** As Explore. The CTA is the screen's only saffron.

**6. Interaction.** CTA → `quickTheme(id)` — seeds a plan with this theme and
builds. Unknown `:id` renders `<Explore/>` instead of erroring (`Theme.tsx:16`) —
a good silent recovery.

**7. Motion.** `.stagger`. Per §1.3.

**8. Edge cases.** A theme with one place still shows the CTA; a one-stop route is
a legitimate answer. A theme where everything is closed on the chosen day
produces a no-fit route — handled downstream at §2.12.

**9–12.** Per §1.5 / §1.6; identical to Explore.

**13. Accessibility.** The CTA sits *after* a potentially long list. Long lists
bury a primary action — see point 14.

**14. Why / open decision.** The brief's rule "every screen has ONE dominant CTA"
is satisfied, but the CTA is below N cards. **Recommendation: hoist it.** Put the
CTA directly under the title as a full-width button, and the list below it. The
visitor arrives here already interested in the theme; making them scroll past
twelve cards to act on that interest is the wrong order.

---

### 2.6 Search — `/search`

**1. UX reasoning.** Search here is not "find a known item" — a tourist doesn't
know the place names. It is **filtering**, which is why the four chips (Open now /
Free / Indoor / Short visit) matter more than the text field. Those chips answer
the four questions an actual traveller has at 2pm on a Monday.

**2. Layout hierarchy.** Back + title → search field (autofocused) → filter chip
row (horizontal scroll) → results.

**3. Components.** `.phead`, `.search` (icon + input + clear), `.hscroll` +
`.chip`, `.plist` / `.pcard`, `.empty`.

**4. Spacing.** 11px field→chips, 8px between chips, 11px between results.

**5. Colour.** Selected chip fills saffron with white text (per brief: "selected
chips" is an explicit saffron role). Unselected: white with brass hairline. The
chip is the one place a selected state is genuinely binary and reversible, so the
fill is safe here where it isn't on Home's pills.

**6. Interaction.** Autofocus + caret to end of any restored query
(`Search.tsx:17-23`) — returning to search resumes where you left, because `S.sq`
and `S.sf` are global. Filters combine (AND). Results re-rank by `rank` desc.

**7. Motion.** `.stagger` on results. Results should **not** re-stagger on every
keystroke — gate the animation to first render only, or typing becomes a strobe.
*(Current code re-runs it; fix.)*

**8. Edge cases.** Query matches EN name, HI name, description **and** theme ids
(`Search.tsx:33`) — so typing "temple" finds spiritual places whose names contain
no such word. Filters with an empty query are valid and useful ("just show me
what's open"). Clear button appears only when there is text.

**9. Empty state.** `.empty` with the search glyph, "We couldn't find a matching
place." + a line suggesting removing a filter. **Add:** when filters are active
and the query is empty, the empty state should offer a "Clear filters" button —
the most likely fix, one tap.

**10. Loading.** None — the corpus is bundled and local. Search is instant and
offline. That is a feature; do not add a debounce that implies latency.

**11. Error.** None possible.

**12. Responsive.** Chip row scrolls horizontally with edge-bleed (`margin:0 -16px`
+ matching padding) so it reads as continuing off-screen.

**13. Accessibility.** `type="search"` gives the native clear affordance on iOS on
top of the custom one — acceptable. Result count must be announced: add
`aria-live="polite"` on a visually-present count line ("12 places"). Chips need
`aria-pressed`. The autofocus raises the keyboard immediately, which is right for
an explicitly-entered search screen but means the results are half-covered —
ensure the first result is visible above the keyboard on a 640px-tall device.

**14. Why.** The brief asks for recent searches, voice search, AI and location
suggestions. All four are deliberately out: with ~30 bundled destinations, four
filters and instant local matching **outperform** every one of them, and voice
search on a rural connection with a Haryanvi-accented Hindi query is a promise the
app can't keep. Revisit if the corpus passes ~200 places.

---

### 2.7 Place details — `/place/:id`

**1. UX reasoning.** This is the storytelling screen and the app's reason to
exist — the difference between a directory and a heritage companion is entirely
here. The user's goal is split: *is this worth my time* (answered by the hero,
the significance and the tags) and *how do I fit it in* (answered by the facts
table and the two docked buttons).

**2. Layout hierarchy.**
1. Hero photo, full-bleed, gradient, floating back + save, photo credit.
2. Title block: theme tags → name → name in the other script → meta row
   (open/shut · duration · distance · "in your plan").
3. Best-time card (brass).
4. "Why this matters" — the significance prose.
5. "Within the complex" — numbered sub-sites.
6. "Worth knowing" — notices.
7. "Planning" — the facts table (hours / closed / entry / how long / best time /
   parking / access).
8. Facilities tags.
9. Reels rail (context video, filmed here).
10. Nearby rail.
11. Docked bar: Navigate + Add to plan.

**3. Components.** `.hero` / `.grad` / `.fbtn` / `.credit`, `.dtitle` / `.tag` /
`.alt` / `.dmeta`, `.card`, `.blk` + `.prose`, `.inside` / `.ins`, `.ncards` /
`.ncard`, `.facts` / `.frow`, `.rail` / `.fcard`, `.dockbar`.

**4. Spacing.** Hero is edge-to-edge (negative page margin). 10px tag row→name,
4px name→alt-script, 12px→meta. 32px between `.blk` sections. Facts rows 12px
apart with a hairline between. Dockbar sticky at `88px + safe-area` from the
bottom so it floats above the tab bar rather than under it.

**5. Colour.** Hero gradient: transparent → Ancient Maroon at 78%, so white text
on the photo always clears 4.5:1 regardless of the image. Floating buttons: 92%
cream circles with a soft shadow — never a bare icon on a photograph. Best-time
card carries the brass/Temple Gold accent (decorative, correct role). `.tag.brass`
for "in your plan". **Two buttons in the dock is a deliberate exception to
one-dominant-CTA:** "Add to plan" is saffron (primary), "Navigate" is
indigo/`--nav` (the reserved navigation colour). They are different colours doing
different jobs, so they don't compete — this is precisely why the brief reserves
indigo.

**6. Interaction.** Save toggles heart fill instantly (optimistic, local). Add to
plan flips to a check + "In your plan" and does **not** navigate — the visitor is
reading, not leaving. Navigate hands off to the OS maps app. Nearby cards
navigate laterally to sibling places.

**7. Motion.** Hero photo fades in. Heart: 140ms scale pulse on fill. Section
reveals are **not** animated — this is a reading screen and scroll-triggered
animation on prose is hostile.

**8. Edge cases.** `d.pending` (coordinates not yet verified) replaces the entire
dock with an explanatory note — the app refuses to navigate someone to a pin it
doesn't trust. That is the single best decision in this screen; keep it. Missing
`why` / `inside` / `notice` / `facilities` → the whole `.blk` is omitted, never an
empty heading. No photo → themed plate. Unknown `:id` → `.empty`.

**9. Empty state.** Unknown id → `.empty` with "We couldn't find a matching
place." Should also offer a button back to Explore; currently it dead-ends.

**10. Loading.** Content is bundled — instant. Only the hero photo and the reels
thumbnails are async; both have reserved boxes.

**11. Error.** Reels rail fails silently (omits itself). Navigation handoff
failure (no maps app) → toast with the coordinates as copyable text.

**12. Responsive.** Hero 16:9 with `max-height:42vh` so a tall photo doesn't push
the title below the fold on a short device. Facts table stays two-column
(`.frow` key/value) down to 320px; below that it stacks.

**13. Accessibility.** Hero photo `alt` is the place name (`Photo.tsx`) — correct,
it's informative here and decorative (`alt=""`) in the rails. The floating
back/save buttons sit over a photo: they need the cream plate for contrast, not
just a drop shadow. Bilingual: the alternate-script name carries `lang` of the
*other* language so a screen reader switches voice. The facts table should be a
real `<dl>`, not divs, so it's navigable as a list.

**14. Why.** "Why this matters" leads the content and the practical facts come
seventh, because a directory answers "when is it open" first and a heritage
companion answers "why should you care" first. The practical answer is still one
scroll away for the visitor who only wants that.

---

### 2.8 Planner — shared chrome (all four steps) — `/plan`

**1. UX reasoning.** A four-step form is the app's highest-risk surface: every
step is a chance to abandon. Three decisions carry it — a **named** step
("Where from", not "Step 2 of 4" alone), the bottom bar owning the screen so
Back/Continue never move, and **naming what's missing** instead of greying out
Continue.

**2. Layout hierarchy.** Back + "Plan my visit" → stepper (name + "Step n of 4" +
4-segment progress) → step body → 108px spacer → fixed `.planbar` (missing-reason
line + Back + Continue).

**3. Components.** `.phead`, `.stepper` / `.stepper-lb` / `.steps`, `.planbar` /
`.planbar-why` / `.planbar-row`, `.btn.ghost` + `.btn.primary`.

**4. Spacing.** 20px page padding. 20px below the stepper. 22px between questions
within a step. `.planbar` 12px padding + safe-area inset.

**5. Colour.** Progress segments fill saffron left-to-right (explicit brief role:
"Progress"). Continue is saffron; Back is a white ghost with a brass hairline.
The `waiting` state on Continue is a *reduced* saffron, not grey — the button is
never disabled, only unfinished.

**6. Interaction.** The **bottom tab bar is hidden on `/plan`** (`Shell.tsx:76`) —
a half-answered form is not a place to be tempted sideways. Back from step 1 goes
Home, so the visitor is never trapped. Continue validates; if invalid it doesn't
advance and the reason appears in the bar, at the exact place the finger already
is. On the last step Continue becomes "Plan my journey".

**7. Motion.** Step transitions use `rise` (5px + fade, 190ms). Progress segments
transition their fill over 190ms. No horizontal slide — a slide implies a
swipeable carousel the form isn't.

**8. Edge cases.** Draft persistence: every mutation ends in `bump()`, and
`persist.ts` hooks `bump` once at boot (`state.ts:83`) — so a killed browser
resumes the half-finished plan. `p.step` is clamped to the last step
(`Planner.tsx:436`) so a stale persisted step can't crash. The custom-length
`<details>` writes `p.mins` on every keystroke including invalid ones — clamp on
blur.

**9. Empty state.** N/A — the form is always populated by `newPlan()`.

**10. Loading.** Only the last action loads (route build). It must show progress:
after 400ms, Continue becomes a spinner + "Building your journey…". Currently the
build is synchronous and can block the main thread on a multi-day plan.

**11. Error state.** Build failure → stay on step 4, toast the reason, never a
blank `/route`.

**12. Responsive.** `.planbar` is `max-width:480px`, centred, matching the shell.
Under 420px viewport height the missing-reason line collapses into a tooltip on
the Continue press.

**13. Accessibility.** `.steps` carries `role="progressbar"` with
`aria-valuenow/min/max` — good. The step name change must be announced: wrap
`.stepper-lb` in `aria-live="polite"`. The missing-reason line needs
`role="status"` so it is read when it appears, not only when focus reaches it.

**14. Why.** Naming the four steps instead of showing four anonymous dashes: dashes
tell a visitor neither where they are nor how much is left, which are the two
things a form must answer to be bearable.

---

### 2.9 Planner Step 1 — When — `/plan`

**1. UX reasoning.** Two questions, in dependency order: *which day* (determines
opening hours and Monday closures) then *how long*. The day is first because it
constrains the answer to the second.

**2. Layout hierarchy.** "When are you going?" → explanatory line → day row →
time row → "How much time?" → duration chip grid → multi-day note → custom-length
disclosure.

**3. Components.** `.q` / `.qs`, `.when.pickrow` ×2 (icon + value + sub + chevron),
`.qsplit` rule, `.tgrid` + `.chip.warm` (five presets + Custom), `.lenwrap` /
`.lenstep` (−/+ stepper), `.note`.

**4. Spacing.** 20px below `.qs`. Pick rows 9px apart, each ≥54px. `.qsplit`
24/20 between the two questions. Chip grid is a fixed 3 columns with an 8px
gutter, so six chips are always two tidy rows rather than reflowing 4+2 as the
screen widens.

**5. Colour.** Selected duration chip fills saffron. Pick rows are white plates
with brass hairlines; their icon squares carry a saffron wash when a non-default
value is set.

**6. Interaction.** Each pick row opens a real picker in a sheet — a month
calendar, a clock dial — rather than a native control, because the calendar has to
express a *range* (arrive → depart) that a native date input can't. The row always
shows its current value, so the step reads at a glance without opening anything.

The lengths are **five presets and Custom**, not nine chips. Nine was a third of
the step spent on near-synonyms — "4h" and "Half day" are twenty minutes apart —
and it pushed the answer below the fold. Custom is a sixth chip in the same grid
that expands a −/+ stepper in place: half-hour increments, 30 min to 12 h, the
value large in the middle between two 60px buttons. It replaced a number field
behind a disclosure triangle, which cost two taps, raised a keyboard, and
accepted "0". A stay longer than a day is a date *range* on the calendar above,
which `setDay` keeps in step with `mins` — so the two controls can never
disagree, and "2 days" never has to stand in for dates it doesn't name.

Home's length pills render from the same `WINDOWS` list for the same reason:
when they were separate arrays Home could hand the planner a "2 days" the step
had no chip for, and it opened showing "Custom · 16h".

**7. Motion.** Sheet expand, 260ms. Per §1.3.

**8. Edge cases.** Today + "now" is the default and the sub-line says "Starting
now" rather than a clock time. A multi-day plan must show both ends of the range
in the row — "3 days" alone forces the visitor to do date arithmetic. Custom
length accepts 1–24h, clamped.

**9–11.** Per §1.5. No network.

**12. Responsive.** Verified in Chromium at 320 / 390 / 430 / 768 and in WebKit
on iPhone SE, 13 and 15 Pro Max plus desktop Safari. Three chip columns at every
width; below 360px the page gutter drops to 14px, the stepper buttons to 52px,
and Home's pill row goes 5-up → 3-up. The action bar measures flush to the
viewport bottom on all eight, before and after scrolling to the end.

**13. Accessibility.** Each pick row is one button with an accessible name
combining value + label ("Friday 1 August, day of visit"). Length chips carry
`aria-pressed`. The stepper's value is a `role="status" aria-live="polite"`
region, so −/+ announce the new length rather than leaving a screen-reader user
to guess; the buttons are labelled "Half an hour more/less" and disable at the
bounds. The step name is in an `aria-live` region and the missing-reason line is
`role="status"`.

**14. Why.** Day before duration, because opening hours are a function of the day
and a plan built for the wrong day is worse than no plan.

**15. The bar does not scroll.** `.planbar` is `position:fixed`, and it now
actually behaves that way — see §4.

---

### 2.10 Planner Steps 2 & 3 — Where from / Where to — `/plan`

**1. UX reasoning.** One question asked twice, so it is literally one component
with two option lists (`WhereStep`). The start and end are separate steps rather
than one screen because the return leg costs real time in the itinerary, and
folding it into an afterthought produces plans that strand people.

**2. Layout hierarchy.** Question → supporting line → *(step 3 only: "You start
at X" note)* → five options, each of which **expands its own picker directly
beneath itself** → picked-location summary line.

**3. Components.** `.opts` / `.optwrap` / `.opt` (+ `.oi` icon, `.chk`
checkmark), `.subpick`, `PlacePicker` (search + curated list + OSM results +
`.srcnote` attribution), `PinMap` (Leaflet, tap to place), `PickedLine`.

**4. Spacing.** 9px between options, 14px option padding, 10px before a nested
picker, `.subpick` indented to align with the option's text column.

**5. Colour.** Selected option: saffron border + saffron wash + filled saffron
checkmark. The nested map uses indigo/`--nav` for the pin and any route line —
the reserved role, correctly separated from the saffron selection. `.srcnote` is
brass, uppercase, small: this marks crowd-sourced OSM results as *not* verified by
the board.

**6. Interaction.** Choosing an option reveals its picker in place. "My location"
shows a 200px map of where we think you are with "Tap the map if it's off" —
it never asserts a fix it doesn't have. Hotel/station/bus open a searchable list:
curated entries (offline, hand-checked) answer first, OSM results follow under an
attribution line, deduplicated by name. "Somewhere else" is a 260px pin map.

**7. Motion.** The nested picker expands (height + fade, 190ms). The map must not
animate its initial fit.

**8. Edge cases.** OSM is rate-limited and community-run: requests are debounced
550ms, aborted on every keystroke, and a failure falls back silently to the
curated list (never an error over a list that already works). `CONFIG.places.useOSM`
can switch the whole live-search path off. Geolocation denied → the option still
works, using the town centre, and says so. Step 3 mirrors step 1's start until
the visitor touches it (`endManual`).

**9. Empty state.** Search with no curated and no OSM match → "No stay by that
name. Drop a pin instead" + the pin map inline. Never a bare "No results".

**10. Loading.** OSM search shows an inline three-row skeleton under the curated
results, so curated answers stay usable while the network is pending.

**11. Error state.** OSM failure → curated list only, plus one quiet line: "Only
our checked list is available right now." Not a dialog.

**12. Responsive.** Maps are fixed-height (200 / 260px), which is correct — a
`vh`-based map jumps when the mobile URL bar collapses.

**13. Accessibility.** A Leaflet tap-map is not keyboard- or screen-reader-
operable. **Required:** every pin map must be paired with a text alternative —
the `PickedLine` summary must be a live region reading the resolved label, and
"Use town centre" must be reachable as a button. Options need `role="radio"` in a
`radiogroup` (they are exclusive), not bare buttons.

**14. Why.** The picker was moved from below all five options to directly beneath
the chosen one: previously you tapped the third row and the answer to your tap
appeared off-screen under the fifth, forcing you to re-find your place in a list
you had just answered.

---

### 2.11 Planner Step 4 — What & how — `/plan`

**1. UX reasoning.** Four separate questions (interests, transport, pace,
company) that all shape the route. They are one step because none of them
individually deserves a screen, and four more screens would double the abandon
surface. The risk is a wall of chips; the answer is one plate per question.

**2. Layout hierarchy.** Four `.qcard` plates (Interests / How you'll travel /
Pace / Who's coming) → "More options" disclosure with five checkboxes.

**3. Components.** `.qcard` (h3 + hint + `.wrap` of chips), `.chip` /
`.chip.on`, `.opt` checkboxes, `details.more`.

**4. Spacing.** 12px between plates, 20px plate padding, 8px chip gutter.

**5. Colour.** Selected chips fill saffron. Nine theme chips + six mode chips
means a fully-answered step is substantially orange — acceptable here because
every filled chip is a real answer, unlike Home's pills.

**6. Interaction.** Themes and modes are **multi-select** (bus to the area, then
walk); pace and company are single-select. Modes can never be empty — deselecting
the last one re-selects it. `p.mode` is kept as `modes[0]` for the engine.

**7. Motion.** Chip fill 140ms. Disclosure expands. Per §1.3.

**8. Edge cases.** "Any" as a theme is a chip like the others but semantically
clears the filter — it should visually deselect the rest when chosen (currently it
doesn't; fix). Walking-only with a 6-hour budget produces a small route; that's
correct, not an error.

**9–11.** Per §1.5. No network.

**12. Responsive.** Chips wrap freely; plates are full-width.

**13. Accessibility.** Multi-select chips need `aria-pressed`; single-select
groups need `role="radiogroup"` + `role="radio"`. The distinction between the two
is currently invisible to a screen reader and only weakly visible to a sighted
user — **add a "Pick any" / "Pick one" line to every `.qcard` hint**, not just
the modes card.

**14. Why.** This step was one unbroken wall of chips with only a label between
questions. Giving each question its own plate lets the eye find where one ends,
and makes a half-finished step obvious at a glance.

---

### 2.12 Route result — "Your journey is ready" — `/route`

**1. UX reasoning.** The payoff. The visitor's goal here is trust: *is this
plan any good, and will it actually work today?* So the screen answers in three
escalating levels of detail — the numbers (summary plate), the story (walkthrough
in sentences), the schedule (timeline) — and lets the visitor stop at whichever
level convinces them. The primary action is "Start the tour"; everything else is
secondary.

**2. Layout hierarchy.**
1. Back + "Your journey".
2. Summary plate (dark): eyebrow → title (duration · theme) → 2×2 metrics
   (stops / on the road / at places / distance) → "Done by 5:40pm" → day tabs
   (multi-day) → action row.
3. Route map.
4. "How the day goes" — the gist sentence + a numbered walkthrough.
5. Timeline: numbered stops with travel legs and meal/rest breaks in place.
6. "Also fits your time" — one-tap additions.
7. "Left out" — what was dropped, and why.
8. "Other ways to do this" — alternative itineraries.
9. Estimates disclaimer.

**3. Components.** `.summ` / `.eyebrow` / `.mgrid` / `.mcell` / `.fin` / `.acts`,
`RouteMap`, `.walk` / `.walk-gist` / `.walk-list`, `.tl` / `.tl-item` / `.tl-gut`
/ `.tl-dot` / `.tl-bar` / `.tl-card` / `.leg` / `.tl-rest`, `.rcard`, `.dropped`.

**4. Spacing.** Summary plate 18px padding, 16px to the metric grid. 22px
plate→map→walkthrough→timeline. Timeline gutter 26px wide, cards 11px padding,
4px between items so the connector bar reads continuous.

**5. Colour.** The summary plate is the app's one large dark surface: **Ancient
Maroon `#4A1F16`** (ledger #4) with cream type, Temple Gold eyebrow, and a green
"Done by" line — green because finishing on time is the one genuinely positive
status on the screen. Inside the plate, "Start the tour" is saffron and the four
secondary actions are translucent white — this is the correct read of "never
create visual competition between multiple buttons": five buttons, one filled.
Timeline dots are saffron (planned/active); rest-stop dots are brass-outlined.
The map line is indigo/`--nav`.

**6. Interaction.** Start → `/go` (live tour). On map → `/map` with the route
drawn. Save → IndexedDB + toast. Calendar → sheet that writes every stop to the
phone's calendar with a reminder before each. Share → native share sheet. Day tabs
swap `p.res` and scroll to top. "Also fits" cards insert a stop and rebuild.
Alternatives swap the whole itinerary.

**7. Motion.** Per §1.3. The timeline must **not** animate in on scroll — the
visitor is checking times, and motion under a finger tracing a schedule is
hostile. Day-tab switching re-runs `rise` on the timeline only.

**8. Edge cases.** No plan at all → empty state → "Plan my visit". Plan built but
zero stops fit → its own state (§2.12.9). Multi-day: totals come from
`multi.totals`, per-day from `res`. `wait > 2` on a stop appends "(opens at
9:00)" so an early arrival isn't mistaken for slack. Dropped stops always state a
reason — no time / closed that day / doesn't match your interests.

**9. Empty states.** Two, deliberately distinct:
- *No route yet* — route glyph, "You haven't planned a journey yet", CTA "Plan my
  visit".
- *Nothing fits* — clock glyph, "We couldn't fit anything into that time", body
  explaining why (too short / everything closed that day), CTA "Change my
  answers" back to `/plan` **with the answers intact**. This is the highest-value
  empty state in the app; it must never lose the form.

**10. Loading.** The build happens before navigation, so this screen either has an
itinerary or doesn't. If the build moves async, this screen owns the skeleton:
summary plate at final height with shimmering metric cells, so the layout doesn't
jump.

**11. Error state.** Map tile failure → the map area shows a cream plate with the
stop list as text and "Map unavailable offline". The itinerary itself never
depends on network.

**12. Responsive.** `.mgrid` 2×2 → 1×4 below 340px. `.acts` wraps; the primary
holds `flex:1;min-width:170px` so it always takes a full row of its own. The map
is fixed-height.

**13. Accessibility.** The timeline should be an ordered list (`<ol>`), so
"stop 3 of 7" is announced. Arrival/departure times use `.tnum` and must be read
as times, not digit strings — use `<time datetime>`. The four metric cells need
their label read with the number (currently the number and its caption are
separate elements). Colour-coded dots carry numbers inside them — good.

**14. Why.** "How the day goes" exists because a timeline is a *table* and a table
is not how a person decides whether to trust a plan. The prose version — "Start at
9, three temples before lunch, back by half five" — is what the visitor actually
evaluates. The table is for the person who has already said yes.

---

### 2.13 Journey — live tour — `/go`

**1. UX reasoning.** Completely different context from every other screen: the
visitor is standing outside, phone in one hand, possibly in sun, and needs
**exactly one** thing at a time. So the screen shows one stop, enormous, with one
dominant action. Every planning affordance is gone.

**2. Layout hierarchy.** Back + "Start the tour" → one large photo card with the
stop name overlaid and a meta row (arrive by / travel / distance / open-closed) →
full-width **Navigate** → four secondary actions (Arrived / Skip / Running late /
End tour) → "Stop 2 of 7".

**3. Components.** `.jcard` (16:11 photo + `.ov` overlay + `.jmeta`), `.btn.nav`
(58px), `.jsub` grid, `.jprog`.

**4. Spacing.** 12px card→Navigate. `.jsub` is a 2×2 grid, 9px gutter, each button
≥54px.

**5. Colour.** Photo card with a maroon-to-transparent overlay. **Navigate is the
dominant action and takes indigo/`--nav`** — this is the screen where the brief's
reserved role does the most work: the one button that hands you off to a map is
the one button in navigation blue, and it is unmistakable at arm's length in sun.
"Arrived" is saffron (it advances the app's own state). Skip / Late / End are
white ghosts.

**6. Interaction.** Navigate → OS maps. Arrived → sheet with what to see here,
how long, and "Next stop". Skip → **recomputes the remaining itinerary** from the
current position and time. Running late → recomputes from now + 20 minutes and
shows the revised schedule for confirmation before applying. End tour → back to
`/route`, which is still intact.

**7. Motion.** Advancing to the next stop: `rise` on the card, scroll to top. No
transition on the photo swap — a cross-fade between two photographs reads as a
loading failure.

**8. Edge cases.** Recalculation that drops stops says so ("We had to leave two
out"). Recalculation with nothing left shows the no-fit copy inside the sheet
rather than emptying the screen. `j.i >= stops.length` → the completion state.
The tab bar remains visible on `/go` and maps to the Plan tab — reconsider:
mid-tour, a bottom bar offering three other destinations is the same temptation
the planner deliberately removes.

**9. Empty state.** No journey → play glyph + "No journey in progress" + "Plan my
visit". Completion → check glyph, "That's the whole route", a warm closing line,
and one button Home. This is the app's last impression — it deserves the same
care as the splash. Consider offering "Save this journey" here.

**10. Loading.** Recalculation is synchronous and can take a beat on a long
itinerary — the sheet must open immediately with a skeleton rather than the tap
appearing to do nothing.

**11. Error state.** No maps app → toast with copyable coordinates. Offline: the
whole screen works offline except the photo; that must be cached by the service
worker at route-build time, not fetched at tour time.

**12. Responsive.** `.jcard` 16:11 with a `max-height:46vh` cap. The 2×2 secondary
grid stacks to 1×4 below 320px.

**13. Accessibility.** "Stop 2 of 7" must be an `aria-live="polite"` region so
advancing is announced. Navigate at 58px exceeds the minimum — correct for the
context; consider raising it further, this is the only button that matters
outdoors. Contrast on the photo overlay must be verified against the *lightest*
photo in the set, not a representative one.

**14. Why.** Skip and Running-late both *recompute* rather than just advancing an
index. That is the difference between an itinerary and a companion: a plan that
can't absorb a real morning is a plan the visitor abandons at the second stop.

---

### 2.14 Map — `/map`

**1. UX reasoning.** Two audiences: the browser exploring what's near what, and
the traveller checking their route in space. One screen serves both because the
route simply draws on top when one exists.

**2. Layout hierarchy.** Title + "My location" → theme filter chip row → map →
disclaimer note.

**3. Components.** `.phead`, `.mfilter` + `.chip`, `.mapwrap` + Leaflet, `.lmk`
(themed pin), `.lnum` (route sequence badge), `.lme` (you-are-here), `.note`, and
the tap sheet.

**4. Spacing.** Chip row 8px gutter with edge-bleed. Map fills the remaining
height above the tab bar reserve.

**5. Colour.** **This is indigo's home screen.** Route polyline, the you-are-here
dot and its halo, and the current-location button are all `--nav` indigo. Pins for
places *in your plan* are saffron (planned). Visited places take a Temple Gold
outline. Everything else is a cream pin with a brass hairline and a themed glyph.
Four states, four distinguishable treatments — and each pin carries a **glyph**,
so the states don't rest on colour.

**6. Interaction.** Tap a pin → sheet with photo, status, duration, distance,
description, best time, and two buttons (Navigate / Details). Theme filter
refilters **and re-fits** the viewport, so choosing "Sarovars" takes you to the
sarovars rather than leaving you at the same wide view. "My location" requests
permission and re-fits.

**7. Motion.** Map animations are explicitly **off** (`fadeAnimation`,
`zoomAnimation`, `markerZoomAnimation` all false, `animate:false` on fits). This
is correct for low-end Android and should not be "improved".

**8. Edge cases.** The full set spans ~12km because a handful of tirthas sit well
outside town; the fit uses only the ~4.5km core when there are more than two core
points, so the two dozen central pins don't collapse into one pile. Distant pins
are still drawn, a pan away. Leaflet needs `invalidateSize` after the container is
measured — handled with a 220ms re-fit.

**9. Empty state.** A theme filter with zero visible places → a cream card over
the map: "Nothing from this theme is mapped yet" + "Show all".

**10. Loading.** Tiles load progressively; the map container has a cream
background so a slow tile grid reads as paper, not as a broken black box.

**11. Error state.** **Tiles unavailable offline is the app's most likely visible
failure.** The map must detect tile-load failure and swap to a cream plate listing
the pins as a text list with distances, headed "Map needs a connection — here's
what's nearby". Do not leave a grey grid.

**12. Responsive.** Map height = viewport minus header, filter row, note and tab
bar. Fixed, not `vh`-based, so the mobile URL bar collapsing doesn't resize it.

**13. Accessibility.** A slippy map is not usable by screen reader or keyboard.
**Required, not optional:** a "List view" toggle in the header giving the same
places as an ordered, distance-sorted list of `Pcard`s. The theme chips need
`aria-pressed`. Marker `title` attributes are present but insufficient.

**14. Why.** The route polyline reads `--accent` off the root element at runtime
because Leaflet can't consume CSS variables. When indigo is split into `--accent`
(saffron) and `--nav` (indigo) per ledger #2, `MapView.tsx:19` and `RouteMap.tsx`
must be updated to read `--nav` — **this is the single edit most likely to be
missed in the repaint.**

---

### 2.15 Saved — `/saved`

**1. UX reasoning.** Two different things live here — saved *journeys* and saved
*places* — and they are not equivalent. A journey is a plan you intend to
execute; a place is a bookmark. Journeys come first and get the richer card.

**2. Layout hierarchy.** Title → "Your journeys" (plan rows) → "Places you saved"
(place cards).

**3. Components.** `.card` plan row (icon plate + title + count/date + remove,
`.savemeta` for day and start point, the numbered stop list, "Open this plan"),
`.plist` / `.pcard`, `.empty`.

**4. Spacing.** 13px plan-row padding, 11px between rows, 32px between the two
sections.

**5. Colour.** Saffron icon plate on the journey row (it leads to the app's
primary action). Places are standard cards. No other colour.

**6. Interaction.** "Open this plan" **rebuilds** the route from the saved
answers against today's opening hours rather than restoring a stale copy — so a
plan saved for Sunday and opened on Monday correctly drops the museum. Remove is
immediate with a toast; no confirm dialog.

**7. Motion.** `.stagger`. Removal should animate the row out (height + fade,
190ms) rather than snapping.

**8. Edge cases.** A saved plan referencing a destination that has since been
removed from content: `byId` returns null and it is filtered out
(`Saved.tsx:24`) — the plan still opens with fewer stops. Rebuilding may produce
a *different* route than when saved; that is correct behaviour but must be said —
add one line: "Rebuilt for today's opening hours."

**9. Empty state.** One combined empty (neither journeys nor places): saved glyph,
"Nothing saved yet", "Journeys you plan and places you like will appear here",
CTA "Plan my visit". If only one of the two is empty, that section is omitted
entirely rather than showing an empty heading — already correct.

**10. Loading.** IndexedDB is async: the screen returns `null` for one frame
(`Saved.tsx:90`). That is a blank flash. **Fix:** render the header and a
two-row skeleton instead.

**11. Error state.** IndexedDB unavailable (private mode / quota) → the plans
section is omitted and favourites (localStorage) still work. Add one quiet line:
"Saved journeys aren't available in private browsing."

**12. Responsive.** Per §1.6. The numbered stop list wraps.

**13. Accessibility.** Remove buttons currently use the *toast* string as their
`aria-label` ("Removed") — that describes the outcome, not the action. Change to
"Remove <plan title>". The stop list is a `·`-joined string; make it a real list.

**14. Why.** Rebuilding rather than restoring is the whole reason this screen is
worth having. A restored stale itinerary would confidently send someone to a
museum that is shut.

---

### 2.16 Settings — `/settings` — and Credits — `/credits`

**1. UX reasoning.** Two settings actually matter to this audience — **language**
and **text size** — and both must be reachable and operable by someone who is
struggling to read the screen they're on. Everything else is a link.

**2. Layout hierarchy.** Back + "Settings" → one card holding Language (chips)
and Text size (three A-samples) → Install app row (only when not already
installed) → Credits row → About prose.

**3. Components.** `.card` with a hairline divider, `.chip`, `.tsize`,
`.card.rcard` rows, `.blk` + `.prose`.

**4. Spacing.** 14px card padding, 11px between rows.

**5. Colour.** Selected language chip and selected text size fill saffron. Nothing
else is coloured — a settings screen with colour is a settings screen you can't
scan.

**6. Interaction.** Both settings apply **instantly and visibly** — changing text
size re-renders the whole app underneath the control, which is the correct
feedback and requires no confirm. The three size samples render their own `A` at
their actual size, so the control demonstrates rather than describes.

**7. Motion.** Text-size change reflows; do not animate it — an animated reflow of
an entire app is nauseating and this control is used most by people most likely to
be affected.

**8. Edge cases.** Already installed as a PWA → the install row is omitted, not
disabled. Install prompt unavailable (iOS) → the row must open instructions
rather than doing nothing.

**9. Empty state.** None.

**10. Loading.** None.

**11. Error state.** Install failure → toast.

**12. Responsive.** Per §1.6.

**13. Accessibility.** This is the app's accessibility control panel, so it must
be exemplary: language chips need `role="radio"` in a `radiogroup` labelled
"Language"; the size control likewise. The size samples' visible content is a bare
"A" — the accessible name must be "Normal" / "Large" / "Largest", which the
adjacent `<span>` supplies only if it's inside the button (it is — verify it isn't
`aria-hidden`).

**14. Why.** Text size lives here rather than in a system-settings deferral
because the audience is unlikely to know their phone has such a setting, and
because `--ts` defaulting to 1.08 already assumes they need more than the OS gives
them.

---

### 2.17 Bottom sheet — shared

Used for: date picker, time picker, map place tap, how-to walkthrough,
recalculation confirm, calendar export, arrival details.

**1. UX reasoning.** A sheet is for a decision that belongs to the screen behind
it. If the content would still make sense as its own screen, it should be one.
Every current use passes that test.

**2. Layout hierarchy.** Scrim → sheet: grab handle → title → optional supporting
line → content → primary action → optional ghost dismiss.

**3. Components.** `.scrim`, `.sheet`, `.grab`, `.display` title, `.ncard`,
`.btn.primary`.

**4. Spacing.** 6px/14px around the grab handle. 18px sheet padding + safe-area.
15px above the primary action.

**5. Colour.** Cream sheet on a 42% ink scrim. One saffron primary. Never two.

**6. Interaction.** Tap-out closes. **Missing and required:** swipe-down to
dismiss, and `Escape`. The grab handle currently promises a drag that isn't
implemented — either implement it or remove the handle, because an affordance
that does nothing teaches distrust of every other control.

**7. Motion.** `translateY(100%) → 0`, 260ms; scrim fades over the same. Reduced
motion → fade only, no translate.

**8. Edge cases.** Content taller than the viewport must scroll *inside* the
sheet with the handle pinned, and the primary action must stay reachable — the
date sheet with a full month grid is the case that breaks first. Sheet open when
the route changes → close it.

**9–11.** Per §1.5; states belong to the content, not the sheet.

**12. Responsive.** `max-width:480px`, centred, matching the shell. Landscape: cap
at 88vh with internal scroll.

**13. Accessibility.** `role="dialog" aria-modal="true"` is present but
insufficient without: focus moved into the sheet on open, focus **trapped** while
open, focus returned to the trigger on close, `aria-labelledby` pointing at the
title, and Escape. **All five are currently missing.** For a modal, this is the
highest-priority accessibility fix in the app.

**14. Why.** Sheets rather than full screens for the date and time pickers keeps
the planner step visible behind them — the visitor never loses their place in a
four-step form for a sub-decision.

---

### 2.18 App chrome — header, tab bar, toast

**Header.** Seal + wordmark (tap → Home) · language toggle · settings. Three
targets, not five: search and weather moved onto Home where they can be
full-width and labelled instead of two more small icons competing in a bar.
Sticky, 92% cream, backdrop blur, hairline bottom. Keep.

**Tab bar.** Four tabs — Home, Plan, Map, Saved. Browsing (`/explore`, `/theme/*`)
belongs to Home; `/route` and `/go` belong to Plan. On screens owned by no tab
(settings, search, place, credits) the indicator **slides out of sight** rather
than defaulting to Home — the bar never claims you are somewhere you are not.
Hidden entirely on `/plan`.

Per the brief this should be a **floating** bar: 72px tall, cream, soft shadow,
inset from the page edges with a full radius, and the active item marked by a
saffron circular plate behind a white icon. That last part is also the fix for
ledger #8 — the active tab currently differs by text colour alone, which fails
both the brief and the app's own "colour never carries meaning alone" rule.
`aria-current="page"` is already set, so the semantic layer is correct; only the
visual one is missing.

**Toast.** Bottom-anchored above the tab bar, cream plate, ink text, 3s, one line.
Never carries an action (an action needs a target that survives the timeout).
Needs `role="status"`.

---

## 3. What is still open

Items 1–8 of the original work order are done (§0.1b). Remaining, in order:

1. **Route-build progress** (§2.8.10) — the build is synchronous and can block
   the main thread on a multi-day plan. Needs a spinner after 400ms.
2. **Search re-staggers on every keystroke** (§2.6.7) — gate `.stagger` to first
   render or typing strobes.
3. **"Any" theme chip doesn't clear the others** (§2.11.8).
4. **Theme screen's CTA sits below the list** (§2.5.14) — hoist it under the title.
5. **Semantics**: timeline → `<ol>`, facts table → `<dl>`, `aria-pressed` on
   multi-select chips, `role="radiogroup"` on the exclusive ones, `aria-live` on
   the search result count and the journey's "stop n of N".
6. **Saved remove button's label** says "Removed" (the outcome) rather than
   "Remove <plan>" (§2.15.13).
7. **Tab bar stays visible during a live tour** (§2.13.8) — reconsider; the
   planner hides it for the same reason.

Verify every visual change in a real browser via Playwright at `localhost:5174`,
screenshotting Home, all four planner steps, the route result, the journey card,
Explore, and each of those again in Hindi. Chromium is already installed at
`~/Library/Caches/ms-playwright`; the `playwright` package itself is not a
project dependency — install it into a scratch dir rather than the repo.

Verify every visual change in a real browser via Playwright at `localhost:5174`,
screenshotting Home, all four planner steps, the route result, the journey card,
Explore, and each of those again in Hindi. Chromium is already installed at
`~/Library/Caches/ms-playwright`.

---

## 4. Two bugs that hid below the fold

Found while making the planner's action bar stay put. Both were live on every
screen, and both were invisible unless you scrolled — the worst way for a
layout bug to present.

**A transform on `<main>` broke every fixed and sticky child.**
`main.screen` carried `animation: pageIn ... both`, whose keyframes ended in
`transform: none`. Under `fill: both` the element keeps a computed transform
(the identity matrix) forever, and *any* transform makes that element the
containing block for `position: fixed` descendants. So the planner's action bar
resolved `bottom: 0` against a 900px-tall `<main>` instead of the viewport, and
sat below the last chip. Measured before the fix on iPhone 13: bar bottom at
925px in a 664px viewport.

Page-level motion is opacity-only now, and must stay that way. `.stagger` still
translates its children, which is safe — no chrome hangs off a list item. The
unused `.fwd` / `.rev` slide variants were deleted rather than left as a trap.

**`overflow-x: hidden` on `#app` broke `position: sticky`.**
An overflow other than `visible` makes that element the sticky *scrollport*.
`#app` never scrolls — the document does — so the place page's Directions /
Add-to-route dock never stuck to anything. It was rendering at the bottom of a
3000px article. It is `position: fixed` now, anchored above the tab bar, with a
`.dockbar-space` reserve so the last section is never trapped underneath. The
`overflow-x: hidden` stays; it is what contains the edge-bleed rails.

**The lesson for anything added later:** in this app, bottom chrome is
`position: fixed` with an explicit spacer. Sticky is not available while `#app`
hides horizontal overflow, and fixed is only trustworthy while nothing above it
transforms.

---

## 5. The place graph and the drive guide

Added after the palette work. Full design discussion is in the conversation;
this is the record of what shipped.

### 5.1 Why a themed day used to ignore its own doorstep

Three causes, all now fixed:

- **`engine.ts:45` made the theme a hard gate on the candidate pool.** Ask for
  Mahabharat and the Krishna Museum never entered `greedy()` — not outranked,
  absent. It is a score weight now: off-theme places score `raw × 0.35 − 18`,
  which keeps them behind every theme match at equal cost but lets them win on
  cheapness.
- **Every stop paid a fresh parking buffer** (`used += … + ctx.parking`), so two
  tirthas sharing one car park were charged twelve minutes of parking and two
  car legs.
- **Neighbours were priced in the itinerary's mode** — a 350m walk became a
  2-minute drive plus another park.

### 5.2 Walk pockets

`apps/web/src/content/data/edges.json`, generated by `npm run build-graph` from the
coordinates already in the repo, then corrected by hand. Two relationships:

- `same-complex` (≤150m) — one gate, one car park. Forms clusters.
- `walkable` (≤500m) — leave the car and walk.

`greedy()` opens a pocket after each driving stop and offers everything joined
to it at its real cost: walking minutes, no second parking buffer. `simulate()`
agrees, keeps the car at the anchor, and charges the walk back.

**Two rules that are load-bearing:**

*Walkability is not transitive.* Eligibility is an edge to the **anchor**, not
to wherever your feet currently are. Without that test the pocket walks itself
across town one short hop at a time — the first working version produced
Sannihit → Nabha House → Panorama → … → Brahma Sarovar: eleven stops, two
kilometres on foot, every hop individually short and the whole thing absurd. The
browser screenshot looked entirely plausible; `check-graph` caught it.

*A pocket has a walking budget.* `POCKET_MAX = 20` minutes there and back. The
audience is in their sixties and seventies, outdoors, in Haryana heat.

Both thresholds and `POCKET_MAX` are calibration knobs. Tune them by watching
someone walk it, not by reasoning about the numbers.

### 5.3 The drive guide

`features/journey/corridor.ts` projects every non-itinerary place onto the
route's drawn polyline → `(along, offset, side)`, keeps those within 400m, and
sorts by distance along the drive. `guide.ts` holds the trigger rules; the
`DriveGuide` component watches position and announces.

Side is a cross product of the road's direction with the vector to the place —
computed, not guessed, and it correctly swaps when the same road is driven the
other way. That is the one thing here no screenshot can verify, so
`check-corridor` asserts it.

Rules that keep it a companion rather than a nag: each place once per journey,
45s minimum gap, never below 8 km/h (you are *at* somewhere, not passing it),
never a place the day is already taking you to, and 220m of lead so "on your
left" is still true when you look.

**Constraints that are real and were designed around, not discovered:**
- Audio must be unlocked inside a user gesture, so `startGo()` primes
  `speechSynthesis` on the tap that starts the tour.
- iOS suspends `watchPosition` when the screen locks. This is a screen-on
  feature; it takes a wake lock where one exists and says "keep the screen on"
  where one doesn't.
- Hindi TTS mangles Sanskrit-derived proper nouns. The spoken line is therefore
  only the side and the name; the description stays on the card, where it is
  read rather than pronounced.

### 5.4 Still open

- **`say: {en, hi}` per place** — a one-clause spoken form. Currently the guide
  speaks the name only, which is safe but plain. `short` is written to be read,
  not heard.
- **Pre-recorded audio** to replace TTS. ~36 places × 2 languages.
- **No edge is `verified: true` yet.** Every one is derived from coordinates. A
  pin on the far bank of a sarovar is 40m away and a 900m walk round it — only
  a person can catch that. The `_check` links in the file open a walking
  direction for each pair.
- `places-index.json` still has 6 entries; the OSM live search stays until it
  is filled (see the discussion on `CONFIG.places.useOSM`).

---

## 6. Route result and plan persistence

### 6.1 Days are now the first thing on the screen

A multi-day plan said "3 DAYS" in an eyebrow and hid the switcher among the
actions inside the dark summary plate, where most people never found it — so a
three-day yatra read as one day with a confusing total. `.daytabs` is a
segmented control above the summary: Day 1 / Day 2 / Day 3, each with its own
stop count, saffron fill on the live one. The same control appears on the map.

### 6.2 The walkthrough folds

"How the day goes" was sixteen paragraphs above the timeline. The one-line
gist stays open — that is the sentence a visitor reads to decide whether the
day is the shape they wanted — and the step-by-step account is behind
`.walkfold`, labelled with its own length ("Read it step by step · 16"). The
timeline is now reachable without scrolling past an essay.

### 6.3 A built plan is kept without being asked

`buildRoute()` calls `savePlan()` immediately. Answering four steps is the
expensive part of this app, and losing it to a closed tab — or to tapping Plan
again and being handed a blank form — is the one failure a visitor cannot
undo. `Plan.savedId` makes a rebuild update the record instead of leaving a
trail of near-identical copies in Saved. The Save button still exists; it now
confirms something that has already happened.

Tapping **Plan** with a built plan shows `ExistingPlan`: the plan whole, with
"Open my plan" and a secondary "Plan a different visit" that keeps the old one.

**And the tab bar had to come back.** `Shell` hid it on `/plan` unconditionally,
which was right for the wizard — a half-answered form is not a place to be
tempted sideways out of — but wrong for this screen, which is a destination
like any other. Hiding it there stranded the visitor with no route to the map
or to Saved. The condition is now `r === "/plan" && !S.plan?.res`.

### 6.4 The map opens on the plan

It drew the route already but framed the whole district, so the visitor had to
find their own route inside a scatter of pins. It now fits to the current day's
stops when a plan exists, carries a "Your plan · day 1 of 3" line, and repeats
the day tabs so the day can be changed without going back to the route screen.

### 6.5 "Leave the car" — only if there is a car

The walk-pocket wording was hard-coded. Choose the bus and the plan read "Take
the bus 8 min to Rantuk Yaksh" followed by "Leave the car and walk 7 min",
which is the kind of detail that makes a visitor stop trusting everything else
on the page.

`features/route/mode-words.ts` is now a pure module — no storage, no DOM — so
`check-graph` asserts it: a bus passenger is never told to leave a car, someone
on foot is never told to leave anything. This was extracted specifically
*because* it could not be verified from a screenshot; the browser test looked
fine while the sentence was wrong.

---

## 7. The open list, worked through

Items 1–7 of §3 are done.

**Route build now answers the tap.** The engine is synchronous and a multi-day
plan is real work — long enough that Continue looked ignored. The button paints
`aria-busy` + "Building your journey…" first and defers the build to the next
tick, so the response is immediate whatever the plan costs. Verified by reading
the button inside the same frame as the click.

**Search no longer staggers on every keystroke.** `.stagger` is an entrance
animation; these results are a live filter. It also announces its count
(`role="status"`), its chips carry `aria-pressed`, and the empty state offers
"Clear filters" when a filter is what emptied it — the likely fix, one tap,
instead of making someone work out which chip did it.

**The Theme screen's CTA moved above the list.** Someone who opened a theme has
already decided they are interested; making them scroll past twelve cards to
act on it is the wrong order, and on a long theme the button was never seen.

**The live tour hides the tab bar**, for the same reason the wizard does:
someone standing outside a tirtha is mid-task, and a bar offering three other
destinations is exactly the temptation the planner removes. Its own Back and
"End tour" both reach the route.

**The map header has room.** Title on its own line, actions on their own row —
three things competing on one 390px row left the heading squeezed beside two
buttons that read as more important than the screen.

**Semantics, without a visual change.** The timeline is a real `<ol>` (a screen
reader now says "3 of 11" per stop), the place facts a real `<dl>`, the four
summary cells are labelled groups, Saved's remove button names the plan instead
of announcing "Removed", and every chip carries `aria-pressed` — except pace
and company, which are `radiogroup`/`radio` because they are one-of.

That last distinction is now visible to everyone, not just screen readers:
every question card is prefixed **"Pick one"** or **"Pick any"**. The hints that
used to say the same thing in other words were deleted rather than left to read
"Pick any · Choose any that apply."

### 7.1 One correction to this document

§2.11.8 claimed the "Any" theme chip does not clear the others. It does —
`flipTheme()` in `plan.ts` has always handled both directions. The note was
wrong; nothing needed fixing.

### 7.2 Still open

Everything remaining is blocked on a decision or on content, not on code:

- `say: {en, hi}` per place, and whether the guide's voice is TTS or recorded.
- Who authors those lines, and Board sign-off on the wording.
- `places-index.json` still has 6 entries — the OSM live search stays until it
  is filled. This is the critical path for planner step 2.
- No edge in `edges.json` is `verified: true` yet; all 84 are derived from
  coordinates.
