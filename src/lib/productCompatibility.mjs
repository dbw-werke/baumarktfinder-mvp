/** Shared by the browser comparison and the Node updater. No product-name guessing. */
const sizeFields = {
  kg: ["weight_kg", "pieces"],
  l: ["volume_l", "pieces"],
  m: ["length_mm", "pieces"],
  m2: ["length_mm", "width_mm", "area_m2", "pieces"],
  piece: ["pieces"],
};
const numericFields = ["weight_kg", "volume_l", "length_mm", "width_mm", "height_mm", "thickness_mm", "diameter_mm", "area_m2", "pieces", "grit", "grammage_g_m2", "sd_m", "thermal_conductivity"];
const functionalFields = {
  gipskarton: ["thickness_mm"], osb: ["thickness_mm"], mineralwolle: ["thickness_mm", "thermal_conductivity"],
  "ud-profil": ["width_mm", "height_mm"], "cd-profil": ["width_mm", "height_mm"], "cw-profil": ["width_mm"], "uw-profil": ["width_mm"],
  trennwandband: ["width_mm", "thickness_mm"], dichtungsband: ["width_mm", "thickness_mm"], randdaemmstreifen: ["width_mm", "thickness_mm"],
  "tn-schrauben": ["diameter_mm", "length_mm"], direktabhaenger: ["length_mm", "profile"], noniusabhaenger: ["length_mm", "profile"],
  "pe-folie": ["thickness_mm"],
  armierungsgewebe: ["width_mm", "length_mm"], schleifpapier: ["grit", "width_mm", "length_mm"],
};
const positive = (value) => typeof value === "number" && Number.isFinite(value) && value > 0;
const close = (left, right) => Math.abs(left - right) <= Math.max(1e-8, Math.abs(right) * 1e-8);
const normalized = (value) => value.toLocaleLowerCase("de-DE").replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").trim();
const drywallBandFamily = (value) => /^(?:trennwandband|trennwand[ -]dichtungsband|dichtungsband|dichtband|anschlussband)$/.test(normalized(value ?? ""));
const comparisonFamily = (value) => drywallBandFamily(value) ? "trennwandband" : normalized(value);

/** Generic dry paper can serve wood; an explicit metal request still requires proven metal suitability. */
export function productPurposeConflict(material, product) {
  const isEdgeStrip = [material?.product_family, material?.productFamily].includes("randdaemmstreifen");
  const isDrywallBand = drywallBandFamily(material?.product_family ?? material?.productFamily);
  const isSuperHaftgrund = [material?.product_family, material?.productFamily, material?.specs?.type].includes("super-haftgrund");
  if (!isEdgeStrip && !isDrywallBand && !isSuperHaftgrund && ![material?.product_family, material?.productFamily].includes("schleifpapier") && material?.family !== "abrasive") return null;
  const strings = (value, depth = 0) => {
    if (typeof value === "string") return [value];
    if (!value || typeof value !== "object" || depth > 4) return [];
    return Object.values(value).flatMap(entry => strings(entry, depth + 1));
  };
  const fields = [product?.name, product?.product_name, product?.category, product?.description,
    product?.attributes, product?.structuredAttributes, product?.additionalProperty,
    product?.observedSpecs, product?.observed_specs, product?.metadata];
  const text = normalized(fields.flatMap(value => strings(value)).join(" "))
    .replace(/\b(?:nicht|kein[e]?|ohne)\s+(?:fuer\s+)?(?:nassschliff|nassschleifen|nassfest|wasserfest|wet sanding)\b/g, "");
  if (isEdgeStrip) {
    if (/ohne\s+(?:folien?lasche|folie|lasche)/.test(text)) return "incompatible-edge-strip:without-film";
    return /folien?lasche|folienschuerze|schleppfolie|mit\s+(?:folie|lasche)/.test(text) ? null : "unverified-edge-strip:film";
  }
  if (isSuperHaftgrund) {
    const identity = normalized([product?.name, product?.product_name, product?.brand, product?.attributes,
      product?.structuredAttributes, product?.additionalProperty, product?.observedSpecs, product?.observed_specs,
      product?.metadata?.brand, product?.metadata?.product_name, product?.metadata?.product_type]
      .flatMap(value => strings(value)).join(" "));
    if (/tiefen?grund|betonkontakt|quarzsand|quarzgefuellt|quarzhaltig/.test(identity)) return "incompatible-super-haftgrund";
    return /\bmem\b/.test(identity) && /\bsuper[ -]?haftgrund\b/.test(identity) ? null : "unverified-super-haftgrund";
  }
  if (isDrywallBand) {
    if (/sanitaer|fenster|tuerdicht|bitumen|butyl|abdichtungsbahn|abdichtungsband|dichtmanschette|fugendicht|kompriband|randdaemmstreifen|badewanne|dusch/.test(text)) return "incompatible-band-purpose";
    const bandName = /trennwand(?:[ -]dichtungs)?band|dichtungsband|\bdichtband\b|anschlussband/.test(text);
    const drywallPurpose = /trennwand|trockenbau|schalldaemm|metallprofil|wand.{0,30}(?:boden|decken?).{0,30}anschl/.test(text);
    return bandName && drywallPurpose ? null : "unverified-band-purpose";
  }
  if (/nass|wet[ -]?(?:and|or|\/|sanding|dry)|wasserfest|waterproof/.test(text)) return "incompatible-abrasive-purpose:wet-sanding";
  if (/schleifgewebe|schleifleinen|gewebeschleif|\bgewebe\b|cloth|schleifgitter|\bgitter\b|\bmesh\b/.test(text)) return "incompatible-abrasive-type:backing";
  // Purpose-built dry-wall paper discs are valid size variants, with their real machine size displayed.
  if (/trockenbau|gipskarton|spachtelflaechen/.test(text) && !/dreieck|delta[ -]?schleif|schleifband\b/.test(text)) return null;
  if (/schleifscheibe|schleifteller|dreieck|delta[ -]?schleif|schleifband\b/.test(text)) return "incompatible-abrasive-type:machine-shape";
  const requestedPurpose = normalized([material?.name, ...(material?.specs?.required_terms ?? [])].join(" "));
  const requiresMetal = /metall?|metal/.test(requestedPurpose);
  if (!/holz|wood/.test(text) || (requiresMetal && !/metall?|metal/.test(text))) {
    return requiresMetal ? "unverified-abrasive-purpose:wood-and-metal" : "unverified-abrasive-purpose:wood";
  }
  return null;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return typeof value === "string" ? normalized(value) : value;
}

