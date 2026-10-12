# OpenLens — Technical Build Plan

AI Builder Cup 2026 · Theme: Media, Content & Digital Experiences
Build window: 12–18 Oct 2026 (confirm the deadline on the official overview page; the themes page does not list it).

OpenLens is an AI-native media house. One reviewed **Claim & Evidence Ledger** per story drives every surface: our own web/PWA app, a newsroom studio, YouTube (regional / national / international), X, Instagram, Facebook and WhatsApp.

---

## 1. Hackathon requirements → how we satisfy them

| Requirement (themes page) | Our answer |
|---|---|
| Working prototype, not a mockup | Deployed reader app + studio + pipeline, end-to-end on one showcase story |
| Uses Google AI (Gemini/Gemma) or agentic platform | Gemini API / Vertex AI everywhere: reasoning, grounding, TTS, image, video; agents built with Google ADK |
| Deployed on Cloud Run or Firebase | Cloud Run (API, agents, render worker) + Firebase Hosting/Auth/Firestore |
| 3-min public demo video | Recorded Oct 18, uploaded to our own YouTube channel (dogfooding) |
| Proposal deck (PDF): problem, benefit, feasibility, scalability | Built from sections 1, 3, 12 of this doc |
| English for code/docs/slides | All code, docs, deck in English; news *output* is multilingual |

Rubric weighting drives priorities: **Technical Merit & GenAI 40% · Problem/Impact 25% · Innovation 25% · UX 10%**. See §12.

---

## 1b. JAPAC scope (updated 12 Oct)

OpenLens covers the whole Asia-Pacific region. The registry in `packages/config/src/japac.ts` is the single source of truth:

| Market | Languages | | Market | Languages |
|---|---|---|---|---|
| APAC (region-wide desk) | en | | SG Singapore | en, zh-Hans, ms |
| IN India | hi, en, te, ta | | MY Malaysia | ms, en, zh-Hans |
| JP Japan | ja | | ID Indonesia | id |
| KR South Korea | ko | | TH Thailand | th |
| TW Taiwan | zh-Hant | | VN Vietnam | vi |
| HK Hong Kong | zh-Hant, en | | PH Philippines | fil, en |
| AU Australia / NZ New Zealand | en | | | |

- **Story languages** default to the story's market languages + English (`languagesFor`). APAC-wide stories render in all 13 languages and appear in every market's feed.
- **YouTube:** one channel per language (`CHANNEL_PLAN`): English = "OpenLens Asia-Pacific" (international tier), Telugu/Tamil = regional, all others national. Each has a fictional, disclosed presenter (`PRESENTERS`). Publisher reads `YOUTUBE_REFRESH_TOKEN_<LANG>` per channel.
- **Rendering:** word-aware line breaking (`Intl.Segmenter`) for Japanese, Chinese and Thai; Noto CJK/Thai/Tamil fonts in Docker; on-screen labels and the AI disclosure are localized (disclosure always also says "AI-generated").
- **Cost:** channel copy is one structured Gemini call per language (was six); a language costs ~3 calls (localize, back-translate, channel package) plus TTS per script line.
- **Mainland China is out of scope:** YouTube, X, Instagram, Facebook and WhatsApp are unavailable there.
- **Real sources:** `npm run intake -w @openlens/agents -- <id> <region> "<title>" <urls…>` ingests only domains in `data/sources/allowlist.json`, which records rights and a documented lens-rating basis per outlet. Left/centre/right is not a universal axis across JAPAC; ratings must cite a per-market source or stay `unrated`.

---

## 2. System architecture

