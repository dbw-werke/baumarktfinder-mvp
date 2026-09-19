import { chromium } from "playwright";
const SHOPS = {
  obi: {
    name: "OBI",
    url: (q) =>
      `https://www.obi.de/search/${encodeURIComponent(q)}/`,
  },

  toom: {
    name: "toom",
    url: (q) =>
      `https://www.toom.de/s/${encodeURIComponent(q)}/`,
  },

  hornbach: {
    name: "Hornbach",
    url: (q) =>
      `https://www.hornbach.de/s/${encodeURIComponent(q)}`,
  },

  bauhaus: {
    name: "BAUHAUS",
    url: (q) =>
      `https://www.bauhaus.info/search?q=${encodeURIComponent(q)}`,
  },

  hagebau: {
    name: "hagebau",
    url: (q) =>
      `https://www.hagebau.de/search/?q=${encodeURIComponent(q)}`,
  },

  globus: {
    name: "Globus",
    url: (q) =>
      `https://www.globus-baumarkt.de/search/result?type=search&query=${encodeURIComponent(q)}`,
  },

  hellweg: {
    name: "HELLWEG",
    url: (q) =>
      `https://www.hellweg.de/search?search=${encodeURIComponent(q)}`,
  },
};

function normalizeText(value = "") {
  return String(value)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePrice(value) {
  if (value == null) return null;

  let text = String(value)
    .replace(/\s/g, "")
    .replace("€", "")
    .replace(",-", ",00")
    .replace(".-", ".00");

  if (/^\d{1,3}(?:\.\d{3})+,\d{2}$/.test(text)) {
    text = text
      .replace(/\./g, "")
      .replace(",", ".");
  } else if (/^\d+,\d{2}$/.test(text)) {
    text = text.replace(",", ".");
  }

  const result = Number(text);

  return Number.isFinite(result)
    ? result
    : null;
}

function looksBlocked(status, title, body) {
  const text =
    `${title || ""} ${body || ""}`.toLowerCase();

  return (
    status === 403 ||
    status === 429 ||
    text.includes("access denied") ||
    text.includes("captcha") ||
    text.includes("verify you are human") ||
    text.includes("unusual traffic") ||
    text.includes("request blocked")
  );
}
async function extractObiProducts(page) {
  return await page.evaluate(() => {
    function clean(value = "") {
      return String(value)
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    function parseNumber(value) {
      if (!value) return null;

      const cleaned = String(value)
        .replace(/\s/g, "")
        .replace(",-", ",00")
        .replace(".-", ",00")
        .replace(",", ".");

      const number = Number(cleaned);

      return Number.isFinite(number)
        ? number
        : null;
    }

    /*
     * OBI zeigt teilweise:
     *
     * 11,59 €
     *
     * oder visuell auf getrennten DOM-Spans:
     *
     * 11,
     * 59
     * €
     *
     * Deshalb erlauben wir Leerzeichen zwischen Euro und Cent.
     */
    function findPrices(text) {
      const result = [];

      const normalized = clean(text);

      const regex =
        /(\d{1,4})\s*[,]\s*(\d{2})\s*€/g;

      for (const match of normalized.matchAll(regex)) {
        const index =
          match.index ?? 0;

        const price =
          Number(
            `${match[1]}.${match[2]}`
          );

        if (
          !Number.isFinite(price) ||
          price <= 0
        ) {
          continue;
        }

        const before =
          normalized
            .slice(
              Math.max(0, index - 35),
              index
            )
            .toLowerCase();

        const after =
          normalized
            .slice(
              index + match[0].length,
              index + match[0].length + 40
            )
            .toLowerCase();

        const isUnitPrice =
          /^\s*\/\s*(kg|kilogramm|g|gramm|l|liter|ml|m²|m2|m|meter)\b/i.test(
            after
          ) ||
          /^\s*(pro|je)\s+(kg|kilogramm|g|gramm|l|liter|ml|m²|m2|m|meter)\b/i.test(
            after
          ) ||
          /\b1\s*(kg|kilogramm|g|gramm|l|liter|ml|m²|m2|m|meter)\s*=\s*$/i.test(
            before
          );

        result.push({
          price,
          isUnitPrice,
          index,
        });
      }

      return result;
    }

    const output = [];
    const seen = new Set();

    const links = [
      ...document.querySelectorAll(
        'a[href*="/p/"]'
      ),
    ];

    for (const link of links) {
      const url =
        link.href?.split("?")[0];

      if (
        !url ||
        seen.has(url)
      ) {
        continue;
      }

      let element =
        link;

      let cardText =
        "";

      let prices =
        [];

      /*
       * OBI Produktkarte finden.
       */
      for (
        let depth = 0;
        depth < 14;
        depth++
      ) {
        if (!element) {
          break;
        }

        const text =
          clean(
            element.innerText ||
            element.textContent
          );

        if (
          text.length >= 10 &&
          text.length <= 6000
        ) {
          const found =
            findPrices(text);

          /*
           * Die Karte ist erst gültig,
           * wenn ein NICHT-Grundpreis existiert.
           */
          const main =
            found.find(
              (entry) =>
                !entry.isUnitPrice &&
                entry.price >= 1
            );

          if (main) {
            cardText =
              text;

            prices =
              found;

            break;
          }
        }

        element =
          element.parentElement;
      }

      if (!cardText) {
        continue;
      }

      /*
       * WICHTIG:
       * Niemals €/kg als Produktpreis.
       */
      const mainPrice =
        prices.find(
          (entry) =>
            !entry.isUnitPrice &&
            entry.price >= 1
        );

      if (!mainPrice) {
        continue;
      }

      const unitPrice =
        prices.find(
          (entry) =>
            entry.isUnitPrice
        );

      let name =
        clean(
          link.getAttribute("aria-label") ||
          link.getAttribute("title") ||
          link.innerText ||
          link.textContent
        );

      if (
        !name ||
        name.length < 3 ||
        name.length > 300
      ) {
        const heading =
          element?.querySelector?.(
            "h1,h2,h3,h4,[class*='title'],[class*='name']"
          );

        if (heading) {
          name =
            clean(
              heading.innerText ||
              heading.textContent
            );
        }
      }

      /*
       * Für OBI ist wichtig:
       * lieber keinen Treffer als 0,39 €.
       */
      if (
        !name ||
        name.length < 3
      ) {
        continue;
      }

      seen.add(url);

      output.push({
        name,
        price:
          mainPrice.price,

        unitPrice:
          unitPrice?.price ??
          null,

        url,
        rawText:
          cardText,
      });

      if (
        output.length >= 30
      ) {
        break;
      }
    }

    return output;
  });
}
async function extractProducts(page, shopId) {
  return await page.evaluate(
    ({ shopId }) => {
      function clean(value) {
        return String(value || "")
          .replace(/\u00a0/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      }

      function allowedUrl(href) {
        if (!href) return false;

        const h =
          href.toLowerCase();

        if (shopId === "obi") {
          return h.includes("/p/");
        }

        if (shopId === "toom") {
          return h.includes("/p/");
        }

        if (shopId === "hornbach") {
          return (
            h.includes("/p/") ||
            h.includes("/shop/")
          );
        }

        if (shopId === "bauhaus") {
          return h.includes("/p/");
        }

        if (shopId === "hagebau") {
          return (
            h.includes("/p/") ||
            h.includes("/artikel/")
          );
        }

        if (shopId === "globus") {
          return (
            h.includes("/p/") ||
            h.includes("/artikel/")
          );
        }

        if (shopId === "hellweg") {
          return (
            h.includes("/a/") ||
            h.includes("/p/") ||
            h.includes("/produkt/")
          );
        }

        return false;
      }

      function number(value) {
        let text =
          String(value || "")
            .trim()
            .replace(/\s/g, "")
            .replace(",-", ",00")
            .replace(".-", ".00");

        if (/^\d{1,3}(?:\.\d{3})+,\d{2}$/.test(text)) {
          text =
            text
              .replace(/\./g, "")
              .replace(",", ".");
        } else {
          text =
            text.replace(",", ".");
        }

        const n = Number(text);

        return Number.isFinite(n)
          ? n
          : null;
      }

      function findPrices(text) {
        const prices = [];

        const regex =
          /(\d{1,4}(?:\.\d{3})*(?:,\d{2}|,-|\.-))\s*€/g;

        for (const match of text.matchAll(regex)) {
          const index =
            match.index ?? 0;

          const raw =
            match[0];

          const price =
            number(match[1]);

          if (!price || price <= 0) {
            continue;
          }

          const before =
            text
              .slice(
                Math.max(0, index - 30),
                index
              )
              .toLowerCase();

          const after =
            text
              .slice(
                index + raw.length,
                index + raw.length + 30
              )
              .toLowerCase();

          const unitPrice =
            /^\s*\/\s*(kg|kilogramm|g|gramm|l|liter|ml|m²|m2|m|meter)\b/i.test(
              after
            ) ||
            /^\s*(pro|je)\s+(kg|kilogramm|g|gramm|l|liter|ml|m²|m2|m|meter)\b/i.test(
              after
            ) ||
            /\b1\s*(kg|kilogramm|g|gramm|l|liter|ml|m²|m2|m|meter)\s*=\s*$/i.test(
              before
            );

          prices.push({
            price,
            raw,
            index,
            unitPrice,
          });
        }

        /*
         * BAUHAUS:
         * 11,50 pro Stück inkl. MwSt.
         */
        const bauhaus =
          /(\d{1,4},\d{2})\s+pro\s+(stück|eimer|sack|packung|rolle|kanister|dose|flasche)/gi;

        for (const match of text.matchAll(bauhaus)) {
          const price =
            number(match[1]);

          if (!price) continue;

          prices.push({
            price,
            raw: match[0],
            index: match.index ?? 0,
            unitPrice: false,
          });
        }

        return prices;
      }

      const output = [];
      const seen =
        new Set();

      const links = [
        ...document.querySelectorAll(
          "a[href]"
        ),
      ];

      for (const link of links) {
        const href =
          link.href || "";

        if (!allowedUrl(href)) {
          continue;
        }

        const url =
          href.split("?")[0];

        if (seen.has(url)) {
          continue;
        }

        let element =
          link;

        let cardText =
          "";

        let foundPrices =
          [];

        let cardElement =
          null;

        /*
         * OBI funktionierte vorher genau mit
         * diesem Parent-Walk.
         */
        for (
          let depth = 0;
          depth < 14;
          depth++
        ) {
          if (!element) break;

          const text =
            clean(
              element.innerText ||
              element.textContent
            );

          if (
            text.length >= 10 &&
            text.length <= 6000
          ) {
            const prices =
              findPrices(text);

            const main =
              prices.find(
                (p) =>
                  !p.unitPrice
              );

            if (main) {
              cardText =
                text;

              foundPrices =
                prices;

              cardElement =
                element;

              break;
            }
          }

          element =
            element.parentElement;
        }

        if (!cardText) {
          continue;
        }

        const mainPrice =
          foundPrices.find(
            (p) =>
              !p.unitPrice
          );

        if (!mainPrice) {
          continue;
        }

        const unit =
          foundPrices.find(
            (p) =>
              p.unitPrice
          );

        let name =
          clean(
            link.getAttribute(
              "aria-label"
            ) ||
            link.getAttribute(
              "title"
            ) ||
            link.innerText ||
            link.textContent
          );

        /*
         * Manche Shops packen den kompletten
         * Karteninhalt in den Link.
         */
        if (
          !name ||
          name.length < 3 ||
          name.length > 350
        ) {
          const heading =
            cardElement?.querySelector?.(
              "h1,h2,h3,h4,[class*='title'],[class*='name']"
            );

          if (heading) {
            name =
              clean(
                heading.innerText ||
                heading.textContent
              );
          }
        }

        /*
         * Letzter Fallback:
         * Text vor Hauptpreis.
         */
        if (
          !name ||
          name.length < 3
        ) {
          const position =
            cardText.indexOf(
              mainPrice.raw
            );

          if (position > 0) {
            name =
              clean(
                cardText.slice(
                  0,
                  position
                )
              );
          }
        }

        if (
          !name ||
          name.length < 3
        ) {
          continue;
        }

        seen.add(url);

        output.push({
          name,

          price:
            mainPrice.price,

          unitPrice:
            unit?.price ??
            null,

          url,

          rawText:
            cardText,
        });

        if (
          output.length >= 40
        ) {
          break;
        }
      }

      return output;
    },
    { shopId }
  );
}

async function scanShop(
  browser,
  shopId,
  query
) {
  const shop =
    SHOPS[shopId];

  const context =
    await browser.newContext({
      locale:
        "de-DE",

      timezoneId:
        "Europe/Berlin",

      viewport: {
        width: 1440,
        height: 1000,
      },

      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",

      extraHTTPHeaders: {
        "Accept-Language":
          "de-DE,de;q=0.9,en;q=0.8",
      },
    });

  const page =
    await context.newPage();

  await page.route(
    "**/*",
    async (route) => {
      const type =
        route
          .request()
          .resourceType();

      if (
        type === "image" ||
        type === "font" ||
        type === "media"
      ) {
        await route.abort();
        return;
      }

      await route.continue();
    }
  );

  try {
    console.log(
      `→ ${shop.name}`
    );

    let response =
      null;

    try {
      response =
        await page.goto(
          shop.url(query),
          {
            waitUntil:
              "domcontentloaded",

            timeout:
              15000,
          }
        );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      if (
        !message.includes(
          "Timeout"
        )
      ) {
        throw error;
      }
    }

    /*
     * OBI braucht etwas länger.
     */
    if (shopId === "obi") {
      await page.waitForTimeout(
        1100
      );
    } else {
      await page.waitForTimeout(
        700
      );
    }

    const status =
      response?.status() ??
      0;

    const title =
      await page
        .title()
        .catch(() => "");

    const body =
      (
        await page
          .locator("body")
          .innerText()
          .catch(() => "")
      ).slice(
        0,
        5000
      );

    if (
      looksBlocked(
        status,
        title,
        body
      )
    ) {
      return {
        store: shopId,
        storeName: shop.name,
        status: "blocked",
        products: [],
      };
    }

    /*
     * Lazy loading.
     */
    for (
      let i = 0;
      i < 3;
      i++
    ) {
      await page.mouse.wheel(
        0,
        1000
      );

      await page.waitForTimeout(
        200
      );
    }

    const products =
  shopId === "obi"
    ? await extractObiProducts(page)
    : await extractProducts(
        page,
        shopId
      );
    if (
      products.length === 0
    ) {
      return {
        store: shopId,
        storeName: shop.name,
        status: "no-products",
        products: [],
      };
    }

    return {
      store: shopId,
      storeName: shop.name,
      status: "ok",
      products,
    };
  } catch (error) {
    return {
      store: shopId,
      storeName: shop.name,
      status: "error",

      error:
        error instanceof Error
          ? error.message
          : String(error),

      products: [],
    };
  } finally {
    await page
      .close()
      .catch(() => {});

    await context
      .close()
      .catch(() => {});
  }
}

export async function searchAllShops(query) {
  const browser = await chromium.launch({
    headless: true,
  });

  try {
    return await Promise.all(
      Object.keys(SHOPS).map((shopId) =>
        scanShop(
          browser,
          shopId,
          query
        )
      )
    );
  } finally {
    await browser
      .close()
      .catch(() => {});
  }
}

export async function searchShop(
  shopId,
  query
) {
  if (!SHOPS[shopId]) {
    throw new Error(
      `Unbekannter Shop: ${shopId}`
    );
  }

  const browser =
    await chromium.launch({
      headless: true,
    });

  try {
    const result =
      await scanShop(
        browser,
        shopId,
        query
      );

    if (
      result.status !== "ok"
    ) {
      throw new Error(
        `${shopId}: ${result.status}`
      );
    }

    return {
      store:
        result.store,

      storeName:
        result.storeName,

      query,

      source:
        "local",

      products:
        result.products,
    };
  } finally {
    await browser
      .close()
      .catch(() => {});
  }
}

export function getShopIds() {
  return Object.keys(
    SHOPS
  );
}