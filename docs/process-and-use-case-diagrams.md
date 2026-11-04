# OpenLens: Process Flow & Use-Case Diagrams Specification

> **OpenLens: The AI Media House That Shows Its Work**  
> Technical Architecture & Operational Process Blueprint for AI Builder Cup 2026.

---

## 1. Executive Overview

OpenLens transforms raw news and primary documents across the Asia-Pacific (JAPAC) region into verifiable, multi-perspective, and multilingual multimedia experiences. Unlike traditional black-box AI summarizers, OpenLens structures all reporting around a reviewed, deterministic **Claim & Evidence Ledger**.

This document specifies the system's operational behaviors, actor interactions, agent pipelines, video rendering workflows, and correction propagation mechanics via **UML Use-Case Diagrams** and **Process Flow Diagrams**.

---

## 2. UML Use-Case Diagrams & Specifications

### 2.1 System Use-Case Diagram

```mermaid
flowchart LR
    %% Actors
    subgraph Actors ["Actors"]
        Reader["👤 Public Reader / Citizen\n(Web & Mobile Apps)"]
        Editor["👤 Newsroom Editor / Fact-Checker\n(Studio Desktop App)"]
        Wire["⚙️ Automated Wire Ingestion\n(Cloud Scheduler / RSS / GDELT)"]
        SocialUser["👥 Social Audience / Subscribers\n(YouTube, X, IG, FB, WhatsApp)"]
        GeminiAI["🤖 Gemini AI Subsystem\n(Vertex AI Pro/Flash/TTS/Veo)"]
    end

    %% OpenLens System Boundary
    subgraph SystemBoundary ["OpenLens Platform Boundary"]
        %% Reader Use Cases
        subgraph ReaderUC ["Reader & Public Experience"]
            UC_Feed(["Browse Multi-Market News Feed\n(Regional/Topic Filters)"]):::uc
            UC_Lenses(["Swipe Multi-Perspective Lenses\n(Left / Center / Right / Official)"]):::uc
            UC_Dossier(["Inspect Claim & Evidence Ledger\n(Verbatim Quotes & Offsets)"]):::uc
            UC_Assessment(["Read Structured AI Assessment\n(Established vs Contested)"]):::uc
            UC_Media(["Stream Video & Audio Briefing\n(Multilingual / Subtitles / HLS)"]):::uc
            UC_Verify(["Verify Custom Claim via '/verify'\n(Embeddings & Ledger Matching)"]):::uc
            UC_Subscribe(["Opt-In to Regional WhatsApp / Push Alerts"]):::uc
        end

        %% Editor Use Cases
        subgraph EditorUC ["Newsroom Studio & Editorial Operations"]
            UC_Intake(["Ingest Story via Verified URLs / Wire"]):::uc
            UC_ReviewLedger(["Audit Extracted Claims & Quotes"]):::uc
            UC_ReviewQA(["Audit QA Critique, Numbers & Risk Tier"]):::uc
            UC_Gate(["Approve / Gate Story Publication"]):::uc
            UC_SimulateCorr(["Patch Claim & Simulate Correction"]):::uc
            UC_AuditEvals(["Monitor Evals, Citation Coverage & Costs"]):::uc
        end

        %% Core Pipeline / System Use Cases
        subgraph CoreUC ["Agent Pipeline & Video Factory"]
            UC_IngestFilter(["Enforce Allowlist & Robots.txt"]):::uc
            UC_Cluster(["Cluster Headlines & Detect Shared PRs"]):::uc
            UC_ExtractClaims(["Extract Claims with Verbatim Offsets"]):::uc
            UC_Corroborate(["Corroborate Independent Sources"]):::uc
            UC_Synthesize(["Synthesize Balanced Perspectives"]):::uc
            UC_Localize(["Localize Script & Run Back-Translation"]):::uc
            UC_RenderVideo(["Render Dual-Aspect Video (9:16 & 16:9)"]):::uc
            UC_PublishMulti(["Publish Omni-Channel Packages"]):::uc
            UC_Propagate(["Propagate Corrections across DAG"]):::uc
        end
    end

    %% Actor Connections
    Reader --> UC_Feed
    Reader --> UC_Lenses
    Reader --> UC_Dossier
    Reader --> UC_Assessment
    Reader --> UC_Media
    Reader --> UC_Verify
    Reader --> UC_Subscribe

    Editor --> UC_Intake
    Editor --> UC_ReviewLedger
    Editor --> UC_ReviewQA
    Editor --> UC_Gate
    Editor --> UC_SimulateCorr
    Editor --> UC_AuditEvals

    Wire --> UC_IngestFilter
    Wire --> UC_Cluster

    UC_Cluster --> UC_ExtractClaims
    UC_ExtractClaims --> UC_Corroborate
    UC_Corroborate --> UC_Synthesize
    UC_Synthesize --> UC_ReviewQA
    UC_Gate --> UC_Localize
    UC_Localize --> UC_RenderVideo
    UC_RenderVideo --> UC_PublishMulti
    UC_PublishMulti --> SocialUser
    UC_SimulateCorr --> UC_Propagate
    UC_Propagate --> UC_PublishMulti

    GeminiAI -.-> UC_ExtractClaims
    GeminiAI -.-> UC_Synthesize
    GeminiAI -.-> UC_Localize
    GeminiAI -.-> UC_RenderVideo
    GeminiAI -.-> UC_Verify

    classDef uc fill:#f8fafc,stroke:#3b82f6,stroke-width:1.5px,rx:12px,ry:12px;
```

