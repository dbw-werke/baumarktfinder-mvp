import {
  createClient,
} from "@supabase/supabase-js";

import {
  searchShop,
  getShopIds,
} from "./shops.mjs";

import {
  matchProducts,
} from "./product-matcher.mjs";


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
      },
    }
  );


const query =
  process.argv
    .slice(2)
    .join(" ")
    .trim() ||
  "Tiefengrund";


function normalize(text = "") {
  let value = String(text)
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/,/g, ".")
    .replace(/\s+/g, " ")
    .trim();

  value = value
    .replace(/\btiefengrundierung\b/g, "tiefgrund")
    .replace(/\btiefengrund\b/g, "tiefgrund");

  return value;
}


/* =========================================================
   EXPLIZITE MAßE / MENGEN AUS QUERY ENTFERNEN

   "Tiefgrund 10 l"
   -> "Tiefgrund"

   "Schnellbauschrauben 3,5 x 25 mm"
   -> "Schnellbauschrauben"
========================================================= */

function removeSpecifications(text) {
  return normalize(text)

    // 3D
    .replace(
      /\b\d+(?:\.\d+)?\s*(?:mm|cm|m)?\s*x\s*\d+(?:\.\d+)?\s*(?:mm|cm|m)?\s*x\s*\d+(?:\.\d+)?\s*(?:mm|cm|m)\b/g,
      " "
    )

    // 2D
    .replace(
      /\b\d+(?:\.\d+)?\s*(?:mm|cm|m)?\s*x\s*\d+(?:\.\d+)?\s*(?:mm|cm|m)\b/g,
      " "
    )

    // Mengen
    .replace(
      /\b\d+(?:\.\d+)?\s*(?:ml|l|liter|kg|kilogramm|g|gramm|stueck|stk|st)\b/g,
      " "
    )

    .replace(
      /\s+/g,
      " "
    )

    .trim();
}


/* =========================================================
   MATERIAL AUS SUPABASE FINDEN
========================================================= */

async function findMaterial(
  userQuery
) {
  const cleanQuery =
    removeSpecifications(
      userQuery
    );


  const {
    data,
    error,
  } =
    await supabase
      .from("materials")
      .select(`
        id,
        name,
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


  let best =
    null;

  let bestScore =
    -1;


  for (const material of data ?? []) {
    const candidates = [
      material.name,
      material.store_search_term,
      material.product_family,

      ...(
        Array.isArray(
          material
            .match_rules
            ?.aliases
        )
          ? material
              .match_rules
              .aliases
          : []
      ),
    ]
      .filter(Boolean)
      .map(normalize);


    let score = 0;


    for (
      const candidate of
      candidates
    ) {
      if (
        candidate ===
        cleanQuery
      ) {
        score =
          Math.max(
            score,
            100
          );

        continue;
      }


      if (
        candidate.includes(
          cleanQuery
        ) ||
        cleanQuery.includes(
          candidate
        )
      ) {
        score =
          Math.max(
            score,
            70
          );
      }


      const words =
        cleanQuery
          .split(" ")
          .filter(
            word =>
              word.length >= 3
          );


      const hits =
        words.filter(
          word =>
            candidate.includes(
              word
            )
        ).length;


      if (words.length) {
        const wordScore =
          Math.round(
            (
              hits /
              words.length
            ) *
            60
          );

        score =
          Math.max(
            score,
            wordScore
          );
      }
    }


    if (score > bestScore) {
      best =
        material;

      bestScore =
        score;
    }
  }


  if (
    !best ||
    bestScore < 20
  ) {
    return null;
  }


  return best;
}


/* =========================================================
   START
========================================================= */

console.log(
  `\nSUCHE: "${query}"\n`
);


const material =
  await findMaterial(
    query
  );


if (!material) {
  throw new Error(
    `Kein Material in Supabase für "${query}" gefunden.`
  );
}


console.log(
  `Material erkannt: ${material.name}`
);

console.log(
  `Vergleichstyp: ${
    material.comparison_type ||
    "generic"
  }`
);


const searchTerm =
  removeSpecifications(query);


console.log(
  `Shop-Suche: "${searchTerm}"\n`
);


const shops =
  getShopIds().filter(
    id =>
      id !== "hellweg"
  );


const results = [];


for (const shopId of shops) {
  console.log(
    `Lese ${shopId}...`
  );

  try {
    const result =
      await searchShop(
        shopId,
        searchTerm
      );

    results.push(result);

    console.log(
      `✓ ${result.products.length} Produkte`
    );
  }

  catch (error) {
    console.log(
      `✗ ${shopId}: ${error.message}`
    );
  }
}


const comparison =
  matchProducts(
    results,
    query,
    material
  );


console.log(
  "\n=============================="
);

console.log(
  "VERGLEICH"
);

console.log(
  "=============================="
);


if (
  comparison.referenceSize
) {
  const ref =
    comparison.referenceSize;


  if (
    ref.values
  ) {
    console.log(
      `Referenz: ${ref.values.join(
        " x "
      )} ${ref.unit}`
    );
  }

  else {
    console.log(
      `Referenz: ${ref.value} ${ref.unit}`
    );
  }
}


console.log(
  `Explizite Dimension: ${
    comparison
      .parsedQuery
      .explicit
      .dimensions
      ? "JA"
      : "NEIN"
  }`
);


console.log(
  `Explizite Menge: ${
    comparison
      .parsedQuery
      .explicit
      .quantity
      ? "JA"
      : "NEIN"
  }`
);


for (
  const match of
  comparison.matches
) {
  console.log(
    `\n${match.storeName}`
  );


  if (!match.product) {
    console.log(
      "Kein passendes Produkt"
    );

    continue;
  }


  console.log(
    match.product.name
  );


  console.log(
    `${match.product.price.toFixed(
      2
    )} €`
  );


  if (
    match.product.attribute
  ) {
    const attr =
      match.product.attribute;


    if (attr.values) {
      console.log(
        `Variante: ${attr.values.join(
          " x "
        )} ${attr.unit}`
      );
    }

    else {
      console.log(
        `Variante: ${attr.value} ${attr.unit}`
      );
    }
  }


  console.log(
    match.product.url
  );
}