```
                         ┌────────────────────────────── Firebase ───────────────────────────┐
                         │  Hosting (Reader PWA + Studio)   Auth    Firestore    FCM push    │
                         └───────────────▲───────────────────────────▲──────────────────────┘
                                         │ REST/SSE                  │ realtime listeners
┌─ Cloud Scheduler ─┐   ┌───────────────┴──────── Cloud Run: api ───┴──────────────┐
│ source polling    ├──►│ REST API · auth · ledger CRUD · approval · correction     │
└───────────────────┘   │ engine (dependency graph) · publish orchestrator          │
                        └───────┬──────────────────────────────────┬───────────────┘
                                │ Cloud Tasks / Pub/Sub             │
                ┌───────────────▼─────────────┐        ┌───────────▼──────────────────┐
                │ Cloud Run: agents (ADK)     │        │ Cloud Run: media-worker      │
                │ intake · cluster · claims · │        │ Gemini TTS · Imagen/Veo ·    │
                │ research · corroborate ·    │        │ FFmpeg · captions · thumbnails│
                │ synthesize · QA · localize ·│        └───────────┬──────────────────┘
                │ social-copy                 │                    │
                └───────┬─────────────────────┘                    ▼
                        │                              Cloud Storage (assets, source docs)
                        ▼
        Gemini API / Vertex AI  (structured output · Search grounding · URL context · embeddings)
                        │
                        ▼
          Publishers (Cloud Run: publisher) ── YouTube Data API · X API · Instagram Graph ·
                                               Facebook Graph (Pages) · WhatsApp Cloud API
          Secret Manager (OAuth tokens/keys) · Cloud Logging/Trace · BigQuery (evals, cost)
```

**Services (each its own Cloud Run service, one repo):**
- `api` — public REST + SSE, owns Firestore writes, correction engine, publish state machine.
- `agents` — ADK agent graph, invoked via Cloud Tasks (retryable, idempotent jobs).
- `media-worker` — CPU/GPU-less render jobs: TTS → image/video gen → FFmpeg compose. Concurrency 1, 4 vCPU / 8 GiB, long timeout.
- `publisher` — one adapter per channel behind a common interface; isolated so channel credential failures never touch the pipeline.
- `web` — Next.js app (reader + studio) on Firebase App Hosting (or Hosting + Cloud Run SSR).

---

## 3. Gemini AI stack — where each model is used

Model IDs live in config (`MODELS.reasoning`, `MODELS.fast`, `MODELS.tts`, `MODELS.image`, `MODELS.video`, `MODELS.embed`); verify current names and quotas on Day 0 and never hard-code them in agent code.

| Capability | Gemini feature | Used for |
|---|---|---|
| Heavy reasoning | Gemini Pro-class model, thinking enabled | Research planning, corroboration, editorial synthesis, QA critique |
| Fast bulk work | Gemini Flash-class model | Clustering, claim extraction, translation, social copy, captions |
| Structured outputs | `responseSchema` / JSON mode (Zod→JSON Schema) | Every agent returns validated objects, never free prose |
| Grounding | Google Search grounding + URL context | Research agent: laws, orders, prior coverage; grounding metadata saved as evidence provenance |
| Multimodal in | Image/PDF/audio/video input | Read court orders/PDF releases, press-conference video |
| Embeddings | Gemini embedding model | Event clustering, "similar historical cases" retrieval (Firestore vector search) |
| Speech | Gemini TTS (multi-speaker, multi-language, style prompts) | Regional/international narration |
| Image | Gemini image model / Imagen | Labelled illustrative visuals, thumbnails, presenter art |
| Video | Veo | Optional labelled illustrative b-roll only (never presented as real footage) |
| Live (stretch) | Gemini Live API | "Ask the newsroom" voice Q&A on a story |
| Agents | Google ADK (Python or TS) on Cloud Run; Vertex AI Agent Engine optional | Orchestration, tool use, session state, tracing |
| Evals | Gemini-as-judge + deterministic checks | Citation coverage, back-translation fidelity, unsupported-claim detection |

---

## 4. Data model (Firestore; the contract between everything)

