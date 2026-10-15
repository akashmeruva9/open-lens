# Video factory

Turns a story's reviewed ledger into narrated, news-style videos in any JAPAC language, in two shapes:
**9:16** (Reels / Shorts / WhatsApp) and **16:9** (YouTube), with captions and an AI-presenter disclosure on every frame.

It works for **any story and any of the 13 languages** in `packages/config/src/japac.ts`. Nothing is specific to the sample story.

```
story ledger (claims + sources)
   │  Gemini: spoken-style script → localise per language → back-translation check
   │  Gemini TTS: one fixed voice per presenter (cached)
   │  Layout: anchor + split-screen scenes, headline bar, source box, highlighted numbers
   │  Presenter: looping Veo idle clip composited under the text (falls back to a still portrait)
   ▼  FFmpeg
video-916.mp4 · video-169.mp4 · captions.vtt · narration.m4a   (per language)
```

Only Google services are used: Gemini / Gemini TTS / Nano Banana / Veo on Vertex AI (Application Default Credentials, no API key).

## Quick start

Requirements: Node ≥ 20, FFmpeg on PATH, `gcloud`, a Google Cloud project with billing enabled.

```bash
npm install
npm run build -w @openlens/schemas -w @openlens/config -w @openlens/client -w @openlens/agents -w @openlens/media-worker
cp .env.example .env     # set GOOGLE_CLOUD_PROJECT; leave GEMINI_API_KEY empty to use Vertex AI via ADC
```

### Google Cloud setup (one time)
```bash
gcloud config configurations create openlens          # optional: keep this project's login separate
gcloud auth login
gcloud config set project <your-project-id>
gcloud auth application-default login                 # this is what the code uses
gcloud services enable aiplatform.googleapis.com
```
Use a personal/team account that owns the project. Do **not** create an AI Studio API key on a billing-linked project; keep `GEMINI_API_KEY` empty so everything goes through Vertex AI and your billing account.

### Make videos from links, in one command
```bash
# links in -> claims/evidence -> scripts per language -> narrated 9:16 + 16:9 videos -> hand-off manifest
npm run story -w @openlens/api -- jp-fare-2026 JP "Tokyo Metro fare revision" <url1> <url2> <primary-doc-url> [--langs ja,en,ko]
```
Sources must be outlets listed in `data/sources/allowlist.json` (rights + documented lens rating); anything else is rejected with the reason and nothing is written. Add `--intake-only` to check the sources first (no AI calls). The story ID is the first argument you choose; list stored stories with `npm run render -w @openlens/api -- --list`.
It writes `.data/assets/<storyId>/` (videos, captions, `manifest.json`). Add languages or re-render later with `npm run render` (below).

### Or step by step
```bash
# 1. Build a story (claims → scripts → channel packages → videos) from a source pack made with `npm run intake`.
npm run seed -w @openlens/api -- data/seed/<story-id>

# 2. Render (or re-render) videos for any stored story, any languages, any shapes
npm run render -w @openlens/api -- --list
npm run render -w @openlens/api -- <storyId> --langs en,hi --aspects 9:16,16:9
```
Outputs are written to `.data/assets/<storyId>/<tier>-<lang>/v<N>/` (`video-916.mp4`, `video-169.mp4`, `captions.vtt`, HLS for 9:16).
`render` only needs scripts to exist; asking for a language with no script tells you to run the scripts stage first:
`npm run seed -w @openlens/api -- data/seed/<story> --stages scripts,channels`.

Narration is **cached** by (model, voice, direction, text) in `.data/tts-cache`, so re-rendering after a layout change costs nothing.

## Hand-off to distribution

Finished videos are exposed as plain `RenderedAsset` records (`packages/schemas/src/outputs.ts`), so WhatsApp / Instagram / Facebook / X / YouTube publishers do not need to know how a video was made:

`storyId, ledgerVersion, lang, tier, aspect (9:16|16:9), mp4Url, hlsUrl?, captionsVttUrl?, thumbnailUrl?, durationSeconds, claimIds, title, presenter, aiDisclosure (always true), status, videoOutputId`

```bash
npm run handoff -w @openlens/api -- <storyId>      # prints the JSON and writes .data/assets/<storyId>/manifest.json
```
`npm run render` writes the same `manifest.json` when it finishes. Distributors should pick `9:16` for Reels/Shorts/WhatsApp and `16:9` for YouTube, keep the disclosure, and treat an asset whose `ledgerVersion` is older than the story's as stale (corrections mark dependent outputs `needs_review`). URLs are relative to the assets root (`/assets/...`); with `STORE=firestore` and `ASSETS_BUCKET` they are public bucket URLs.

## Presenters, voices and assets

| Thing | Where |
|---|---|
| Languages, presenters (fictional), voices, channel plan | `packages/config/src/japac.ts` (`LANGUAGES`, `PRESENTERS`, `CHANNEL_PLAN`) |
| Portraits | `data/presenters/<id>.png` (+ `.prompt.txt`) |
| Idle motion clips (silent, 8 s) | `data/presenters/<id>.idle.mp4` |
| Voice direction prompt (style, pacing, accent) | `services/media-worker/src/tts.ts` (`direction`) |
| Layouts | `services/media-worker/src/scenes.ts` (`anchor`, `split`) |
| Compositing | `services/media-worker/src/render.ts` |

