import {
  searchAllShops,
} from "./shops.mjs";


/* =========================================================
   MVP VERGLEICHSREFERENZEN

   Das sind Vergleichsprodukte für unsere App.
   So vergleichen wir gleiche Ware miteinander.

   NICHT als DIN-Bezeichnung verstehen.
========================================================= */

const COMPARISON_PRODUCTS = [

  /* -------------------------
     PUTZ / SPACHTEL
  ------------------------- */

  {
    id:
      "rotband-30kg",

    detect:
      /rotband/i,

    search:
      "Rotband 30 kg",

    required: [
      /rotband/i,
      /\b30\s*kg\b/i,
    ],

    forbidden: [
      /finish/i,
      /flächenspachtel/i,
      /flaechenspachtel/i,
    ],
  },


  {
    id:
      "uniflott-5kg",

    detect:
      /uniflott/i,

    search:
      "Uniflott 5 kg",

    required: [
      /uniflott/i,
      /\b5\s*kg\b/i,
    ],

    forbidden: [
      /finish/i,
    ],
  },


  {
    id:
      "perlfix-30kg",

    detect:
      /perlfix/i,

    search:
      "Perlfix 30 kg",

    required: [
      /perlfix/i,
      /\b30\s*kg\b/i,
    ],

    forbidden: [],
  },


  /* -------------------------
     GIPSKARTON
  ------------------------- */

  {
    id:
      "gipskarton-12-5-2000x1250",

    detect:
      /gipskarton|rigips|bauplatte/i,

    search:
      "Gipskartonplatte 12,5 mm 2000 x 1250 mm",

    required: [
      /12[,.]?5\s*mm/i,

      /2000\s*[x×]\s*1250|2[,.]?0\s*m\s*[x×]\s*1[,.]?25\s*m/i,
    ],

    forbidden: [
      /feuchtraum/i,
      /imprägniert/i,
      /impraegniert/i,
      /brandschutz/i,
      /fireboard/i,
    ],
  },


  {
    id:
      "feuchtraum-12-5-2000x1250",

    detect:
      /feuchtraum|imprägniert|impraegniert/i,

    search:
      "Feuchtraumplatte 12,5 mm 2000 x 1250 mm",

    required: [
      /12[,.]?5\s*mm/i,

      /2000\s*[x×]\s*1250|2[,.]?0\s*m\s*[x×]\s*1[,.]?25\s*m/i,

      /feuchtraum|imprägniert|impraegniert/i,
    ],

    forbidden: [],
  },


  /* -------------------------
     PROFILE
  ------------------------- */

  {
    id:
      "cd-60-27-3m",

    detect:
      /\bcd\b.*60.*27|60\s*[x/]\s*27/i,

    search:
      "CD Profil 60/27 3 m",

    required: [
      /60\s*[x/×]\s*27/i,

      /3000\s*mm|\b3\s*m\b/i,
    ],

    forbidden: [],
  },


  {
    id:
      "ud-28-3m",

    detect:
      /\bud\b.*28|ud[- ]profil/i,

    search:
      "UD Profil 28 3 m",

    required: [
      /\b28\b/i,

      /3000\s*mm|\b3\s*m\b/i,
    ],

    forbidden: [],
  },


  /* -------------------------
     SCHRAUBEN
  ------------------------- */

  {
    id:
      "tn25-1000",

    detect:
      /tn\s*25|schnellbauschraube.*25/i,

    search:
      "Schnellbauschrauben TN 25 1000 Stück",

    required: [
      /\b25\s*mm\b/i,

      /1000\s*(stück|stueck|stk)|(?:stück|stueck|stk)\s*1000/i,
    ],

    forbidden: [
      /\b35\s*mm\b/i,
    ],
  },


  {
    id:
      "tn35-1000",

    detect:
      /tn\s*35|schnellbauschraube.*35/i,

    search:
      "Schnellbauschrauben TN 35 1000 Stück",

    required: [
      /\b35\s*mm\b/i,

      /1000\s*(stück|stueck|stk)|(?:stück|stueck|stk)\s*1000/i,
    ],

    forbidden: [
      /\b25\s*mm\b/i,
    ],
  },


  /* -------------------------
     GRUNDIERUNG
  ------------------------- */

  {
    id:
      "tiefengrund-10l",

    detect:
      /tiefengrund|tiefgrund/i,

    search:
      "Tiefengrund 10 l",

    required: [
      /\b10\s*l(?:iter)?\b/i,
    ],

    forbidden: [
      /\b1\s*l\b/i,
      /\b2[,.]?5\s*l\b/i,
      /\b5\s*l\b/i,
    ],
  },


  /* -------------------------
     ACRYL
  ------------------------- */

  {
    id:
      "acryl-310ml",

    detect:
      /\bacryl\b/i,

    search:
      "Acryl 310 ml",

    required: [
      /\b310\s*ml\b/i,
    ],

    forbidden: [
      /silikon/i,
    ],
  },


  /* -------------------------
     DÄMMUNG
  ------------------------- */

  {
    id:
      "mineralwolle-50mm",

    detect:
      /mineralwolle|steinwolle|klemmfilz/i,

    search:
      "Mineralwolle 50 mm",

    required: [
      /\b50\s*mm\b/i,
    ],

    forbidden: [
      /\b80\s*mm\b/i,
      /\b100\s*mm\b/i,
      /\b120\s*mm\b/i,
      /\b140\s*mm\b/i,
    ],
  },


  /* -------------------------
     DIREKTABHÄNGER
  ------------------------- */

  {
    id:
      "direktabhaenger-125",

    detect:
      /direktabhänger|direktabhaenger/i,

    search:
      "Direktabhänger 125 mm",

    required: [
      /\b125\s*mm\b/i,
    ],

    forbidden: [],
  },


  /* -------------------------
     DAMPFBREMSE
  ------------------------- */

  {
    id:
      "dampfbremse-100m2",

    detect:
      /dampfbremse/i,

    search:
      "Dampfbremse 100 m2",

    required: [
      /100\s*m²|100\s*m2|2\s*m\s*[x×]\s*50\s*m/i,
    ],

    forbidden: [],
  },


  /* -------------------------
     PE-FOLIE
  ------------------------- */

  {
    id:
      "pe-folie-100m2",

    detect:
      /pe[- ]?folie|polyethylenfolie/i,

    search:
      "PE Folie 100 m2",

    required: [
      /100\s*m²|100\s*m2|4\s*m\s*[x×]\s*25\s*m/i,
    ],

    forbidden: [],
  },


  /* -------------------------
     RANDDÄMMSTREIFEN
  ------------------------- */

  {
    id:
      "randdaemmstreifen-100-25",

    detect:
      /randdämmstreifen|randdaemmstreifen/i,

    search:
      "Randdämmstreifen 100 mm 25 m",

    required: [
      /\b100\s*mm\b/i,
      /\b25\s*m\b/i,
    ],

    forbidden: [],
  },
];


