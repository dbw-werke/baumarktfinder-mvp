import { chromium } from "playwright";

function looksBlocked(status, title, body) {
  const text = `${title} ${body}`.toLowerCase();

  return (
    status === 403 ||
    status === 429 ||
    text.includes("access denied") ||
    text.includes("forbidden") ||
    text.includes("captcha") ||
    text.includes("unusual traffic")
  );
}

export async function withPage(url, worker) {
  let browser = null;

  try {
    console.log("→ lokaler Playwright");

    browser = await chromium.launch({
      headless: true,
    });

    const page = await browser.newPage({
      locale: "de-DE",
      viewport: {
        width: 1440,
        height: 1000,
      },
    });

    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });

    await page.waitForTimeout(800);

    const status = response?.status() ?? 0;
    const title = await page.title();

    const body = (
      await page
        .locator("body")
        .innerText()
        .catch(() => "")
    ).slice(0, 3000);

    if (looksBlocked(status, title, body)) {
      throw new Error(
        `Shop blockiert lokalen Playwright. HTTP ${status}`
      );
    }

    const result = await worker(page);

    return {
      source: "local",
      result,
    };
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}