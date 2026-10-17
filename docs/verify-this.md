# Verify this

A visitor pastes a claim at `/verify` and sees what OpenLens's evidence ledgers say about it.

## How it answers (and why it can be trusted)
1. **Match.** The statement is embedded (Gemini embeddings, multilingual) and compared with every claim in every published ledger. Claims under 0.74 similarity are ignored (unrelated claims score about 0.65, real matches 0.79 and up). If embeddings are unavailable it falls back to keyword overlap and says so.
2. **Relate.** A model labels each top match `supports`, `contradicts` or `related`, seeing only the claim texts under short ids (it cannot cite a claim it was not shown) and told to judge only from those texts. Anything doubtful stays `related`. A slow or failing model call means everything is `related`.
3. **Status by rules, not by the model** (`computeStatus` in `services/api/src/verify.ts`):
   | Status | When |
   |---|---|
   | Supported | a claim that says the same is `supported`, and nothing contradicts it |
   | Contradicted | a `supported` claim says the opposite |
   | Disputed | a `contested` claim is involved, or sources both support and contradict |
   | Not yet confirmed | only `attributed` / `unverified` claims say it |
   | We cover the topic, not this exact claim | matches exist but none says it directly |
   | We haven't covered this yet | nothing matches; the statement joins the editors' queue |

It never answers from the model's own knowledge, and the result card says it is only a check against OpenLens's own ledgers.

## API
`POST /v1/verify` with `{ "text": "..." }` (8 to 600 characters) returns `{ status, headline, explanation, findings[], stories[], matching }`; each finding has the claim, its evidence state, attribution, the outlets and links, similarity and relation. Statements with no match are kept (deduplicated, no user data) and listed for editors at `GET /v1/studio/verify-queue`.

Bounds: `VERIFY_PER_MINUTE` (default 12 per visitor), `VERIFY_DAILY_CAP` (500 a day), `VERIFY_MIN_SIMILARITY` (0.74). Each check costs one embedding and one small model call.

## Speed
Claim vectors are computed once and stored per story (state key `claimvec:<storyId>`), and the server warms them and the model at startup (`VERIFY_WARM=0` turns that off). A check then embeds only the statement. The model call takes about 4 s warm; Vertex rate limits can make it slower.

## Web
`apps/web`: page `/verify`, component `components/verify/verify-box.tsx`. `/verify?q=...` re-runs a check, which is how "Share this check" works.