function identitySpecs(specs, unit) {
  return Object.fromEntries(Object.entries(specs).filter(([key]) => !sizeFields[unit].includes(key) && !["min_package_price", "max_package_price", "required_terms", "excluded_terms", "color"].includes(key))
    .sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => [key,
      ["required_terms", "excluded_terms"].includes(key) && Array.isArray(value) ? [...new Set(value.map(normalized))].sort() : stable(value)]));
}

/** Reject inconsistent package metadata before considering any alternative. */
export function hasComparableSpecification(material) {
  if (!material || typeof material.product_family !== "string" || !material.product_family.trim()
    || !(material.brand === null || (typeof material.brand === "string" && material.brand.trim()))
    || !Object.hasOwn(sizeFields, material.base_unit) || !positive(material.package_quantity)
    || material.active === false || !Number.isInteger(material.canonical_version) || material.canonical_version < 1) return false;
  const specs = material.specs;
  if (!specs || typeof specs !== "object" || Array.isArray(specs) || typeof specs.type !== "string" || !specs.type.trim()) return false;
  if (material.product_family === "dampfbremse" && !(positive(specs.sd_m)
    || (positive(specs.sd_min_m) && positive(specs.sd_max_m) && specs.sd_min_m < specs.sd_max_m))) return false;
  // The VARIO comparison is explicitly restricted to one 25 kg sack, including exact offers.
  if (comparisonFamily(material.product_family) === "vario"
    && (material.base_unit !== "kg" || !close(material.package_quantity, 25) || !close(specs.weight_kg, 25) || (specs.pieces ?? 1) !== 1)) return false;
  if (numericFields.some((key) => specs[key] !== undefined && !positive(specs[key]))) return false;
  if ((functionalFields[comparisonFamily(material.product_family)] ?? []).some((key) => typeof specs[key] === "string" ? !specs[key].trim() : !positive(specs[key]))) return false;
  if (specs.pieces !== undefined && !Number.isInteger(specs.pieces)) return false;
  if (["required_terms", "excluded_terms"].some((key) => specs[key] !== undefined && (!Array.isArray(specs[key]) || specs[key].some((term) => typeof term !== "string" || !term.trim())))) return false;
  const pieces = specs.pieces ?? 1;
  const quantity = { kg: specs.weight_kg, l: specs.volume_l, m: specs.length_mm / 1000 * pieces,
    m2: specs.length_mm * specs.width_mm / 1e6 * pieces, piece: specs.pieces }[material.base_unit];
  if (!positive(quantity) || !close(quantity, material.package_quantity)) return false;
  return specs.area_m2 === undefined || material.base_unit !== "m2" || close(specs.area_m2, quantity);
}

