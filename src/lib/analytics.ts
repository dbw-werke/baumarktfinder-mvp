/** Cloudflare's public site token, never an API credential. No configured token means no tracking. */
export function cloudflareAnalyticsConfig(env: NodeJS.ProcessEnv = process.env) {
  const token = env.CLOUDFLARE_WEB_ANALYTICS_TOKEN?.trim();
  if (env.NODE_ENV !== "production" || (env.VERCEL_ENV && env.VERCEL_ENV !== "production")
    || !token || !/^[a-f0-9]{32}$/i.test(token)) return null;
  return { src: "https://static.cloudflareinsights.com/beacon.min.js", beacon: JSON.stringify({ token }) };
}

/** URL-prefix ownership verification works without changing DNS. */
export function googleSiteVerification(value = process.env.GOOGLE_SITE_VERIFICATION): string | undefined {
  const token = value?.trim();
  return token && /^[A-Za-z0-9_-]{10,200}$/.test(token) ? token : undefined;
}
