# OpenLens — the AI media house that shows its work

One story → one reviewed **Claim & Evidence Ledger** → our own web + mobile apps, narrated regional/national/international videos, and channel-ready posts for YouTube, X, Instagram, Facebook and WhatsApp. Built on Gemini + Google Cloud for AI Builder Cup 2026. Full spec: [`plan.md`](plan.md).

## Repo

| Path | What |
|---|---|
| `packages/schemas` | Zod contracts: sources, claims, evidence states, lanes, assessment, outputs, publications, corrections, evals |
| `packages/config` | Model registry, languages, presenters (fictional, disclosed), YouTube tiers, channel limits |
| `packages/client` | Typed REST client shared by web + mobile |
| `services/agents` | Gemini agent pipeline: claims → corroborate → lenses → research → synthesize → QA → scripts (+localize, back-translation) → channel packages |
| `services/media-worker` | Gemini TTS narration → canvas scenes (Indic-safe) → FFmpeg 9:16 / 16:9 + HLS + WebVTT |
| `services/api` | Hono REST/SSE: reader feed, studio, approvals, correction propagation, publishing, evals |
| `services/publisher` | Channel adapters (YouTube, X, Instagram, Facebook, WhatsApp, FCM) with dry-run mode |
| `apps/web` | Next.js reader + newsroom studio (PWA) |
| `apps/mobile` | Expo Android + iOS reader |
| `infra` | GCP setup script, Cloud Build, Firestore rules |
| `data/seed`, `data/fixtures` | Source packs (sample story is **fictional**) and frontend fixtures |

## Run locally

Requirements: Node ≥ 20, FFmpeg on PATH.

```bash
npm install
npm run build -w @openlens/schemas -w @openlens/config -w @openlens/client -w @openlens/agents -w @openlens/media-worker
cp .env.example .env            # add GEMINI_API_KEY

# Seed data: instant fixture, or the full live AI pipeline (~5-10 min incl. TTS + video)
npm run seed -w @openlens/api -- --fixture
npm run seed -w @openlens/api                 # data/seed/sample-story
npm run seed -w @openlens/api -- data/seed/<story> --stages scripts,channels,media

npm run dev -w @openlens/api    # http://localhost:8080  (AUTH_MODE=dev locally)
```

Useful env (`.env.example` lists all): `GEMINI_CACHE_DIR` (cache model responses while iterating), `MEDIA_SILENT=1` (skip TTS), `RESEARCH_GROUNDING=0` (skip Search grounding), `MODEL_*` overrides.

### Adding a real story
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

## Guardrails built in
- Claims are dropped unless their quoted passage appears verbatim in the source.
- Evidence states are assigned by deterministic rules (independent roots, primary sources, contradictions); the model only proposes groupings.
- "Established" may cite only `supported` claims; numbers absent from the ledger block approval.
- Localized scripts are back-translated and scored; missing numbers force a retry.
- Every video frame and channel caption carries an AI-presenter disclosure; YouTube uploads set `containsSyntheticMedia`.
- Nothing publishes without editor approval; WhatsApp sends only to opted-in subscribers.
- Editing a claim bumps the ledger version and marks only dependent outputs `needs_review`; live posts are flagged for correction.