---

### 2.2 Actor Characterization

| Actor | Type | Description | Primary Interfaces |
|---|---|---|---|
| **Public Reader / Citizen** | Human (End User) | Consumes balanced reporting, scrutinizes evidence trails, listens/watches in their native tongue, and queries claims. | Next.js PWA (`apps/web`), Expo Mobile App (`apps/mobile` iOS & Android). |
| **Newsroom Editor / Fact-Checker** | Human (Privileged) | Supervises news generation, reviews risk classifications, validates claims, gates publication, and executes transparent corrections. | OpenLens Studio Desktop UI (`/studio`), Studio API (`services/api`). |
| **Automated Wire Ingestion Worker** | Automated System | Runs on Cloud Scheduler (10–15 min frequency) to discover breaking news from allowlisted RSS/Atom feeds and GDELT triggers. | Cloud Scheduler, Cloud Tasks, Ingest Runner (`services/api/src/ingest.ts`). |
| **AI Subsystem (Gemini & Vertex AI)** | External AI Service | Provides reasoning, multimodal extraction, Search grounding, TTS voices, and Veo idle-motion visual synthesis. | Google Cloud Vertex AI SDK, Gemini 1.5/2.0 APIs. |
| **Channel Platforms / Social Audience** | External Services / Users | External distribution channels consuming validated video packages, threads, and broadcast templates. | YouTube Data API v3, X API v2, Instagram Graph API, Facebook Pages API, WhatsApp Cloud API. |

---

### 2.3 Key Use-Case Specifications

#### UC-01: Inspect Claim & Evidence Ledger
- **Primary Actor:** Public Reader / Citizen.
- **Preconditions:** Story is published (`status: "published" | "corrected"`).
- **Trigger:** Reader taps on an assessment sentence or opens the "Evidence Dossier" tab.
- **Main Flow:**
  1. System displays all underlying atomic claims linked to the selected sentence.
  2. For each claim, system displays its assigned evidence state (`supported`, `contested`, `attributed`, `unverified`).
  3. System renders verbatim source excerpts highlighted with exact character offsets from the primary document or reporting outlet.
  4. System shows the source's political/editorial framing basis derived from documented tables.
- **Postconditions:** Reader verifies factual claims directly against original documentation without algorithmic bias.

#### UC-02: Human-in-the-Loop Publication Gating
- **Primary Actor:** Newsroom Editor.
- **Preconditions:** Agent pipeline has completed `claims`, `corroborate`, `lenses`, `research`, `synthesize`, and `qa` stages.
- **Trigger:** Editor opens the Studio Queue for an `in_review` story.
- **Main Flow:**
  1. System presents the story summary, risk-tier classification (`low` vs `sensitive`), and automated QA flags.
  2. If the story has sensitive topics (elections, legal disputes, casualties), publication is locked pending explicit sign-off.
  3. Editor inspects deterministic citation coverage (enforcing $\ge 95\%$) and number/entity verification diffs.
  4. Editor clicks **"Approve Story"**.
  5. System unlocks downstream script generation, localization, video rendering, and multi-channel publication.
- **Alternate Flow (Flagged Hallucination / Unsupported Claim):**
  - Editor rejects or edits the claim; system forces re-synthesis before publication can occur.

