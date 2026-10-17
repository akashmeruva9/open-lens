# Publishing videos to the shared channels (team guide)

Several people can run their own OpenLens deployment (their own Google Cloud project) and still publish to the **same** social channels. This page is how to do that without stepping on each other.

Channels today: YouTube **Open Lens Global** (`@openlensglobal`, English) and **Open Lens Japan** (`@openlensjapan`, Japanese). Instagram and X follow once those accounts exist.

## How credentials work (read this first)

- Every Google Cloud project has **its own OAuth client**. A refresh token only works with the client that issued it, so **tokens are not shared between projects**. Nobody sends a token or a client secret to anyone.
- Each person authorizes the same channels once, from their own project, and keeps the result in their own `~/.openlens/youtube.env`.
- Channel access is by invitation: the channel owner adds you as **Manager** (YouTube Studio → Settings → Permissions → Invite). You then see the channels in the account chooser during authorization.
- Quotas (YouTube API) are per project, so everyone has their own allowance.

## One-time setup

1. Clone the repo and install:
   ```bash
   git clone https://github.com/akashmeruva9/open-lens.git && cd open-lens
   npm install
   npm run build -w @openlens/schemas -w @openlens/config -w @openlens/client -w @openlens/agents -w @openlens/media-worker -w @openlens/publisher
   ```
2. Sign in to Google Cloud for **your** project:
   ```bash
   gcloud auth login
   gcloud auth application-default login
   gcloud config set project <your-project-id>
   ```
3. In your project's Cloud console → **Google Auth Platform**: set the app to *External / Testing*, add **your own Google email as a test user**, then **Clients → Create client → Desktop app**. Download the JSON. Keep it outside the repo (`~/.openlens/youtube-client.json`, `chmod 600`). Never commit it or paste it in chat.
4. Authorize each channel (a browser opens; sign in with the Google account that was invited as Manager, and pick the channel):
   ```bash
   export YOUTUBE_CLIENT_ID=...      # from the JSON
   export YOUTUBE_CLIENT_SECRET=...  # from the JSON
   npm run youtube-auth -w @openlens/publisher -- --tier en   # choose Open Lens Global
   npm run youtube-auth -w @openlens/publisher -- --tier ja   # choose Open Lens Japan
   ```
   Each run prints one line, `YOUTUBE_REFRESH_TOKEN_EN=...` (then `_JA`). Copy **only that line** (npm also prints banner lines).
5. Put everything in `~/.openlens/youtube.env` (`chmod 600`):
   ```
   YOUTUBE_CLIENT_ID=...
   YOUTUBE_CLIENT_SECRET=...
   YOUTUBE_REFRESH_TOKEN_EN=...
   YOUTUBE_REFRESH_TOKEN_JA=...
   YOUTUBE_PRIVACY_STATUS=private
   ```
   The publish command loads this file automatically. Routing is by language: `en` posts to Global, `ja` to Japan (`YOUTUBE_REFRESH_TOKEN_<LANG>`).
6. In your repo `.env` set the public site URL (story links in posts and QR codes) and your data:
   ```
   OPENLENS_PUBLIC_URL=https://<your-web-service-url>
   STORE=firestore
   GOOGLE_CLOUD_PROJECT=<your-project-id>
   ASSETS_BUCKET=<your-project-id>-openlens-media
   ```

## Post everywhere with one command

```bash
npm run publish -w @openlens/api -- <storyId> --all                         # dry run: what would go where
npm run publish -w @openlens/api -- <storyId> --all --live --approve        # post for real
npm run publish -w @openlens/api -- <storyId> --all --langs en --channel youtube --live --approve   # narrow it down
```
`--all` covers **YouTube, Instagram (Reel) and Facebook** for every language the story has, each to the account that language is routed to:

| Language | YouTube | Instagram | Facebook |
|---|---|---|---|
| `en` | Open Lens Global | `@openlensglobal` | Open Lens Global |
| `ja` | Open Lens Japan | `@openlensjapan` | Open Lens Japan |

It **skips** anything already published, a post whose video is not approved, and any channel or language without credentials, and ends with a summary table. `--republish` posts again although a live post exists (for example after re-rendering the video; the old post stays up).

