import type { Channel } from "@openlens/schemas";
import { appPublisher } from "./channels/app.js";
import { facebookPublisher } from "./channels/facebook.js";
import { instagramPublisher } from "./channels/instagram.js";
import { whatsappPublisher } from "./channels/whatsapp.js";
import { xPublisher } from "./channels/x.js";
import { youtubePublisher } from "./channels/youtube.js";
import type { ChannelPublisher } from "./types.js";

export type { ChannelPublisher, PublishContext, PublishOptions, ValidationResult, RequestSpec, PublishErrorCode } from "./types.js";
export { PublishError } from "./types.js";
export { sendPush, setPushTokenProvider } from "./push.js";
export { verifyWhatsAppWebhook, verifyMetaSignature } from "./channels/whatsapp.js";
export { HttpError, redact } from "./http.js";
export { hasAiDisclosure, xWeightedLength } from "./util.js";
export { withHashtags, hashtagsFor, cleanTag } from "./hashtags.js";

const PUBLISHERS: Record<Channel, ChannelPublisher> = {
  app: appPublisher,
  youtube: youtubePublisher,
  x: xPublisher,
  instagram: instagramPublisher,
  facebook: facebookPublisher,
  whatsapp: whatsappPublisher,
};

export function getPublisher(channel: Channel): ChannelPublisher {
  const p = PUBLISHERS[channel];
  if (!p) throw new Error(`unknown channel: ${channel}`);
  return p;
}

export function channelStatuses(): { channel: Channel; live: boolean; reason?: string }[] {
  return (Object.keys(PUBLISHERS) as Channel[]).map((channel) => ({ channel, ...PUBLISHERS[channel].status() }));
}
