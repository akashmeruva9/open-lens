# OpenLens — the AI media house that shows its work

One story → one reviewed **Claim & Evidence Ledger** → our own web + mobile apps, narrated regional/national/international videos, and channel-ready posts for YouTube, X, Instagram, Facebook and WhatsApp. Built on Gemini + Google Cloud for AI Builder Cup 2026. Full spec: [`plan.md`](plan.md).

## Repo

| Path | What |
|---|---|
| `packages/schemas` | Zod contracts: sources, claims, evidence states, lanes, assessment, outputs, publications, corrections, evals |
| `packages/config` | Model registry, languages, presenters (fictional, disclosed), YouTube tiers, channel limits |
| `packages/client` | Typed REST client shared by web + mobile |
| `services/agents` | Gemini agent pipeline: claims → corroborate → lenses → research → synthesize → QA → scripts (+localize, back-translation) → channel packages |
| `services/media-worker` | The video factory: Gemini TTS narration → news-style scenes (anchor / split-screen, headline bar) → Veo idle-motion presenter → FFmpeg 9:16 / 16:9 + HLS + WebVTT. See [`docs/video-factory.md`](docs/video-factory.md) |
| `services/api` | Hono REST/SSE: reader feed, studio, approvals, correction propagation, publishing, evals |
| `services/publisher` | Channel adapters (YouTube, X, Instagram, Facebook, WhatsApp, FCM) with dry-run mode |
| `apps/web` | Next.js reader + newsroom studio (PWA) |
| `apps/mobile` | Expo Android + iOS reader |
| `infra` | GCP setup script, Cloud Build, Firestore rules |
| `data/sources`, `data/seed` | Verified source allowlist + feeds; hand-built source packs (`npm run intake`) |

## Run locally

Requirements: Node ≥ 20, FFmpeg on PATH.

```bash
npm install
npm run build -w @openlens/schemas -w @openlens/config -w @openlens/client -w @openlens/agents -w @openlens/media-worker
cp .env.example .env            # add GEMINI_API_KEY

npm run dev -w @openlens/api    # http://localhost:8080  (AUTH_MODE=dev locally; INGEST_INTERVAL_MIN=15 runs the wire)
npm run dev -w @openlens/web    # http://localhost:3000  (NEXT_PUBLIC_API_URL in apps/web/.env.local)
```
There is no sample data: every story comes from the wire (verified official sources) or from a source pack you build with `npm run intake` (below). The web and mobile apps only read the API.

**Deployed:** web https://openlens-web-42lefjl5bq-uc.a.run.app · api https://openlens-api-42lefjl5bq-uc.a.run.app (project `openlens-511713`, Gemini via Vertex AI). Point local apps at the cloud API by setting `NEXT_PUBLIC_API_URL` / `EXPO_PUBLIC_API_URL` to the api URL.

### Video factory
Links in, videos out, in one command (sources must be on the allowlist):
```bash
npm run story -w @openlens/api -- <story-id> <market> "<title>" <url> [url...] [--langs en,hi,te]
```
Render narrated videos for any stored story, any languages, both shapes (narration is cached, so re-renders are free):
```bash
npm run render -w @openlens/api -- --list
npm run render -w @openlens/api -- <storyId> --langs en,hi,te --aspects 9:16,16:9
```
Setup (Vertex AI via ADC, locations, voices, portraits, idle clips, costs, troubleshooting): [`docs/video-factory.md`](docs/video-factory.md).

Useful env (`.env.example` lists all): `GEMINI_CACHE_DIR` (cache model responses while iterating), `MEDIA_SILENT=1` (skip TTS), `RESEARCH_GROUNDING=0` (skip Search grounding), `MODEL_*` overrides.

### Adding a real story (any JAPAC market)
Add the outlets to `data/sources/allowlist.json` (rights + documented lens-rating basis), then:
```bash
npm run intake -w @openlens/agents -- jp-fare-2026 JP "Tokyo Metro fare revision" <url1> <url2> <primary-doc-url>
npm run seed -w @openlens/api -- data/seed/jp-fare-2026
```
Story languages default to the market's languages + English (`APAC` = all 13). See plan.md §1b.

### The wire (automatic discovery every 5–10 min)
The api can run discovery on a schedule: RSS/Atom feeds (`data/sources/feeds.json`) plus optional GDELT headline signals → dedupe → multilingual clustering → full text **only from verified allowlisted outlets** → create/update stories → pipeline (budgeted) → optional low-risk auto-publish.