**Everyone publishes through the same shared store.** "Already published" is read from the database, so two people running the command can only post a story once if they use the same one. Set this in your repo `.env` (you are Owner on the shared project):
```
STORE=firestore
GOOGLE_CLOUD_PROJECT=open-lens-511319
ASSETS_BUCKET=open-lens-511319-openlens-media
```
Your own tokens (YouTube, Meta) stay on your machine; only the posting record is shared. If you run your own separate deployment instead, you lose this protection, so agree who posts first.

**Hashtags are added automatically** at publish time (`services/publisher/src/hashtags.ts`, no model call): the story's own tags first, then topic tags in the post's language, the market (for example `#Japan`), a couple of broad news tags and `#OpenLens`. Instagram gets up to 10, YouTube gets a line at the end of the description (YouTube shows the first three above the title; `#Shorts` is added for vertical video), Facebook gets 4. A tag already in the text is never repeated.

**Which account is which** is listed in `SOCIAL_ACCOUNTS` (`packages/config/src/japac.ts`). An account marked `pending: true` is skipped when posting. Remove that flag when the account exists and its credentials are saved.

### Instagram and Facebook credentials (once per account)
1. In your Meta app (Development mode) add the permissions `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`, `pages_manage_posts` and `business_management` (Use cases, Permissions and features).
2. Generate a user token with those permissions in the Graph API Explorer, selecting the Page and the Instagram account.
3. Run `npm run meta-auth -w @openlens/publisher -- --lang en --app-id <your app id>` in a terminal (it asks for the app secret and token as hidden input) and again with `--lang ja` for the Japan Page. It writes `IG_USER_ID_<LANG>`, `FB_PAGE_ID_<LANG>` and `META_PAGE_ACCESS_TOKEN_<LANG>` to `~/.openlens/instagram.env`.

Instagram posts are public the moment they are posted and the API cannot delete them; delete by hand in the app. YouTube uploads are private unless `YOUTUBE_PRIVACY_STATUS=public` (and an unaudited API project may force private regardless).

## Publishing a video

Always dry-run first. A dry run saves nothing and prints the exact requests, with tokens redacted:
```bash
npm run publish -w @openlens/api -- <storyId> --lang en            # dry run
npm run publish -w @openlens/api -- <storyId> --lang en --live --approve   # real upload
```
- `--live` refuses unless the output is already approved or you pass `--approve`. That is the human sign-off, so read the dry run first.
- Uploads are **private** unless `YOUTUBE_PRIVACY_STATUS` says otherwise. Check the video in Studio, then make it public by hand.
- The video must be approved and in the bucket. A story needs a YouTube post (`yt_meta`) for that language; to add a language to an existing story, see below.
- Find story ids on the live site (the URL is `/story/<storyId>`).

## Adding a language to an existing story

```bash
npm run add-lang -w @openlens/api -- <storyId> ja              # translate the English script, build posts, render the video
npm run add-lang -w @openlens/api -- <storyId> ja --no-render   # script and posts only
npm run add-lang -w @openlens/api -- <storyId> ja --render-only # render after reviewing the script
```
It leaves the English script, videos and approvals untouched. Rendering costs a few cents (images, TTS); read the Japanese script before rendering.

Fixing stored posts without regenerating them: `npm run relink -w @openlens/api -- --replace "old" "new"` (dry run unless `--apply`; only unpublished posts).

## Agree these rules before posting anything (important)

Two deployments do **not** share a database. Both can build a video for the same news item, and the "already published" record lives in each project's own Firestore, so **nothing stops a double post**. Pick one rule and stick to it:

- **One publisher.** Only one deployment publishes live to a given channel; everyone else does dry runs and private uploads. (Recommended for demos.)
- **Or split by channel.** One person owns Global, the other owns Japan.
- **Or announce each story** before posting it.

Other rules:
- Nothing goes public without a person reading it. Videos rendered before 16 Oct 2026 carry an on-screen line claiming editor review that is not true; re-render them before publishing.
- Every post must keep the AI-presenter disclosure and the synthetic-media flag. The publisher refuses posts without it.
- While the Google app is in *Testing*, refresh tokens expire after **7 days**. If an upload fails with an auth error, rerun step 4.
- Custom thumbnails need a phone-verified channel (both channels are verified).
- Do not commit `.env`, `~/.openlens/*`, client JSON files or tokens.
