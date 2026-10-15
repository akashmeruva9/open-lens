// robots.txt check for article fetches. The wire only reads pages a site allows OpenLensBot (or
// every crawler) to fetch. Unreachable robots.txt (404/5xx/network) follows the usual convention:
// 4xx = allowed, 5xx/network = not allowed this time.

export const BOT_TOKEN = "openlensbot";
const TTL_MS = 6 * 3600_000;

interface Rule { allow: boolean; pattern: string }
const cache = new Map<string, { at: number; rules: Rule[] | "all" | "none" }>();

/** Rules that apply to OpenLensBot: its own group if present, else the `*` group. */
export function parseRobots(txt: string, agent = BOT_TOKEN): Rule[] {
  const groups: { agents: string[]; rules: Rule[] }[] = [];
  let cur: { agents: string[]; rules: Rule[] } | undefined;
  let lastWasAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    const val = m[2]!.trim();
    if (key === "user-agent") {
      if (!cur || !lastWasAgent) groups.push((cur = { agents: [], rules: [] }));
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (!cur) continue;
      if (key === "disallow" && val) cur.rules.push({ allow: false, pattern: val });
      if (key === "allow" && val) cur.rules.push({ allow: true, pattern: val });
    }
  }
  const own = groups.filter((g) => g.agents.some((a) => a !== "*" && agent.includes(a)));
  const chosen = own.length ? own : groups.filter((g) => g.agents.includes("*"));
  return chosen.flatMap((g) => g.rules);
}

function toRegex(pattern: string): RegExp {
  const anchored = pattern.endsWith("$");
  const body = (anchored ? pattern.slice(0, -1) : pattern).split("*").map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`);
}

/** Longest matching rule wins; Allow wins ties. No matching rule = allowed. */
export function isAllowed(rules: Rule[], pathAndQuery: string): boolean {
  let best: Rule | undefined;
  for (const r of rules) {
    if (!toRegex(r.pattern).test(pathAndQuery)) continue;
    if (!best || r.pattern.length > best.pattern.length || (r.pattern.length === best.pattern.length && r.allow)) best = r;
  }
  return best ? best.allow : true;
}

export async function robotsAllows(url: string, fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<boolean> {
  const u = new URL(url);
  const key = u.origin;
  let entry = cache.get(key);
  if (!entry || now - entry.at > TTL_MS) {
    let rules: Rule[] | "all" | "none";
    try {
      const res = await fetchImpl(`${u.origin}/robots.txt`, {
        headers: { "user-agent": "OpenLensBot/0.1 (+https://openlens.app/bot)" },
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) rules = parseRobots(await res.text());
      else rules = res.status >= 400 && res.status < 500 ? "all" : "none";
    } catch {
      rules = "none";
    }
    entry = { at: now, rules };
    cache.set(key, entry);
  }
  if (entry.rules === "all") return true;
  if (entry.rules === "none") return false;
  return isAllowed(entry.rules, `${u.pathname}${u.search}`);
}

/** Test helper. */
export const clearRobotsCache = () => cache.clear();