#### UC-03: Reactive Correction Propagation
- **Primary Actor:** Newsroom Editor.
- **Preconditions:** Story has been published to Web, Mobile, YouTube, and Social Channels.
- **Trigger:** A source updates its reporting, a factual dispute arises, or an editor submits a claim patch (`POST /v1/studio/story/:id/claim/:claimId`).
- **Main Flow:**
  1. Editor updates claim text or flips evidence state (e.g., `supported` $\rightarrow$ `contested`) with a mandatory audit reason.
  2. System increments story ledger version ($V \rightarrow V+1$).
  3. Correction Engine traverses the dependency Directed Acyclic Graph (DAG) using `impactedOutputs(outputs, [claimId])`.
  4. All affected scripts, channel packages, and video outputs are immediately marked `needs_review` with a stale reason.
  5. Live social publications linked to affected outputs are flagged `needs_correction`.
  6. Reader Web and Mobile apps instantly display a prominent **Correction Notice Banner** indicating which claim changed and why.
  7. Channel publisher enqueues corrective actions (pinned comment update on YouTube, correction thread on X, revised caption on Facebook).
- **Postconditions:** Transparent, auditable correction trail is published without manual cross-platform tracking.

#### UC-04: Citizen Claim Verification ("Verify This")
- **Primary Actor:** Public Reader / Citizen.
- **Preconditions:** At least one story ledger is indexed in Firestore / vector store.
- **Trigger:** User submits a 8–600 character statement at `/verify`.
- **Main Flow:**
  1. System generates a multilingual embedding for the user's statement via Gemini Embeddings.
  2. System computes cosine similarity across all claims in published ledgers, filtering by threshold ($\ge 0.74$).
  3. Top matching claims are sent to Gemini with strict instructions to evaluate solely against the provided claim texts (`supports`, `contradicts`, or `related`).
  4. Deterministic decision engine computes the verdict: `Supported`, `Contradicted`, `Disputed`, `Not yet confirmed`, `Topic covered but not claim`, or `Uncovered`.
  5. System renders an evidence card showing matching claims, source outlets, and direct ledger links.
- **Alternate Flow (Uncovered Statement):**
  - Statement matches no published claims; system registers the statement anonymously into the editorial research queue (`/studio/verify-queue`).

---

## 3. Process Flow Diagrams

### 3.1 End-to-End System Process Flow (Wire-to-Publish)

This flowchart illustrates the complete lifecycle of news content in OpenLens, from initial discovery through multi-agent analysis, editorial approval, media synthesis, and reader consumption.

