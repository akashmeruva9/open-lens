# OpenLens design system — "video-first newsroom"

Inspired by the *experience patterns* of video-first social news publishers (e.g. Brut): bold grotesk type on a white/near-black canvas, rails of tall vertical videos, a spotlight hero, an edition switcher and icon category navigation. **OpenLens keeps its own identity**: own wordmark, own accent colour, open-licence fonts, and no copied logos, names, illustrations or assets from any other publisher.

What OpenLens adds on top of the pattern — and must stay visible — is the evidence layer: evidence chips, lens swipe, research dossier, assessment, correction and AI-disclosure labels.

## 1. Tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#ffffff` | `#080808` | page canvas |
| `--surface` | `#f4f4f4` | `#141414` | cards behind text, inputs |
| `--surface-2` | `#e9e9e9` | `#1f1f1f` | hover, skeletons |
| `--ink` | `#0a0a0a` | `#f5f5f5` | headlines, body |
| `--ink-2` | `#3d3d3d` | `#c7c7c7` | deks, secondary |
| `--ink-3` | `#737373` | `#8c8c8c` | metadata (≥4.5:1 on white) |
| `--line` | `#dedede` | `#2a2a2a` | dividers |
| `--accent` | `#2f5bff` | `#6b8bff` | OpenLens accent: links, active nav, "View all", focus ring base |
| `--accent-ink` | `#ffffff` | `#080808` | text on accent |
| `--live` | `#e5383b` | `#ff5a5d` | LIVE / breaking / corrected / developing |
| `--highlight` | `#eaff5c` | `#eaff5c` | sparing marker highlight behind key words in hero titles (optional) |

Keep the existing lens (`--lens-*`) and evidence (`--ev-*`) colours; they carry meaning.

Radii: `--r-sm: 4px` (chips on media, label pills), `--r-md: 8px` (thumbnails, cards), `--r-lg: 12px` (featured band, sheets), `--r-pill: 999px` (chips, buttons).

Added for the editorial layout: `--pop` `#f5ff3d` / `--pop-ink` `#080808` (solid label pills such as "In the spotlight" and "Featured", and highlighted words in burned-in headlines), `--line-strong` (`#0a0a0a` light / `#3a3a3a` dark: outlined spotlight tiles, "View all" and pager buttons).
Spacing unit 4px; page max width **1240px**, outer margin 20px (16px on phones), rail gutter 12px (phone) / 16px (desktop).

## 2. Type

- **Display:** Inter Tight 700 (web: `next/font/google`; mobile: system bold fallback acceptable). Sentence case, tight tracking (−0.01em to −0.02em), line-height 1.05–1.15.
  - Featured title 52/54 desktop, 32/34 phone · Rail title 32/36 (26/30 phone) · Card title 15/19 semibold (3-line clamp).
  - **Burned-in headlines** (`.burn`): white display type over a scrim on media tiles; the two longest content words are set in `--pop` (`burnTitle()`).
- **Body:** Inter 400/500, 16/24; deks 15/22 `--ink-2`.
- **Labels:** 12/16, 600, sentence case (no all-caps blocks). Market/category eyebrow may use small caps-style weight 600 `--ink-3`.
- **Scripts:** fall back to system fonts for ja/ko/zh/th/hi/te/ta (Noto/Hiragino/Apple SD Gothic/PingFang/Thonburi). Never clip non-Latin text with fixed heights.

## 3. Core components

