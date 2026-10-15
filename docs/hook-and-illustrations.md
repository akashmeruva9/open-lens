# Spoken hook clip and editorial illustrations (experiment, 2026-10-15)

Run everything from `services/media-worker`. Each paid call is logged to `.data/genai-spend.jsonl` and refused once the
total would pass `GENAI_SPEND_CAP_USD` (default 3). Outputs are cached by a content hash, so re-running costs nothing.

## Spoken hook (`src/hook.ts`, `src/hookreview.ts`)

```bash
node --env-file-if-exists=../../.env --import tsx src/hook.ts maya-apac en "The Reserve Bank of Australia has raised interest rates to 4.60 per cent, the highest in fifteen years." [--duration 4|6|8] [--dry]
node --env-file-if-exists=../../.env --import tsx src/hookreview.ts ../../.data/hooks/<clip>.mp4 maya-apac "<same line>"
```

`generateHookClip({ presenterId, line, lang, aspect?, durationSeconds?, force?, dryRun? })` uses
`veo-3.1-fast-generate-001` (us-central1), image-to-video from `data/presenters/<id>.png` (centre-cropped to 9:16 so
there are no black bars), with audio. It writes `.data/hooks/<id>-<lang>-<hash>.mp4` plus `.wav` (Veo voice only),
`.silent.mp4` and `.json` (prompt, cost, latency). Cost: US$0.10/s, so US$0.80 for 8 s.

Veo cannot lip-sync to supplied audio. It writes its own speech from the quoted line.

Results from the test, one clip each:
- **English (maya-apac):** the face stays on-model, there are no bars, no text and no visible watermark. Speech runs
  from 0.1 to 6.8 s and a blind transcript gets it word for word ("four point six zero percent"). Gemini scored it
  intelligibility 4/5, naturalness 3–5/5 and lip-sync 4/5. The accent is Australian.
- **Hindi (kavya-hi):** the speech is Hindi, and a blind transcript is correct apart from the number, which she says in
  English ("four point sixty"). Lip-sync scored 3/5. She smiles a lot, which is the wrong tone for a rate rise.
- **Veo voice vs. the presenter's Gemini TTS voice:** they clash. They sound like two different people. The TTS reading
  of the same line also runs longer (8.9 s for English, 9.2 s for Hindi) than Veo's ~6.7 s.
- **Muted Veo clip with TTS laid over it:** lip-sync scored 2/5, which is obviously out of sync. Don't use it.
- **Provenance:** the file has an invisible SynthID watermark and a signed Google C2PA manifest. Re-encoding with
  FFmpeg drops the C2PA manifest but not SynthID.

Recommendation: if we use the hook, keep Veo's own voice and use it only for the first line, as a cold open. Then cut
to a graphic or illustration rather than straight back to the anchor face with the TTS voice, so the voice change is
less noticeable. English is fine. Hindi works if we spell numbers out in Hindi words in the line. Keep each line to
about 18 words.

## Illustrations (`src/illustrations.ts`)

```bash
node --env-file-if-exists=../../.env --import tsx src/illustrations.ts <storyId> "<one visual metaphor>" [--aspect 9:16|16:9]
```

`generateIllustration({ prompt, aspect?, storyId, name?, force?, dryRun? })` calls `gemini-nano-banana-2.1` (global) at
about US$0.035 per image. Files go to `.data/illustrations/<storyId>/`. Every prompt is built as:

`ILLUSTRATION_STYLE + "Subject: <metaphor>." + COMPOSITION[aspect] + ILLUSTRATION_RULES`

The house style is flat vector editorial in navy, slate and off-white with one amber accent and slight isometric
perspective. The rules are: no text or digits, no real people, not photoreal, no documents.

Tips for writing the subject:
- Describe objects, not headlines.
- Use one metaphor per beat.
- Avoid abstract forces such as "a weight pressing down". In the test that came out as an ugly block.
- Ask for one seamless background. Asking for a "calm top/bottom zone" made the model draw solid bands.
