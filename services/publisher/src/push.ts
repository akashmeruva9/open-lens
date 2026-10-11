import { GoogleAuth } from "google-auth-library";
import { env } from "./env.js";
import { formatError, http } from "./http.js";
import { log } from "./util.js";

const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
type TokenProvider = () => Promise<string>;

let provider: TokenProvider | undefined;
let auth: GoogleAuth | undefined;

/** Override how the FCM access token is obtained (tests, or a custom credential). Pass undefined to reset to ADC. */
export function setPushTokenProvider(p: TokenProvider | undefined): void {
  provider = p;
}

async function accessToken(): Promise<string> {
  if (provider) return provider();
  auth ??= new GoogleAuth({ scopes: [SCOPE] });
  const t = await auth.getAccessToken();
  if (!t) throw new Error("ADC returned no access token");
  return t;
}

/**
 * FCM HTTP v1 topic push (story approved / corrected). Never throws: returns sent=false with a reason
 * when unconfigured or on failure so the publish flow is never blocked by notifications.
 */
export async function sendPush(opts: {
  topic: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}): Promise<{ sent: boolean; reason?: string }> {
  const project = env("FCM_PROJECT_ID");
  if (!project) return { sent: false, reason: "FCM_PROJECT_ID not set; push disabled" };
  const topic = opts.topic.replace(/^\/topics\//, "");
  if (!/^[a-zA-Z0-9-_.~%]{1,900}$/.test(topic)) return { sent: false, reason: `invalid FCM topic name: ${opts.topic}` };
  if (opts.data && Object.values(opts.data).some((v) => typeof v !== "string")) return { sent: false, reason: "FCM data values must be strings" };

  const message = {
    topic,
    notification: { title: opts.title, body: opts.body },
    ...(opts.data ? { data: opts.data } : {}),
    android: { priority: "high" },
    apns: { headers: { "apns-priority": "10" } },
    ...(opts.data?.url ? { webpush: { fcm_options: { link: opts.data.url } } } : {}),
  };
  try {
    const token = await accessToken();
    const res = await http({
      method: "POST",
      url: `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(project)}/messages:send`,
      label: "fcm.send",
      headers: { Authorization: `Bearer ${token}` },
      json: { message },
      retry5xx: true,
    });
    log("push.sent", { topic, name: res.json?.name });
    return { sent: true };
  } catch (err) {
    const reason = formatError(err);
    log("push.failed", { topic, error: reason });
    return { sent: false, reason };
  }
}