- **VideoCard (vertical)** — thumbnail 9:16 (`aspect-ratio: 9/16`), `--r-md`, subtle dark gradient at bottom; overlays: duration pill bottom-left (`0:48`), language pill top-left (`日本語`), tiny "AI presenter" tag top-right. Title below the thumbnail (display 15/19, 4-line clamp), then a metadata row: market · relative time · evidence dot-counts. Hover (web): image scale 1.03, title underline. Story without video → **PosterCard**: same frame, solid `--surface` with the headline set large inside, market eyebrow, and a "Read" glyph instead of play.
- **SpotlightGrid** — outlined tiles (1px `--line-strong`, 8px inner gutter): a lead tile spanning two rows with an "In the spotlight" pop pill straddling its top edge, two stacked tiles, and a tall tile with its dek. Each tile: landscape media with the headline burned in, then title, dek, and market · time · evidence dots.
- **FeaturedBand** — full-width dark panel (both themes) over a blurred still: vertical video with muted preview on the left (respect reduced motion + low-data); "Featured" pill, burned-in title, dek, disclosure labels (auto-published, checks flagged, evidence counts) and "Watch" / "Open the research" on the right.
- **Rail** — header: title (32/36 display) with a chevron link + round outlined "View all" button on the right; body: horizontal scroll-snap row of VideoCards with a thin visible scrollbar (desktop ~5.5 cards; arrow buttons on hover; phone ~2.3). Article rails use round prev/next buttons under the track instead. Keyboard reachable, `aria-roledescription="carousel"`.
- **ArticleSlider** — horizontal cards: 4:3 thumbnail left; accent "Explainer" pill, 4-line title and metadata right; used for "Explainers" (stories without video, or assessment-led).
- **EditionSwitcher** — row pinned to the foot of the desktop sidebar (opens upwards), pill in the phone top bar: "Asia-Pacific ▾" listing JAPAC markets (`MARKETS` from `@openlens/config`) with native-language subtitle; selection filters every rail and persists (cookie/localStorage on web, settings on mobile).
- **CategoryNav** — vertical icon + label list in the desktop sidebar (active item inverted ink), then Videos / Explainers / Corrections / Search; icon-over-label strip under the phone top bar: Top, Politics, Economy, Climate & Disasters, Tech, Health, Society, Sport (topics) — plus a "Wire" item that lists everything newest-first.
- **Chips** — pill, 12/16 600: evidence chips keep `--ev-*`; `LIVE`/`Developing`/`Corrected` use `--live`; `Auto-published · not editor-reviewed` uses outline `--ink-3`.
- **Footer** — editions (markets), categories, About OpenLens ("How we verify", "AI disclosure policy", "Corrections"), social links placeholders, legal. No third-party brand names.

## 4. Page layouts

### Home
1. Shell: desktop (≥1024px) has a sticky left sidebar (`--sidebar-w`, 232px): wordmark · CategoryNav · About links · EditionSwitcher + theme toggle at the foot. Phones/tablets get a sticky top bar (wordmark · EditionSwitcher · search · theme) with the category strip below.
2. **SpotlightGrid** (top four stories by recency × evidence × video availability), then the **FeaturedBand** (strongest video story not in the grid).
3. **Rail "Latest videos"** (all video outputs, newest first, in the reader's language if available).
4. **ArticleSlider "Explainers"**.
5. **One Rail per market** in the selected edition order (Asia-Pacific shows all markets with stories; a single edition shows its topics instead).
6. **Rail "Corrected & updated"** (stories with corrections) — OpenLens-specific trust rail.
7. Footer.
Empty states: if a rail has no items, hide it; if the whole feed is empty, show an editorial empty state explaining the wire.

### Story (video page pattern)
- Top: two columns on desktop — left: vertical player (9:16, max-height 80vh, rounded `--r-lg`, captions on, language switcher pills under it, AI-disclosure line); right: eyebrow (market · time), title, dek/neutral summary, evidence chips, share, "Corrected" banner if any.
- Below: OpenLens evidence layer as stacked sections with display headings: **"How outlets framed it"** (lens swipe — keep "model-generated framing, not a truth meter" note), **"What we know"** (assessment sections with claim chips), **"Open the research"** (dossier tabs), **"Sources"**.
- Bottom: Rail "More from {market}".
- Phone: player full-bleed at top (or poster), content below; sticky bottom bar with Watch / Research / Share.

### Studio
Restyle with the same tokens/fonts (white canvas, ink type, accent buttons). Keep layout and functionality; it is a desktop tool.

## 5. Motion & accessibility
- 150ms ease transitions; no autoplay with sound; autoplay previews only muted, only in view, disabled by `prefers-reduced-motion` and low-data mode.
- Contrast ≥ 4.5:1 for text over thumbnails (gradient scrim required).
- All rails operable by keyboard and screen reader; cards are single links with descriptive accessible names (title, market, duration, language).
