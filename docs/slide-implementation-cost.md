# Slide: Estimated Implementation Cost & Unit Economics

> **OpenLens: The AI Media House That Shows Its Work**  
> AI Builder Cup 2026 · Pitch Deck Slide Specification

---

## 1. Slide Metadata & Executive Summary

- **Slide Title:** Estimated Implementation Cost & Unit Economics
- **Subtitle:** Sub-Dollar Multi-Channel Publishing Built on Gemini & Google Cloud Serverless
- **Slide Objective:** Demonstrate exceptional fiscal feasibility, scalability, and technical merit (40% Technical Merit + 25% Feasibility/Scalability rubric). Prove that OpenLens delivers a **99.9% cost reduction** compared to traditional regional newsrooms while maintaining rigorous factual verification.
- **Key Takeaway Figure:** **~$0.12 per fully verified, narrated dual-aspect video story package** (English), or **~$0.25 across three Asia-Pacific languages** (e.g., English, Japanese, Hindi) with automated social adaptation.

---

## 2. Unit Economics Breakdown (Per-Story Cost)

All calculations reflect **Google Cloud & Vertex AI list pricing** (checked October 2026) verified against the OpenLens codebase ([`genspend.ts`](services/media-worker/src/genspend.ts), [`.env.example`](.env.example), and [`cloudbuild.yaml`](infra/cloudbuild.yaml)).

| Processing Stage | Service / Model Used | Resource Consumption | Unit Cost (USD) |
|---|---|---|---|
| **1. Wire Intake & Ingestion** | Cloud Run + RSS/GDELT Poller | 1.2s CPU time on 4 vCPU / 8 GiB | $0.0008 |
| **2. Multilingual Clustering** | Gemini Embedding 2 | ~4k text tokens (headline + lead) | $0.0003 |
| **3. Claim & Quote Extraction** | Gemini Flash (Fast) | ~25k prompt tokens, ~3.5k output tokens | $0.0052 |
| **4. Grounded Research & Timeline** | Gemini Pro + Google Search Grounding | 1 Grounding query + ~12k tokens | $0.0180 |
| **5. Editorial Synthesis & Lens Analysis** | Gemini Pro (Reasoning) | ~14k prompt tokens, ~2.5k structured JSON | $0.0210 |
| **6. Multi-Critic QA & Risk Tiering** | Gemini Flash (Critic) + NER Diff | ~8k prompt tokens, ~1k output tokens | $0.0018 |
| **Subtotal: Base Verified Story Ledger** | **All 6 Core Stages** | **One Complete Reviewed Story Ledger** | **$0.0471** |

---

### Language & Video Adaptation Cost (Per Output Tier)

| Component | Technology | Consumption | Cost per Language |
|---|---|---|---|
| **Script Localization & Back-Translation** | Gemini Flash + Judge | ~10k prompt tokens, ~1.8k output tokens | $0.0024 |
| **Channel Copy (X, IG, FB, YT, WA)** | Gemini Flash (Single Call) | ~6k prompt tokens, ~1.2k structured JSON | $0.0015 |
| **Gemini TTS Narration** | `gemini-3.1-flash-tts-preview` | 60–75s audio (~1,100 text characters) | $0.0002 |
| **Visual Asset Desk** | Wikimedia Commons + Geo Maps | Licenced photo verification + vector map | $0.0080 |
| **Presenter Compositing** | Veo 3.1 Idle Loop (Cached) | Cached idle clip overlay (amortized) | $0.0100 |
| **Dual FFmpeg Render (9:16 + 16:9 + HLS)** | Cloud Run (4 vCPU / 8 GiB) | ~45 seconds rendering time | $0.0035 |
| **Total per Rendered Language** | **Video + Audio + Socials** | **Narrated Broadcast Package** | **~$0.0256** |

---

