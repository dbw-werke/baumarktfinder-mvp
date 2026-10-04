import { normalize, extractSpecifications } from "./product-standardizer.mjs";

/** OBI query matching has no dependency on canonical material records or their IDs. */
export function normalizeObiQuery(query) {
  return normalize(String(query ?? "").replace(/<[^>]*>/g, " ").replace(/[\u0000-\u001f]/g, " "))
    .replace(/[‐‑–—]/g, "-").replace(/\s+/g, " ").trim().slice(0, 160);
}
const number = (value) => Number.isFinite(Number(value)) && Number(value) > 0;
const equal = (a, b) => number(a) && number(b) && Math.abs(Number(a) - Number(b)) < Math.max(.001, Number(b) * .00001);
const germanNumber = (value) => String(value).replace(/\b(\d{1,3})\.(\d{3})(?=\s*(?:mm|cm|m|ml|l|kg|Stück|Stueck|Stk)\b)/gi, "$1$2");
const families = [
  { id: "direct-hanger", test: /direktabhaenger/, shape: "hanger", exclude: /nonius|verbinder|schraub/ },
  { id: "reinforcement-mesh", test: /armierungsgewebe|glasfasergewebe|putzgewebe/, shape: "mesh", exclude: /eckwinkel|gewebewinkel|eckprofil|gewebeband|streifen/ },
  { id: "gypsum-wet", test: /feuchtraumplatte|gkbi|gipskarton.*impraegniert/, shape: "board", exclude: /brandschutz|feuerschutz|\bgkfi\b/ },
  { id: "gypsum-special", test: /brandschutzplatte|feuerschutzplatte|fireboard|silentboard|\bgkfi?\b/, shape: "board" },
  { id: "uniflott-finish", test: /uniflott.*finish/, shape: "bag" },
  { id: "uniflott", test: /uniflott/, shape: "bag", exclude: /finish|impraegniert/ },
  { id: "rotband-finish", test: /rotband.*(?:finish|spachtel|\bpro\b)/, shape: "bag" },
  { id: "rotband", test: /rotband/, shape: "bag", exclude: /finish|spachtel|\bpro\b/ },
  { id: "perlfix", test: /perlfix/, shape: "bag" },
  { id: "drywall-screw", test: /schnellbauschraub|trockenbauschraub|gipskartonschraub/, shape: "screw" },
  { id: "screw", test: /schraube/, shape: "screw", exclude: /schrauber|schraubendreher|schraubenschluessel/ },
  { id: "cd-profile", test: /\bcd(?:[ -]?profil|\b)|deckenprofil/, shape: "profile", exclude: /\bcw\b|\buw\b|\bud\b|abhaenger|verbinder|schraub/ },
  { id: "cw-profile", test: /\bcw(?:[ -]?profil|\b)|staenderprofil/, shape: "profile", exclude: /\bcd\b|\buw\b|\bud\b|verbinder|schraub/ },
  { id: "uw-profile", test: /\buw(?:[ -]?profil|\b)|rahmenprofil/, shape: "profile", exclude: /\bcd\b|\bcw\b|\bud\b|verbinder|schraub/ },
  { id: "ud-profile", test: /\bud(?:[ -]?profil|\b)|randprofil/, shape: "profile", exclude: /\bcd\b|\bcw\b|\buw\b|verbinder|schraub/ },
  { id: "paint", test: /farbe|weisslack|buntlack|acryllack|dispersionslack|wandlack/, shape: "liquid", exclude: /farbrolle|farbwalze|farbwanne|pinsel|abtoenpaste|farbentferner/ },
  { id: "hybrid-sealant", test: /hybrid|ms[ -]?polymer|smp[ -]?polymer/, shape: "liquid" },
  { id: "mounting-adhesive", test: /montagekleber/, shape: "liquid" },
  { id: "pu-sealant", test: /pu[ -]?dichtstoff|polyurethan[ -]?dichtstoff/, shape: "liquid" },
  { id: "silicone", test: /silikon/, shape: "liquid", exclude: /acryl|entferner|reiniger|fugenabzieher|silikonpinsel|silikonform/ },
  { id: "acrylic", test: /acryl/, shape: "liquid", exclude: /silikon|hybrid|ms[ -]?polymer|smp[ -]?polymer|polyurethan|\bpu\b|montagekleber|farbe|lack|reiniger|entferner|kartuschenpresse/ },
  { id: "deep-primer", test: /tief(?:en)?grund/, shape: "liquid", exclude: /haftgrund|betonkontakt/ },
  { id: "bonding-primer", test: /haftgrund/, shape: "liquid", exclude: /tief(?:en)?grund/ },
  { id: "concrete-primer", test: /betonkontakt/, shape: "liquid" },
  { id: "primer", test: /grundierung|grundiermittel|putzgrund|sperrgrund|isoliergrund/, shape: "liquid" },
  { id: "pu-foam", test: /\bpu[ -]?schaum|montageschaum|bauschaum|pistolenschaum|brunnenschaum|polyurethanschaum/, shape: "liquid", exclude: /reiniger|entferner|schaumpistole|ersatz|pistolenduese/ },
  { id: "roll-plaster", test: /rollputz|streichputz|easyputz/, shape: "bag", exclude: /rolle|walze|werkzeug/ },
  { id: "plinth-plaster", test: /sockelputz|sockelleichtputz/, shape: "bag", exclude: /farbe|profil|gewebe/ },
  { id: "tile-adhesive", test: /fliesenkleber|flexkleber|fliesenklebemoertel/, shape: "bag" },
  { id: "dry-screed", test: /trockenestrich|estrichelement|estrichplatte/, shape: "board" },
  { id: "screed", test: /estrich|fliessestrich/, shape: "bag", exclude: /randstreifen|folie|matte|klammer|gitter|schleifer|platte|element/ },
  { id: "mortar", test: /moertel/, shape: "bag" },
  { id: "plaster", test: /putz/, shape: "bag" },
  { id: "cement", test: /zement|\bcem\s*[iv]/, shape: "bag", exclude: /moertel|estrich|beton|farbe|putz|faser|platte|reiniger/ },
  { id: "abrasive", test: /schleifpapier|schleifblatt|schleifgitter|schleifbogen/, shape: "abrasive", exclude: /maschine|schleifer|schleifgeraet/ },
  { id: "mineral-wool", test: /mineralwolle|glaswolle|steinwolle|klemmfilz|trennwandplatte|sonorock|akustic/, shape: "insulation", exclude: /rohrschale|du[e]?bel|messer|kleber|halter/ },
  { id: "insulation-board", test: /daemmplatte|hartschaumplatte|\bxps\b|\beps\b|styropor|styrodur|holzfaserplatte/, shape: "insulation", exclude: /kleber|du[e]?bel|halter|messer/ },
  { id: "osb", test: /\bosb/, shape: "board", exclude: /lack|schraub|kleber/ },
  { id: "filler", test: /spachtelmasse|fugenspachtel|flaechenspachtel|renovierspachtel|feinspachtel|fuellspachtel/, shape: "bag" },
  { id: "gypsum", test: /gipskarton|rigips|gipsplatte|bauplatte|\bgkb\b/, shape: "board", exclude: /feuchtraum|impraegniert|gkbi|brandschutz|feuerschutz|gkfi|hartgips|diamant|silentboard|schallschutz|akustik|fireboard|spezialplatte|zement|\bxps\b|\beps\b|gipsfaser|schraub|spachtel|kleber/ },
];
const byFamily = new Map(families.map((family) => [family.id, family]));
const detect = (text) => families.find((family) => family.test.test(text))?.id ?? "unknown";
const colorPattern = /\b(weiss|grau|schwarz|transparent|beige|braun|rot|blau|gruen)\b/;
const accessoryPattern = /entferner|reiniger|kartuschenpresse|fugenabzieher|schraubendreher|schrauber\b|farbwalze|farbwanne|farbrolle|abdeckfolie|schleifmaschine/;