1. Review `docs/sources-research.md` and the terms URL of each outlet in `data/sources/allowlist.json`; set `verified: true` only where reuse is confirmed.
2. Set in `.env`: `INGEST_INTERVAL_MIN=10` (and optionally `AUTO_PUBLISH=low_risk`, `INGEST_MARKETS=JP,KR,…`).
3. `npm run dev -w @openlens/api` — progress shows in Studio → "The wire" (or click **Run now**).

On Cloud Run, `infra/setup.sh` creates a Cloud Scheduler job hitting `POST /v1/internal/ingest` every 15 minutes (`WIRE_EVERY_MIN`). Budgets: `INGEST_MAX_NEW`, `INGEST_MAX_UPDATES`, `INGEST_DAILY_RUNS`, `INGEST_MAX_FETCH` (see `.env.example`).

### Adding a story by hand
Create `data/seed/<story>/sources.json` (array of `SourceRecord`, see `packages/schemas/src/ledger.ts`) using only permitted/public sources, set each outlet's `lens.rating` + `ratingBasis` from a documented rating table, and mark primary documents `sourceType: "primary"`. Optional `story.json` sets title/region/topics/languages.

## Tests
```bash
npm test          # all workspaces
npm run typecheck
```

## Deploy (Google Cloud)
```bash
PROJECT_ID=<id> ./infra/setup.sh       # enable APIs, Firestore, media bucket, service account
printf %s "$GEMINI_API_KEY" | gcloud secrets create gemini-api-key --data-file=-
gcloud builds submit --config infra/cloudbuild.yaml .
```
The api runs on Cloud Run with `STORE=firestore`, `ASSETS_BUCKET` (public media for Instagram/Facebook), and `AUTH_MODE=firebase` (studio editors need the `role: editor` custom claim or an address in `EDITOR_EMAILS`).

### Redeploying an existing project, and the optional image features
Run this in a terminal **from the repo root** (the folder that contains `infra/` and `services/`), logged in with `gcloud auth login` as someone who can deploy to the project. It is the same command as above, plus options:

```bash
gcloud builds submit --config infra/cloudbuild.yaml --project <your-project-id> \
  --substitutions=_TAG=$(git rev-parse --short HEAD),_PUBLIC_URL=https://<your-web-service-url>,_PHOTOS=2,_ILLUSTRATIONS=1,_MAPS=1 .
```

| Option | Default | What it does | Cost per video |
|---|---|---|---|
| `_PUBLIC_URL` | empty | Where the end-card QR code and link point (`<url>/story/<id>`). Empty = placeholder | none |
| `_PHOTOS` | 0 | Up to N credited file photos (Wikimedia Commons, licence- and Gemini-checked) of public figures, organisations or objects named in the script | about US$0.004 per photo checked |
| `_ILLUSTRATIONS` | 0 | Up to N realistic, people-free AI backdrops, labelled "AI image" on screen | about US$0.035 each + one Gemini call |
| `_MAPS` | 0 | A locator map (Natural Earth outline + pin) for the line that names a place | about US$0.004 |
| `_CPU`, `_MEMORY`, `_DAILY_RUNS`, `_MAX_NEW`, `_MAX_UPDATES`, `_CONCURRENCY`, `_AUTO_PUBLISH` | 4, 8Gi, 100, 5, 4, 5, all | Sizing and wire limits. Lower them on a test project to protect credit, e.g. `_CPU=2,_MEMORY=4Gi,_DAILY_RUNS=10,_MAX_NEW=1,_MAX_UPDATES=1,_CONCURRENCY=1` | |

Existing videos keep their old look until their story is re-run; new stories get the new layout. `_AUTO_PUBLISH` must stay `all` unless a person approves stories some other way (the studio was removed). If a service returns 403 after the first deploy, give it public access: `gcloud run services add-iam-policy-binding <service> --region us-central1 --member=allUsers --role=roles/run.invoker`.

## Guardrails built in
- Claims are dropped unless their quoted passage appears verbatim in the source.
- Evidence states are assigned by deterministic rules (independent roots, primary sources, contradictions); the model only proposes groupings.
- "Established" may cite only `supported` claims; numbers absent from the ledger block approval.
- Localized scripts are back-translated and scored; missing numbers force a retry.
- Every video frame and channel caption carries an AI-presenter disclosure; YouTube uploads set `containsSyntheticMedia`.
- Nothing publishes without editor approval; WhatsApp sends only to opted-in subscribers.
- Editing a claim bumps the ledger version and marks only dependent outputs `needs_review`; live posts are flagged for correction.