```mermaid
flowchart TD
    %% Styling Classes
    classDef trigger fill:#e0f2fe,stroke:#0284c7,stroke-width:2px;
    classDef agent fill:#fef3c7,stroke:#d97706,stroke-width:2px;
    classDef data fill:#f1f5f9,stroke:#475569,stroke-width:1.5px;
    classDef gate fill:#fee2e2,stroke:#dc2626,stroke-width:2px;
    classDef media fill:#f3e8ff,stroke:#9333ea,stroke-width:2px;
    classDef pub fill:#dcfce7,stroke:#16a34a,stroke-width:2px;

    %% Ingestion Phase
    subgraph Phase1 ["1. Ingestion & Discovery"]
        T1(["Cloud Scheduler\n(10-15 min cron)"]):::trigger
        T2(["Manual Desk Intake\n('npm run story' / 'npm run intake')"]):::trigger
        
        P1_Poll["Feed Poller\n(RSS / Atom / GDELT Signals)"]
        P1_Allow["Allowlist & Robots.txt Check\n(Rights & License Validation)"]
        P1_Fetch["Full-Text Document Extraction\n(HTML Readability & Gemini PDF Parser)"]
        P1_Cluster["Multilingual Event Clustering\n(Embeddings & Deduplication)"]
        D_Source[("Source Records\n& Content Hash")]:::data

        T1 --> P1_Poll
        T2 --> P1_Allow
        P1_Poll --> P1_Allow
        P1_Allow -->|Verified Source Only| P1_Fetch
        P1_Allow -->|Unlisted Domain| P1_Reject[/"Drop & Log Ingestion Rejection"/]
        P1_Fetch --> P1_Cluster
        P1_Cluster --> D_Source
    end

    %% Agent Pipeline Phase
    subgraph Phase2 ["2. Multi-Agent Intelligence Pipeline (Google ADK / Vertex AI)"]
        A_Claims["Stage 1: Claims Extraction\n(Atomic Claims + Exact Quote Offsets)"]:::agent
        A_Corrob["Stage 2: Deterministic Corroboration\n(Independent Root Counting & Contradictions)"]:::agent
        A_Lenses["Stage 3: Lens & Framing Analysis\n(Documented Rating Tables + Neutral Summaries)"]:::agent
        A_Research["Stage 4: Grounded Research\n(Google Search Grounding + Official Context)"]:::agent
        A_Synth["Stage 5: Editorial Synthesis\n(Balanced Assessment: Established / Contested)"]:::agent
        A_QA["Stage 6: Multi-Critic QA & Risk Tiering\n(>=95% Citation Check, Entity Diff, Hallucination Gate)"]:::agent
        
        D_Ledger[("Claim & Evidence Ledger\n(Firestore State)")]:::data

        D_Source --> A_Claims
        A_Claims -->|Verbatim Match Verified| A_Corrob
        A_Claims -.->|Unmatched Quote| DropQuote[/"Drop Claim"/]
        A_Corrob --> D_Ledger
        D_Ledger --> A_Lenses
        D_Ledger --> A_Research
        A_Lenses & A_Research --> A_Synth
        A_Synth --> A_QA
    end

    %% Editorial Gate Phase
    subgraph Phase3 ["3. Editorial Gate & Human-in-the-Loop"]
        G_Risk{"Evaluate Risk Tier\n& QA Flags"}:::gate
        G_Editor{"Editor Studio Approval\n(Review Diff & Numbers)"}:::gate
        
        A_QA --> G_Risk
        G_Risk -->|Sensitive Risk / QA Flags| G_Editor
        G_Risk -->|Low Risk & Auto-Publish Enabled| G_AutoApproved[/"Auto-Approve Low Risk"/]:::pub
        G_Editor -->|Approved| G_Proceed[/"Proceed to Production"/]:::pub
        G_Editor -->|Rejected / Edited| E_Patch[/"Edit Claim / Re-synthesize"/]
        E_Patch --> A_Synth
        G_AutoApproved --> G_Proceed
    end

    %% Production & Media Factory Phase
    subgraph Phase4 ["4. Localization & Media Factory (services/media-worker)"]
        M_Script["Stage 7: Base Script Assembly\n(Claim IDs Mapped to Spoken Lines)"]:::agent
        M_Localize["Stage 8: Multilingual Localization\n(13 JAPAC Languages + Glossary Lock)"]:::agent
        M_BackTrans{"Back-Translation Judge Check\n(Gemini Verifies Semantic Fidelity)"}:::gate
        M_TTS["Gemini TTS Engine\n(Voice Persona per Market / Regional Language)"]:::media
        M_Visuals["Scene Assembler\n(Veo Idle Presenter, Cards, Maps, Disclosures)"]:::media
        M_FFmpeg["FFmpeg Render Engine\n(9:16 Vertical & 16:9 Landscape + HLS + VTT)"]:::media
        
        D_Media[("Rendered Media Assets\n(Cloud Storage Bucket)")]:::data

        G_Proceed --> M_Script
        M_Script --> M_Localize
        M_Localize --> M_BackTrans
        M_BackTrans -->|Pass| M_TTS
        M_BackTrans -->|Fidelity Failure| M_Localize
        M_TTS --> M_Visuals
        M_Visuals --> M_FFmpeg
        M_FFmpeg --> D_Media
    end

    %% Publishing & Distribution Phase
    subgraph Phase5 ["5. Omni-Channel Publishing & Consumer Delivery"]
        P_Package["Stage 9: Channel Packaging\n(YouTube Meta, X Threads, Reels, WhatsApp)"]:::agent
        P_Publish["Publisher Service\n(services/publisher)"]:::pub
        
        Pub_Web["OpenLens Web PWA\n(Next.js on Cloud Run/Vercel)"]:::pub
        Pub_Mobile["OpenLens Native Mobile\n(Expo iOS & Android)"]:::pub
        Pub_YT["YouTube Channels\n(Global, National, Regional)"]:::pub
        Pub_Social["Social Networks\n(X, Instagram Reels, Facebook)"]:::pub
        Pub_WA["WhatsApp Cloud API\n(Opt-in Regional Subscribers)"]:::pub

        D_Media & G_Proceed --> P_Package
        P_Package --> P_Publish
        
        P_Publish --> Pub_Web
        P_Publish --> Pub_Mobile
        P_Publish --> Pub_YT
        P_Publish --> Pub_Social
        P_Publish --> Pub_WA
    end

    %% Citizen Interaction
    subgraph Phase6 ["6. Citizen Experience & Verification"]
        User_Read["Reader Explores Story Lenses\n& Taps Evidence Quotes"]
        User_FactCheck["Reader Fact-Checks Custom Statement\nat '/verify'"]
        
        Pub_Web & Pub_Mobile --> User_Read
        User_FactCheck -->|Embed & Match| D_Ledger
    end
```

