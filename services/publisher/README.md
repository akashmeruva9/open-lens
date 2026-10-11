# @openlens/publisher

Channel publishing layer for OpenLens (plan.md §7). It's a library: the `api` service imports it, enforces
editor approval and persists the returned `Publication` records. One adapter per channel sits behind a common
interface, so a channel with bad credentials never affects the pipeline.

```ts
import { getPublisher, channelStatuses, sendPush, verifyWhatsAppWebhook } from "@openlens/publisher";

const yt = getPublisher("youtube");
const check = await yt.validate(output, ctx);                // { ok, errors, warnings }
const pub = await yt.publish(output, ctx, { mode: "dry_run" }); // or "live"
const fixed = await yt.update(pub, correctedOutput, { ...ctx, correctionNote: "The vote was 6-3." });
const gone = await yt.retract(pub, ctx);
```

## Contract

| Export | Notes |
|---|---|
| `getPublisher(channel)` | `app`, `youtube`, `x`, `instagram`, `facebook`, `whatsapp` |
| `channelStatuses()` | `{ channel, live, reason? }[]`. `live` = credentials present. Use it for the demo's "live / preview" badges |
| `ChannelPublisher.validate(output, ctx)` | Zod payload schema + `CHANNEL_LIMITS` + disclosure / link / media checks |
| `ChannelPublisher.publish(output, ctx, opts)` | `opts = { mode, scheduleAt?, recipients? }` |
| `ChannelPublisher.update(pub, output, ctx)` | Correction. Status becomes `corrected` (or `needs_correction` if it fails or has to be done by hand) |
| `ChannelPublisher.retract(pub, ctx)` | Status becomes `retracted` (or `needs_correction` if it can't be done through the API) |
| `sendPush({ topic, title, body, data? })` | FCM HTTP v1 topic push. Never throws: returns `{ sent:false, reason }` when unconfigured or on failure |
| `verifyWhatsAppWebhook(query)` | Webhook GET handshake that returns `{ status, body }`. Mount at e.g. `GET /webhooks/whatsapp` |
| `verifyMetaSignature(rawBody, header)` | Checks `X-Hub-Signature-256` on webhook POSTs (`META_APP_SECRET`) |
| `PublishError` | Thrown for refusals. `code` is one of `not_live`, `not_approved`, `validation_failed`, `wrong_channel`, `unsupported`, `bad_request` |

Extensions to the specified interface (all optional and backward compatible):
- `PublishContext.correctionNote?: string`: the text used in the correction note that `update()` appends or posts.
- `PublishOptions.recipients?: string[]`: **WhatsApp only.** E.164 numbers. The api must pass **only subscribers with a
  recorded opt-in consent** (`subscribers/{id}.consent`). Numbers are de-duplicated and masked (last 4 digits) in every response.

### Rules enforced here
- **Never auto-publish.** `publish()` throws `not_approved` unless `output.status` is `approved` (`scheduled`, which means approved and queued, is also accepted).
- **`dry_run` never touches the network.** It validates, then builds the exact request(s) that live mode would send, with placeholders such as
  `{{video_id}}` for values that only exist at runtime. It returns `mode:"dry_run"` and `status:"published"`, with `response.requests`.
  If validation fails, it returns `status:"failed"` with `error` and `response.validation` instead of throwing, so the studio can show why.
- **`live` throws `not_live`** when `status().live` is false, and throws `validation_failed` on validation errors.
  Failures from the upstream API **don't throw**. They return `status:"failed"` with a structured `error` such as
  `youtube.videos.insert.init: HTTP 403 …quota… (after 4 attempts)`.
- **No secrets in output.** Requests built for `dry_run` carry auth *descriptors*, never tokens. Every `response`, `error` and log line
  goes through `redact()`.
- **HTTP** (`src/http.ts`): per-request timeout, then exponential backoff with jitter on 429 and 5xx, honouring `Retry-After`. 5xx is **not** retried
  for non-idempotent creates (tweets, WhatsApp sends, FB posts, IG `media_publish`), because a retry there could duplicate content.

## Channels and env vars

All configuration comes from env vars, which are read when each call runs. In prod they're injected from Secret Manager. See `.env.example`.

| Channel | Required env | Optional env | Live behaviour |
|---|---|---|---|
| app | none | none | Always live. Records the publication; no network call |
| youtube | `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN` *or* `YOUTUBE_REFRESH_TOKEN_{REGIONAL,NATIONAL,INTERNATIONAL}` | `YOUTUBE_PRIVACY_STATUS` (default `private`), `YOUTUBE_CATEGORY_ID` (25), `YOUTUBE_NOTIFY_SUBSCRIBERS` | OAuth refresh, then `videos.insert` resumable upload (snippet with title, description, tags, `defaultLanguage`/`defaultAudioLanguage` = `output.lang`; status with `privacyStatus`, `containsSyntheticMedia`, `selfDeclaredMadeForKids:false`; `localizations`), then `captions.insert` (VTT, if present), then `thumbnails.set` (if present; failure is only a warning). `scheduleAt` sets private + `publishAt`. Update calls `videos.update` on the snippet with a correction note. Retract sets the video to private |
| x | `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET` (OAuth 1.0a) **or** `X_OAUTH2_USER_TOKEN` | `X_MEDIA_UPLOAD` (default off), `X_USERNAME`, `X_API_BASE` | `POST /2/tweets` thread chained with `reply.in_reply_to_tweet_id`. If `X_MEDIA_UPLOAD=true`, chunked v2 media upload and the video goes on post 1. A partial thread comes back as `failed` with `postIds`. Update posts a correction reply. Retract deletes every post |
| instagram | `IG_USER_ID`, `META_PAGE_ACCESS_TOKEN` | `META_GRAPH_VERSION` (v23.0), `IG_POLL_INTERVAL_MS`, `IG_POLL_TIMEOUT_MS` | REELS container from a **public https** `video_url` (`resolveAsset(..., {public:true})`, e.g. a signed GCS URL), polled until `FINISHED`, then `media_publish`, then the permalink is fetched. Carousels use child containers, then a CAROUSEL container. Update posts a correction comment (captions can't be edited through the API). Retract returns `needs_correction` (the API can't delete media) |
| facebook | `FB_PAGE_ID`, `META_PAGE_ACCESS_TOKEN` | `META_GRAPH_VERSION` | `/{page}/feed` (message + link), or `graph-video…/{page}/videos` (`file_url` + description) when `videoOutputId` is set. `scheduleAt` sets `published:false` + `scheduled_publish_time` (10 min to 30 days ahead). Update edits the message or description, adding a correction note. Retract does `DELETE` |
| whatsapp | `WA_PHONE_NUMBER_ID`, `WA_ACCESS_TOKEN` | `WA_TEMPLATES`, `WA_WEBHOOK_VERIFY_TOKEN`, `META_APP_SECRET`, `WA_SEND_INTERVAL_MS` (100), `WA_MAX_RECIPIENTS` (1000) | One `POST /{phone-number-id}/messages` `type:"template"` per opted-in recipient, sent one after another with throttling. `WA_TEMPLATES` describes each approved template (`bodyParams`, `language`, `urlButton` + `urlPrefix`, `disclosureInTemplate`). Update and retract return `needs_correction`, because sent messages can't be edited or recalled. Send a correction digest instead |
| push | `FCM_PROJECT_ID` (+ ADC) | none | FCM HTTP v1 `messages:send` to a topic via `google-auth-library` ADC (scope `firebase.messaging`) |

Shared: `PUBLISHER_HTTP_TIMEOUT_MS` (30000), `PUBLISHER_HTTP_RETRIES` (3), `PUBLISHER_RETRY_BASE_MS` (500), `PUBLISHER_LOG` (`silent` disables logs).

### Validation per channel
- **YouTube:** title ≤ 100 chars, description ≤ 5000, no `<` or `>`, tags ≤ 500 chars total, the description links to `ctx.storyUrl`. If `aiDisclosure` is set, then
  `containsSyntheticMedia` must be true **and** the description must contain disclosure text. A rendered video must resolve, from `videoOutputId`
  or from a `video` output in `dependsOn`.
- **X:** ≤ 8 posts, each ≤ 280 *weighted* chars (URLs count 23; emoji and CJK count 2). The thread contains the story link, plus a disclosure when `aiDisclosure` is set. The video must be ≤ 140 s when media upload is on.
- **Instagram:** the caption plus appended hashtags is ≤ 2200 chars, with ≤ 30 hashtags, and includes a disclosure. The Reel is **9:16 and 5–90 s**. The video URL resolves to public https. Carousel slides need rendered images.
  A missing story link is only a warning, because links in IG captions aren't clickable.
- **Facebook:** the message is ≤ 63206 chars, the link is https and points to the story, and the message includes a disclosure. Any video resolves to public https.
- **WhatsApp:** the parameter count matches `WA_TEMPLATES[templateName].bodyParams`. Params contain no newlines or tabs and no more than 4 consecutive spaces. Params total ≤ 1024 chars. The link is https and points to the story.
  Live mode needs `recipients`. A disclosure that isn't in the params is a warning (the approved template body should carry it).

## YouTube refresh token

1. In GCP, enable the YouTube Data API v3 and create an OAuth client of type **Desktop app**. Add your account as a test user on the consent screen.
2. `YOUTUBE_CLIENT_ID=… YOUTUBE_CLIENT_SECRET=… npm run youtube-auth -w @openlens/publisher -- --tier regional`
3. Open the printed URL, choose the channel, and store the printed `YOUTUBE_REFRESH_TOKEN_REGIONAL=…` in Secret Manager.

Scopes: `youtube.upload` and `youtube.force-ssl` (for captions and `videos.update`). An unverified API project uploads as **private** only.
For the demo, flip videos to public in YouTube Studio.

## Development

```sh
npm run build -w @openlens/schemas -w @openlens/config
npm test -w @openlens/publisher        # mocked fetch; no network
npm run typecheck -w @openlens/publisher
```
