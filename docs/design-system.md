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
| `--ink-3` | `#8c8c8c` | `#8c8c8c` | metadata |
| `--line` | `#dedede` | `#2a2a2a` | dividers |
| `--accent` | `#2f5bff` | `#6b8bff` | OpenLens accent: links, active nav, "View all", focus ring base |
| `--accent-ink` | `#ffffff` | `#080808` | text on accent |
| `--live` | `#e5383b` | `#ff5a5d` | LIVE / breaking / corrected / developing |
| `--highlight` | `#eaff5c` | `#eaff5c` | sparing marker highlight behind key words in hero titles (optional) |

Keep the existing lens (`--lens-*`) and evidence (`--ev-*`) colours; they carry meaning.

Radii: `--r-sm: 4px` (chips on media), `--r-md: 6px` (thumbnails, cards), `--r-lg: 10px` (hero, sheets), `--r-pill: 999px` (chips, buttons).
Spacing unit 4px; page max width **1240px**, outer margin 20px (16px on phones), rail gutter 12px (phone) / 16px (desktop).

## 2. Type

- **Display:** Inter Tight 700 (web: `next/font/google`; mobile: system bold fallback acceptable). Sentence case, tight tracking (−0.01em to −0.02em), line-height 1.05–1.15.
  - Hero title 40/44 desktop, 30/34 phone · Rail title 24/28 · Card title 15/19 (clamp 4 lines on video cards, 3 on article cards).
- **Body:** Inter 400/500, 16/24; deks 15/22 `--ink-2`.
- **Labels:** 12/16, 600, sentence case (no all-caps blocks). Market/category eyebrow may use small caps-style weight 600 `--ink-3`.
- **Scripts:** fall back to system fonts for ja/ko/zh/th/hi/te/ta (Noto/Hiragino/Apple SD Gothic/PingFang/Thonburi). Never clip non-Latin text with fixed heights.

## 3. Core components

- **VideoCard (vertical)** — thumbnail 9:16 (`aspect-ratio: 9/16`), `--r-md`, subtle dark gradient at bottom; overlays: duration pill bottom-left (`0:48`), language pill top-left (`日本語`), tiny "AI presenter" tag top-right. Title below the thumbnail (display 15/19, 4-line clamp), then a metadata row: market · relative time · evidence dot-counts. Hover (web): image scale 1.03, title underline. Story without video → **PosterCard**: same frame, solid `--surface` with the headline set large inside, market eyebrow, and a "Read" glyph instead of play.
- **SpotlightHero** — left: large 2:3 (phone: full-width 4:5) media tile with muted autoplay preview when a video exists (respect reduced motion + low-data); right/below: eyebrow ("In the spotlight" / market), hero title, dek, evidence chips, CTA buttons "Watch" (filled ink) and "Open the research" (outline).
- **SpotlightList** — 3 compact rows next to the hero (desktop) / under it (phone): 4:5 thumb 96px + title + dek (2 lines).
- **Rail** — header: icon + title (24/28 display) + "View all →" (accent) on the right; body: horizontal scroll-snap row of VideoCards (desktop shows ~5.5 cards to signal scrolling; arrow buttons on hover; phone shows ~2.3). Keyboard reachable, `aria-roledescription="carousel"`.
- **ArticleSlider** — cards with 3:2 thumbnail, pill chip (topic/market) and 3-line title; used for "Explainers" (stories without video, or assessment-led).
- **EditionSwitcher** — pill dropdown in the header: "Asia-Pacific ▾" listing JAPAC markets (`MARKETS` from `@openlens/config`) with native-language subtitle; selection filters every rail and persists (cookie/localStorage on web, settings on mobile).
- **CategoryNav** — icon-over-label row (horizontal scroll on phone): Top, Politics, Economy, Climate & Disasters, Tech, Health, Society, Sport (topics) — plus a "Wire" item that lists everything newest-first.
- **Chips** — pill, 12/16 600: evidence chips keep `--ev-*`; `LIVE`/`Developing`/`Corrected` use `--live`; `Auto-published · not editor-reviewed` uses outline `--ink-3`.
- **Footer** — editions (markets), categories, About OpenLens ("How we verify", "AI disclosure policy", "Corrections"), social links placeholders, legal. No third-party brand names.

## 4. Page layouts

### Home
1. Header (sticky, white, 64px): wordmark · CategoryNav (desktop inline; phone below header) · EditionSwitcher · search icon · theme toggle.
2. **SpotlightHero + SpotlightList** (top story by recency × evidence × video availability).
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
