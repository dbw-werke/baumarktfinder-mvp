import { createClient } from "@supabase/supabase-js";

import {
  searchShop,
  getShopIds,
} from "./shop-reader/shops.mjs";

import {
  searchHornbach,
} from "./shop-reader/hornbach.mjs";

import {
  buildStandard,
  chooseNormalizedProduct,
} from "./shop-reader/product-standardizer.mjs";


/* =========================================================
   SUPABASE
========================================================= */

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt."
  );
}

const supabase =
  createClient(
    supabaseUrl,
    serviceKey,
    {
      auth: {
        persistSession: false,
      },
    }
  );


/* =========================================================
   SHOP AUS ARGUMENT
========================================================= */

const requestedStore =
  process.argv[2]
    ?.trim()
    .toLowerCase();

if (!requestedStore) {
  console.error(
    "Shop fehlt. Beispiel:"
  );

  console.error(
    'node --env-file=.env.local scripts/test-store-materials.mjs obi'
  );

  process.exit(1);
}


const validStores =
  new Set([
    ...getShopIds(),
    "hornbach",
  ]);


if (
  !validStores.has(
    requestedStore
  )
) {
  console.error(
    `Ungültiger Shop: ${requestedStore}`
  );

  console.error(
    "Erlaubt: obi, toom, hornbach, bauhaus, hagebau, globus, hellweg"
  );

  process.exit(1);
}


/* =========================================================
   EINEN SHOP LESEN
========================================================= */

async function readStore(
  storeId,
  query
) {
  /*
   * Hornbach benutzt seinen
   * separaten Reader.
   */
  if (
    storeId === "hornbach"
  ) {
    return await searchHornbach(
      query
    );
  }


  try {
    const result =
      await searchShop(
        storeId,
        query
      );


    return {
      store:
        result.store,

      storeName:
        result.storeName,

      status:
        "ok",

      products:
        result.products ?? [],
    };
  }

  catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);


    let status =
      "error";


    if (
      message.toLowerCase().includes(
        "blocked"
      )
    ) {
      status =
        "blocked";
    }


    if (
      message.toLowerCase().includes(
        "no-products"
      )
    ) {
      status =
        "no-products";
    }


    return {
      store:
        storeId,

      status,

      error:
        message,

      products:
        [],
    };
  }
}


/* =========================================================
   MATERIALIEN AUS SUPABASE LADEN
========================================================= */

async function loadMaterials() {
  const {
    data,
    error,
  } =
    await supabase
      .from("materials")
      .select(`
        id,
        name,
        suggestion_label,
        store_search_term,
        product_family,
        comparison_type,
        match_rules,
        active
      `)
      .eq(
        "active",
        true
      )
      .order(
        "name"
      );


  if (error) {
    throw error;
  }


  return data ?? [];
}


/* =========================================================
   SHOP-SUCHBEGRIFF

   KEIN buildSearchTerm Import mehr.

   Wir benutzen den aktuell
   vorhandenen Supabase-Suchbegriff.
========================================================= */

function getSearchTerm(
  material
) {
  return (
    material.store_search_term ||
    material.suggestion_label ||
    material.name
  );
}


/* =========================================================
   MAIN
========================================================= */

