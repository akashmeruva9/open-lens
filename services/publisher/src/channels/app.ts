import { definePublisher } from "../base.js";

/** The OpenLens app/PWA: the api owns Firestore writes, so publishing here just records the state change. */
export const appPublisher = definePublisher<null>({
  channel: "app",
  kinds: ["script", "video", "audio", "carousel"],
  status: () => ({ live: true }),
  async validate() {
    return { errors: [], warnings: [] };
  },
  async prepare(output, ctx) {
    return { requests: [{ step: "app.publish", method: "NONE", url: ctx.storyUrl, body: { outputId: output.id } }], state: null };
  },
  async execute(_prep, output, ctx) {
    return { externalId: output.id, url: ctx.storyUrl, response: { note: "app publication recorded; no external network call" } };
  },
  async update(pub, output) {
    return { ...pub, status: "corrected", ledgerVersion: output.ledgerVersion };
  },
  async retract(pub) {
    return { ...pub, status: "retracted" };
  },
});
