/** Match product identity before preferences. Only product-bound reader fields are trusted. */
export function normalize(value = "") {
  return String(value).toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
    .replace(/ß/g, "ss").replace(/×|\*/g, "x").replace(/,/g, ".").replace(/\s+/g, " ").trim();
}
const positive = (v) => Number.isFinite(Number(v)) && Number(v) > 0;
const close = (a, b) => positive(a) && positive(b) && Math.abs(Number(a) - Number(b)) <= Math.max(0.001, Number(b) * 0.00001);
const numericKeys = ["length_mm", "width_mm", "height_mm", "thickness_mm", "diameter_mm", "weight_kg", "volume_l", "pieces", "grammage_g_m2", "grit", "area_m2"];
const families = [
  [/uniflott.*finish/, "bag", /uniflott.*finish/, /impraegniert/],
  [/vario/, "bag", /vario/, /hydro/],
  [/rotband/, "bag", /rotband/, /finish|flaechenspachtel|\bpro\b/],
  [/perlfix/, "bag", /perlfix/, /finish/], [/uniflott/, "bag", /uniflott/, /finish|impraegniert/],
  [/feuchtraum|gkbi/, "board", /feuchtraum|impraegniert|gkbi/, /brandschutz|gkfi/],
  [/\bosb/, "board", /\bosb\s*[/ -]?3\b/, /osb\s*[/ -]?2\b/],
  [/gipskarton|rigips|gipsplatte|\bgkb\b/, "board", /gipskarton|rigipsplatte|gipsplatte|bauplatte|\bgkb\b/, /feuchtraum|impraegniert|gkbi|brandschutz|feuerschutz|\bgkf\b|gkfi|\bdf\b|hartgips|diamant|silentboard|schallschutz|akustik|fireboard|spezialplatte|zementbauplatte|bauplatten?\s*(?:aus\s*)?xps/],
  [/schnellbauschraub|trockenbauschraub/, "screw", /schnellbauschraub|trockenbauschraub|gipskartonschraub/, /bohrspitze/],
  [/direktabhaenger/, "hanger", /direktabhaenger/, /nonius/],
  [/nonius/, "hanger", /nonius.*unterteil/, /oberteil/],
  [/trennwandband|dichtungsband|randdaemmstreifen/, "band", /trennwandband|dichtungsband|randdaemmstreifen/],
  [/dampfbremse|pe.?folie/, "film", /dampfbremse|folie/],
  [/\bcd\b/, "profile", /\bcd\b|deckenprofil/, /\bcw\b|\buw\b|\bud\b/],
  [/\bcw\b/, "profile", /\bcw\b|staenderprofil/, /\bcd\b|\buw\b|\bud\b/],
  [/\buw\b/, "profile", /\buw\b|rahmenprofil/, /\bcd\b|\bcw\b|\bud\b/],
  [/\bud\b/, "profile", /\bud\b|randprofil/, /\bcd\b|\bcw\b|\buw\b/],
  [/mineralwolle|glaswolle|steinwolle|klemmfilz|trennwandplatte/, "insulation", /mineralwolle|glaswolle|steinwolle|klemmfilz|trennwandplatte|sonorock|akustic/, /rohrschale/],
  [/armierungsgewebe/, "mesh", /armierungsgewebe|glasfasergewebe|putzgewebe/, /streifen|eckwinkel|band/],
  [/acryl/, "liquid", /acryl/, /silikon|hybrid|ms[ -]?polymer|smp[ -]?polymer|polyurethan|\bpu[ -]?(?:dichtstoff|fugendicht)|montagekleber|acryl[ -]?(?:farbe|lack)|\b(?:weisslack|buntlack|klarlack|lack|farbe)\b|haftgrund|tiefen?grund|grundierung|baukleber|dichtband|reiniger|fugenabzieher|kartuschenpresse|kuenstler|entferner/],
  [/silikon/, "liquid", /silikon/, /acryl|entferner|werkzeug/],
  [/tiefengrund|tiefgrund/, "liquid", /tiefengrund|tiefgrund/, /haftgrund|betonkontakt/],
  [/haftgrund/, "liquid", /haftgrund/, /tiefengrund/],
  [/pu.?schaum|montageschaum|bauschaum/, "liquid", /pu.?schaum|montageschaum|bauschaum|pistolenschaum/, /reiniger|entferner|ersatz|set/],
  [/rollputz/, "bag", /rollputz|streichputz|easyputz/, /werkzeug|rolle/],
  [/sockelputz/, "bag", /sockelputz|sockelleichtputz/, /farbe|profil|gewebe/],
  [/zement/, "bag", /zement/, /moertel|estrich|beton|farbe|putz/],
  [/schleifpapier/, "abrasive", /schleifpapier|schleifblatt|schleifgitter/, /maschine|schleifer/],
];