async function main() {
  const materials =
    await loadMaterials();


  console.log("");
  console.log(
    "=============================================="
  );

  console.log(
    `SHOP: ${requestedStore.toUpperCase()}`
  );

  console.log(
    `AKTIVE MATERIALIEN: ${materials.length}`
  );

  console.log(
    "=============================================="
  );


  const results = {
    success: [],
    noMatch: [],
    noRule: [],
    blocked: [],
    noProducts: [],
    errors: [],
  };


  for (
    let index = 0;
    index < materials.length;
    index++
  ) {
    const material =
      materials[index];


    console.log("");
    console.log(
      `[${index + 1}/${materials.length}] ${material.name}`
    );


    /* =====================================================
       TECHNISCHEN STANDARD BAUEN
    ===================================================== */

    let standard =
      null;


    try {
      standard =
        buildStandard(
          material
        );
    }

    catch (error) {
      console.log(
        `✗ STANDARD-FEHLER: ${
          error instanceof Error
            ? error.message
            : error
        }`
      );


      results.errors.push({
        material:
          material.name,

        error:
          error instanceof Error
            ? error.message
            : String(error),
      });


      continue;
    }


    if (!standard) {
      console.log(
        "⚠ KEINE VERGLEICHSREGEL"
      );


      results.noRule.push(
        material.name
      );


      continue;
    }


    /* =====================================================
       SUCHBEGRIFF
    ===================================================== */

    const searchTerm =
      getSearchTerm(
        material
      );


    console.log(
      `Suche: ${searchTerm}`
    );


    /* =====================================================
       SHOP LESEN
    ===================================================== */

    const shopResult =
      await readStore(
        requestedStore,
        searchTerm
      );


    /* =====================================================
       BLOCK
    ===================================================== */

    if (
      shopResult.status ===
      "blocked"
    ) {
      console.log(
        "✗ BLOCKIERT"
      );


      results.blocked.push(
        material.name
      );


      continue;
    }


    /* =====================================================
       KEINE PRODUKTE
    ===================================================== */

    if (
      shopResult.status ===
      "no-products"
    ) {
      console.log(
        "✗ KEINE PRODUKTE LESBAR"
      );


      results.noProducts.push(
        material.name
      );


      continue;
    }


    /* =====================================================
       TECHNISCHER FEHLER
    ===================================================== */

    if (
      shopResult.status !==
      "ok"
    ) {
      console.log(
        `✗ FEHLER: ${
          shopResult.error ||
          shopResult.status
        }`
      );


      results.errors.push({
        material:
          material.name,

        error:
          shopResult.error ||
          shopResult.status,
      });


      continue;
    }


    /* =====================================================
       TECHNISCH PASSENDES PRODUKT FINDEN

       MARKE IST NICHT ENTSCHEIDEND.

       Entscheidend:
       - Produktart
       - Größe
       - Dicke
       - Menge
       - Länge
       - Stückzahl
       usw.
    ===================================================== */

    let product =
      null;


    try {
      product =
        chooseNormalizedProduct(
          shopResult.products,
          standard
        );
    }

    catch (error) {
      console.log(
        `✗ MATCHER-FEHLER: ${
          error instanceof Error
            ? error.message
            : error
        }`
      );


      results.errors.push({
        material:
          material.name,

        error:
          error instanceof Error
            ? error.message
            : String(error),
      });


      continue;
    }


    /* =====================================================
       SHOP WAR LESBAR,
       ABER KEIN PASSENDES PRODUKT
    ===================================================== */

    if (!product) {
      console.log(
        `✗ SHOP LESBAR, ABER KEINE TECHNISCH PASSENDE VARIANTE`
      );

      console.log(
        `  Gelesene Produkte: ${shopResult.products.length}`
      );


      results.noMatch.push({
        material:
          material.name,

        searchTerm,

        productsRead:
          shopResult.products.length,
      });


      continue;
    }


    /* =====================================================
       ERFOLG
    ===================================================== */

    console.log(
      "✓ PASSEND"
    );


    console.log(
      `  Produkt: ${product.name}`
    );


    console.log(
      `  Preis: ${Number(
        product.price
      ).toFixed(2)} €`
    );


    if (
      product.normalizedUnitPrice != null
    ) {
      console.log(
        `  Vergleich: ${Number(
          product.normalizedUnitPrice
        ).toFixed(2)} €/${product.normalizedUnit}`
      );
    }


    console.log(
      `  URL: ${product.url || "-"}`
    );


    results.success.push({
      material:
        material.name,

      product:
        product.name,

      price:
        Number(
          product.price
        ),

      normalizedUnitPrice:
        product.normalizedUnitPrice ??
        null,

      normalizedUnit:
        product.normalizedUnit ??
        null,

      url:
        product.url ??
        null,
    });
  }


  /* =========================================================
     ZUSAMMENFASSUNG
  ========================================================= */

  console.log("");
  console.log("");
  console.log(
    "=================================================="
  );

  console.log(
    `${requestedStore.toUpperCase()} — ENDERGEBNIS`
  );

  console.log(
    "=================================================="
  );


  console.log("");
  console.log(
    `✅ FUNKTIONIERT: ${results.success.length}`
  );


  for (
    const item of results.success
  ) {
    console.log(
      `  ✓ ${item.material} → ${item.price.toFixed(2)} €`
    );
  }


  console.log("");
  console.log(
    `⚠ SHOP LESBAR, MATCHING FEHLT: ${results.noMatch.length}`
  );


  for (
    const item of results.noMatch
  ) {
    console.log(
      `  ⚠ ${item.material} (${item.productsRead} Produkte gelesen)`
    );
  }


  console.log("");
  console.log(
    `⚠ KEINE VERGLEICHSREGEL: ${results.noRule.length}`
  );


  for (
    const material of results.noRule
  ) {
    console.log(
      `  ⚠ ${material}`
    );
  }


  console.log("");
  console.log(
    `✗ KEINE PRODUKTE LESBAR: ${results.noProducts.length}`
  );


  for (
    const material of results.noProducts
  ) {
    console.log(
      `  ✗ ${material}`
    );
  }


  console.log("");
  console.log(
    `⛔ BLOCKIERT: ${results.blocked.length}`
  );


  for (
    const material of results.blocked
  ) {
    console.log(
      `  ⛔ ${material}`
    );
  }


  console.log("");
  console.log(
    `❌ TECHNISCHE FEHLER: ${results.errors.length}`
  );


  for (
    const item of results.errors
  ) {
    console.log(
      `  ❌ ${item.material} → ${item.error}`
    );
  }


  console.log("");
  console.log(
    "=================================================="
  );

  console.log(
    "TEST FERTIG — NICHTS IN SUPABASE VERÄNDERT"
  );

  console.log(
    "=================================================="
  );
}


main().catch(
  (error) => {
    console.error(
      error
    );

    process.exit(1);
  }
);