import {
  buildStandard,
  chooseNormalizedProduct,
  filterCrossStorePriceOutliers,
} from "./product-standardizer.mjs";

function normalize(text = "") {
  return String(text)
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/×/g, "x")
    .replace(/,/g, ".")
    .replace(/\s+/g, " ")
    .trim();
}

/* ======================================================
   QUERY PARSEN
====================================================== */

export function parseQuery(
  query = ""
) {
  const normalized =
    normalize(query);

  const dims =
    normalized.match(
      /(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*mm\b/
    );

  const qty =
    normalized.match(
      /(\d+(?:\.\d+)?)\s*(kg|l|liter|ml|stueck|stk)\b/
    );

  return {
    raw:
      query,

    normalized,

    dimensions:
      dims
        ? {
            type:
              "dimension2",

            values: [
              Number(dims[1]),
              Number(dims[2]),
            ],

            unit:
              "mm",
          }
        : null,

    quantity:
      qty
        ? {
            type:
              qty[2] === "kg"
                ? "weight"
                : /l|liter|ml/.test(
                      qty[2]
                    )
                  ? "volume"
                  : "count",

            value:
              qty[2] === "ml"
                ? Number(
                    qty[1]
                  ) / 1000
                : Number(
                    qty[1]
                  ),

            unit:
              qty[2] === "kg"
                ? "kg"
                : /l|liter|ml/.test(
                      qty[2]
                    )
                  ? "l"
                  : "st",
          }
        : null,

    explicit: {
      dimensions:
        Boolean(dims),

      quantity:
        Boolean(qty),
    },
  };
}

/* ======================================================
   PRODUKTE MATCHEN
====================================================== */

export function matchProducts(
  shopResults,
  query,
  material
) {
  /*
   * Der Standard wird aus dem Supabase-Material
   * aufgebaut.
   *
   * Falls material fehlt, verwenden wir die
   * Query als Fallback.
   */

  const standard =
    buildStandard(
      material || {
        name: query,
        store_search_term:
          query,
      }
    );

  const parsedQuery =
    parseQuery(query);

  const comparisonType =
    material?.comparison_type ||
    standard?.family ||
    "generic";

  /*
   * Kein Standard:
   *
   * Lieber KEIN Produkt zurückgeben,
   * als irgendein ähnlich klingendes Produkt.
   */

  if (!standard) {
    return {
      query,

      material: {
        id:
          material?.id ||
          null,

        name:
          material?.name ||
          query,

        comparisonType,
      },

      parsedQuery,

      referenceSize:
        null,

      matches:
        (shopResults || []).map(
          (shop) => ({
            store:
              shop.store,

            storeName:
              shop.storeName,

            product:
              null,
          })
        ),
    };
  }

  /*
   * Pro Shop:
   *
   * 1. Nur technisch passende Produkte
   * 2. Produktpreis prüfen
   * 3. günstigstes technisch identisches Produkt
   */

  const winners =
    (shopResults || []).map(
      (shop) => {
        /*
         * blocked / error / no-products
         *
         * niemals mit einem Fantasiepreis
         * ersetzen.
         */

        if (
          shop?.status &&
          shop.status !== "ok"
        ) {
          return {
            store:
              shop.store,

            storeName:
              shop.storeName,

            product:
              null,
          };
        }

        const winner =
          chooseNormalizedProduct(
            shop?.products ||
              [],
            standard
          );

        return {
          store:
            shop.store,

          storeName:
            shop.storeName,

          product:
            winner
              ? {
                  name:
                    winner.name,

                  /*
                   * WICHTIG:
                   * Das ist der Packungs-/Stückpreis,
                   * NICHT €/kg oder €/l.
                   */

                  price:
                    Number(
                      winner.price
                    ),

                  /*
                   * Grundpreis separat behalten.
                   */

                  unitPrice:
                    Number.isFinite(
                      Number(
                        winner.unitPrice
                      )
                    )
                      ? Number(
                          winner.unitPrice
                        )
                      : null,

                  url:
                    winner.url,

                  attribute:
                    standard.id,

                  distance:
                    0,

                  relevance:
                    100,
                }
              : null,
        };
      }
    );

  /* ====================================================
     SHOPÜBERGREIFENDE PREIS-PLAUSIBILITÄT
  ==================================================== */

  const priced =
    winners
      .filter(
        (entry) =>
          entry.product
      )
      .map(
        (entry) => ({
          store:
            entry.store,

          price:
            entry.product.price,
        })
      );

  /*
   * Beispiel:
   *
   * OBI       11,59 €
   * toom      11,99 €
   * BAUHAUS   11,50 €
   * Globus    0,39 €
   *
   * 0,39 € liegt massiv außerhalb
   * des Preisniveaus und wird entfernt.
   *
   * Dieser Check läuft NACH dem
   * technischen Matching.
   */

  const sane =
    filterCrossStorePriceOutliers(
      priced
    );

  const saneStores =
    new Set(
      sane.map(
        (entry) =>
          entry.store
      )
    );

  const matches =
    winners.map(
      (entry) =>
        entry.product &&
        !saneStores.has(
          entry.store
        )
          ? {
              ...entry,
              product:
                null,
            }
          : entry
    );

  return {
    query,

    material: {
      id:
        material?.id ||
        null,

      name:
        material?.name ||
        query,

      comparisonType,
    },

    parsedQuery,

    referenceSize:
      standard.id,

    matches,
  };
}