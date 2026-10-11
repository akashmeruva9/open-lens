import { env, graphBase } from "../env.js";
import { http, type HttpResponse } from "../http.js";

/** Graph API call authenticated with a bearer token header (keeps tokens out of URLs and logs). */
export function graph(
  tokenEnv: string,
  method: string,
  pathOrUrl: string,
  label: string,
  init: { json?: unknown; retry5xx?: boolean; base?: string } = {},
): Promise<HttpResponse> {
  const url = /^https:\/\//.test(pathOrUrl) ? pathOrUrl : `${init.base ?? graphBase()}${pathOrUrl}`;
  return http({ method, url, label, headers: { Authorization: `Bearer ${env(tokenEnv) ?? ""}` }, json: init.json, retry5xx: init.retry5xx });
}