---

### 3.2 Detailed Agentic Story Processing Pipeline

This diagram zooms into the **10-Stage Agent Execution Pipeline** managed by the Google ADK and Gemini reasoning engine.

```mermaid
flowchart TD
    classDef stage fill:#f8fafc,stroke:#2563eb,stroke-width:2px;
    classDef check fill:#fef2f2,stroke:#ef4444,stroke-width:1.5px;
    classDef store fill:#ecfdf5,stroke:#059669,stroke-width:1.5px;

    Start([Input: Allowlisted URLs / Wire Batch]) --> S1

    subgraph S1 ["Stage 1: Claim Extraction (Gemini Flash)"]
        S1_Run["Extract Atomic Claims\nExtract Direct Speaker Attribution\nCapture Verbatim Supporting Quote"]:::stage
        S1_Val{"Deterministic Verifier:\nDoes quoted text exist\nverbatim in raw source?"}:::check
        S1_Pass["Save Validated Claims\nRecord Precise Character Offsets"]:::store
        S1_Fail["Drop Unmatched Claim\nIncrement droppedClaims Counter"]
        
        S1_Run --> S1_Val
        S1_Val -->|Yes| S1_Pass
        S1_Val -->|No| S1_Fail
    end

    S1_Pass --> S2

    subgraph S2 ["Stage 2: Deterministic Corroboration Engine"]
        S2_Root["Detect Shared Press Releases & Syndication\n(Cluster by Content Hash / URL Domain)"]:::stage
        S2_Calc["Count Independent Root Sources\nIdentify Contradictory Assertions"]:::stage
        S2_Assign["Assign Rule-Based Evidence State:\n• supported (>=2 independent roots)\n• attributed (single source assertion)\n• contested (conflicting reports)\n• unverified (insufficient backing)"]:::store
        
        S2_Root --> S2_Calc --> S2_Assign
    end

    S2_Assign --> S3 & S4

    subgraph S3 ["Stage 3: Multi-Lens Perspective Analysis"]
        S3_Table["Lookup Source Rating in Static Allowlist\n(Left / Center / Right / Unrated)"]:::stage
        S3_Frame["Generate Framing Summaries\n(Strictly Disclosed as 'Model-Generated')"]:::stage
        S3_Lanes["Synthesize Perspectives into 3 Contrast Lanes"]:::store
        
        S3_Table --> S3_Frame --> S3_Lanes
    end

    subgraph S4 ["Stage 4: Grounded Official Research (Gemini Pro)"]
        S4_Search["Google Search Grounding & Official Portals\n(Targeting Acts, Court Orders, Gazette Releases)"]:::stage
        S4_Context["Structure Legal & Official Context Items\nConstruct Verified Chronological Timeline"]:::store
        
        S4_Search --> S4_Context
    end

    S3_Lanes & S4_Context --> S5

    subgraph S5 ["Stage 5: Editorial Synthesis (Gemini Pro Reasoning)"]
        S5_Draft["Draft Neutral Headline & Overview\nPartition Findings into Sections:\n• established (citations MUST be 'supported')\n• attributed (cites primary statements)\n• contested (lays out explicit disagreement)\n• unknown & would_change (critical blindspots)"]:::stage
        S5_Lock["Enforce Strict Citation Schema:\nEvery factual sentence MUST cite claimIds[]"]:::store
        
        S5_Draft --> S5_Lock
    end

    S5_Lock --> S6

    subgraph S6 ["Stage 6: Multi-Critic QA & Risk Classification"]
        S6_C1{"Deterministic Citation Check:\nAre >=95% of factual\nsentences cited?"}:::check
        S6_C2{"NER & Number Diff:\nDo entities, numbers, and dates\nmatch the Ledger exactly?"}:::check
        S6_C3["Gemini Critic:\nDetect Subtle Bias or Unbacked Inferences"]:::stage
        S6_Risk["Classify Story Risk Tier:\n• Low: Routine civic/tech updates\n• Sensitive: Politics, conflict, legal accusations"]:::store
        
        S6_C1 -->|Pass| S6_C2
        S6_C2 -->|Pass| S6_C3 --> S6_Risk
        S6_C1 -->|Fail <95%| S5_Draft
        S6_C2 -->|Mismatch| S5_Draft
    end

    S6_Risk --> End([Ready for Editorial Gate / Script Generation])
```

---

### 3.3 Multilingual Video Factory Architecture & Pipeline