/* =========================================================
   REFERENZ ERKENNEN
========================================================= */

function findComparison(
  userQuery
) {
  return (
    COMPARISON_PRODUCTS.find(
      (reference) =>
        reference.detect.test(
          userQuery
        )
    ) ??
    null
  );
}


/* =========================================================
   PRODUKT MUSS REFERENZ ERFÜLLEN
========================================================= */

function matchesReference(
  product,
  reference
) {
  const text =
    `${product.name} ${product.rawText || ""}`;


  for (
    const forbidden of
    reference.forbidden
  ) {
    if (
      forbidden.test(text)
    ) {
      return false;
    }
  }


  for (
    const required of
    reference.required
  ) {
    if (
      !required.test(text)
    ) {
      return false;
    }
  }


  return true;
}


/* =========================================================
   NAMENSÜBEREINSTIMMUNG
========================================================= */

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");
}


function keywordScore(
  product,
  query
) {
  const productText =
    normalize(
      `${product.name} ${product.rawText}`
    );

  const ignored =
    new Set([
      "kg",
      "mm",
      "cm",
      "m",
      "liter",
      "stück",
      "stueck",
      "stk",
      "x",
    ]);


  const words =
    normalize(query)
      .split(
        /[^a-z0-9]+/
      )
      .filter(
        (word) =>
          word.length >= 3 &&
          !ignored.has(word) &&
          !/^\d+$/.test(word)
      );


  if (
    words.length === 0
  ) {
    return 1;
  }


  let hits = 0;

  for (const word of words) {
    if (
      productText.includes(
        word
      )
    ) {
      hits++;
    }
  }


  return hits /
    words.length;
}


