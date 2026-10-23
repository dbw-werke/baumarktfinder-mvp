/** Public website ID supplied by the owner; previews and local development do not track. */
export function umamiAnalyticsConfig(env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV !== "production" || (env.VERCEL_ENV && env.VERCEL_ENV !== "production")) return null;
  return {
    id: "umami-analytics",
    src: "https://cloud.umami.is/script.js",
    strategy: "afterInteractive" as const,
    defer: true,
    "data-website-id": "e8e49b5e-7925-4039-97d5-37e646e0c181",
    "data-domains": "baumarktfinder-app.de",
    "data-exclude-search": "true",
    "data-exclude-hash": "true",
    "data-do-not-track": "true",
  };
}

/** URL-prefix ownership verification works without changing DNS. */
export function googleSiteVerification(value = process.env.GOOGLE_SITE_VERIFICATION): string | undefined {
  const token = value?.trim();
  return token && /^[A-Za-z0-9_-]{10,200}$/.test(token) ? token : undefined;
}