export function buildStandard(material) {
  if (!material || !Number.isInteger(Number(material.canonical_version)) || Number(material.canonical_version) < 1 || !["kg", "l", "m", "m2", "piece"].includes(material.base_unit) || !positive(material.package_quantity)) return null;
  const specs = material.specs;
  if (!specs || typeof specs !== "object" || Array.isArray(specs)) return null;
  const known = [...numericKeys, "type", "color", "profile", "sd_m", "thermal_conductivity", "required_terms", "excluded_terms", "min_package_price", "max_package_price"];
  if (Object.keys(specs).some((key) => !known.includes(key))) return null;
  const family = families.find(([pattern]) => pattern.test(normalize(`${material.name || ""} ${material.product_family || ""}`)));
  if (!family) return null;
  const required = { bag: ["weight_kg"], liquid: ["volume_l"], board: ["length_mm", "width_mm", "thickness_mm"],
    profile: ["length_mm", "width_mm"], insulation: ["length_mm", "width_mm", "thickness_mm", "pieces"],
    screw: ["diameter_mm", "length_mm", "pieces"], mesh: ["length_mm", "width_mm", "grammage_g_m2"],
    hanger: ["length_mm", "pieces"], band: ["length_mm", "width_mm", "thickness_mm"], film: ["length_mm", "width_mm"],
    abrasive: ["length_mm", "width_mm", "grit", "pieces"] }[family[1]];
  if (required.some((key) => !positive(specs[key])) || numericKeys.some((key) => specs[key] != null && !positive(specs[key]))) return null;
  const quantity = Number(material.package_quantity);
  const calculated = { kg: specs.weight_kg, l: specs.volume_l,
    m: Number(specs.length_mm) / 1000 * Number(specs.pieces || 1),
    m2: Number(specs.length_mm) * Number(specs.width_mm) / 1e6 * Number(specs.pieces || 1), piece: Number(specs.pieces || 1) }[material.base_unit];
  if (!close(quantity, calculated)) return null;
  return { id: material.id, name: material.name, brand: material.brand ?? null, productFamily: material.product_family || normalize(material.name).replace(/\s+\d.*$/, ""), search: material.store_search_term || material.name, family: family[1], productMatch: family[2],
    exclude: family[3], specs, baseUnit: material.base_unit, packageQuantity: quantity, canonicalVersion: Number(material.canonical_version),
    minPrice: Number(specs.min_package_price || 0.1), maxPrice: Number(specs.max_package_price || 10000) };
}