/* =========================================================
   BESTES PRODUKT
========================================================= */

function selectBest(
  products,
  reference,
  query
) {
  const candidates =
    products

      .filter(
        (product) =>
          Number.isFinite(
            Number(
              product.price
            )
          ) &&
          Number(
            product.price
          ) > 0
      )

      .filter(
        (product) =>
          matchesReference(
            product,
            reference
          )
      )

      .map(
        (product) => ({
          product,

          score:
            keywordScore(
              product,
              query
            ),
        })
      )

      .filter(
        (entry) =>
          entry.score >=
          0.25
      )

      .sort(
        (a, b) => {
          if (
            b.score !==
            a.score
          ) {
            return (
              b.score -
              a.score
            );
          }

          return (
            Number(
              a.product.price
            ) -
            Number(
              b.product.price
            )
          );
        }
      );


  return (
    candidates[0]?.product ??
    null
  );
}


/* =========================================================
   MAIN
========================================================= */

async function main() {
  const userQuery =
    process.argv
      .slice(2)
      .join(" ")
      .trim();


  if (!userQuery) {
    console.error(
      'Beispiel: node compare-all.mjs "Rotband 30 kg"'
    );

    process.exit(1);
  }


  const reference =
    findComparison(
      userQuery
    );


  if (!reference) {
    console.error(
      `Kein Vergleichsstandard für "${userQuery}" gefunden.`
    );

    process.exit(1);
  }


  console.log("");
  console.log(
    "========================================"
  );

  console.log(
    `EINGABE: ${userQuery}`
  );

  console.log(
    `VERGLEICH: ${reference.id}`
  );

  console.log(
    `SHOP-SUCHE: ${reference.search}`
  );

  console.log(
    "========================================"
  );

  console.log("");


  /*
   * Alle Baumärkte gleichzeitig.
   */
  const results =
    await searchAllShops(
      reference.search
    );


  console.log("");
  console.log(
    "========================================"
  );

  console.log(
    "ERGEBNIS"
  );

  console.log(
    "========================================"
  );


  for (const shop of results) {

    console.log("");
    console.log(
      shop.storeName
    );


    if (
      shop.status ===
      "blocked"
    ) {
      console.log(
        "BLOCKIERT → später manuell"
      );

      continue;
    }


    if (
      shop.status ===
      "error"
    ) {
      console.log(
        `FEHLER → ${shop.error}`
      );

      continue;
    }


    if (
      shop.status ===
      "no-products"
    ) {
      console.log(
        "KEINE PRODUKTE LESBAR → später manuell"
      );

      continue;
    }


    const product =
      selectBest(
        shop.products,
        reference,
        reference.search
      );


    if (!product) {
      console.log(
        "KEIN GLEICHWERTIGES PRODUKT"
      );

      continue;
    }


    console.log(
      `✓ ${product.name}`
    );

    console.log(
      `  Produktpreis: ${Number(product.price).toFixed(2)} €`
    );


    if (
      product.unitPrice != null
    ) {
      console.log(
        `  Grundpreis: ${Number(product.unitPrice).toFixed(2)} €`
      );
    }


    console.log(
      `  ${product.url}`
    );
  }


  console.log("");
  console.log(
    "========================================"
  );

  console.log(
    "FERTIG"
  );

  console.log(
    "========================================"
  );
}


main().catch(
  (error) => {
    console.error(error);

    process.exit(1);
  }
);