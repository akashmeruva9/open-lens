# @openlens/mobile

Native Android + iOS **reader** app for OpenLens (Expo SDK 57, React Native, Expo Router, TypeScript).
Reader only: the newsroom Studio stays web-only.

Video-first newsroom design (spec: `docs/design-system.md`; tokens in `src/theme/index.ts`).

Screens:
- **Home**: wordmark, edition switcher (JAPAC markets with native-language subtitles, persisted as
  `settings.region`), search, icon category row (Top · Politics · Economy · Climate & Disasters · Tech ·
  Health · Society · Sport · Wire), spotlight hero (4:5, muted preview only when in view, not low-data,
  not reduce-motion) + spotlight list, rails: Latest videos (9:16), Explainers (3:2), one rail per
  market (or per topic in a single edition), Corrected & updated. Empty rails are hidden.
- **Watch** (`/watch`): Shorts-style vertical pager over the tapped rail's videos: muted autoplay,
  tap to unmute, captions (script lines timed to playback) and transcript sheet, AI-presenter
  disclosure, "Open the research". Falls back to a poster when media can't load.
- **Story**: media/poster on top with language pills, title, dek, evidence chips, corrections banner,
  auto-published note, then How outlets framed it (lens pager), What we know, Open the research,
  Sources, More from {market}; sticky Watch / Research / Share bar.
- Research dossier · AI assessment · Watch & listen (language switcher, transcript, audio) ·
  Corrections inbox · Search · Settings (language, edition, topics, low-data, alerts, theme,
  WhatsApp digest opt-in).

Fixture mode loads `data/fixtures/feed.json` + `story-bundle.json` + `japac-feed.json` +
`japac-bundles.json` (9 fictional JAPAC stories).

## Run

```bash
# from the repo root
npm install
npm run build -w @openlens/schemas -w @openlens/client -w @openlens/config   # app imports their dist/

cd apps/mobile
npx expo start            # press a (Android) / i (iOS), or scan the QR code with Expo Go
```

Expo Go works for everything except push notifications (needs a development build).
Development build: `npx expo run:android` / `npx expo run:ios` locally, or
`npx eas-cli build --profile development` (profiles in `eas.json`: development, preview = APK, production).

Checks: `npm run typecheck`, `npm run export:android`, `npm run doctor`.

## Environment

| Var | Default | Meaning |
|---|---|---|
| `EXPO_PUBLIC_USE_FIXTURES` | `1` | `1` = offline demo data from `data/fixtures/*.json`; `0` = call the API |
| `EXPO_PUBLIC_API_URL` | `http://localhost:8080` | `services/api` origin; media paths (`/assets/...`) resolve against it. Use your LAN IP (or `10.0.2.2` on the Android emulator) when testing on a device |
| `EXPO_PUBLIC_WEB_URL` | `https://openlens.app` | Origin used for share links / universal links |

## Links

- Custom scheme: `openlens://story/{id}`
- Universal / app links: `https://openlens.app/story/{id}` (configured in `app.json`; needs
  `apple-app-site-association` and `assetlinks.json` hosted on openlens.app)
- Push payloads may carry `data.storyId` or `data.url` to open a story on tap.
