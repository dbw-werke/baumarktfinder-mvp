import {
  createClient,
} from "@supabase/supabase-js";

import {
  searchShop,
} from "./shop-reader/shops.mjs";

import {
  buildStandard,
  chooseNormalizedProduct,
  filterCrossStorePriceOutliers,
} from "./shop-reader/product-standardizer.mjs";


const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY;


if (
  !supabaseUrl ||
  !serviceKey
) {
  throw new Error(
    "Supabase ENV fehlt."
  );
}


const supabase =
  createClient(
    supabaseUrl,
    serviceKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );


/*
 * NUR diese Shops werden automatisch gelesen.
 *
 * NICHT automatisch:
 * hornbach
 * hellweg
 * hagebau
 */
const AUTO_STORES = [
  "obi",
  "toom",
  "bauhaus",
  "globus",
];


const REQUEST_DELAY_MS = 3000;


function sleep(ms) {
  return new Promise(
    (resolve) =>
      setTimeout(resolve, ms)
  );
}


function normalize(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/\s+/g, " ")
    .trim();
}


/* ======================================================
   PRODUKT-URL ABSOLUT MACHEN
====================================================== */

function absoluteProductUrl(
  storeId,
  url
) {
  if (!url) {
    return null;
  }


  if (
    url.startsWith("https://") ||
    url.startsWith("http://")
  ) {
    return url;
  }


  const bases = {
    obi:
      "https://www.obi.de",

    toom:
      "https://toom.de",

    bauhaus:
      "https://www.bauhaus.info",

    globus:
      "https://www.globus-baumarkt.de",
  };


  const base =
    bases[storeId];


  if (!base) {
    return url;
  }


  return (
    base +
    (url.startsWith("/")
      ? ""
      : "/") +
    url
  );
}


/* ======================================================
   PREIS SPEICHERN

   WICHTIG:
   Erst nachdem ein technisch gültiger Treffer
   gefunden wurde.

   Blockiert / kein Treffer / Fehler:
   alter Preis bleibt bestehen.
====================================================== */

async function savePrice(
  material,
  storeId,
  product
) {
  const price =
    Number(
      product.price
    );


  if (
    !Number.isFinite(price) ||
    price <= 0
  ) {
    throw new Error(
      `Ungültiger Produktpreis: ${product.price}`
    );
  }


  const payload = {
    material_id:
      material.id,

    store_id:
      storeId,

    price,

    product_name:
      product.name,

    product_url:
      absoluteProductUrl(
        storeId,
        product.url
      ),

    checked_at:
      new Date()
        .toISOString(),
  };


  /*
   * Neuesten bestehenden Datensatz suchen.
   */
  const {
    data: existing,
    error: findError,
  } =
    await supabase
      .from("store_prices")
      .select("id")
      .eq(
        "material_id",
        material.id
      )
      .eq(
        "store_id",
        storeId
      )
      .order(
        "checked_at",
        {
          ascending: false,
        }
      )
      .limit(1);


  if (findError) {
    throw findError;
  }


  /*
   * Existiert bereits ein Preis:
   * aktualisieren statt Duplikat erzeugen.
   */
  if (
    existing &&
    existing.length > 0
  ) {
    const {
      error,
    } =
      await supabase
        .from("store_prices")
        .update(payload)
        .eq(
          "id",
          existing[0].id
        );


    if (error) {
      throw error;
    }


    return "updated";
  }


  /*
   * Sonst neu anlegen.
   */
  const {
    error,
  } =
    await supabase
      .from("store_prices")
      .insert(payload);


  if (error) {
    throw error;
  }


  return "inserted";
}


/* ======================================================
   EIN MATERIAL VERARBEITEN
====================================================== */

