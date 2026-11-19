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
export function createPoliteFetcher({ fetchImpl = fetch, minDelayMs = 2000, timeoutMs = 15000, maxBytes = 8_000_000,
  waitImpl = ms => new Promise(resolve => setTimeout(resolve, ms)), now = Date.now } = {}) {
  const policies = new Map(), lastRequest = new Map(), cooldownUntil = new Map(), stopped = new Set();
  const transientNetwork = error => error.name === "TimeoutError" || ["ECONNRESET", "ECONNREFUSED", "EPIPE", "ETIMEDOUT", "EAI_AGAIN",
    "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT", "UND_ERR_SOCKET"].includes(error.cause?.code || error.code);
  const retryAfter = value => {
    if (!value) return 0;
    const delay = /^\d+$/.test(value.trim()) ? Number(value) * 1000 : Date.parse(value) - now();
    return Number.isNaN(delay) ? 0 : Math.max(0, delay);
  };
  async function responseBody(response) {
    if (Number(response.headers.get("content-length")) > maxBytes) throw new CollectionError("response-too-large");
    if (!response.body) return "";
    const reader = response.body.getReader(), chunks = []; let size = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length;
      if (size > maxBytes) { await reader.cancel(); throw new CollectionError("response-too-large"); } chunks.push(value); }
    return Buffer.concat(chunks).toString("utf8");
  }
  async function request(url, hosts, delay = minDelayMs, isRobots = false) {
    let current = new URL(url), redirects = 0, retries = 0, retryAt = 0;
    while (redirects < 5) {
      if (current.protocol !== "https:" || current.username || current.password || !hosts.includes(current.hostname) || current.port) throw new CollectionError("unsafe-url");
      if (stopped.has(current.origin)) throw new CollectionError("blocked");
      const cooldown = cooldownUntil.get(current.origin) || 0;
      if (cooldown - now() > 30000) throw new CollectionError("retry-after", "Retry-After cooldown is still active");
      await waitImpl(Math.max(0, (lastRequest.get(current.origin) ?? -Infinity) + delay - now(), retryAt - now(), cooldown - now()));
      lastRequest.set(current.origin, now());
      let response, body;
      try {
        response = await fetchImpl(current.href, { redirect: "manual", signal: AbortSignal.timeout(timeoutMs), headers: {
          "User-Agent": USER_AGENT, "Accept-Language": "de-DE,de;q=0.9", Accept: "text/html,application/ld+json,application/xml,text/plain;q=0.9" } });
        // Never retry a denial, including one accompanying an otherwise transient status.
        if ([401, 403, 429].includes(response.status)) { stopped.add(current.origin); throw new CollectionError("blocked", `HTTP ${response.status}`); }
        if (response.ok || [502, 503, 504].includes(response.status)) body = await responseBody(response);
      } catch (error) {
        if (!isRobots && retries < 2 && transientNetwork(error)) { retryAt = now() + 1000 * 2 ** retries++; continue; }
        throw error;
      }
      if (/verify (?:you are|that you are) human|unusual traffic|request blocked|checking your browser|bot challenge|<title>[^<]*(access denied|captcha)/i.test(body || "")
        || ([502, 503, 504].includes(response.status) && /captcha|access denied/i.test(body || ""))) {
        stopped.add(current.origin); throw new CollectionError("blocked");
      }
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const next = new URL(response.headers.get("location"), current);
        if (!isRobots) {
          const policy = await getRobots(next.origin, hosts);
          if (!robotsAllows(policy, next.href)) throw new CollectionError("robots-disallowed");
          delay = Math.max(delay, policy.delay);
        }
        current = next; redirects++; retryAt = 0; continue;
      }
      if (!isRobots && [502, 503, 504].includes(response.status)) {
        const requestedDelay = retryAfter(response.headers.get("retry-after"));
        // The server's backoff applies to later products too, even after this request exhausts its retries.
        if (requestedDelay > 0) cooldownUntil.set(current.origin, now() + requestedDelay);
        // A long Retry-After ends this attempt; never shorten the server's requested wait.
        if (retries < 2 && requestedDelay <= 30000) { retryAt = now() + Math.max(1000 * 2 ** retries++, requestedDelay); continue; }
        if (requestedDelay > 0) throw new CollectionError("retry-after", "Retry-After cooldown is still active");
      }
      if (!response.ok) throw new CollectionError(response.status === 404 ? "not-found" : "http-error", `HTTP ${response.status}`);
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