If a stored script names a presenter id that no longer exists (e.g. after a rename), the renderer falls back to that language's `CHANNEL_PLAN` presenter.

### Add a language or presenter
1. Add the language to `LANGUAGES`, a presenter to `PRESENTERS` (pick a voice, see below) and the language to `CHANNEL_PLAN`.
2. Add a `UI_STRINGS` and disclosure entry if missing, and a font for its script in `services/media-worker/src/fonts.ts`.
3. Generate the portrait and idle clip (below), then `npm run render ...`.

### Choose a voice
```bash
npm run voicetest -w @openlens/media-worker     # 4 voices per demo language reading the same real script → .data/voicetest/
```
Listen, then set `voice` in `PRESENTERS`. The 3.1 TTS model follows the structured direction prompt (style, accent, pacing, emphasis); the old one-line prompt sounded robotic.

### Generate a portrait (Nano Banana) and idle clip (Veo 3.1 Lite)
```bash
npm run portraits -w @openlens/media-worker -- haruka-ja            # one image, ~US$0.04-0.07; skips existing files
npm run idle-clip -w @openlens/media-worker -- haruka-ja            # 8 s, 720p, silent; ~US$0.24; skips existing files
```
Add `--force` to regenerate. Faces are fully fictional and the disclosure line stays on every frame. Set `PRESENTER_VIDEO=0` to render with still portraits only.
Veo sometimes answers "high load"; the script retries up to three times.

### Preview the layout without spending anything
```bash
npm run preview -w @openlens/media-worker          # still frames, 4 languages × 2 shapes × 2 layouts → .data/preview/
npm run preview:video -w @openlens/media-worker -- en 16:9   # silent motion preview with the idle clip
```

## Configuration

See `.env.example`. The ones that matter here:

| Variable | Purpose |
|---|---|
| `GOOGLE_CLOUD_PROJECT` | Your project. Leave `GEMINI_API_KEY` empty to use Vertex AI via ADC. |
| `GOOGLE_CLOUD_LOCATION` | `global` for the text pipeline (`gemini-3.8-flash` is not available in `us-central1`). |
| `TTS_LOCATION` / `VEO_LOCATION` | `us-central1` (Gemini 3.1 TTS preview and Veo are there). |
| `MODEL_TTS`, `MODEL_IMAGE`, `MODEL_VIDEO` | Model overrides. Verify names against your project (see Troubleshooting). |
| `TTS_CACHE_DIR` | Narration cache (default `.data/tts-cache`). |
| `PRESENTER_VIDEO=0` | Use still portraits instead of idle clips. |
| `MEDIA_SILENT=1` | Skip TTS (silent track), for offline tests. |
| `INGEST_INTERVAL_MIN=0` | Keep the wire off locally so it does not spend credit in the background. |

## Cost (Vertex AI list prices; check the pricing page before relying on them)

| Step | Model | Approx. |
|---|---|---|
| Portrait | Nano Banana | US$0.04-0.07 per image |
| Idle clip | Veo 3.1 Lite, video only, 720p | US$0.03/s → ~US$0.24 per 8 s clip |
| Narration | Gemini TTS | a few rupees per video; cached afterwards |
| Scripts, claims, translation | Gemini 3.8 Flash | cents per story |

Portraits and idle clips are made **once per presenter** and reused for every story, so a new story costs only text and voice.

Running on a free-trial credit? Set per-service budgets with spend caps (Billing → Budgets & caps) and an alerts-only budget on the whole account. Never click "Upgrade" on a trial account if you must not be charged. Cloud Run GPU quota is 0 on trial projects.

## Troubleshooting

- **404 "Publisher model ... was not found"**: the model is not in that location. Text models: use `GOOGLE_CLOUD_LOCATION=global`. List what your project can use:
  `curl -s -H "Authorization: Bearer $(gcloud auth print-access-token)" -H "x-goog-user-project: <project>" "https://<region>-aiplatform.googleapis.com/v1beta1/publishers/google/models?pageSize=200&listAllVersions=true"` (use `aiplatform.googleapis.com` for `global`).
- **429 on image generation**: new-project quota; wait a minute and re-run (finished portraits are skipped).
- **Veo "high load"**: temporary; the script retries. A failed job is not billed.
- **Presenter id not found**: handled by the language fallback; re-run the scripts stage to refresh stored scripts.
- **Black bars at the top of the video**: Veo returns 3:4 content inside a 9:16 frame; the renderer crops it automatically.

## Known limits / roadmap

- Faces move (blinking, small head movement) but the **mouth is not lip-synced** to the narration. Real lip-sync needs a GPU model (e.g. MuseTalk on a Vertex AI L4) and is a possible next step. Cloud Run GPU quota is 0 on trial projects; Vertex AI L4 quota is separate.
- No music bed or Veo intro/outro yet.
- YouTube upload (OAuth Desktop client, synthetic-media flag) is the next piece.
- Scripts target ~60 s; Japanese and Telugu run a little longer.
