import test from "node:test";
import assert from "node:assert/strict";
import { umamiAnalyticsConfig, googleSiteVerification } from "../src/lib/analytics";

test("Umami stays off in development, tests and Vercel previews", () => {
  for (const env of [{}, { NODE_ENV: "development" }, { NODE_ENV: "test" },
    { NODE_ENV: "production", VERCEL_ENV: "preview" },
    { NODE_ENV: "production", VERCEL_ENV: "development" }]) {
    assert.equal(umamiAnalyticsConfig(env as NodeJS.ProcessEnv), null);
  }
});

test("production uses the supplied Umami website only and excludes URL query/hash data", () => {
  const config = umamiAnalyticsConfig({ NODE_ENV: "production", VERCEL_ENV: "production" });
  assert.ok(config);
  assert.equal(config.src, "https://cloud.umami.is/script.js");
  assert.equal(config["data-website-id"], "e8e49b5e-7925-4039-97d5-37e646e0c181");
  assert.equal(config["data-domains"], "baumarktfinder-app.de");
  assert.equal(config["data-exclude-search"], "true");
  assert.equal(config["data-exclude-hash"], "true");
  assert.equal(config["data-do-not-track"], "true");
  assert.equal(config.strategy, "afterInteractive");
  assert.deepEqual(umamiAnalyticsConfig({ NODE_ENV: "production" }), config);
  for (const manualTracking of ["data-distinct-id", "data-auto-track", "data-auto-pageview", "data-performance"]) {
    assert.equal(Object.hasOwn(config, manualTracking), false);
  }
});

test("Search Console accepts only a plain verification token", () => {
  assert.equal(googleSiteVerification("<script>invalid</script>"), undefined);
  assert.equal(googleSiteVerification("URL_prefix-verification_123"), "URL_prefix-verification_123");
});