```
stories/{storyId}
  status: draft|researching|in_review|approved|published|stale|corrected
  version: int            // bumps on any ledger change
  region, topics[], languages[], riskTier: low|sensitive      // sensitive => mandatory human gate
  eventSummary, updatedAt, embedding
stories/{id}/sources/{sourceId}
  url, publisher, publishedAt, language, rights: {license, usage}, fetchStatus,
  lens: {rating: left|center|right|unrated, ratingBasis, modelFraming}, sourceType: primary|reporting|commentary|analysis,
  storagePath, contentHash, derivedFrom?: sourceId     // detects shared-press-release non-independence
stories/{id}/claims/{claimId}
  text, claimType: fact|allegation|opinion|forecast|causal, attributedTo?,
  state: supported|contested|attributed|unverified|superseded,
  evidence: [{sourceId, passage, offsets, groundingRef}], independenceCount, version
stories/{id}/assessment/{sectionId}
  kind: established|attributed|contested|unknown|implications|would_change, text, claimIds[]
stories/{id}/timeline/{eventId}   context/{itemId}  (laws, orders, prior actions, similar cases)
stories/{id}/outputs/{outputId}
  kind: app_card|script|video|audio|carousel|yt_meta|x_thread|ig_reel|fb_post|wa_digest
  lang, claimIds[], ledgerVersion, status: draft|qa|needs_review|approved|scheduled|published|failed,
  assetPaths[], aiDisclosure: {...}, qa: {...}
stories/{id}/publications/{pubId}
  channel, outputId, ledgerVersion, externalId, url, publishedAt, approvedBy, response
stories/{id}/runs/{runId}      // agent run log: model, prompt hash, tokens, latency, cost
subscribers/{id}  (WhatsApp opt-in: phone hash, lang, region, topics, consent timestamp)
```

**Correction propagation (core differentiator):** every `output` stores `claimIds[]` and `ledgerVersion`. When a claim/source changes, the correction engine (Firestore trigger → `api`) does a reverse lookup `claimId → outputs`, marks those `needs_review`, enqueues regeneration for only the affected outputs, and, for already-published items, creates a `correction_task` (update/delete/pin-correction per channel).

---

## 5. Agent pipeline (ADK) — one job type per stage

Each agent: input schema → Gemini call → output schema → validator → write to Firestore → emit next job. All idempotent on `(storyId, stage, ledgerVersion)`.

1. **Intake** — RSS/API/uploaded URL → fetch (respect robots/licensing), extract text (readability + Gemini for PDFs), store `SourceRecord`, compute hash and language.
2. **Cluster/Event** — embed, cluster into `StoryEvent`, dedupe syndicated copies, detect shared upstream primary source.
3. **Claim extraction** — atomic claims, exact quotes, speaker attribution, character offsets for the supporting passage.
4. **Research** (Search grounding + URL context + whitelisted official portals) — laws/orders/prior actions/datasets/similar cases → `context` + `timeline`; store grounding metadata as provenance.
5. **Corroboration** — per claim: independent support count, contradictions, temporal changes → assigns evidence `state`.
6. **Lens analysis** — outlet rating from a static documented table (not model-invented) + per-source framing summary labelled "model-generated"; produce 3 lane summaries.
7. **Editorial synthesis** — assessment sections; every factual sentence carries `claimIds`. No numeric truth score.
8. **QA/Correction** — deterministic checks (every sentence cited, numbers/dates/entities match ledger, freshness) + Gemini critic; emits flags. Sensitive `riskTier` forces human approval.
9. **Localize** — adapts (not literal-translates) per audience; glossary lock for names/legal terms/numbers.
10. **Channel adapters** — script, YouTube metadata, X thread, IG caption/carousel, FB post, WhatsApp digest; each validated against channel limits.

Human gate sits between 8 and 9→publish. No "auto-publish all" mode.

---

## 6. Content formats and the media pipeline

All formats derive from `approved claimIds`; the script is the lock point.

**Script builder:** ledger → 45–90 s script where each line has `claimIds` and a source-card reference → localization → **back-translation check** (Gemini translates back to English; a judge compares to the approved script; fail → regenerate).

