import test from "node:test";
import assert from "node:assert/strict";
import { cloudflareAnalyticsConfig, googleSiteVerification } from "../src/lib/analytics";

test("analytics fails closed without a real site token and stays off in development and Vercel previews", () => {
  const token = "0123456789abcdef0123456789abcdef"; // Synthetic format fixture; never deployed.
  for (const env of [{}, { NODE_ENV: "production" }, { NODE_ENV: "production", CLOUDFLARE_WEB_ANALYTICS_TOKEN: "placeholder" },
    { NODE_ENV: "development", CLOUDFLARE_WEB_ANALYTICS_TOKEN: token },
    { NODE_ENV: "production", VERCEL_ENV: "preview", CLOUDFLARE_WEB_ANALYTICS_TOKEN: token }]) {
    assert.equal(cloudflareAnalyticsConfig(env as NodeJS.ProcessEnv), null);
  }
  const config = cloudflareAnalyticsConfig({ NODE_ENV: "production", VERCEL_ENV: "production", CLOUDFLARE_WEB_ANALYTICS_TOKEN: token });
  assert.equal(config?.src, "https://static.cloudflareinsights.com/beacon.min.js");
  assert.deepEqual(JSON.parse(config!.beacon), { token });
  assert.equal(googleSiteVerification("<script>invalid</script>"), undefined);
  assert.equal(googleSiteVerification("URL_prefix-verification_123"), "URL_prefix-verification_123");
});
