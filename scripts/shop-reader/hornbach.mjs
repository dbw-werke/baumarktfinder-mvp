import { chromium } from "playwright";

export async function searchHornbach(query) {
  const browser = await chromium.launch({
    headless: true,
  });

  const context = await browser.newContext({
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
    viewport: {
      width: 1440,
      height: 1000,
    },
  });

  const page = await context.newPage();

  try {
    console.log("→ Hornbach");

    // Erst Startseite für normale Session
    await page.goto("https://www.hornbach.de/", {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });

    await page.waitForTimeout(500);

    // Danach Suche
    const url =
      `https://www.hornbach.de/s/${encodeURIComponent(query)}`;

    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });

    await page.waitForTimeout(1000);

    const status = response?.status() ?? 0;

    const body = await page
      .locator("body")
      .innerText()
      .catch(() => "");

    const lower = body.toLowerCase();

    if (
      status === 403 ||
      status === 429 ||
      lower.includes("access denied") ||
      lower.includes("captcha") ||
      lower.includes("request blocked")
    ) {
      return {
        store: "hornbach",
        status: "blocked",
        products: [],
      };
    }

    const products = await page.evaluate(() => {
      const results = [];
      const seen = new Set();

      const links = [
        ...document.querySelectorAll('a[href*="/p/"]'),
      ];

      for (const link of links) {
        const url = link.href?.split("?")[0];

        if (!url || seen.has(url)) continue;

        let node = link;
        let text = "";

        for (let i = 0; i < 12 && node; i++) {
          const candidate = String(
            node.innerText || node.textContent || ""
          )
            .replace(/\s+/g, " ")
            .trim();

          if (
            candidate.length >= 15 &&
            candidate.length <= 4000 &&
            candidate.includes("€")
          ) {
            text = candidate;
            break;
          }

          node = node.parentElement;
        }

        if (!text) continue;

        /*
         * Erst normalen Produktpreis suchen.
         * Grundpreise wie 0,39 €/kg nicht als
         * Produktpreis verwenden.
         */
        const matches = [
          ...text.matchAll(
            /(\d{1,4}(?:[.,]\d{2}|,-))\s*€/g
          ),
        ];

        let price = null;

        for (const match of matches) {
          const index = match.index ?? 0;

          const after = text
            .slice(
              index + match[0].length,
              index + match[0].length + 25
            )
            .toLowerCase();

          if (
            /^\s*\/\s*(kg|l|liter|m²|m2|m)\b/.test(after)
          ) {
            continue;
          }

          const n = Number(
            match[1]
              .replace(",-", ",00")
              .replace(",", ".")
          );

          if (Number.isFinite(n) && n > 0) {
            price = n;
            break;
          }
        }

        if (price == null) continue;

        let name = String(
          link.getAttribute("aria-label") ||
          link.getAttribute("title") ||
          link.innerText ||
          ""
        )
          .replace(/\s+/g, " ")
          .trim();

        if (!name || name.length < 3) {
          name = text.slice(0, 250);
        }

        seen.add(url);

        results.push({
          name,
          price,
          url,
          rawText: text,
        });

        if (results.length >= 20) break;
      }

      return results;
    });

    if (!products.length) {
      return {
        store: "hornbach",
        status: "no-products",
        products: [],
      };
    }

    return {
      store: "hornbach",
      status: "ok",
      products,
    };
  } catch (error) {
    return {
      store: "hornbach",
      status: "error",
      error: error.message,
      products: [],
    };
  } finally {
    await browser.close().catch(() => {});
  }
}