This diagram shows how OpenLens creates broadcast-ready news videos with forced subtitles and AI disclosures across two aspect ratios (9:16 and 16:9).

```mermaid
flowchart TD
    classDef proc fill:#f8fafc,stroke:#6366f1,stroke-width:2px;
    classDef media fill:#faf5ff,stroke:#a855f7,stroke-width:1.5px;
    classDef decision fill:#fff1f2,stroke:#f43f5e,stroke-width:2px;
    classDef file fill:#f0fdf4,stroke:#22c55e,stroke-width:1.5px;

    InputLedger[("Approved Assessment\n& Claims Ledger")] --> VF_Script

    subgraph StepA ["1. Scripting & Semantic Integrity"]
        VF_Script["Build Master English Script\n(45-90s Spoken Cadence, Anchor Beats,\nLine-by-Line Claim ID Mappings)"]:::proc
        VF_Localize["Localize into Market Languages\n(en, ja, hi, te, ta, ko, zh-Hant, etc.\nGlossary Lock for Names/Numbers)"]:::proc
        VF_BackTrans["Gemini Back-Translation:\nTranslate localized text back to English"]:::proc
        VF_Judge{"Semantic Fidelity Judge:\nDoes back-translation match\napproved master script?"}:::decision

        VF_Script --> VF_Localize --> VF_BackTrans --> VF_Judge
        VF_Judge -->|Divergence Detected| VF_Localize
    end

    subgraph StepB ["2. Voice Narration & Audio Mastering"]
        VF_TTS["Gemini TTS Narration:\nAssigned Persona Voice per Region\n(e.g., Japanese Kenji, Hindi Priya)"]:::media
        VF_Align["Generate Forced Word Timing\n(Output WebVTT / SRT Captions)"]:::media
        VF_Loudness["Audio Mastering:\nEBU R128 Loudness Normalization (-16 LUFS)"]:::media

        VF_Judge -->|Passed| VF_TTS
        VF_TTS --> VF_Align --> VF_Loudness
    end

    subgraph StepC ["3. Dynamic Visual Scene Construction"]
        VF_Presenter["Presenter Video Engine:\nVeo Idle-Motion Video Loop\n(or 4K Still Portrait with Subtle Motion)"]:::media
        VF_Cards["Template Graphic Renderer:\n• Lower-Third Headline Bar\n• Live Claim & Source Badge\n• Key Metrics & Figures Highlight"]:::media
        VF_Broll["Media Assets Desk:\n• Wikimedia Commons Credited Photos\n• Natural Earth Vector Locator Maps\n• Optional Labelled AI Illustrations"]:::media
        VF_Disclosure["Mandatory Disclosure Overlay:\n'AI Presenter / AI-Generated Newsroom'"]:::media

        VF_Presenter & VF_Cards & VF_Broll & VF_Disclosure --> VF_Comp
    end

    subgraph StepD ["4. FFmpeg Dual-Aspect Composition"]
        VF_Comp["Scene Compositor (Dual Layouts):"]:::proc
        VF_916["9:16 Vertical Video\n(Reels / Shorts / WhatsApp)\nAnchor on bottom, evidence on top"]:::file
        VF_169["16:9 Landscape Video\n(YouTube Broadcast Explainer)\nSplit-screen: Anchor left, dossier right"]:::file
        VF_HLS["FFmpeg HLS Segmenter\n(Adaptive Bitrate for Mobile Streaming)"]:::file

        VF_Loudness --> VF_Comp
        VF_Comp --> VF_916 & VF_169
        VF_916 --> VF_HLS
    end

    VF_916 & VF_169 & VF_HLS --> OutputAssets[("Cloud Storage / CDN\nManifest JSON Ready for Distribution")]
```

---

### 3.4 Reactive Correction Propagation Engine Flow

This diagram illustrates how OpenLens guarantees verifiable transparency by traversing the output dependency DAG when an editor updates a claim.