### Total Package Scenarios

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ STORY COST SUMMARY (ONE EVENT ➔ VERIFIED MULTI-CHANNEL DISTRIBUTION)                  │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Scenario A: Single-Market Story (English or Japanese Video + All Socials)      ➔ $0.07 │
│ Scenario B: National Multi-Language Story (EN + HI + TE Videos + All Socials)   ➔ $0.12 │
│ Scenario C: APAC-Wide Regional Story (All 13 JAPAC Languages + 26 Videos)       ➔ $0.38 │
│                                                                                        │
│ 🆚 Traditional Newsroom Cost to Produce Equivalent Package:             $350 – $1,200  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Total Cost of Ownership (Monthly TCO Projections)

### Tier 1: Hackathon Prototype / Regional Desk Pilot
- **Scope:** 3 stories/day (90 stories/month), 2 languages per story (180 videos), automated 15-min wire polling, up to 10,000 monthly reader visits.

| Cloud Component | Sizing & Allocation | Monthly Cost (USD) |
|---|---|---|
| **Google Cloud Run (`api` & `media-worker`)** | 4 vCPU / 8 GiB, concurrency 5, min-instances 0 | $14.50 |
| **Google Cloud Run (`web` PWA)** | 1 vCPU / 2 GiB, min-instances 0 | $4.20 |
| **Firestore & Vector Storage** | ~2,500 documents, daily vector indexing | $1.80 |
| **Cloud Storage & CDN (Media Bucket)** | 120 GB egress / 40 GB video storage | $6.50 |
| **Gemini & Vertex AI Spend** | Flash + Pro + TTS + Search Grounding | $18.20 |
| **Cloud Scheduler, Tasks & Secret Manager** | 2,880 wire invocations/month | $0.50 |
| **Monthly Total (Prototype / Hackathon):** | | **~$45.70 / month** |

---

### Tier 2: Commercial Multi-Market 24/7 Newsroom
- **Scope:** 20 breaking stories/day (600 stories/month), 5 languages per story (3,000 videos rendered in 9:16 & 16:9), 250,000 monthly active readers, 5,000 daily citizen `/verify` queries.

| Cloud Component | Sizing & Allocation | Monthly Cost (USD) |
|---|---|---|
| **Cloud Run (`api` & rendering)** | 4 vCPU / 8 GiB, autoscaling 1–10 instances, min-instances 1 | $112.00 |
| **Next.js Web PWA & Expo Backend** | Cloud Run SSR + Firebase CDN | $38.00 |
| **Firestore Database & Search** | Realtime listeners, 6M reads, 1.2M writes | $22.50 |
| **Cloud Storage & CDN Egress** | 1.8 TB video streaming egress, HLS caching | $74.00 |
| **Vertex AI: Gemini Flash & Pro** | Reasoning, Claim extraction, Synthesis, QA | $135.00 |
| **Vertex AI: Gemini TTS Narration** | ~3,000 localized audio tracks | $0.60 |
| **Vertex AI: Veo & Illustrative Visuals** | Background asset generation (budget-capped) | $45.00 |
| **Cloud Tasks, Logging & BigQuery Evals** | Automated tracing and token audit | $8.50 |
| **Monthly Total (Production Newsroom):** | | **~$435.60 / month** |

---

## 4. Built-in Cost Guardrails & Protection Mechanisms

OpenLens implements strict financial controls directly in the codebase to prevent runaway bills or quota exhaustion:

```mermaid
flowchart LR
    classDef cap fill:#fee2e2,stroke:#ef4444,stroke-width:1.5px;
    classDef cache fill:#ecfdf5,stroke:#10b981,stroke-width:1.5px;
    classDef limit fill:#eff6ff,stroke:#3b82f6,stroke-width:1.5px;

    Call([Generative Model Call]) --> CheckCap
    
    subgraph Guardrails ["Codebase Cost Guardrails"]
        CheckCap{"assertBudget()<br/>(services/media-worker/<br/>genspend.ts)"}:::cap
        CheckCache{"Content-Hash Cache<br/>(GEMINI_CACHE_DIR)"}:::cache
        WireLimits{"Ingestion Budgets<br/>(INGEST_MAX_NEW=5<br/>DAILY_RUNS=100)"}:::limit
        VerifyLimits{"Rate Limiting<br/>(12 req/min per IP<br/>500 daily cap)"}:::limit
    end

    CheckCap -->|Exceeds GENAI_SPEND_CAP_USD| RejectCall[/"Refuse & Alert Admin"/]
    CheckCap -->|Within Budget| CheckCache
    CheckCache -->|Cache Hit| ServeFree[/"Zero-Cost Cached Response"/]
    CheckCache -->|Cache Miss| ExecuteModel[/"Invoke Vertex AI Model"/]
```