function fields(product) {
  const attributes = [];
  const attribute = (name,value) => {
    let key=normalize(name), content=normalize(germanNumber(value));
    const suffix=key.match(/\s*\((l|kg|mm|cm|m|m2|m²)\)$/);
    if (suffix) {key=key.slice(0,suffix.index);if (/^\d+(?:\.\d+)?$/.test(content)) content+=` ${suffix[1]}`;}
    // Early browser cache entries included the shipping-size table. Keep their real price/date,
    // but derive dimensions from the product title until a scoped observation replaces them.
    if (product.priceSource==='obi-rendered-product' && product.attributeEvidence!=='own-product-data-section' && /^(gewicht|hoehe|breite|tiefe|laenge|staerke)$/.test(key)) return;
    attributes.push({name:key,value:content});
  };
  for (const source of [product.attributes, product.structuredAttributes, product.additionalProperty, product.metadata?.attributes]) {
    if (Array.isArray(source)) for (const entry of source) {
      if (entry && typeof entry === "object" && ["string", "number"].includes(typeof entry.value))
        attribute(entry.name || entry.key,entry.value);
    }
    else if (source && typeof source === "object") for (const [name, value] of Object.entries(source)) {
      if (["string", "number"].includes(typeof value)) attribute(name,value);
    }
  }
  const clean = (text) => normalize(text).replace(/\b(?:silikon|acryl|loesemittel)frei\b/g, "").replace(/\b(?:ohne|kein(?:e|en)?)\s+(?:silikon|acryl)\b/g, "");
  const name = clean(germanNumber(product.name || product.product_name || ""));
  const identityAttrs = attributes.filter(({ name }) => /^(?:artikeltyp|produkttyp|produktart|ausfuehrung|material|grundmaterial|basis|bindemittel|typ|type|family|product_family|chemische basis|serie)$/.test(name));
  const primary = [name, ...identityAttrs.map(({ value }) => clean(value)), ...Object.entries(product.observedSpecs || {})
    .filter(([key, value]) => /^(type|family|product_family|material)$/.test(key) && typeof value === "string").map(([, value]) => clean(value))].join(" ");
  const category = clean(product.category || product.metadata?.category).split(/>|\//).at(-1) || "";
  const description = clean(product.description || product.metadata?.description).split(/\b(?:fuer|geeignet|anstelle|statt|im vergleich|verwendbar)\b/)[0].slice(0, 400);
  return { name, primary, category, description, attributes };
}

function specifications(product, family) {
  const own = fields(product), shape = byFamily.get(family)?.shape || "generic";
  // Reuse the established reader specification parser without constructing a canonical material.
  const parsed = extractSpecifications({ ...product, name: own.name, attributes: own.attributes }, { family: shape });
  const add = (key, value) => {
    if (!number(value)) return;
    if (parsed.values[key] != null && !equal(parsed.values[key], value)) parsed.conflicts.push(key);
    else parsed.values[key] = Number(value);
  };
  if (shape === "profile") {
    const section = own.name.match(/\b(?:cd|cw|uw|ud)(?:[ -]?profil)?\s*(\d+(?:\.\d+)?)\s*(?:[/x-]\s*(\d+(?:\.\d+)?))?/);
    if (section && (section[2] || parsed.values.width_mm == null)) {
      add("width_mm", section[2] ? Math.max(Number(section[1]),Number(section[2])) : section[1]);
      if (section[2]) add("height_mm", Math.min(Number(section[1]),Number(section[2])));
    }
  }
  const grit = own.name.match(/(?:koernung|korn)\s*(\d{2,4})\b/); if (grit) add("grit", grit[1]);
  const thermal = own.name.match(/\b(?:wlg|wls)\s*(0?\d{2})\b/); if (thermal) add("thermal_conductivity", Number(thermal[1]) / 1000);
  if (product.observedSpecs?.thermal_conductivity) add("thermal_conductivity",product.observedSpecs.thermal_conductivity);
  for (const { name, value } of own.attributes) {
    if (/^(koernung|korn)$/.test(name)) add("grit", value.replace(/^[kp]\s*/, ""));
    if (/^(waermeleitgruppe|wlg|wls)$/.test(name)) add("thermal_conductivity", Number(value) > 1 ? Number(value) / 1000 : value);
  }
  const color = normalize(product.observedSpecs?.color || own.attributes.find((attr) => /^(farbe|farbton|grundfarbe|color)$/.test(attr.name))?.value || own.name).match(colorPattern)?.[1];
  if (color) parsed.values.color = color;
  return { ...parsed, fields: own };
}

/** Explicit technical identity is mandatory; quantities and colours are ranking preferences. */
export function detectObiQueryIntent(query) {
  const normalizedQuery = normalizeObiQuery(query);
  let family = detect(normalizedQuery);
  if (/^(?:daemmung|waermedaemmung|daemmstoff(?:e)?)$/.test(normalizedQuery)) family = "mineral-wool";
  const { values } = specifications({ name: normalizedQuery }, family);
  const packageKeys = new Set(["weight_kg", "volume_l", "pieces", "area_m2"]);
  if (["profile", "hanger"].includes(byFamily.get(family)?.shape)) packageKeys.add("length_mm");
  if (["board", "insulation", "mesh", "abrasive"].includes(byFamily.get(family)?.shape)) {
    packageKeys.add("length_mm"); packageKeys.add("width_mm");
  }
  const essentialSpecs = Object.fromEntries(Object.entries(values).filter(([key]) => !packageKeys.has(key) && key !== "color"));
  const packageSpecs = Object.fromEntries(Object.entries(values).filter(([key]) => packageKeys.has(key)));
  const essentialTerms = [];
  for (const pattern of [/\b(?:feingewinde|grobgewinde|bohrspitze|edelstahl)\b/, /\b(?:steinwolle|glaswolle)\b/, /\b(?:sanitaer|neutralvernetzend|essigvernetzend|acetat)\b/]) {
    const term = normalizedQuery.match(pattern)?.[0]; if (term) essentialTerms.push(term);
  }
  const osb = normalizedQuery.match(/\bosb\s*[/ -]?([234])\b/); if (osb) essentialTerms.push(`osb ${osb[1]}`);
  return { family, normalizedQuery, requestedSpecs: values, essentialSpecs, packageSpecs, preferredColor: values.color || null, essentialTerms };
}

const format = (value) => Number(value).toLocaleString("de-DE", { maximumFractionDigits: 4 });
/** Package labels always describe the observed product. No price is converted to the requested size. */
export function extractObiProductPackage(product, family = detect(fields(product).primary)) {
  const { values, conflicts, fields: own } = specifications(product, family);
  const shape = byFamily.get(family)?.shape;
  const labels = [];
  let packageQuantity, baseUnit;
  // A count plus a container volume is ambiguous unless the per-container size is explicit.
  const multi = own.name.match(/\b(\d+)\s*(?:x|stueck\s*(?:a|à|je))\s*(\d+(?:\.\d+)?)\s*(ml|l|kg)\b/);
  if (multi) {
    const count = Number(multi[1]), key = multi[3] === "kg" ? "weight_kg" : "volume_l";
    if (values.pieces && values.pieces !== count) conflicts.push("multipack-count");
    values.pieces = count;
    values[key] = count * Number(multi[2]) * (multi[3] === "ml" ? .001 : 1);
  } else if (values.pieces > 1 && (values.volume_l || values.weight_kg)) conflicts.push("ambiguous-multipack-quantity");
  if (number(values.volume_l)) {
    packageQuantity = values.volume_l; baseUnit = "l";
    labels.push(values.volume_l < 1 ? `${format(values.volume_l * 1000)} ml` : `${format(values.volume_l)} l`);
  } else if (number(values.weight_kg)) { packageQuantity = values.weight_kg; baseUnit = "kg"; labels.push(`${format(values.weight_kg)} kg`); }
  if (number(values.length_mm) && number(values.width_mm)) {
    const third = values.thickness_mm || values.height_mm;
    labels.push(`${[values.length_mm, values.width_mm, ...(third ? [third] : [])].map(format).join(" × ")} mm`);
  } else if (number(values.length_mm)) labels.push(`${values.diameter_mm ? `${format(values.diameter_mm)} × ` : ""}${format(values.length_mm)} mm`);
  else if (number(values.thickness_mm)) labels.push(`${format(values.thickness_mm)} mm`);
  else if (number(values.width_mm) && shape === "profile") labels.push(`${format(values.width_mm)}${values.height_mm ? `/${format(values.height_mm)}` : ""} mm`);
  if (number(values.area_m2) && !packageQuantity && ["board", "insulation", "mesh", "film"].includes(shape)) {
    packageQuantity = values.area_m2; baseUnit = "m2"; labels.push(`${format(packageQuantity)} m²`);
  }
  if (number(values.pieces)) {
    labels.push(`${format(values.pieces)} Stück`);
    if (!packageQuantity) { packageQuantity = values.pieces; baseUnit = "piece"; }
  }
  if (!packageQuantity && number(values.length_mm) && shape === "profile") { packageQuantity = values.length_mm / 1000 * (values.pieces || 1); baseUnit = "m"; }
  if (number(values.grit)) labels.push(`K${values.grit}`);
  // Own product package fields can label a product even when they cannot establish a numeric quantity.
  const explicitLabel = product.packageLabel || product.actualSize || own.attributes.find((a) => /^(packungsgroesse|gebindegroesse|verkaufseinheit)$/.test(a.name))?.value;
  const actualSize = labels.length ? [...new Set(labels)].join(" · ") : typeof explicitLabel === "string" ? explicitLabel.slice(0, 160) : "";
  return { actualSize, ...(packageQuantity ? { packageQuantity, baseUnit } : {}), observedSpecs: values, conflicts: [...new Set(conflicts)] };
}

function compatible(requested, detected, own) {
  if (requested === detected) return true;
  if (requested === "screw" && detected === "drywall-screw") return true;
  if (requested === "primer" && ["deep-primer", "bonding-primer", "concrete-primer"].includes(detected)) return true;
  if (requested === "filler" && ["uniflott", "uniflott-finish", "rotband-finish"].includes(detected)) return true;
  if (requested === "insulation-board" && detected === "mineral-wool" && /platte/.test(own.primary)) return true;
  return false;
}
const ignoredWords = new Set(["fuer", "mit", "und", "von", "der", "die", "das", "weiss", "grau", "schwarz", "transparent", "mm", "cm", "ml", "kg", "liter", "stueck"]);
const queryWords = (query) => query.split(/[^a-z0-9]+/).filter((word) => word.length > 2 && !/^\d+$/.test(word) && !ignoredWords.has(word));
const identityRequirements = [
  [/\bxps\b|styrodur/, /\bxps\b|styrodur/, "xps"], [/\beps\b|styropor/, /\beps\b|styropor/, "eps"],
  [/fassadenfarbe|aussenfarbe/, /fassadenfarbe|aussenfarbe/, "exterior-paint"],
  [/innenfarbe|wandfarbe/, /innenfarbe|wandfarbe|innen\b/, "interior-paint"],
  [/zementputz/, /zementputz|zementgebunden/, "cement-plaster"], [/gipsputz/, /gipsputz|gipsgebunden/, "gypsum-plaster"],
  [/portlandzement/, /portlandzement/, "portland-cement"], [/trasszement/, /trasszement/, "trass-cement"],
  [/zementestrich|betonestrich/, /zementestrich|betonestrich|zementgebunden/, "cement-screed"],
  [/calciumsulfat|anhydrit/, /calciumsulfat|anhydrit/, "calcium-sulfate"],
];

export function rankObiCandidates(query, products = []) {
  const intent = detectObiQueryIntent(query), normalizedQuery = intent.normalizedQuery;
  const ranked = [], diagnostics = [];
  for (const product of products) {
    const own = fields(product);
    const primaryFamily = detect(own.primary);
    const detectedFamily = primaryFamily !== "unknown" ? primaryFamily : detect(`${own.category} ${own.description}`);
    const actual = extractObiProductPackage(product, detectedFamily);
    const diagnostic = { store: "OBI", productName: product.name || product.product_name || "", productUrl: product.url || product.product_url || null,
      detectedFamily, requestedFamily: intent.family, requestedSpecs: intent.requestedSpecs, observedSpecs: actual.observedSpecs,
      actualSize: actual.actualSize, packagePrice: product.price ?? product.package_price ?? null, unitPrice:product.declaredUnitPrice ?? product.unitPrice ?? null, matchScore: 0, score: 0, result: "REJECT", hardExclusion: null, rejectionReason: null };
    const reject = (reason) => { diagnostic.rejectionReason = reason; diagnostic.hardExclusion = reason; diagnostics.push(diagnostic); };
    if (!normalizedQuery || !own.name) { reject("missing-query-or-product-name"); continue; }
    if (actual.conflicts.length) { reject(`conflicting-specifications:${actual.conflicts.join(",")}`); continue; }
    if (intent.family !== "unknown") {
      if (!compatible(intent.family, detectedFamily, own)) { reject("incompatible-product-family"); continue; }
      if (byFamily.get(intent.family)?.exclude?.test(own.primary) || accessoryPattern.test(own.primary)) { reject("incompatible-product-or-accessory"); continue; }
    } else {
      // Unlisted construction families remain possible, but applications/category recommendations never supply query relevance.
      const words = queryWords(normalizedQuery);
      if (!words.length || !words.every((word) => own.primary.includes(word))) { reject("insufficient-query-relevance"); continue; }
      if (accessoryPattern.test(own.primary) && !accessoryPattern.test(normalizedQuery)) { reject("unrequested-accessory"); continue; }
    }
    const technicalText = `${own.primary} ${own.attributes.map((a) => `${a.name}: ${a.value}`).join(" ")} ${own.description}`;
    const wrongIdentity = identityRequirements.find(([request, proof]) => request.test(normalizedQuery) && !proof.test(technicalText));
    if (wrongIdentity) { reject(`missing-essential-attribute:${wrongIdentity[2]}`); continue; }
    const missingTerm = intent.essentialTerms.find((term) => term.startsWith("osb ")
      ? !new RegExp(`\\bosb\\s*[/ -]?${term.at(-1)}\\b`).test(technicalText) : !technicalText.includes(term));
    if (missingTerm) { reject(`missing-essential-attribute:${missingTerm}`); continue; }
    const mismatch = Object.entries(intent.essentialSpecs).find(([key, value]) => !equal(actual.observedSpecs[key], value));
    if (mismatch) { reject(`wrong-or-unverified-specification:${mismatch[0]}`); continue; }
    let score = intent.family === "unknown" ? 90 : 100;
    if (detectedFamily === primaryFamily) score += 15;
    if (byFamily.get(intent.family)?.test.test(own.category)) score += 8;
    const packageEntries = Object.entries(intent.packageSpecs);
    let packageDistance = 0, exactPackage = true;
    for (const [key, expected] of packageEntries) {
      const observed = actual.observedSpecs[key];
      if (!number(observed)) { exactPackage = false; packageDistance += 10; continue; }
      const distance = Math.abs(Number(observed) - Number(expected)) / Number(expected);
      packageDistance += distance; exactPackage &&= equal(observed, expected);
      score += equal(observed, expected) ? 40 : distance <= .05 ? 30 : distance <= .15 ? 20 : Math.max(1, 15 - distance * 10);
    }
    if (intent.preferredColor && actual.observedSpecs.color === intent.preferredColor) score += 20;
    if (intent.family === "screw" && detectedFamily === "drywall-screw") score += 8;
    score += Math.min(12, queryWords(normalizedQuery).filter((word) => own.name.includes(word)).length * 3);
    if (actual.actualSize) score += 5;
    diagnostic.matchScore = diagnostic.score = Math.round(score * 100) / 100;
    diagnostic.result = "ACCEPT";
    diagnostics.push(diagnostic);
    ranked.push({ product: { ...product, matchScore: diagnostic.matchScore, detectedFamily, actualSize: actual.actualSize,
      ...(actual.packageQuantity ? { packageQuantity: actual.packageQuantity, baseUnit: actual.baseUnit } : {}),
      ...(number(product.declaredUnitPrice ?? product.unitPrice) ? { unitPrice: Number(product.declaredUnitPrice ?? product.unitPrice) } : {}) },
      score, exactPackage, packageDistance, diagnostic });
  }
  // Exact package first; correctness/score before price. Stable URL/name tie-breaks never bias toward the cheapest.
  ranked.sort((a, b) => Number(b.exactPackage) - Number(a.exactPackage) || b.score - a.score || a.packageDistance - b.packageDistance
    || String(a.product.url || a.product.name).localeCompare(String(b.product.url || b.product.name)));
  const selected = ranked[0]?.product ?? null;
  return { normalizedQuery, intent, candidates: diagnostics.sort((a, b) => b.matchScore - a.matchScore), selected };
}