```mermaid
flowchart TD
    classDef edit fill:#eff6ff,stroke:#3b82f6,stroke-width:2px;
    classDef alert fill:#fef2f2,stroke:#dc2626,stroke-width:2px;
    classDef task fill:#fefce8,stroke:#ca8a04,stroke-width:2px;
    classDef action fill:#f0fdf4,stroke:#16a34a,stroke-width:2px;

    EditorPatch(["Editor Submits Claim Patch\n(e.g., Claim #14 State: Supported -> Contested)"]):::edit --> S_Patch

    subgraph Engine ["Correction Engine (services/api/corrections.ts)"]
        S_Patch["1. Validate Patch & Mandatory Reason\nVerify Editor Permissions"]:::edit
        S_Bump["2. Bump Story Version (V -> V+1)\nUpdate Claim State & Version Timestamp"]:::edit
        S_DAG["3. Traverse Dependency DAG via impactedOutputs():\n• Find outputs where claimIds contains changedClaim\n• Transitively follow dependsOn edges (e.g. Script -> Channel Package)"]:::alert
        S_Stale["4. Invalidate Impacted Outputs:\nFlip status to 'needs_review'\nSet staleReason with Version Diff"]:::alert
        S_Pubs["5. Identify Published Publications:\nMark live social publications as 'needs_correction'"]:::alert
        S_Event["6. Append Immutable CorrectionEvent Record\n(fromVersion, toVersion, changedClaims, affectedOutputs)"]:::edit

        S_Patch --> S_Bump --> S_DAG --> S_Stale --> S_Pubs --> S_Event
    end

    S_Event --> ReaderImpact & PublisherImpact

    subgraph ReaderImpact ["Real-Time Reader Experience (Web & Mobile)"]
        R_Banner["Display Visible Correction Banner:\n'Story Updated to vN: Claim #14 revised'"]:::alert
        R_Audit["Publish Public Audit Log:\nShows exactly what changed and why"]:::action
        
        R_Banner --> R_Audit
    end

    subgraph PublisherImpact ["Multi-Channel Reactive Fixer (services/publisher)"]
        P_YT["YouTube Publisher Task:\n• Post pinned comment explaining correction\n• Update video description with revised ledger link\n• Queue video re-render if fundamental error"]:::task
        P_X["X Publisher Task:\n• Post threaded reply with correction tag\n• Link to updated evidence dossier"]:::task
        P_Meta["Meta Publisher Task (FB / IG):\n• Edit Facebook post copy with correction disclaimer\n• Update Instagram caption and carousel card"]:::task
        P_WA["WhatsApp Channel:\n• Broadcast correction bulletin to opted-in list"]:::task

        P_YT & P_X & P_Meta & P_WA --> P_Resolve["Mark Correction Task Resolved\nSync Publications to Ledger Version V+1"]:::action
    end
```

---

### 3.5 "Verify This" Citizen Fact-Checking Process Flow

This flowchart diagrams the `/verify` subsystem, where a citizen enters an arbitrary claim and the platform checks it against indexed ledgers using vector similarity and rule-based logic.

```mermaid
flowchart TD
    classDef user fill:#eff6ff,stroke:#2563eb,stroke-width:2px;
    classDef embed fill:#fdf4ff,stroke:#c026d3,stroke-width:2px;
    classDef judge fill:#fffbeb,stroke:#d97706,stroke-width:2px;
    classDef rule fill:#f0fdf4,stroke:#15803d,stroke-width:2px;

    UserQuery(["Citizen Enters Statement at '/verify'\n(8 to 600 Characters)"]):::user --> CheckRate

    CheckRate{"Rate Limit Check\n(<= 12 req/min per IP)"}
    CheckRate -->|Exceeded| BlockUser[/"HTTP 429 Too Many Requests"/]
    CheckRate -->|Allowed| GenerateEmbedding

    subgraph VectorMatch ["Step 1: Multilingual Embedding Match"]
        GenerateEmbedding["Embed Statement with Gemini Multilingual Embeddings"]:::embed
        ScanLedgers["Compute Cosine Similarity against all\nindexed claims in published story ledgers"]:::embed
        FilterMatch{"Is Cosine Similarity\n>= 0.74 Threshold?"}

        GenerateEmbedding --> ScanLedgers --> FilterMatch
    end

    FilterMatch -->|No Match < 0.74| UncoveredFlow
    FilterMatch -->|Matches Found| TopMatches["Retrieve Top Matching Claims (Max 5)\nExtract Evidence State & Source Citations"]

    subgraph LLMRelation ["Step 2: Relational Classification (Gemini Flash)"]
        TopMatches --> LLMJudge["Classify Semantic Relation for Each Claim:\n• supports (statement matches claim meaning)\n• contradicts (statement says opposite of claim)\n• related (statement touches topic but differs in facts)\n[Strict Prompt: Model can only assess given claim texts]"]:::judge
    end

    subgraph RuleStatus ["Step 3: Deterministic Verdict Assignment (computeStatus)"]
        LLMJudge --> Rules

        Rules{"Evaluate Deterministic Status Rules\n(No Model Hallucination Allowed)"}:::rule

        Rules -->|Claim says same AND state is supported| St_Supp["Status: 'Supported'\n(Backed by verified primary evidence)"]:::rule
        Rules -->|Supported claim says opposite| St_Contra["Status: 'Contradicted'\n(Directly refuted by verified evidence)"]:::rule
        Rules -->|Contested claim involved OR mixed support/contradict| St_Disp["Status: 'Disputed'\n(Sources or reporting in active conflict)"]:::rule
        Rules -->|Matches only attributed / unverified claims| St_Unconf["Status: 'Not yet confirmed'\n(Asserted by single source, uncorroborated)"]:::rule
        Rules -->|Only 'related' claims found| St_Covered["Status: 'We cover the topic, not this exact claim'"]:::rule
    end

    subgraph UncoveredFlow ["Step 4: Editorial Queue Registration"]
        Uncovered["Status: 'We haven't covered this yet'"]:::rule
        QueueStatement["Anonymize & Enqueue Query into\nStudio Verify Queue (/v1/studio/verify-queue)"]
        
        Uncovered --> QueueStatement
    end

    St_Supp & St_Contra & St_Disp & St_Unconf & St_Covered & Uncovered --> ResponsePayload[("JSON Response Card:\n• Status Headline & Rule Explanation\n• Matching Findings with Source Quotes\n• Link to Full Claim Dossier\n• Share URL '/verify?q=...'")]
```

