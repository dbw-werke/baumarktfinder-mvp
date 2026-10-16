import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SITE_URL, siteMetadata, siteStructuredData, siteViewport, serializeStructuredData } from "../src/app/seo";
import sitemap from "../src/app/sitemap";
import robots from "../src/app/robots";

test("SEO uses one public canonical origin and only existing indexable pages", () => {
  assert.equal(SITE_URL, "https://baumarktfinder-app.de/");
  assert.equal(siteMetadata.metadataBase?.toString(), SITE_URL);
  assert.equal(siteMetadata.alternates?.canonical?.toString(), SITE_URL);
  assert.equal(siteMetadata.openGraph?.url, SITE_URL);
  assert.deepEqual(siteMetadata.robots, { index: true, follow: true });
  assert.deepEqual(sitemap().map((entry) => entry.url), [SITE_URL]);
  assert.equal(robots().sitemap, `${SITE_URL}sitemap.xml`);
  assert.deepEqual(robots().rules, { userAgent: "*", allow: "/", disallow: "/api/" });
  assert.equal(siteViewport.width, "device-width");
  assert.ok(!("userScalable" in siteViewport), "Mobile zoom remains available");
  assert.ok(existsSync(fileURLToPath(new URL("../src/app/icon.svg", import.meta.url))));
  assert.ok(existsSync(fileURLToPath(new URL("../public/Material.hero.png", import.meta.url))));
});

test("structured data describes the service without fabricated business, rating or search URLs", () => {
  const data = JSON.parse(serializeStructuredData(siteStructuredData));
  assert.deepEqual(data["@graph"].map((entry: { "@type": string }) => entry["@type"]), ["WebSite", "WebApplication"]);
  const [website, app] = data["@graph"];
  assert.equal(app.isPartOf["@id"], website["@id"]);
  for (const entity of data["@graph"]) {
    assert.equal(entity.url, SITE_URL);
    assert.equal(entity.inLanguage, "de-DE");
    for (const unverified of ["offers", "aggregateRating", "address", "telephone", "potentialAction"]) {
      assert.equal(Object.hasOwn(entity, unverified), false);
    }
  }
  const input = { name: "</script><script>alert(1)</script>" };
  const serialized = serializeStructuredData(input);
  assert.equal(serialized.includes("<"), false);
  assert.deepEqual(JSON.parse(serialized), input);
});