**Render (media-worker):**
1. Gemini TTS per language/voice (style prompt per fictional presenter persona; no real-person voice cloning).
2. Visuals: data/source cards rendered from HTML/Canvas templates (reliable) → optional Imagen/Gemini-image illustrative frames, optional Veo b-roll; all AI visuals carry an on-screen "AI-generated" tag.
3. Presenter: fictional newsroom character (static/lightly animated layers) per region; "AI presenter" label in-frame.
4. Captions: forced alignment from TTS timing → SRT/VTT, burned in for social, uploaded separately for YouTube.
5. FFmpeg compose: 9:16 (Reels/Shorts/WhatsApp) and 16:9 (YouTube explainer), loudness normalization, thumbnails.
6. Output to Cloud Storage; `RenderedAsset` doc with hash, duration, language, claimIds.

**Language matrix (demo):** English (national + international) · Hindi (national) · Telugu (regional) · one international (e.g., Spanish or Arabic). Architecture is language-agnostic; add languages by config + glossary.

---

## 7. Channel integrations (publisher adapters)

Common interface:
```ts
interface ChannelPublisher {
  validate(output): ValidationResult      // limits, aspect ratio, disclosure fields
  publish(output, {scheduleAt?}): Promise<PublicationRecord>
  update(pubId, patch): Promise<void>     // corrections
  retract(pubId): Promise<void>
}
```
Secrets in Secret Manager; tokens refreshed by `publisher`; every call logged with response ID. State machine: `DRAFT → QA → EDITOR_APPROVAL → SCHEDULE → PUBLISH → MONITOR → CORRECT`.

| Channel | API / method | What we publish | Notes & risks |
|---|---|---|---|
| **OpenLens app** | Firestore + Hosting | Story, lenses, dossier, video, audio, corrections | Primary; always live |
| **YouTube** | YouTube Data API v3 `videos.insert` (resumable upload), `captions.insert`, `thumbnails.set`, localizations | Regional/National/International videos; localized title/desc; subtitles; `status.containsSyntheticMedia` set true for synthetic presenters/media; source links in description | One channel per tier (or one channel + localized metadata + playlists). Unverified API projects force uploads private → fallback: upload private, flip public in YouTube Studio for demo. Quota: uploads are expensive, so budget ≤ a few demo uploads |
| **X** | X API v2 (`POST /2/tweets`, media upload v2) | Thread + short clip, language variant | Write access may require a paid tier; if unavailable → preview-only |
| **Instagram** | Instagram Graph API (container create → publish) for Reels/carousels | Reel + caption + carousel | Needs Professional account linked to a Facebook Page, app roles/review; publish from a public URL (signed GCS URL) |
| **Facebook** | Graph API Pages (`/{page}/videos`, `/feed`) | Page video + summary post with source link | Page access token, `pages_manage_posts`; test with app in dev mode on own Page |
| **WhatsApp** | WhatsApp Business Cloud API | Opt-in regional digest via approved **template** + link/video | Opt-in only; template approval lead time → submit templates Day 0; demo to our own test numbers; subscription via app form + webhook |

**Demo honesty rule:** claim "live" only for channels with working credentials on demo day; everything else is shown as a validated, ready-to-publish package. Priority: **YouTube live → Facebook or X live → others preview**.

**Day-0 actions (long lead times):** create Google Cloud project + enable APIs; YouTube OAuth consent + API project; Meta developer app + Page + IG Professional account; WhatsApp Business test number + template submission; X developer app.

---

## 8. Frontend (Next.js + Tailwind, PWA)

**Reader app**
- Vertical feed (virtualized), region/language/topic filters, last-updated + source-count + evidence-status chips.
- Story screen: horizontal swipe through lenses (Embla/Swiper) · "Open the research" dossier (claims → source passage highlight, timeline, legal/official context, similar cases) · AI assessment (established/attributed/contested/unknown/implications) · video + audio player (language switcher, subtitles) · share card · correction banner.
- Accessibility: captions, audio mode, large-text, screen-reader labels, low-bandwidth mode (rendered images before video).
- Offline/PWA: cached feed, FCM web push for topic digests.

