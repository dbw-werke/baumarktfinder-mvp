function normalize(value = "") {
  return String(value)
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

function num(v) {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function esc(v) {
  return String(v).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function close(a, b, t = 0.02) {
  return (
    a != null &&
    b != null &&
    Math.abs(a - b) <= Math.max(t, Math.abs(b) * 0.002)
  );
}

function getKg(text) {
  const m = normalize(text).match(/(\d+(?:\.\d+)?)\s*kg\b/);
  return m ? num(m[1]) : null;
}

function getLiter(text) {
  const t = normalize(text);

  let m = t.match(/(\d+(?:\.\d+)?)\s*(?:l|liter)\b/);
  if (m) return num(m[1]);

  m = t.match(/(\d+(?:\.\d+)?)\s*ml\b/);
  return m ? num(m[1]) / 1000 : null;
}

function getMl(text) {
  const m = normalize(text).match(/(\d+(?:\.\d+)?)\s*ml\b/);
  return m ? num(m[1]) : null;
}

function getPieces(text) {
  const t = normalize(text);

  let m = t.match(/(\d+)\s*(?:stueck|stk\.?|st\.)\b/);
  if (m) return Number(m[1]);

  m = t.match(/(?:stueck|stk\.?)\s*(\d+)/);
  return m ? Number(m[1]) : null;
}

function getMmValues(text) {
  return [...normalize(text).matchAll(/(\d+(?:\.\d+)?)\s*mm\b/g)]
    .map((m) => num(m[1]))
    .filter((v) => v != null);
}

function getDimensionPairs(text) {
  const t = normalize(text);
  const out = [];

  for (const m of t.matchAll(
    /(\d+(?:\.\d+)?)\s*(mm|cm|m)?\s*[x/]\s*(\d+(?:\.\d+)?)\s*(mm|cm|m)\b/g
  )) {
    const u1 = m[2] || m[4];
    const u2 = m[4];

    const f = (u) =>
      u === "m"
        ? 1000
        : u === "cm"
          ? 10
          : 1;

    out.push([
      num(m[1]) * f(u1),
      num(m[3]) * f(u2),
    ]);
  }

  return out;
}

function hasExactPair(text, a, b, tol = 0.15) {
  return getDimensionPairs(text).some(
    ([x, y]) =>
      (close(x, a, tol) && close(y, b, tol)) ||
      (close(x, b, tol) && close(y, a, tol))
  );
}

function hasThickness(text, mm) {
  return getMmValues(text).some((v) => close(v, mm, 1));
}

function getGsm(text) {
  const t = normalize(text);

  const m = t.match(
    /(\d+(?:\.\d+)?)\s*g\s*\/?\s*m(?:2|²)\b/
  );

  return m ? num(m[1]) : null;
}

function getMeshWidthMm(text) {
  const t = normalize(text);

  const factor = (unit) =>
    unit === "m"
      ? 1000
      : unit === "cm"
        ? 10
        : 1;

  const widths = [];

  for (const m of t.matchAll(
    /(\d+(?:\.\d+)?)\s*(mm|cm|m)\s*x\s*(\d+(?:\.\d+)?)\s*(mm|cm|m)\b/g
  )) {
    const a = num(m[1]) * factor(m[2]);
    const b = num(m[3]) * factor(m[4]);

    if (a != null && b != null) {
      widths.push(Math.min(a, b));
    }
  }

  return widths.length
    ? Math.max(...widths)
    : null;
}

function getGrit(text) {
  const t = normalize(text);

  const m = t.match(
    /\b(?:k|p)\s*(\d{2,4})\b/
  );

  return m ? Number(m[1]) : null;
}

function rawMaterial(material) {
  return [
    material?.name,
    material?.suggestion_label,
    material?.store_search_term,
    material?.product_family,
    material?.brand,
    material?.package_size,
    material?.package_unit,
  ]
    .filter(Boolean)
    .join(" ");
}

function explicitKg(raw) {
  return getKg(raw);
}

function explicitLiter(raw) {
  return getLiter(raw);
}

function explicitMl(raw) {
  return getMl(raw);
}

function explicitPieces(raw) {
  return getPieces(raw);
}

function explicitThickness(raw) {
  const vals = getMmValues(raw);

  return (
    vals.find(
      (v) => v >= 4 && v <= 300
    ) ?? null
  );
}

function base(
  id,
  family,
  search,
  productMatch,
  extra = {}
) {
  return {
    id,
    family,
    search,
    productMatch,
    minPrice: 0.5,
    maxPrice: 500,
    ...extra,
  };
}

/* ======================================================
   MATERIAL -> TECHNISCHER STANDARD
====================================================== */

export function buildStandard(material) {
  const raw = rawMaterial(material);
  const text = normalize(raw);

  const materialName = normalize(
    material?.name ||
    material?.suggestion_label ||
    ""
  );

  /*
   * DIREKTABHÄNGER
   * MUSS VOR CD/CW/UW/UD KOMMEN.
   */
  if (/direktabhaenger/.test(materialName)) {
    return base(
      "direktabhaenger",
      "hanger",
      "Direktabhänger CD 60/27",
      /direktabhaenger/i,
      {
        requiredName:
          /direktabhaenger/i,

        exclude:
          /deckenprofil|cd[\s-]*profil|cw[\s-]*profil|uw[\s-]*profil|ud[\s-]*profil|staenderprofil|randprofil|nonius/i,

        minPrice: 0.2,
        maxPrice: 100,
      }
    );
  }

  /* ROTBAND */

  if (/rotband/.test(text)) {
    return base(
      "rotband-30kg",
      "bag",
      "Rotband 30 kg",
      /rotband|haftputzgips|gipsputz/i,
      {
        exclude:
          /spachtel|finish|kleber|perlfix|zement|kalk/i,

        kg:
          explicitKg(raw) ?? 30,

        minPrice: 5,
        maxPrice: 40,
      }
    );
  }

  /* PERLFIX */

  if (/perlfix/.test(text)) {
    return base(
      "perlfix-30kg",
      "bag",
      "Perlfix 30 kg",
      /perlfix|ansetzgips|gipskleber/i,
      {
        exclude:
          /rotband|putz|spachtel/i,

        kg:
          explicitKg(raw) ?? 30,

        minPrice: 5,
        maxPrice: 45,
      }
    );
  }

  /* UNIFLOTT */

  if (/uniflott/.test(text)) {
    const kg =
      explicitKg(raw) ?? 25;

    return base(
      `uniflott-${kg}kg`,
      "bag",
      `Uniflott ${kg} kg`,
      /uniflott|fugenspachtel/i,
      {
        exclude:
          /finish|fertigspachtel/i,

        kg,

        minPrice: 5,
        maxPrice: 100,
      }
    );
  }

  /* FEUCHTRAUMPLATTE */

  if (
    /feuchtraum|impraegniert|gkbi/.test(
      text
    )
  ) {
    const th =
      explicitThickness(raw) ?? 12.5;

    return base(
      `feuchtraum-${th}`,
      "board",
      `Feuchtraumplatte ${String(th).replace(
        ".",
        ","
      )} mm`,
      /feuchtraum|impraegniert|gkbi|gipskarton|bauplatte|rigips/i,
      {
        requiredName:
          /feuchtraum|impraegniert|gkbi|gruen/i,

        exclude:
          /brandschutz|fireboard|gkfi/i,

        thickness: th,

        minPrice: 3,
        maxPrice: 60,
      }
    );
  }

  /* NORMALE GIPSKARTONPLATTE */

  if (
    /rigips|gipskarton|bauplatte|gkb\b/.test(
      text
    )
  ) {
    const th =
      explicitThickness(raw) ?? 12.5;

    return base(
      `gipskarton-${th}`,
      "board",
      `Gipskartonplatte ${String(th).replace(
        ".",
        ","
      )} mm`,
      /gipskarton|rigips|bauplatte|gipsplatte|\bgkb\b/i,
      {
        exclude:
          /feuchtraum|impraegniert|gkbi|brandschutz|fireboard|gkfi/i,

        thickness: th,

        minPrice: 3,
        maxPrice: 60,
      }
    );
  }

  /* CD 60/27 */

  if (
    /\bcd\b.*60.*27|60.*27.*\bcd\b/.test(
      text
    )
  ) {
    return base(
      "cd-60-27",
      "profile",
      "CD Profil 60/27",
      /\bcd\b|deckenprofil/i,
      {
        requiredPair:
          [60, 27],

        exclude:
          /\bud\b|\bcw\b|\buw\b/i,

        minPrice: 1,
        maxPrice: 30,
      }
    );
  }

  /* CW 50 */

  if (
    /\bcw\b.*50|50.*\bcw\b/.test(
      text
    )
  ) {
    return base(
      "cw-50",
      "profile",
      "CW Profil 50",
      /\bcw\b|staenderprofil/i,
      {
        requiredName:
          /\bcw\b|cw[-\s]*db|staenderprofil/i,

        requiredWidth: 50,

        exclude:
          /\buw\b|\bcd\b|\bud\b/i,

        minPrice: 1,
        maxPrice: 30,
      }
    );
  }

  /* UW 50 */

  if (
    /\buw\b.*50|50.*\buw\b/.test(
      text
    )
  ) {
    return base(
      "uw-50",
      "profile",
      "UW Profil 50",
      /\buw\b|bodenprofil|wandanschlussprofil|rahmenprofil/i,
      {
        requiredName:
          /\buw\b|uw[-\s]*db|uw[-\s]*rahmenprofil/i,

        requiredWidth: 50,

        exclude:
          /\bcw\b|\bcd\b|\bud\b/i,

        minPrice: 1,
        maxPrice: 30,
      }
    );
  }

  /* UD 28 */

  if (
    /\bud\b.*28|28.*\bud\b/.test(
      text
    )
  ) {
    return base(
      "ud-28",
      "profile",
      "UD Profil 28",
      /\bud\b|randprofil/i,
      {
        requiredName:
          /\bud\b|randprofil/i,

        requiredWidth: 28,

        exclude:
          /\bcd\b|\bcw\b|\buw\b/i,

        minPrice: 1,
        maxPrice: 25,
      }
    );
  }

  /* MINERALWOLLE */

  if (
    /steinwolle|mineralwolle|klemmfilz|daemmfilz|trennwandplatte/.test(
      text
    )
  ) {
    const th =
      explicitThickness(raw) ?? 40;

    return base(
      `mineralwolle-${th}`,
      "insulation",
      `Mineralwolle ${th} mm`,
      /steinwolle|mineralwolle|klemmfilz|daemmfilz|trennwandplatte|akustic|akustik|rockwool|sonorock|isover|ursa/i,
      {
        exclude:
          /gabione|zaun|draht|pflanz|deko|rohrschale/i,

        thickness: th,

        minPrice: 5,
        maxPrice: 180,
      }
    );
  }

  /* SCHNELLBAUSCHRAUBEN */

  if (
    /schnellbauschraube|trockenbauschraube|\btn\s*25|\btn\s*35/.test(
      text
    )
  ) {
    const pairs =
      getDimensionPairs(raw);

    const pair =
      pairs.find(
        ([a, b]) =>
          a <= 10 &&
          b >= 10
      ) ?? null;

    const tnMatch =
      text.match(
        /\btn\s*(25|35)\b/
      );

    const length =
      pair?.[1] ??
      (
        tnMatch?.[1]
          ? Number(tnMatch[1])
          : explicitThickness(raw)
      );

    const diameter =
      pair?.[0] ??
      (
        text.includes("3.5")
          ? 3.5
          : null
      );

    const pieces =
      explicitPieces(raw) ?? 1000;

    return base(
      `screw-${diameter ?? "x"}x${
        length ?? "x"
      }-${pieces}`,
      "screw",
      `Schnellbauschrauben ${
        diameter
          ? `${String(diameter).replace(
              ".",
              ","
            )} x `
          : ""
      }${length ?? 25} mm ${pieces} Stück`,
      /schnellbauschraube|trockenbauschraube|gipskartonschraube|\btn\s*\d+/i,
      {
        screwDiameter:
          diameter,

        screwLength:
          length,

        pieces,

        minPrice: 3,
        maxPrice: 80,
      }
    );
  }

  /* ACRYL */

  if (
    /\bacryl\b|acryldichtstoff/.test(
      text
    )
  ) {
    const ml =
      explicitMl(raw) ?? 310;

    return base(
      `acryl-${ml}ml`,
      "liquid-small",
      `Acryl Weiß ${ml} ml`,
      /acryl|acryldichtstoff|maleracryl/i,
      {
        exclude:
          /silikon|hybrid|montagekleber/i,

        ml,

        minPrice: 1,
        maxPrice: 25,
      }
    );
  }

  /* SILIKON */

  if (/\bsilikon\b/.test(text)) {
    const ml =
      explicitMl(raw);

    return base(
      `silikon-${ml ?? "std"}`,
      "liquid-small",
      ml
        ? `Silikon ${ml} ml`
        : "Silikon",
      /silikon|sanitaersilikon/i,
      {
        exclude:
          /acryl|entferner|fuge.*set/i,

        ml,

        minPrice: 2,
        maxPrice: 30,
      }
    );
  }

  /* TIEFENGRUND */

  if (
    /tiefengrund|tiefgrund/.test(
      text
    )
  ) {
    const l =
      explicitLiter(raw);

    return base(
      `tiefengrund-${l ?? "std"}l`,
      "liquid",
      l
        ? `Tiefengrund ${l} l`
        : "Tiefengrund",
      /tiefengrund|tiefgrund|tiefengrundierung/i,
      {
        exclude:
          /haftgrund|betonkontakt|quarzgrund/i,

        liter: l,

        minPrice: 3,
        maxPrice: 100,
      }
    );
  }

  /* HAFTGRUND */

  if (/haftgrund/.test(text)) {
    const l =
      explicitLiter(raw);

    return base(
      `haftgrund-${l ?? "std"}l`,
      "liquid",
      l
        ? `Haftgrund ${l} l`
        : "Haftgrund",
      /haftgrund|haftprimer|quarzgrund/i,
      {
        exclude:
          /tiefengrund|tiefgrund/i,

        liter: l,

        minPrice: 3,
        maxPrice: 100,
      }
    );
  }

  /* ======================================================
     ARMIERUNGSGEWEBE
     Nur vollwertiges 160-g/m²-Gewebe.
     Schmale Streifen/Bänder werden abgelehnt.
  ====================================================== */

  if (
    /armierungsgewebe|glasfasergewebe/.test(
      text
    )
  ) {
    return base(
      "armierungsgewebe-160",
      "mesh",
      "Armierungsgewebe 160 g/m²",
      /armierungsgewebe|glasfasergewebe|putzgewebe/i,
      {
        requiredGsm: 160,

        minMeshWidthMm: 900,

        exclude:
          /eckwinkel|streifen|band/i,

        minPrice: 5,
        maxPrice: 150,
      }
    );
  }

  /* ======================================================
     PU-SCHAUM
     Keine Röhrchen-/Zubehör-Sets.
  ====================================================== */

  if (
    /pu[- ]?schaum|montageschaum|bauschaum/.test(
      text
    )
  ) {
    const ml =
      explicitMl(raw) ?? 500;

    return base(
      `pu-schaum-${ml}ml`,
      "foam",
      `PU-Schaum ${ml} ml`,
      /pu.?schaum|montageschaum|bauschaum|adapterschaum|pistolenschaum/i,
      {
        requiredName:
          /pu.?schaum|montageschaum|bauschaum|adapterschaum|pistolenschaum/i,

        exclude:
          /reiniger|entferner|roehrchen|rohr.?set|adapterrohr|ersatzrohr|zubehoer|duese|schlauch/i,

        ml,

        minPrice: 2,
        maxPrice: 30,
      }
    );
  }

  /* ======================================================
     ROLLPUTZ
     Für MVP einheitlich 10 kg.
  ====================================================== */

  if (/rollputz/.test(text)) {
    const kg =
      explicitKg(raw) ?? 10;

    return base(
      `rollputz-${kg}kg`,
      "plaster",
      `Rollputz ${kg} kg`,
      /rollputz|streichputz|easyputz/i,
      {
        exclude:
          /rolle|werkzeug/i,

        kg,

        minPrice: 10,
        maxPrice: 150,
      }
    );
  }

  /* SCHLEIFPAPIER */

  if (
    /schleifpapier|schleifgitter/.test(
      text
    )
  ) {
    const grit =
      getGrit(raw) ?? 120;

    return base(
      `schleifpapier-k${grit}`,
      "abrasive",
      `Schleifpapier K${grit}`,
      /schleifpapier|schleifgitter|schleifblatt/i,
      {
        grit,

        exclude:
          /schleifer|maschine|teller/i,

        minPrice: 1,
        maxPrice: 80,
      }
    );
  }

  /* SOCKELPUTZ */

  if (/sockelputz/.test(text)) {
    const kg =
      explicitKg(raw);

    return base(
      "sockelputz",
      "bag",
      kg
        ? `Sockelputz ${kg} kg`
        : "Sockelputz",
      /sockelputz|sockelleichtputz/i,
      {
        exclude:
          /farbe|profil|gewebe/i,

        kg,

        minPrice: 5,
        maxPrice: 80,
      }
    );
  }

  /* ZEMENT */

  if (/\bzement\b/.test(text)) {
    const kg =
      explicitKg(raw);

    return base(
      `zement-${kg ?? "std"}`,
      "bag",
      kg
        ? `Zement ${kg} kg`
        : "Zement",
      /\bzement\b|portlandzement/i,
      {
        exclude:
  /moertel|estrich|beton|farbe|putz|sockelputz|zementputz/i,

        kg,

        minPrice: 3,
        maxPrice: 50,
      }
    );
  }

  return null;
}

/* ======================================================
   TECHNISCHE PRODUKTPRÜFUNG
====================================================== */

function textOf(product) {
  return `${
    product?.name || ""
  } ${
    product?.rawText || ""
  }`;
}

function exactWidth(text, w) {
  const t = normalize(text);

  // Explizite Angaben wie "50 mm"
  const explicitMm = [
    ...t.matchAll(/(\d+(?:\.\d+)?)\s*mm\b/g),
  ]
    .map((m) => num(m[1]))
    .filter((v) => v != null);

  if (
    explicitMm.some(
      (v) => close(v, w, 0.5)
    )
  ) {
    return true;
  }

  // Angaben wie "2000 x 50 x 40 mm"
  for (const m of t.matchAll(
    /(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*mm\b/g
  )) {
    const dimensions = [
      num(m[1]),
      num(m[2]),
      num(m[3]),
    ];

    if (
      dimensions.some(
        (v) => close(v, w, 0.5)
      )
    ) {
      return true;
    }
  }

  // Angaben wie "50 x 40 mm"
  for (const m of t.matchAll(
    /(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*mm\b/g
  )) {
    const dimensions = [
      num(m[1]),
      num(m[2]),
    ];

    if (
      dimensions.some(
        (v) => close(v, w, 0.5)
      )
    ) {
      return true;
    }
  }

  return false;
}

export function productMatchesStandard(
  product,
  standard
) {
  if (
    !standard ||
    !product
  ) {
    return false;
  }

  const text =
    textOf(product);

  const n =
    normalize(text);

  if (
    standard.exclude &&
    standard.exclude.test(n)
  ) {
    return false;
  }

  if (
    standard.productMatch &&
    !standard.productMatch.test(n)
  ) {
    return false;
  }

  if (
    standard.requiredName &&
    !standard.requiredName.test(n)
  ) {
    return false;
  }

  if (
    standard.required &&
    !standard.required.test(n)
  ) {
    return false;
  }

  /* KG */

  if (
    standard.kg != null &&
    !close(
      getKg(text),
      standard.kg,
      0.1
    )
  ) {
    return false;
  }

  /* LITER */

  if (
    standard.liter != null &&
    !close(
      getLiter(text),
      standard.liter,
      0.05
    )
  ) {
    return false;
  }

  /* ML */

  if (
    standard.ml != null &&
    !close(
      getMl(text),
      standard.ml,
      3
    )
  ) {
    return false;
  }

  /* DICKE */

  if (
    standard.thickness != null &&
    !hasThickness(
      text,
      standard.thickness
    )
  ) {
    return false;
  }

  /* EINZELNES MM-MAß */

  if (
    standard.mm != null &&
    !getMmValues(text).some(
      (v) =>
        close(
          v,
          standard.mm,
          1
        )
    )
  ) {
    return false;
  }

  /* STÜCKZAHL */

  if (
    standard.pieces != null &&
    getPieces(text) !==
      standard.pieces
  ) {
    return false;
  }

  /* PROFIL 60 x 27 */

  if (
    standard.requiredPair &&
    !hasExactPair(
      text,
      standard.requiredPair[0],
      standard.requiredPair[1],
      0.5
    )
  ) {
    return false;
  }

  /* PROFILBREITE */

  if (
    standard.requiredWidth != null &&
    !exactWidth(
      text,
      standard.requiredWidth
    )
  ) {
    return false;
  }

  /* ARMIERUNGSGEWEBE: GRAMMATUR */

  if (
    standard.requiredGsm != null
  ) {
    const gsm =
      getGsm(text);

    if (
      gsm == null ||
      !close(
        gsm,
        standard.requiredGsm,
        3
      )
    ) {
      return false;
    }
  }

  /* ARMIERUNGSGEWEBE: MINDESTBREITE */

  if (
    standard.minMeshWidthMm != null
  ) {
    const width =
      getMeshWidthMm(text);

    if (
      width == null ||
      width <
        standard.minMeshWidthMm
    ) {
      return false;
    }
  }

  /* SCHLEIFPAPIER: KÖRNUNG */

  if (
    standard.grit != null
  ) {
    const grit =
      getGrit(text);

    if (
      grit == null ||
      grit !== standard.grit
    ) {
      return false;
    }
  }

  /* SCHRAUBENDURCHMESSER + LÄNGE */

  if (
    standard.screwLength != null ||
    standard.screwDiameter != null
  ) {
    const pairs =
      getDimensionPairs(text).filter(
        ([a, b]) =>
          a <= 10 &&
          b >= 10
      );

    if (!pairs.length) {
      return false;
    }

    const correct =
      pairs.some(
        ([a, b]) =>
          (
            standard.screwDiameter == null ||
            close(
              a,
              standard.screwDiameter,
              0.05
            )
          ) &&
          (
            standard.screwLength == null ||
            close(
              b,
              standard.screwLength,
              0.1
            )
          )
      );

    if (!correct) {
      return false;
    }
  }

  return true;
}

/* ======================================================
   PRODUKTPREIS-PLAUSIBILITÄT

   price = Preis für Sack / Packung / Stück / Eimer
   unitPrice = €/kg, €/l, €/m² usw.
====================================================== */

function saneProductPrice(
  product,
  standard
) {
  const price =
    Number(product?.price);

  if (
    !Number.isFinite(price) ||
    price <= 0
  ) {
    return false;
  }

  if (
    price <
      standard.minPrice ||
    price >
      standard.maxPrice
  ) {
    return false;
  }

  const unit =
    Number(product?.unitPrice);

  if (
    Number.isFinite(unit) &&
    unit > 0
  ) {
    if (
      Math.abs(
        price - unit
      ) <= 0.01
    ) {
      if (
        standard.kg >= 2 ||
        standard.liter >= 2
      ) {
        return false;
      }
    }

    if (
      standard.kg >= 2
    ) {
      const expected =
        unit *
        standard.kg;

      if (
        expected >= 3 &&
        price <
          expected * 0.35
      ) {
        return false;
      }
    }

    if (
      standard.liter >= 2
    ) {
      const expected =
        unit *
        standard.liter;

      if (
        expected >= 3 &&
        price <
          expected * 0.35
      ) {
        return false;
      }
    }
  }

  return true;
}

/* ======================================================
   BESTES PRODUKT EINES SHOPS
====================================================== */

export function chooseNormalizedProduct(
  products,
  standard
) {
  if (
    !standard ||
    !Array.isArray(products)
  ) {
    return null;
  }

  const valid =
    products
      .filter(
        (product) =>
          productMatchesStandard(
            product,
            standard
          )
      )
      .map(
        (product) => ({
          ...product,

          price:
            Number(
              product.price
            ),
        })
      )
      .filter(
        (product) =>
          saneProductPrice(
            product,
            standard
          )
      );

  if (
    valid.length === 0
  ) {
    return null;
  }

  /*
   * Erst nach technischer Prüfung
   * darf nach Preis sortiert werden.
   */
  return valid.sort(
    (a, b) =>
      a.price -
      b.price
  )[0];
}

/* ======================================================
   SHOPÜBERGREIFENDER PREIS-CHECK
====================================================== */

export function filterCrossStorePriceOutliers(
  rows,
  {
    minRatio = 0.5,
    maxRatio = 2,
  } = {}
) {
  const valid =
    (rows || []).filter(
      (row) =>
        Number.isFinite(
          Number(row?.price)
        ) &&
        Number(row.price) > 0
    );

  if (
    valid.length < 3
  ) {
    return rows || [];
  }

  const prices =
    valid
      .map(
        (row) =>
          Number(row.price)
      )
      .sort(
        (a, b) =>
          a - b
      );

  const mid =
    Math.floor(
      prices.length / 2
    );

  const median =
    prices.length % 2
      ? prices[mid]
      : (
          prices[mid - 1] +
          prices[mid]
        ) / 2;

  return (
    rows || []
  ).filter(
    (row) => {
      const p =
        Number(row?.price);

      if (
        !Number.isFinite(p) ||
        p <= 0
      ) {
        return true;
      }

      return (
        p >=
          median * minRatio &&
        p <=
          median * maxRatio
      );
    }
  );
}