async function updateMaterial(
  material
) {
  const standard =
    buildStandard(
      material
    );


  if (!standard) {
    console.log(
      `– ${material.name}: keine Vergleichsregel`
    );

    return;
  }


  console.log("");
  console.log(
    "================================="
  );

  console.log(
    material.name
  );

  console.log(
    `STANDARD: ${standard.id}`
  );

  console.log(
    `SUCHE: ${standard.search}`
  );

  console.log(
    "================================="
  );


  /*
   * Erst alle technisch gültigen Kandidaten sammeln.
   *
   * NOCH NICHT Supabase verändern.
   */
  const candidates = [];


  for (
    const storeId
    of AUTO_STORES
  ) {
    console.log("");
    console.log(
      `→ ${storeId}`
    );


    try {
      const shop =
        await searchShop(
          storeId,
          standard.search
        );


      const product =
        chooseNormalizedProduct(
          shop.products ?? [],
          standard
        );


      if (!product) {
        console.log(
          `✗ ${storeId}: kein technisch passendes Produkt`
        );

        await sleep(
          REQUEST_DELAY_MS
        );

        continue;
      }


      const price =
        Number(
          product.price
        );


      if (
        !Number.isFinite(price) ||
        price <= 0
      ) {
        console.log(
          `✗ ${storeId}: ungültiger Produktpreis`
        );

        await sleep(
          REQUEST_DELAY_MS
        );

        continue;
      }


      candidates.push({
        store:
          storeId,

        price,

        product,
      });


      console.log(
        `✓ KANDIDAT ${storeId}: ${price.toFixed(
          2
        )} € | ${product.name}`
      );


    } catch (error) {
      console.log(
        `✗ ${storeId}: ${
          error instanceof Error
            ? error.message
            : String(error)
        }`
      );


      /*
       * Ganz wichtig:
       *
       * Bei BLOCKED / ERROR / NO PRODUCTS
       * wird NICHTS aus Supabase gelöscht.
       */
    }


    await sleep(
      REQUEST_DELAY_MS
    );
  }


  if (
    candidates.length === 0
  ) {
    console.log(
      "– Kein sicherer neuer Preis. Bestehende Preise bleiben unverändert."
    );

    return;
  }


  /* ====================================================
     CROSS-STORE PLAUSIBILITÄT

     Erst NACH technischem Matching.

     Preis entscheidet niemals,
     welches Produkt technisch passend ist.
  ==================================================== */

  const saneCandidates =
    filterCrossStorePriceOutliers(
      candidates
    );


  const acceptedStores =
    new Set(
      saneCandidates.map(
        (candidate) =>
          candidate.store
      )
    );


  for (
    const candidate
    of candidates
  ) {
    if (
      !acceptedStores.has(
        candidate.store
      )
    ) {
      console.log(
        `⛔ ${candidate.store}: ${candidate.price.toFixed(
          2
        )} € als Preis-Ausreißer verworfen`
      );

      continue;
    }


    const action =
      await savePrice(
        material,
        candidate.store,
        candidate.product
      );


    console.log(
      `✓ GESPEICHERT ${candidate.store}: ${candidate.price.toFixed(
        2
      )} € (${action})`
    );
  }
}


/* ======================================================
   MAIN
====================================================== */

async function main() {
  const requested =
    process.argv
      .slice(2)
      .join(" ")
      .trim();


  const {
    data: materials,
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
      );


  if (error) {
    throw error;
  }


  let selected =
    materials ?? [];


  if (
    requested &&
    requested.toLowerCase() !==
      "all"
  ) {
    const needle =
      normalize(
        requested
      );


    selected =
      selected.filter(
        (material) =>
          [
            material.name,
            material.suggestion_label,
            material.store_search_term,
            material.product_family,
          ]
            .filter(Boolean)
            .some(
              (value) => {
                const normalized =
                  normalize(
                    value
                  );


                return (
                  normalized.includes(
                    needle
                  ) ||
                  needle.includes(
                    normalized
                  )
                );
              }
            )
      );
  }


  if (
    selected.length === 0
  ) {
    throw new Error(
      `Material nicht gefunden: ${requested}`
    );
  }


  console.log("");
  console.log(
    "===== BAUMARKTFINDER PREISUPDATE ====="
  );

  console.log(
    `Materialien: ${selected.length}`
  );

  console.log(
    `Automatisch: ${AUTO_STORES.join(
      ", "
    )}`
  );

  console.log(
    "Manuell: hornbach, hellweg, hagebau"
  );


  for (
    const material
    of selected
  ) {
    await updateMaterial(
      material
    );


    /*
     * Pause zwischen Materialien.
     */
    await sleep(
      REQUEST_DELAY_MS
    );
  }


  console.log("");
  console.log(
    "===== FERTIG ====="
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