**Native mobile apps (Android + iOS) — `apps/mobile`**
- **Stack:** Expo SDK (React Native + TypeScript, Expo Router), one codebase for both platforms; shares `packages/schemas` and `packages/config` with web. Firebase JS SDK (Auth, Firestore, Storage) for data; `expo-notifications` + FCM/APNs for push; `expo-video` (HLS/MP4) and `expo-audio` for players; `react-native-reanimated` + `react-native-gesture-handler` + `react-native-pager-view` for the lens swipe; `expo-sharing` for story cards; `expo-localization` for language default; MMKV/SQLite cache for offline feed.
- **Screens (mirror the reader app):** Feed → Story (horizontal lens pager) → Research dossier → Assessment → Video/Audio player → Share → Settings (language, region, topics, digest opt-in, WhatsApp subscribe deep-link) → Corrections inbox.
- **Mobile-specific features:** vertical snap-scroll feed with video autoplay (muted + captions), background audio briefing with lock-screen controls, topic/region push notifications, deep links/universal links (`openlens.app/story/{id}`) used by every social post, share sheet with generated story card image, dark mode, Dynamic Type/TalkBack/VoiceOver labels, low-data mode.
- **Backend impact:** none beyond `api` — mobile calls the same REST/SSE + Firestore. Add `devices/{deviceId}` collection (FCM token, lang, region, topics) and a `notifier` job in `publisher` that sends FCM topic pushes when a story is approved/corrected. Videos are published as HLS (FFmpeg `-f hls`) plus MP4 fallback for smooth mobile playback.
- **Build & distribution (hackathon-realistic):**
  - Android: EAS Build → signed APK/AAB; share APK link + Play Console **Internal Testing** track.
  - iOS: EAS Build → **TestFlight** (needs Apple Developer Program, $99/yr, enrolment can take 1–2 days — start Day 0). Fallback if enrolment slips: Expo Go / dev-client build + screen-recorded device demo, and the PWA remains the judge-accessible link.
  - Judges get: deployed web URL (always works) + Android APK + TestFlight link (if ready) + demo-video footage from real devices.
- **Scope rule:** native apps are the *reader* only. The newsroom **Studio stays web-only** (desktop workflow); don't build editor screens in React Native.

**Studio (auth-gated roles: editor, admin)**
- Story queue with pipeline progress (Firestore realtime), ledger editor (edit claim/state/source), assessment review diff, per-channel preview (mobile frames), approve / schedule / publish, correction log, **evals panel** (citation coverage %, back-translation score, flags, cost/latency per story).
- "Simulate correction" button → live visualization of impacted outputs flipping to `needs_review`.

---

## 9. Repo layout

```
open-lens/
  apps/
    web/                 # Next.js: reader + studio (PWA)
    mobile/              # Expo React Native: Android + iOS reader app
  services/
    api/                 # REST/SSE, correction engine, publish orchestrator (Node/TS or FastAPI)
    agents/              # ADK agent graph, prompts, tool wrappers, eval harness
    media-worker/        # TTS, image/video gen, FFmpeg, captions
    publisher/           # channel adapters
  packages/
    schemas/             # Zod/JSON Schema shared types (single source of truth)
    config/              # model registry, language/glossary config, channel limits
  data/
    seed/                # showcase story source pack, outlet-rating table, glossaries
  infra/                 # Terraform or gcloud scripts, Cloud Build, Firestore rules/indexes
  docs/                  # architecture, eval report, demo script, deck source
  plan.md
```

Language choice: TypeScript end-to-end (shared Zod schemas) unless ADK Python is needed for the agent service; if so, generate JSON Schema from Zod and validate on the Python side.

---

## 10. Google Cloud / deployment