---

## 4. Architectural Traceability Matrix

This table maps the functional components in the process diagrams to the specific code packages and services within the repository.

| Diagram Subsystem | Workspace Package | Key Modules / Source Files | Core Dependencies |
|---|---|---|---|
| **Schemas & Data Contracts** | `packages/schemas` | [`ledger.ts`](packages/schemas/src/ledger.ts), [`outputs.ts`](packages/schemas/src/outputs.ts), [`ops.ts`](packages/schemas/src/ops.ts) | Zod, TypeScript |
| **Model Registry & Config** | `packages/config` | `japac.ts`, `models.ts`, `channels.ts` | Shared Config |
| **Ingestion & Discovery** | `services/agents`, `services/api` | [`intake.ts`](services/agents/src/intake.ts), [`discovery.ts`](services/agents/src/discovery.ts), [`ingest.ts`](services/api/src/ingest.ts), [`robots.ts`](services/agents/src/robots.ts) | Cheerio, GDELT, RSS-Parser |
| **Claims & Corroboration** | `services/agents` | [`claims.ts`](services/agents/src/claims.ts), [`corroborate.ts`](services/agents/src/corroborate.ts) | Gemini 1.5/2.0 Flash, Regex Verifier |
| **Synthesis & QA Critique** | `services/agents` | [`synthesis.ts`](services/agents/src/synthesis.ts), [`qa.ts`](services/agents/src/qa.ts), [`research.ts`](services/agents/src/research.ts) | Gemini Pro (Reasoning + Search Grounding) |
| **Scripting & Localization** | `services/agents` | [`script.ts`](services/agents/src/script.ts), [`channels.ts`](services/agents/src/channels.ts) | Gemini Pro, Back-Translation Judge |
| **Video Factory (Rendering)** | `services/media-worker` | [`render.ts`](services/media-worker/src/render.ts), [`tts.ts`](services/media-worker/src/tts.ts), [`scenes.ts`](services/media-worker/src/scenes.ts), [`beats.ts`](services/media-worker/src/beats.ts) | Vertex AI Gemini TTS, Veo, FFmpeg, Canvas |
| **Correction Engine** | `services/api` | [`corrections.ts`](services/api/src/corrections.ts), [`store.ts`](services/api/src/store.ts) | Firestore, Graph Traversal |
| **Omni-Channel Publisher** | `services/publisher` | [`base.ts`](services/publisher/src/base.ts), `channels/youtube.ts`, `channels/meta.ts`, `channels/x.ts` | YouTube Data API, Meta Graph API, X API |
| **Citizen Verification** | `services/api` | [`verify.ts`](services/api/src/verify.ts) | Gemini Multilingual Embeddings, Vector Search |
| **Reader Web PWA** | `apps/web` | `app/story/[id]/page.tsx`, `components/verify/verify-box.tsx`, `components/ledger/` | Next.js 14, Tailwind CSS, Lucide Icons |
| **Reader Mobile App** | `apps/mobile` | `app/story/[id].tsx`, `components/LensPager.tsx` | Expo SDK, React Native Reanimated, Expo Video |