function productFields(product) {
  const attributes = [];
  const attributeValue = (value) => normalize(typeof value === "string" ? value.replace(/\b([1-9]\d{0,2})\.(\d{3})(?=\s*(?:mm|cm|m|kg|ml|l|Stück|Stueck|Stk|St)\b)/gi, "$1$2") : value);
  for (const source of [product.attributes, product.structuredAttributes, product.additionalProperty, product.metadata?.attributes]) {
    if (Array.isArray(source)) for (const item of source) {
      if (item && typeof item === "object") attributes.push({ name: normalize(item.name || item.key), value: attributeValue(item.value) });
    }
    else if (source && typeof source === "object") for (const [name, value] of Object.entries(source)) {
      if (["string", "number"].includes(typeof value)) attributes.push({ name: normalize(name), value: attributeValue(value) });
    }
  }
  const name = attributeValue(product.name || product.product_name);
  const typed = Object.entries(product.observedSpecs || {}).filter(([key, value]) => ["type", "family", "product_family", "material", "color", "profile"].includes(key) && typeof value === "string").map(([, value]) => value);
  const identity = attributes.filter((item) => /^(?:artikeltyp|produkttyp|produktart|ausfuehrung|material|grundmaterial|inhaltsstoffe|basis|bindemittel|typ|type|family|product_family|chemische basis|serie)$/.test(item.name)).map((item) => item.value);
  // Application substrates and recommendations are not the identity of the sold product.
  const clean = (value) => normalize(value).replace(/\b(?:silikon|acryl|loesemittel)frei\b/g, "").replace(/\b(?:ohne|kein(?:e|en)?)\s+(?:silikon|acryl)\b/g, "");
  const primary = clean([name, ...typed, ...identity].join(" "));
  const category = normalize(product.category || product.metadata?.category).split(/>|\//).at(-1) || "";
  const description = clean(product.description || product.metadata?.description).split(/\b(?:fuer|geeignet|anstelle|statt|im vergleich|verwendbar)\b/)[0].slice(0, 500);
  return { name, attributes, primary, category, description, confirmation: `${primary} ${category} ${description}` };
}

const familyDetectors = [
  ["silicone", /silikon/], ["hybrid-sealant", /hybrid|ms[ -]?polymer|smp[ -]?polymer/],
  ["pu-sealant", /\bpu[ -]?dichtstoff|polyurethan[ -]?dichtstoff/], ["mounting-adhesive", /montagekleber/],
  ["acrylic-paint", /acryl[ -]?(?:farbe|lack)|weisslack|buntlack|kuenstleracryl/],
  ["betonkontakt", /betonkontakt/], ["haftgrund", /haftgrund/], ["tiefengrund", /tiefen?grund/],
  ["acrylic", /acryl/],
  ["uniflott-finish", /uniflott.*finish/], ["uniflott", /uniflott/], ["rotband", /rotband/], ["perlfix", /perlfix/], ["vario", /vario/],
  ["gipskarton-feuchtraum", /feuchtraum|gkbi|impraegniert/], ["osb", /\bosb/],
  ["gipskarton", /gipskarton|rigipsplatte|gipsplatte|bauplatte|\bgkb\b/],
  ["direktabhaenger", /direktabhaenger/], ["noniusabhaenger", /nonius/],
  ["band", /trennwandband|dichtungsband|randdaemmstreifen/], ["tn-schrauben", /schnellbauschraub|trockenbauschraub|gipskartonschraub/],
  ["cd-profil", /\bcd\b/], ["cw-profil", /\bcw\b/], ["uw-profil", /\buw\b/], ["ud-profil", /\bud\b/],
  ["cd-profil", /deckenprofil/], ["cw-profil", /staenderprofil/], ["uw-profil", /rahmenprofil/], ["ud-profil", /randprofil/],
  ["pu-schaum", /pu.?schaum|bauschaum|montageschaum|pistolenschaum/],
  ["mineralwolle", /mineralwolle|glaswolle|steinwolle|klemmfilz|trennwandplatte|sonorock|akustic/],
  ["dampfbremse", /dampfbremse/], ["pe-folie", /pe.?folie|pe.?baufolie/], ["armierungsgewebe", /armierungsgewebe|glasfasergewebe|putzgewebe/],
  ["rollputz", /rollputz|streichputz|easyputz/], ["sockelputz", /sockelputz|sockelleichtputz/], ["zement", /zement/],
  ["schleifpapier", /schleifpapier|schleifblatt|schleifgitter/],
];
function detectedFamily(text) { return familyDetectors.find(([, pattern]) => pattern.test(text))?.[0] ?? "unknown"; }
function requestedFamily(standard) {
  if (standard.specs.type === "feuchtraum") return "gipskarton-feuchtraum";
  return detectedFamily(normalize(`${standard.productFamily} ${standard.name}`)) === "unknown" ? standard.productFamily : detectedFamily(normalize(`${standard.productFamily} ${standard.name}`));
}

export function extractSpecifications(product, standard) {
  const result = {}, conflicts = new Set();
  function add(key, value) {
    if (!positive(value)) return;
    if (result[key] != null && !close(result[key], value)) conflicts.add(key);
    result[key] = Number(value);
  }
  for (const key of numericKeys) if (product.observedSpecs?.[key] != null) add(key, product.observedSpecs[key]);
  const fields = productFields(product);
  for (const { name: key, value } of fields.attributes) {
    if (numericKeys.includes(key)) { add(key, Number(value)); continue; }
    const m = value.match(/^(\d+(?:\.\d+)?)\s*(mm|cm|m|ml|l|liter|kg|g|m2|m²)?(?:\s|$)/);
    if (!m) continue;
    const dimension = { laenge: "length_mm", breite: "width_mm", hoehe: "height_mm", staerke: "thickness_mm", dicke: "thickness_mm", durchmesser: "diameter_mm" }[key];
    if (dimension && ["mm", "cm", "m"].includes(m[2])) add(dimension, Number(m[1]) * ({ mm: 1, cm: 10, m: 1000 }[m[2]]));
    if (/^(inhalt|nenninhalt|volumen|gebinde|packungsinhalt|nettoinhalt)$/.test(key)) {
      if (["ml", "l", "liter"].includes(m[2])) add("volume_l", Number(m[1]) * (m[2] === "ml" ? 0.001 : 1));
      if (["kg", "g"].includes(m[2])) add("weight_kg", Number(m[1]) * (m[2] === "g" ? 0.001 : 1));
    }
    if (/^(anzahl|stueckzahl|stueck pro packung)$/.test(key)) {
      const count = value.replace(/^(\d{1,3})\.(\d{3})(?=\s|$)/, "$1$2").match(/^\d+(?:\.\d+)?/)?.[0];
      add("pieces", count);
    }
  }
  const name = fields.name;
  const capture = (pattern, key, factor = 1) => { for (const m of name.matchAll(pattern)) add(key, Number(m[1]) * factor); };
  capture(/(\d+(?:\.\d+)?)\s*kg\b/g, "weight_kg"); capture(/(\d+(?:\.\d+)?)\s*(?:l|liter)\b/g, "volume_l");
  capture(/(\d+(?:\.\d+)?)\s*ml\b/g, "volume_l", 0.001); capture(/(\d+)\s*(?:stueck|stk\.?|st\b)/g, "pieces");
  capture(/(\d+(?:\.\d+)?)\s*g\s*\/\s*m[2²]/g, "grammage_g_m2"); capture(/\b[kp]\s*(\d{2,4})\b/g, "grit");
  capture(/(\d+(?:\.\d+)?)\s*m[2²]/g, "area_m2");
  const factor = (unit) => unit === "m" ? 1000 : unit === "cm" ? 10 : 1;
  let hasTriple = false;
  for (const m of name.matchAll(/(\d+(?:\.\d+)?)\s*(mm|cm|m)?\s*[x/]\s*(\d+(?:\.\d+)?)\s*(mm|cm|m)?\s*x\s*(\d+(?:\.\d+)?)\s*(mm|cm|m)\b/g)) {
    hasTriple = true;
    const values = [Number(m[1]) * factor(m[2] || m[4] || m[6]), Number(m[3]) * factor(m[4] || m[6]), Number(m[5]) * factor(m[6])].sort((a, b) => b - a);
    add("length_mm", values[0]); add("width_mm", values[1]); add(standard.family === "profile" ? "height_mm" : "thickness_mm", values[2]);
  }
  if (!hasTriple) {
    for (const m of name.matchAll(/(\d+(?:\.\d+)?)\s*(mm|cm|m)?\s*[x/]\s*(\d+(?:\.\d+)?)\s*(mm|cm|m)\b/g)) {
      const values = [Number(m[1]) * factor(m[2] || m[4]), Number(m[3]) * factor(m[4])].sort((a, b) => b - a);
      if (standard.family === "screw") { add("length_mm", values[0]); add("diameter_mm", values[1]); }
      else if (standard.family === "profile" && values[0] < 500) { add("width_mm", values[0]); add("height_mm", values[1]); }
      else { add("length_mm", values[0]); add("width_mm", values[1]); }
    }
    if (["board", "insulation"].includes(standard.family)) for (const m of name.matchAll(/(\d+(?:\.\d+)?)\s*mm\b/g)) if (Number(m[1]) < 500) add("thickness_mm", m[1]);
    if (["profile", "hanger"].includes(standard.family)) for (const m of name.matchAll(/(\d+(?:\.\d+)?)\s*(mm|cm|m)\b/g)) {
      const value = Number(m[1]) * factor(m[2]); if (value >= 500 || standard.family === "hanger") add("length_mm", value);
    }
  }
  capture(/(\d+(?:\.\d+)?)\s*[µμ]m\b/g, "thickness_mm", 0.001);
  if (result.length_mm && result.width_mm && result.area_m2 == null) result.area_m2 = result.length_mm * result.width_mm / 1e6 * Number(result.pieces || 1);
  return { values: result, conflicts: [...conflicts] };
}

const packageAxes = { kg: ["weight_kg"], l: ["volume_l"], m: ["length_mm"], m2: ["length_mm", "width_mm", "area_m2", "pieces"], piece: ["pieces"] };
const colors = /\b(weiss|white|grau|gray|grey|schwarz|black|transparent|beige|braun|brown)\b/;
const colorName = (value) => ({ white: "weiss", gray: "grau", grey: "grau", black: "schwarz", brown: "braun" }[value] || value);
function packageQuantity(values, standard) {
  return { kg: values.weight_kg, l: values.volume_l, m: values.length_mm / 1000 * (values.pieces || 1),
    m2: values.area_m2, piece: values.pieces }[standard.baseUnit];
}

/** Family and essential identity are hard gates; size, colour and wording earn preference points. */
export function evaluateProductMatch(product, standard, { exactPackage = false } = {}) {
  const diagnostic = { accepted: false, score: 0, detectedFamily: "unknown", requestedFamily: standard ? requestedFamily(standard) : "unknown",
    hardExclusion: null, requestedSpecs: standard?.specs ?? {}, observedSpecs: {}, matchKind: null, rejectionReason: null };
  const reject = (reason, hard = false) => ({ ...diagnostic, accepted: false, score: 0, rejectionReason: reason, hardExclusion: hard ? reason : null });
  if (!product || !standard) return reject("unsupported-canonical-specification", true);
  const fields = productFields(product), { values, conflicts } = extractSpecifications(product, standard);
  const attributeText = fields.attributes.map(({ name, value }) => `${name}: ${value}`).join(" ");
  const observedColor = colorName(normalize(product.observedSpecs?.color || fields.attributes.find((a) => /^(farbe|farbton|grundfarbe|color)$/.test(a.name))?.value).match(colors)?.[1] || fields.name.match(colors)?.[1]);
  diagnostic.observedSpecs = { ...values, ...(observedColor ? { color: observedColor } : {}) };
  diagnostic.detectedFamily = detectedFamily(fields.primary);
  const identity = diagnostic.detectedFamily === "unknown" ? fields.confirmation : fields.primary;
  if (diagnostic.detectedFamily === "unknown") diagnostic.detectedFamily = detectedFamily(identity);
  if (diagnostic.detectedFamily !== "unknown" && diagnostic.requestedFamily !== "unknown" && diagnostic.detectedFamily !== diagnostic.requestedFamily) return reject("incompatible_product_family", true);
  if (!standard.productMatch.test(identity)) return reject("incompatible_product_family", true);
  if (standard.exclude?.test(fields.primary)) return reject("incompatible_product_family", true);
  if (standard.family === "board" && standard.specs.type === "standard" && /\bxps\b|\beps\b|zement|gipsfaser/.test(fields.primary)) return reject("incompatible_product_family", true);
  // Long exclusions also occur in German compounds (Tiefengrundkonzentrat).
  // Short codes keep word boundaries: PRO must never reject 'Produkt'.
  const excluded = (standard.specs.excluded_terms || []).filter((term) => !colors.test(normalize(term))).find((term) => {
    const word = normalize(term);
    return word.length >= 5 ? fields.primary.includes(word)
      : new RegExp(`(?:^|[^a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:[^a-z0-9]|$)`).test(fields.primary);
  });
  if (excluded) return reject(`excluded-identity-term:${normalize(excluded)}`, true);
  const evidence = `${fields.primary} ${attributeText} ${fields.description}`;
  const essential = {
    "glaswolle-klemmfilz": /glaswolle|glasfasern?/,
    "steinwolle-trennwandplatte": /steinwolle|steinfasern?|sonorock/,
    "haftgrund-quarzsand": /quarzsand|quarzgefuellt|quarzhaltig/,
    "sanitaer-silikon-acetat": /essig|acetat|acetoxy/,
    "pe-baufolie": /\bpe\b|polyethylen/,
    "tn": /\btn\b|feingewinde/,
    "1k-b2-genius": /\bgenius\b/,
  }[standard.specs.type];
  if (essential && !essential.test(evidence) && normalize(product.observedSpecs?.type) !== normalize(standard.specs.type)) return reject("unverified-essential-attribute", true);
  if (standard.specs.type === "1k-b2-genius" && (!/\bb2\b/.test(evidence) || !/einkomponent|1[ -]?k\b/.test(evidence))) return reject("unverified-essential-attribute", true);
  if (standard.specs.profile && !evidence.replace(/\s+/g, "").includes(normalize(standard.specs.profile))) return reject("wrong-or-missing-profile", true);
  const sd = product.observedSpecs?.sd_m ?? evidence.match(/\bsd(?:[ -]?wert)?\s*[:=]?\s*(\d+(?:\.\d+)?)\s*m\b/)?.[1];
  if (standard.specs.sd_m != null && !close(sd, standard.specs.sd_m)) return reject("wrong-or-missing-sd-value", true);
  const thermal = product.observedSpecs?.thermal_conductivity ?? Number(evidence.match(/\b(?:wlg?|wls)\s*[:=]?\s*(0\d{2})\b/)?.[1]) / 1000;
  if (standard.specs.thermal_conductivity != null && !close(thermal, standard.specs.thermal_conductivity)) return reject("wrong-or-missing-thermal-conductivity", true);
  if (conflicts.length) return reject(`conflicting-specifications:${conflicts.join(",")}`, true);
  let exactSize = true;
  for (const key of numericKeys) {
    if (standard.specs[key] == null) continue;
    if (key === "pieces" && Number(standard.specs[key]) === 1 && values.pieces == null && product.soldIndividually === true) { values.pieces = 1; continue; }
    if (values[key] == null) return reject(`missing-specification:${key}`);
    if (!close(values[key], standard.specs[key])) {
      if (exactPackage || !packageAxes[standard.baseUnit].includes(key)) return reject(`wrong-specification:${key}`, !packageAxes[standard.baseUnit].includes(key));
      exactSize = false;
    }
  }
  if (/\b\d+\s*x\s*\d+(?:\.\d+)?\s*(kg|ml|l)\b/.test(fields.name) || (values.pieces > Number(standard.specs.pieces || 1) && !packageAxes[standard.baseUnit].includes("pieces"))) return reject("unexpected-multipack", true);
  const quantity = packageQuantity(values, standard);
  if (!positive(quantity)) return reject("missing-package-size");
  if (exactPackage && observedColor && standard.specs.color && observedColor !== colorName(normalize(standard.specs.color))) return reject("different-canonical-color");
  const observedBrand = normalize(typeof product.brand === "object" ? product.brand?.name : product.brand);
  if (exactPackage && standard.brand && observedBrand && observedBrand !== normalize(standard.brand)) return reject("different-canonical-brand");
  const distance = Math.abs(quantity - standard.packageQuantity) / standard.packageQuantity;
  const colorScore = standard.specs.color && observedColor === colorName(normalize(standard.specs.color)) ? 20 : 0;
  const properties = (standard.specs.required_terms || []).filter((term) => evidence.includes(normalize(term))).length;
  diagnostic.accepted = true;
  diagnostic.score = 100 + (exactSize ? 40 : distance <= 0.05 ? 30 : distance <= 0.15 ? 20 : Math.max(1, 15 / (1 + distance)))
    + colorScore + Math.min(10, properties * 2) + (standard.productMatch.test(`${fields.category} ${attributeText}`) ? 10 : 0)
    + (standard.brand && (observedBrand === normalize(standard.brand) || fields.name.includes(normalize(standard.brand))) ? 5 : 0);
  diagnostic.matchKind = exactSize ? "exact" : "alternative";
  diagnostic.packageQuantity = quantity;
  diagnostic.packageDistance = distance;
  diagnostic.observedSpecs = { ...diagnostic.observedSpecs, ...values, type: standard.specs.type,
    ...(standard.specs.sd_m != null ? { sd_m: Number(sd) } : {}),
    ...(standard.specs.thermal_conductivity != null ? { thermal_conductivity: Number(thermal) } : {}) };
  return diagnostic;
}

export function getProductMatchRejection(product, standard, options) { return evaluateProductMatch(product, standard, options).rejectionReason; }
export function productMatchesStandard(product, standard, options) { return evaluateProductMatch(product, standard, options).accepted; }

/** The updater and diagnostics use the same validation, so rejected candidates stay explainable. */
export function getProductRejectionReason(product, standard, { exactPackage = true } = {}) {
  const mismatch = getProductMatchRejection(product, standard, { exactPackage });
  if (mismatch) return mismatch;
  if (product.currency !== "EUR") return "unsupported-currency";
  if (!["json-ld-offer", "microdata-offer", "retailer-product-state", "authorized-feed", "manual-admin-verification"].includes(product.priceSource)) return "unverified-price-source";
  if (product.availability && !/^(InStock|LimitedAvailability|OnlineOnly|PreOrder|BackOrder)$/.test(product.availability)) return "not-purchasable";
  // A displayed Grundpreis is rounded. Multiplying it cannot reconstruct the actual total.
  // Require the retailer's independently stated package price, even for exact dimensions.
  if (product.priceBasis !== "package") return product.priceBasis ? "base-unit-price-only" : "missing-package-price-basis";
  if (!positive(product.price)) return "invalid-package-price";
  const price = Number(product.price);
  if (Math.abs(price * 100 - Math.round(price * 100)) > 0.000001) return "invalid-price-precision";
  if (price < standard.minPrice || price > standard.maxPrice) return "package-price-out-of-range";
  const unitPrice = price / evaluateProductMatch(product, standard, { exactPackage }).packageQuantity;
  if (product.declaredUnitPrice != null && (!positive(product.declaredUnitPrice) || Math.abs(Number(product.declaredUnitPrice) - unitPrice) > Math.max(0.011, unitPrice * 0.01))) return "conflicting-unit-price";
  return null;
}

export function normalizeProductPrice(product, standard, { exactPackage = true } = {}) {
  if (getProductRejectionReason(product, standard, { exactPackage })) return null;
  const match = evaluateProductMatch(product, standard, { exactPackage });
  const price = Number(product.price), unitPrice = price / match.packageQuantity;
  return { ...product, price: Math.round(price * 100) / 100, unitPrice: Math.round(unitPrice * 1e6) / 1e6,
    unit: standard.baseUnit, packageQuantity: match.packageQuantity, matchScore: match.score, matchKind: match.matchKind,
    matchEvidence: { canonical_version: standard.canonicalVersion, specs: exactPackage ? standard.specs : { ...standard.specs, ...match.observedSpecs },
      match_score: match.score, detected_family: match.detectedFamily,
      observed_specs: match.observedSpecs, price_basis: product.priceBasis,
      ...(product.priceBasisEvidence ? { price_basis_evidence: product.priceBasisEvidence } : {}),
      extraction: product.priceSource, retrieved_at: product.retrievedAt } };
}
export function chooseNormalizedProduct(products, standard, { exactPackage = true } = {}) {
  return (products || []).map((product) => normalizeProductPrice(product, standard, { exactPackage })).filter(Boolean)
    .sort((a, b) => (a.matchKind === "exact" ? 0 : 1) - (b.matchKind === "exact" ? 0 : 1) || b.matchScore - a.matchScore || a.price - b.price || String(a.url).localeCompare(String(b.url)))[0] || null;
}
export function filterCrossStorePriceOutliers(rows, { minRatio = 0.5, maxRatio = 2 } = {}) {
  const valid = (rows || []).filter((row) => positive(row.price));
  if (valid.length < 3) return valid;
  const prices = valid.map((row) => Number(row.price)).sort((a, b) => a - b), middle = Math.floor(prices.length / 2);
  const median = prices.length % 2 ? prices[middle] : (prices[middle - 1] + prices[middle]) / 2;
  return valid.filter((row) => row.price >= median * minRatio && row.price <= median * maxRatio);
}
