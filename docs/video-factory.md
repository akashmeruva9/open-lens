# Video factory (Mani)

Turn the approved ledger into news-style videos per language, two shapes each
(9:16 Reels/Shorts/WhatsApp, 16:9 YouTube), with captions and the AI-presenter
disclosure on every frame, and upload to YouTube (synthetic-media flag set).

Demo languages: en, hi, te, ja. Default auto-render stays `AUTO_MEDIA_LANGS=en`.

## Plan
1. Live baseline render (TTS + video) on `data/seed/sample-story` (fictional); measure time/cost.
2. Presenter portraits (Nano Banana) -> `data/presenters/`.
3. News-style layout v2: lower third, ticker, logo bug, big fact cards, source chip.
4. Illustrative per-scene stills with slow zoom, labelled "AI illustration" (cached).
5. Veo 3.1 Lite intro/outro per presenter; fallback to animated portrait.
6. Music bed (Lyria or free track), ducked under voice.
7. One CLI: render a story in N languages x 2 shapes.
8. YouTube upload (OAuth Desktop client; one channel + playlists per language).
9. Hand-off contract to Pranav: `RenderedAsset` = mp4 URL, captions URL, lang, aspect, claimIds.
10. Pre-render the showcase story for the 3-min demo.

## Cost rules
- Always show an estimated cost before running Veo / image / music generation.
- Veo Lite only. Wire off locally (`INGEST_INTERVAL_MIN=0`). Cloud Run min-instances 0. No GPUs.
- Only Vertex via ADC (leave `GEMINI_API_KEY` empty); AI Studio keys would be billed outside the trial credit.
- Rough budget: first demo story in 4 languages ~ $2.5, later stories ~ $0.8.
