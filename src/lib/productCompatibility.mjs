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
  "ud-profil": ["width_mm", "height_mm"], "cd-profil": ["width_mm", "height_mm"], "cw-profil": ["width_mm", "height_mm"], "uw-profil": ["width_mm", "height_mm"],
  trennwandband: ["width_mm", "thickness_mm"], dichtungsband: ["width_mm", "thickness_mm"], randdaemmstreifen: ["width_mm", "thickness_mm"],
  "tn-schrauben": ["diameter_mm", "length_mm"], direktabhaenger: ["length_mm", "profile"], noniusabhaenger: ["length_mm", "profile"],
  dampfbremse: ["sd_m"], "pe-folie": ["thickness_mm"],
  armierungsgewebe: ["grammage_g_m2"], schleifpapier: ["grit", "width_mm", "length_mm"],
};
const positive = (value) => typeof value === "number" && Number.isFinite(value) && value > 0;
const close = (left, right) => Math.abs(left - right) <= Math.max(1e-8, Math.abs(right) * 1e-8);
const normalized = (value) => value.toLocaleLowerCase("de-DE").replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").trim();

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
  if (numericFields.some((key) => specs[key] !== undefined && !positive(specs[key]))) return false;
  if ((functionalFields[normalized(material.product_family)] ?? []).some((key) => typeof specs[key] === "string" ? !specs[key].trim() : !positive(specs[key]))) return false;
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
    || preferred.base_unit !== actual.base_unit || normalized(preferred.product_family) !== normalized(actual.product_family)) return null;
  if (JSON.stringify(identitySpecs(preferred.specs, preferred.base_unit)) !== JSON.stringify(identitySpecs(actual.specs, actual.base_unit))) return null;
  const relative = (left, right) => Math.abs(right - left) / left;
  const distances = [relative(preferred.package_quantity, actual.package_quantity)];
  if (["m", "m2"].includes(preferred.base_unit)) distances.push(relative(preferred.specs.length_mm, actual.specs.length_mm));
  if (preferred.base_unit === "m2") distances.push(relative(preferred.specs.width_mm, actual.specs.width_mm));
  // Equal total quantities can still have different numbers of individual units.
  distances.push(relative(preferred.specs.pieces ?? 1, actual.specs.pieces ?? 1));
  const colorPenalty = preferred.specs.color && normalized(String(preferred.specs.color)) !== normalized(String(actual.specs.color ?? "")) ? 0.2 : 0;
  const brandPenalty = preferred.brand && normalized(preferred.brand) !== normalized(actual.brand ?? "") ? 0.05 : 0;
  return distances.reduce((sum, value) => sum + value, 0) / distances.length + colorPenalty + brandPenalty;
}
