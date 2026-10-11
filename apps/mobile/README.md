# @openlens/mobile

Native Android + iOS **reader** app for OpenLens (Expo SDK 57, React Native, Expo Router, TypeScript).
Reader only: the newsroom Studio stays web-only.

Screens: Feed (vertical snap-scroll, language/region filters) → Story (lens pager) → Research dossier
(claims → highlighted source passage, timeline, context, sources) → AI assessment (cited sections) →
Watch & listen (expo-video, language switcher, transcript, AI disclosure) · Corrections inbox · Settings
(language, region, topics, low-data, alerts, WhatsApp digest opt-in).

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