- Project with APIs: Cloud Run, Cloud Build, Artifact Registry, Firestore, Cloud Storage, Cloud Tasks, Pub/Sub, Cloud Scheduler, Secret Manager, Vertex AI / Generative Language, YouTube Data, Cloud Logging/Trace/Monitoring, BigQuery.
- CI: Cloud Build trigger on `main` → build images → deploy Cloud Run revisions; Firebase deploy for web.
- Service accounts per service with least privilege (`agents` → Vertex + Firestore; `publisher` → Secret Manager only; `media-worker` → GCS + Vertex).
- Cloud Run settings: `api` min-instances 1 (demo latency), `media-worker` concurrency 1, timeout 15 min; Cloud Tasks retry w/ backoff, dead-letter topic.
- Firestore security rules: public read of `published` stories only; studio writes require role claim.
- Observability: structured logs with `storyId/runId`; Trace per pipeline; BigQuery export of `runs` for token/cost dashboard.
- Budget alert + per-story token cap to avoid runaway spend; cache Gemini results by prompt hash during dev.

---

## 11. Quality, safety, and evaluation (feeds the 40% criterion)

- **Citation coverage:** % of factual sentences in assessment/script with ≥1 valid `claimId` (target ≥ 95%, deterministic check).
- **Source-support check:** Gemini judge verifies each cited passage actually supports the claim; report unsupported count.
- **Numbers/dates/entities:** regex + NER diff between ledger and every output.
- **Back-translation fidelity:** per language, score + flagged divergences.
- **Independence check:** claims sourced only from one upstream release are not "corroborated".
- **Safety:** risk-tier classifier; sensitive topics (elections, conflict, communal, allegations about identifiable people, deaths, health, legal) → mandatory human approval. AI disclosure labels on synthetic presenter/media in-frame and in platform metadata. No cloning of real journalists' likeness/voice. Rate-limit and opt-in enforcement for WhatsApp.
- **Eval set:** 1 showcase + 2 backup stories with hand-labelled expected claims; run harness nightly/pre-demo; publish results in `docs/eval.md` and the studio evals panel.

---

## 12. Rubric mapping

| Criterion | What we build / show |
|---|---|
| **Technical Merit & GenAI (40%)** | 10-stage ADK agent graph, structured outputs, Search grounding + URL context, embeddings clustering, multimodal PDF reading, Gemini TTS/image/(Veo), correction-propagation engine, evals panel with real metrics, Cloud Run + Tasks + Firestore scaling story, cost/latency per story |
| **Problem & Impact (25%)** | One event → one inspectable story → many languages/channels; regional-language reach; transparency vs. AI-summary opacity; small-newsroom use case; numbers: time-to-publish per language, # channels from one ledger |
| **Innovation (25%)** | Evidence ledger as universal source of truth; lens swipe that is *not* a truth meter; independence-aware corroboration; disclosed fictional regional presenters; self-correcting multi-channel publishing |
| **UX & Design (10%)** | Swipe-for-perspective, tap-for-evidence, subtitles/audio mode, language switcher, studio with previews and one-click approve |

---

## 13. Milestones (Oct 12 → 18)