/**
 * null means incompatible or incomplete. Zero means the same size.
 * Only declared size axes can differ; every functional spec stays equal.
 * Distance is relative to the requested size, so a closer size wins before price.
 */
export function getVariantDistance(preferred, actual) {
  if (!hasComparableSpecification(preferred) || !hasComparableSpecification(actual)
    || comparisonFamily(preferred.product_family) !== comparisonFamily(actual.product_family)) return null;
  const family = comparisonFamily(preferred.product_family);
  const crossUnitPrimer = family === "haftgrund" && [preferred.base_unit, actual.base_unit].every(unit => ["kg", "l"].includes(unit));
  if (preferred.base_unit !== actual.base_unit && !crossUnitPrimer) return null;
  const wantedIdentity = identitySpecs(preferred.specs, preferred.base_unit);
  const actualIdentity = identitySpecs(actual.specs, actual.base_unit);
  let sdRangePenalty = 0;
  if (family === "dampfbremse") {
    // A humidity-variable membrane is a labelled alternative, never relabelled as fixed sd 2 m.
    if (positive(preferred.specs.sd_m) && positive(actual.specs.sd_min_m) && positive(actual.specs.sd_max_m)) {
      if (preferred.specs.sd_m < actual.specs.sd_min_m || preferred.specs.sd_m > actual.specs.sd_max_m) return null;
      delete wantedIdentity.sd_m; delete actualIdentity.sd_min_m; delete actualIdentity.sd_max_m;
      sdRangePenalty = 1;
    }
  }
  let bandThicknessPenalty = 0;
  if (family === "randdaemmstreifen") {
    if (!close(preferred.specs.thickness_mm, actual.specs.thickness_mm)) return null;
    const heightDifference = Math.abs(actual.specs.width_mm - preferred.specs.width_mm) / preferred.specs.width_mm;
    if (heightDifference > 0.2) return null;
    delete wantedIdentity.width_mm; delete actualIdentity.width_mm;
    bandThicknessPenalty = heightDifference;
  }
  if (family === "trennwandband") {
    // Canonical band families already establish drywall use; plain display names need not repeat it.
    // Explicit conflicting use still invalidates metadata. Retailer offers require positive evidence separately.
    if ([preferred, actual].some(material => productPurposeConflict(material, material) === "incompatible-band-purpose")) return null;
    // Drywall foam tapes share an application, but must still fit the same profile width.
    if (!close(preferred.specs.width_mm, actual.specs.width_mm)) return null;
    bandThicknessPenalty = Math.abs(actual.specs.thickness_mm - preferred.specs.thickness_mm) / preferred.specs.thickness_mm;
    if (bandThicknessPenalty > 0.1) return null;
    wantedIdentity.type = comparisonFamily(wantedIdentity.type);
    actualIdentity.type = comparisonFamily(actualIdentity.type);
    delete wantedIdentity.thickness_mm; delete actualIdentity.thickness_mm;
  }
  // A broad mesh query has no specified grammage; explicit grammage stays strict.
  if (family === "armierungsgewebe" && preferred.specs.grammage_g_m2 === undefined) delete actualIdentity.grammage_g_m2;
  // Sandpaper sheets/strips keep their real dimensions and grit, never a converted price.
  if (family === "schleifpapier") for (const key of ["length_mm", "width_mm"]) { delete wantedIdentity[key]; delete actualIdentity[key]; }
  if (family === "schleifpapier" && preferred.specs.diameter_mm === undefined) delete actualIdentity.diameter_mm;
  if (JSON.stringify(wantedIdentity) !== JSON.stringify(actualIdentity)) return null;
  if (preferred.base_unit !== actual.base_unit) return 2; // No mass/volume conversion; prefer same-unit packages.
  const relative = (left, right) => Math.abs(right - left) / left;
  const distances = [relative(preferred.package_quantity, actual.package_quantity)];
  if (["m", "m2"].includes(preferred.base_unit)) distances.push(relative(preferred.specs.length_mm, actual.specs.length_mm));
  if (preferred.base_unit === "m2") distances.push(relative(preferred.specs.width_mm, actual.specs.width_mm));
  // Equal total quantities can still have different numbers of individual units.
  distances.push(relative(preferred.specs.pieces ?? 1, actual.specs.pieces ?? 1));
  const colorPenalty = preferred.specs.color && normalized(String(preferred.specs.color)) !== normalized(String(actual.specs.color ?? "")) ? 0.2 : 0;
  const brandPenalty = preferred.brand && normalized(preferred.brand) !== normalized(actual.brand ?? "") ? 0.05 : 0;
  return distances.reduce((sum, value) => sum + value, 0) / distances.length + colorPenalty + brandPenalty + bandThicknessPenalty + sdRangePenalty;
}
