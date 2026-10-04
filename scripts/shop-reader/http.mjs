/** Transparent, bounded crawler. Never bypasses robots.txt, CAPTCHA or rate limits. */
export const USER_AGENT = "BaumarktFinderPriceBot/1.0";
export class CollectionError extends Error {
  constructor(code, message = code) { super(message); this.name = "CollectionError"; this.code = code; }
}
const escape = (text) => text.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
export function parseRobots(text, agent = USER_AGENT) {
  const groups = [], sitemaps = []; let group = null, directives = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim(), colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase(), value = line.slice(colon + 1).trim();
    if (key === "sitemap") { sitemaps.push(value); continue; }
    if (key === "user-agent") {
      if (!group || directives) { group = { agents: [], rules: [], delay: 0 }; groups.push(group); directives = false; }
      group.agents.push(value.toLowerCase());
    } else if (group) {
      directives = true;
      if (["allow", "disallow"].includes(key) && value) group.rules.push({ allow: key === "allow", value });
      if (key === "crawl-delay" && Number.isFinite(Number(value))) group.delay = Number(value) * 1000;
    }
  }
  const bot = agent.toLowerCase();
  const score = (g) => Math.max(-1, ...g.agents.map((a) => a === "*" ? 0 : bot.includes(a) ? a.length : -1));
  const best = Math.max(-1, ...groups.map(score)), selected = best < 0 ? [] : groups.filter((g) => score(g) === best);
  return { rules: selected.flatMap((g) => g.rules), delay: Math.max(0, ...selected.map((g) => g.delay)), sitemaps };
}
export function robotsAllows(policy, url) {
  const target = new URL(url).pathname + new URL(url).search;
  const rules = policy.rules.filter(({ value }) => {
    const end = value.endsWith("$");
    const pattern = (end ? value.slice(0, -1) : value).split("*").map(escape).join(".*");
    return new RegExp(`^${pattern}${end ? "$" : ""}`).test(target);
  }).sort((a, b) => b.value.replace(/\*/g, "").length - a.value.replace(/\*/g, "").length || Number(b.allow) - Number(a.allow));
  return !rules.length || rules[0].allow;
}
export function createPoliteFetcher({ fetchImpl = fetch, minDelayMs = 2000, timeoutMs = 15000, maxBytes = 8_000_000 } = {}) {
  const policies = new Map(), lastRequest = new Map(), stopped = new Set();
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  async function request(url, hosts, delay = minDelayMs, isRobots = false) {
    let current = new URL(url);
    for (let redirect = 0; redirect < 5; redirect++) {
      if (current.protocol !== "https:" || current.username || current.password || !hosts.includes(current.hostname) || current.port) throw new CollectionError("unsafe-url");
      if (stopped.has(current.origin)) throw new CollectionError("blocked");
      await wait(Math.max(0, (lastRequest.get(current.origin) || 0) + delay - Date.now()));
      lastRequest.set(current.origin, Date.now());
      const response = await fetchImpl(current.href, { redirect: "manual", signal: AbortSignal.timeout(timeoutMs), headers: {
        "User-Agent": USER_AGENT, "Accept-Language": "de-DE,de;q=0.9", Accept: "text/html,application/ld+json,application/xml,text/plain;q=0.9" } });
      if ([401, 403, 429].includes(response.status)) { stopped.add(current.origin); throw new CollectionError("blocked", `HTTP ${response.status}`); }
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const next = new URL(response.headers.get("location"), current);
        if (!isRobots) {
          const policy = await getRobots(next.origin, hosts);
          if (!robotsAllows(policy, next.href)) throw new CollectionError("robots-disallowed");
        }
        current = next; continue;
      }
      if (!response.ok) throw new CollectionError(response.status === 404 ? "not-found" : "http-error", `HTTP ${response.status}`);
      if (Number(response.headers.get("content-length")) > maxBytes) throw new CollectionError("response-too-large");
      const reader = response.body.getReader(), chunks = []; let size = 0;
      for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length;
        if (size > maxBytes) { await reader.cancel(); throw new CollectionError("response-too-large"); } chunks.push(value); }
      const body = Buffer.concat(chunks).toString("utf8");
      if (/verify you are human|unusual traffic|request blocked|<title>[^<]*(access denied|captcha)/i.test(body)) {
        stopped.add(current.origin); throw new CollectionError("blocked");
      }
      return { body, url: current.href };
    }
    throw new CollectionError("redirect-limit");
  }
  async function getRobots(origin, hosts) {
    if (!hosts.includes(new URL(origin).hostname)) throw new CollectionError("unsafe-url");
    if (!policies.has(origin)) policies.set(origin, (async () => {
      try {
        const response = await request(`${origin}/robots.txt`, hosts, minDelayMs, true);
        if (/<html|<!doctype/i.test(response.body)) throw new CollectionError("robots-invalid");
        return parseRobots(response.body);
      }
      catch (error) { if (error.code === "not-found") return { rules: [], delay: 0, sitemaps: [] }; throw new CollectionError("robots-unavailable", error.message); }
    })());
    return policies.get(origin);
  }
  return { getRobots, async get(url, hosts) {
    const policy = await getRobots(new URL(url).origin, hosts);
    if (!robotsAllows(policy, url)) throw new CollectionError("robots-disallowed");
    return request(url, hosts, Math.max(minDelayMs, policy.delay));
  } };
}