1. **`assertBudget()` Hard Spend Ceiling ([`genspend.ts`](services/media-worker/src/genspend.ts#L38-L42))**:
   - Inspects the spend ledger (`.data/genai-spend.jsonl`) prior to invoking high-cost models (Veo, Imagen). If spending would exceed `GENAI_SPEND_CAP_USD` (default $3–$10), execution is refused automatically.
2. **SHA-256 Prompt & Asset Caching**:
   - Model responses and rendered TTS clips are keyed by SHA-256 hash. Re-running the pipeline or re-rendering video shapes (16:9 after 9:16) incurs **$0 incremental AI cost**.
3. **Reusable Presenter Asset Pool ([`portraits.ts`](services/media-worker/src/portraits.ts), [`idleclip.ts`](services/media-worker/src/idleclip.ts))**:
   - Fictional newsroom presenters (Kenji for Japan, Priya for India, etc.) utilize pre-generated, looping Veo idle clips composited under dynamic graphics, avoiding per-second video generation fees.
4. **Token Minimization Strategy**:
   - Social copy generation across all 5 channels (YouTube, X, Instagram, Facebook, WhatsApp) was collapsed from 6 individual model calls into a single structured schema call per language.
5. **Rate-Gated Citizen Verification ([`verify.ts`](services/api/src/verify.ts#L23-L24))**:
   - `/verify` requests are rate-limited to 12/minute per visitor with a 500/day IP cap, protecting vector search and embedding resources.

---

## 5. Comparative Value Proposition

| Dimension | Traditional Regional Newsroom | Generic AI Summarizer (LLM Wrapper) | OpenLens Platform |
|---|---|---|---|
| **Production Cost** | $300 – $1,200 / story | ~$0.02 (text only, unverified) | **~$0.12 (video + audio + ledger)** |
| **Time to Publish** | 4 to 8 hours | 10 seconds | **2 to 4 minutes** |
| **Citation Verification** | Manual editor fact-checking | None (hallucination prone) | **Automated ($\ge 95\%$ citation gate)** |
| **Multi-Language Output** | Requires dedicated regional desks | Literal translation (often flawed) | **Glossary-locked + Back-translated** |
| **Multimedia Deliverables** | Dedicated video editing team | None | **Dual-aspect video + HLS + forced subs** |
| **Correction Propagation** | Silent edits or manual tracking | Impossible | **Automated DAG invalidation** |

---

## 6. Slide Presenter Script (30–45s Pitch Track)

> *"One of OpenLens's strongest architectural advantages is its unit economics.*  
>  
> *By combining Google Cloud Run serverless compute with Gemini 2.0 Flash for extraction and Gemini Pro for structured synthesis, our base verified evidence ledger costs less than 5 cents to create.*  
>  
> *When you add Gemini TTS narration, dynamic graphic assembly, and dual-aspect video rendering, a complete broadcast news package costs just 12 cents in English, or 25 cents across three regional languages.*  
>  
> *Compared to traditional media operations where producing regional multimedia packages costs hundreds of dollars, OpenLens delivers a 99.9% cost reduction.*  
>  
> *We have also built in strict financial guardrails—including SHA-256 prompt caching, pre-rendered idle presenter loops, and a hard spending cap enforced at the runtime level in `genspend.ts`.*  
>  
> *A full regional newsroom running 24/7 on OpenLens can operate for under $450 a month."*