| Day | Backend/AI | Frontend | Media & channels | Exit criteria |
|---|---|---|---|---|
| **Oct 12** | GCP project, APIs, Firestore, schemas pkg, repo scaffold, model registry; freeze showcase story + 8–12 sources + 1 primary doc | Next.js scaffold, Firebase Auth, design tokens; **Expo app scaffold + Firebase connected, first EAS Android build; start Apple Developer enrolment** | **Spikes:** Gemini TTS→FFmpeg 9:16 clip (+HLS output); YouTube OAuth + test upload; submit WhatsApp templates; Meta/X app setup | Reproducible seed data; deploy pipeline works; video spike plays |
| **Oct 13** | Intake, cluster, claim extraction, ledger writes | Web feed + story shell; **mobile feed + story screens reading Firestore** | Script builder v1 | Ledger populated with cited claims |
| **Oct 14** | Lens analysis + outlet table; research agent (grounding) | Lens swipe + dossier on web **and mobile (pager, passage highlight)** | Video templates (cards, presenter, captions) | Navigate feed → lenses → evidence |
| **Oct 15** | Corroboration, synthesis, QA agent, risk tiering | Assessment UI + correction banner (web + mobile); **mobile video/audio players, language switcher** | Localize + back-translation; render EN/HI/TE + international | Assessment live; 3–4 language videos rendered |
| **Oct 16** | Correction engine (dependency graph, regen jobs) | Studio: queue, ledger editor, approvals, previews | Channel adapters: validate + preview for all 5 | All five previews from one ledger version |
| **Oct 17** | Evals harness + panel; hardening, retries, rules | Polish, a11y, PWA; **mobile push (FCM), deep links, share cards; EAS release builds → APK + TestFlight** | **Live publish:** YouTube, then FB/X; IG/WA sandbox/preview; WhatsApp opt-in flow | One real YouTube upload; correction demo end-to-end |
| **Oct 18** | Freeze, prod deploy, smoke test | Final QA on real Android + iOS devices; capture device footage for the demo | Record 3-min demo; export PDF deck; submit | Public demo link + deck + deployed URL |

**Cut line (in order of removal):** Veo b-roll → Gemini Live Q&A → IG live → WhatsApp live → X live → extra languages → iOS TestFlight (fall back to dev-client/screen recording) → mobile push. Never cut: working Android app + web PWA, ledger, assessment, app, studio approval, one multilingual video, five previews, correction propagation, YouTube live (or private-upload fallback).

---

## 14. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Platform API access/approval delays | Day-0 registration; preview-only fallback; honest demo labelling |
| YouTube unverified-project uploads forced private | Upload private + manual publish; or use already-verified project/channel |
| Video generation latency/quota | Template-driven visuals as default; AI visuals optional; pre-render demo assets |
| LLM hallucination in claims/assessment | Schema + citation-required validation, source-support judge, human gate |
| Translation errors (names, legal terms, numbers) | Glossary lock, number/entity diff, back-translation check |
| Content rights | Permitted/public/primary sources only; short quotes; store rights metadata |
| Gemini quota/cost | Flash for bulk, Pro only for synthesis/QA; prompt-hash cache; per-story token caps |
| Apple Developer enrolment/TestFlight delay | Enrol Day 0; ship Android APK + PWA as judge-accessible builds; iOS shown via dev-client build/screen recording if TestFlight isn't ready |
| Native app doubles frontend workload | Mobile is reader-only; share schemas, API client, and design tokens; web Studio is not ported; reuse the same Firestore queries |
| Live demo failure | Pre-recorded fallback clips, seeded Firestore snapshot, `DEMO_MODE` flag |

---

## 15. Demo script (3 min)

1. **0:00–0:20** Problem: 12 headlines, no evidence, one language.
2. **0:20–1:10** Reader app: feed → swipe lenses → open evidence dossier → assessment.
3. **1:10–1:50** Studio: approve → generate EN/Hindi/Telugu/international videos → five channel previews from the same ledger version.
4. **1:50–2:30** Live YouTube publish (+ one more live channel if ready); edit one claim → dependents flip to `needs_review` → regenerate → correction logged.
5. **2:30–3:00** Evals panel (citation coverage, back-translation score), architecture slide, impact.

---

## 16. Open decisions (answer on Day 0)

1. Showcase story (low-controversy, with a primary document: policy, tech regulation, civic project).
2. Regional + international languages for the demo.
3. Which platform developer accounts/credentials already exist.
4. Language for services: all-TS vs. TS web/api + Python ADK agents.
5. Gemini/Veo quota and hackathon credits actually available.
6. Apple Developer account available (for TestFlight) and Google Play Console account (or APK-only distribution)?
7. How many people are building? Native apps need a dedicated mobile owner to stay on schedule.
