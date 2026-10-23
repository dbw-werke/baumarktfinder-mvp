/**
 * Discovery vocabulary only. Callers must keep the original material/specs and
 * validate each found offer before accepting its size, purpose or price.
 * This module is shared by customer search and background retailer readers.
 */
const clean = value => typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
const ascii = value => value.replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
  .replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue").replace(/ß/g, "ss");
const normalized = value => ascii(clean(value)).toLowerCase().replace(/×/g, "x");
const positive = value => Number.isFinite(Number(value)) && Number(value) > 0;
const numberLabel = value => String(Number(value)).replace(".", ",");

function inputContext(input) {
  const material = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const name = typeof input === "string" ? input : material.name || material.suggestion_label || material.store_search_term || "";
  const specs = material.specs && typeof material.specs === "object" ? material.specs : {};
  return { material, name: clean(name), specs, brand: clean(material.brand),
    family: clean(material.product_family || material.productFamily),
    text: normalized([name, material.product_family, specs.type, specs.profile].filter(Boolean).join(" ")) };
}

// Explicit family metadata wins over ambiguous brand words in a product title.
function inferFamily(context) {
  if (context.family) return context.family;
  const patterns = [
    ["uniflott-finish", /uniflott.*finish/], ["uniflott", /uniflott/],
    ["vario", /(?:rigips.*vario|vario.*(?:fugen|spachtel)|^vario$)/],
    ["rotband", /rotband/], ["perlfix", /perlfix|perflix/],
    ["super-haftgrund", /super[ -]?haftgrund/], ["tiefengrund", /tiefen?grund/], ["haftgrund", /haftgrund/],
    ["tn-schrauben", /schnellbauschraub|trockenbauschraub|gips(?:karton|platten?)schraub/],
    ["direktabhaenger", /direktabhaenger/], ["noniusabhaenger", /nonius/],
    ["randdaemmstreifen", /randdaemmstreifen|estrichrandstreifen/],
    ["trennwandband", /trennwand(?:[ -]dichtungs)?band/], ["dichtungsband", /dichtungsband|dichtband/],
    ["dampfbremse", /dampfbrems|klimamembran/], ["pe-folie", /pe[ -]?(?:bau)?folie|baufolie|polyethylenfolie/],
    ["cd-profil", /\bcd(?:\b|\d)|deckenprofil/], ["ud-profil", /\bud(?:\b|\d)|wandanschlussprofil/],
    ["cw-profil", /\bcw(?:\b|\d)|staenderprofil/], ["uw-profil", /\buw(?:\b|\d)|rahmenprofil/],
    ["mineralwolle", /glaswolle|steinwolle|mineralwolle|klemmfilz|sonorock|trennwandplatte/],
    ["armierungsgewebe", /armierungs(?:glas)?gewebe|putzgewebe|glasfasergewebe/],
    ["pu-schaum", /bauschaum|montageschaum|pu[ -]?schaum|pistolenschaum/],
    ["silikon", /silikon/], ["acryl", /acryl(?:[ -]dichtstoff|at)?\b/],
    ["rollputz", /rollputz|streichputz|easyputz/], ["sockelputz", /sockelputz/],
    ["schleifpapier", /schleifpapier|schleifblatt|schleifbogen|schleifscheibe|schleifrolle/],
    ["osb", /\bosb/], ["gipskarton", /gipskarton|gipsplatte|rigipsplatte|regips|\brigips\b|\bgk(?:b|bi)?\b/],
    ["zement", /^zement(?:\b|,)/],
  ];
  return patterns.find(([, pattern]) => pattern.test(context.text))?.[0] || "";
}

function colorName(context) {
  const color = clean(context.specs.color);
  if (color) return /^weiss|weiß$/i.test(color) ? "weiß" : color;
  return context.text.match(/\b(weiss|weissgrau|transparent|grau|schwarz|beige|champagner)\b/)?.[0]?.replace(/^weiss$/, "weiß") || "";
}

function compactFallback(name) {
  // Do not pass an entire dimension chain or package description to a retailer.
  const withoutUnits = clean(name).replace(/\b\d+(?:[.,]\d+)?(?:\s*[×x]\s*\d+(?:[.,]\d+)?)*\s*(?:µm|mm|cm|kg|ml|m²|m2|g\/m²|g\/m2|g|l|m|Stück|Stueck|Stk\.?|Blatt|Rollen?)\b(?:\s*\/\s*(?:Rolle|Paket))?/gi, " ");
  return clean(withoutUnits.split(/[,;|]/)[0].replace(/\s*[×x]\s*$/i, ""))
    .split(" ").filter(Boolean).slice(0, 6).join(" ").slice(0, 80).trim();
}

function vocabulary(context) {
  const { specs, text, name } = context;
  const family = inferFamily(context);
  const color = colorName(context);
  const withColor = value => clean(`${value} ${color}`);
  switch (family) {
    case "rotband": return /finish|flaechenspachtel|renovier|\bpro\b/.test(text)
      ? [compactFallback(name)] : ["Rotband", "Knauf Rotband", "Rotband Haftputzgips"];
    case "perlfix": return ["Perlfix", "Knauf Perlfix", "Perlfix Ansetzgips", "Perflix"];
    case "vario": return ["Vario Fugenspachtel", "Rigips Vario", "Vario"];
    case "uniflott-finish": return ["Uniflott Finish", "Knauf Uniflott Finish", "Uniflott Fertigspachtel"];
    case "uniflott": return ["Uniflott", "Knauf Uniflott", "Uniflott Fugenspachtel"];
    case "super-haftgrund": return ["Super Haftgrund", "MEM Super Haftgrund", "Super-Haftgrund"];
    case "haftgrund": return ["Haftgrund", "Haftgrundierung"];
    case "tiefengrund": return ["Tiefengrund", "Tiefgrund"];
    case "pu-schaum": {
      // Component count is an identity, not a size preference. Never search for
      // 1K on behalf of a 2K request, even during the broadest fallback attempt.
      const component = /\b2[ -]?k\b|zweikomponent/.test(text) ? "2K"
        : /\b1[ -]?k\b|einkomponent/.test(text) || specs.excluded_terms?.some?.(term => /^2[ -]?k$/i.test(term)) ? "1K" : "";
      const suffix = component ? ` ${component}` : "";
      const words = [`Bauschaum${suffix}`, `PU Bauschaum${suffix}`, `Montageschaum${suffix}`, `PU Schaum${suffix}`];
      if (/genius/.test(text)) words.splice(1, 0, `Soudal Genius Gun${suffix}`);
      return words;
    }
    case "sanitaer-silikon-acetat":
    case "silikon": return [withColor("Sanitär Silikon"), withColor("Sanitärsilikon"), withColor("Silikon")];
    case "acryl": return [withColor("Acryl"), withColor("Acryl Dichtstoff"), withColor("Maleracryl")];
    case "pe-folie": return ["PE Baufolie", "Baufolie", "PE Folie", "Polyethylenfolie"];
    case "dampfbremse": return /feuchtevariabel|variabel|klimamembran/.test(text) || positive(specs.sd_max_m)
      ? ["Dampfbremse", "Klimamembran", "Dampfbremsfolie", "Dampfbremse variabel"]
      : ["Dampfbremse", "Dampfbremsfolie"];
    case "randdaemmstreifen": return ["Randdämmstreifen", "Randdämmstreifen mit Folie", "Estrichrandstreifen", "Randstreifen Estrich"];
    case "trennwandband": return ["Trennwandband", "Trennwand Dichtungsband", "Dichtungsband Trockenbau", "Anschlussband Trockenbau"];
    case "dichtungsband": return ["Dichtungsband Trockenbau", "Trennwandband", "Trennwand Dichtungsband", "Anschlussband Trockenbau"];
    case "direktabhaenger": return ["Direktabhänger", "Direktabhänger CD", "Direktabhänger Deckenprofil"];
    case "noniusabhaenger": return /oberteil/.test(text)
      ? ["Nonius Oberteil", "Noniusabhänger Oberteil"] : ["Nonius Unterteil", "Noniusabhänger Unterteil"];
    case "cd-profil": return ["CD Profil", "CD Deckenprofil", "Deckenprofil CD"];
    case "ud-profil": return ["UD Profil", "UD Wandprofil", "Wandanschlussprofil UD"];
    case "cw-profil": return ["CW Profil", "CW Ständerprofil", "Ständerprofil CW"];
    case "uw-profil": return ["UW Profil", "UW Rahmenprofil", "Rahmenprofil UW"];
    case "tn-schrauben": return ["Schnellbauschrauben TN", "Trockenbauschrauben Feingewinde", "Gipskartonschrauben Feingewinde"];
    case "gipskarton": return /feuchtraum|gkbi|impraegniert/.test(text)
      ? ["Gipskarton Feuchtraum", "Gipskarton imprägniert", "Gipskartonplatte grün", "GKBI Platte"]
      : ["Gipskartonplatte", "Gipskarton", "Rigipsplatte", "Gipsplatte", "GKB Platte", "Regipsplatte"];
    case "osb": return ["OSB Platte", "OSB Verlegeplatte", "OSB 3", "OSB Nut Feder"];
    case "mineralwolle": {
      const material = /steinwolle|sonorock/.test(text) ? "Steinwolle" : /glaswolle|klemmfilz/.test(text) ? "Glaswolle" : "Mineralwolle";
      const thickness = positive(specs.thickness_mm) ? Number(specs.thickness_mm)
        : Number(text.match(/\b(\d+(?:[.,]\d+)?)\s*(?:mm\b|x\s*\d)/)?.[1]?.replace(",", "."));
      const primary = `${material}${positive(thickness) ? ` ${numberLabel(thickness)} mm` : ""}`;
      return [primary, ...(material === "Glaswolle" ? ["Glaswolle Klemmfilz", "Klemmfilz"]
        : material === "Steinwolle" ? ["Steinwolle Trennwandplatte", "Steinwolle"] : ["Mineralwolle Dämmung", "Mineralwolle"]), material];
    }
    case "armierungsgewebe": return ["Armierungsgewebe", "Putzgewebe", "Armierungsglasgewebe", "Glasfasergewebe Putz"];
    case "sockelputz": return ["Sockelputz", "Zementsockelputz", "Zement Sockelputz"];
    case "rollputz": return [withColor("Rollputz"), withColor("Streichputz"), "Rollputz"];
    case "zement": return ["Zement", "Portlandzement"];
    case "schleifpapier": {
      if (Array.isArray(specs.grits) || /sortiment|k\s*\d+(?:\s*\/\s*\d+){2,}/.test(text)) {
        return ["Schleifpapier Sortiment", "Schleifpapier Set", "Schleifbogen Sortiment"];
      }
      const grit = positive(specs.grit) ? Number(specs.grit) : Number(text.match(/\b[pk]\s*(\d+)\b/)?.[1]);
      const suffix = positive(grit) ? ` K${grit}` : "";
      if (positive(specs.diameter_mm) || /scheibe/.test(text)) return [`Schleifscheibe${suffix}`, `Trockenbau Schleifpapier${suffix}`];
      if (/schleifpapierrolle|schleifrolle/.test(text)) return [`Schleifpapierrolle${suffix}`, `Schleifrolle${suffix}`];
      return [`Schleifpapier${suffix}`, `Schleifbogen${suffix}`, `Schleifblatt${suffix}`];
    }
    default: {
      const primary = compactFallback(name || context.material.store_search_term || family);
      const brand = context.brand;
      const simpler = brand && normalized(primary).startsWith(`${normalized(brand)} `) ? primary.slice(brand.length).trim() : primary;
      // New families automatically get a useful short query; authored aliases
      // can add actual synonyms without introducing a new family-specific rule.
      const aliases = Array.isArray(context.material.aliases) ? context.material.aliases.map(compactFallback) : [];
      return [primary, simpler, ...aliases];
    }
  }
}

/** @param {string | {name?: string, suggestion_label?: string | null, store_search_term?: string, product_family?: string, productFamily?: string, brand?: string | null, specs?: object, aliases?: string[]} | null | undefined} input */
export function getMaterialDisplayName(input) {
  return vocabulary(inputContext(input)).find(Boolean) || "";
}

/**
 * Ordered, bounded discovery attempts, starting with the short customer name.
 * Retry synonyms/broader terms only after no technically valid offer is found.
 * @param {Parameters<typeof getMaterialDisplayName>[0]} input
 * @returns {string[]}
 */
export function getMaterialSearchTerms(input) {
  const context = inputContext(input);
  const terms = vocabulary(context).filter(Boolean);
  const primary = terms[0];
  if (primary && context.brand && !normalized(primary).includes(normalized(context.brand))) terms.push(`${context.brand} ${primary}`);
  const result = [];
  const seen = new Set();
  for (const term of [...terms, ...terms.map(ascii)]) {
    const value = clean(term).slice(0, 80);
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
    if (result.length === 8) break;
  }
  return result;
}

/** A short name plus enough measured detail to choose between catalogue variants.
 * Full manufacturer titles and technical matching records remain unchanged.
 * @param {Parameters<typeof getMaterialDisplayName>[0] & {package_quantity?: number, base_unit?: string}} input
 */
export function getMaterialOptionLabel(input) {
  const { specs } = inputContext(input);
  const name = getMaterialDisplayName(input);
  const parts = [name];
  const dimensions = [specs.thickness_mm ?? specs.height_mm, specs.width_mm, specs.length_mm]
    .filter(positive);
  if (dimensions.length) parts.push(`${dimensions.map(numberLabel).join(" × ")} mm`);
  if (positive(specs.diameter_mm)) parts.push(`Ø ${numberLabel(specs.diameter_mm)} mm`);
  if (positive(specs.grammage_g_m2)) parts.push(`${numberLabel(specs.grammage_g_m2)} g/m²`);
  const quantity = input?.package_quantity, unit = input?.base_unit;
  if (positive(quantity) && unit) parts.push(unit === "l" && quantity < 1 ? `${numberLabel(quantity * 1000)} ml`
    : `${numberLabel(quantity)} ${{ m2: "m²", piece: "Stück" }[unit] ?? unit}`);
  if (/genius/.test(String(specs.type))) parts.push("Genius Gun");
  if (specs.color && !normalized(name).includes(normalized(specs.color))) parts.push(specs.color);
  if (positive(specs.sd_m)) parts.push(`sd ${numberLabel(specs.sd_m)} m`);
  if (positive(specs.sd_max_m)) parts.push("feuchtevariabel");
  if (String(specs.type).includes("acetat")) parts.push("essigvernetzend");
  if (specs.profile && /abh/.test(String(specs.type))) parts.push(String(specs.profile).toUpperCase());
  if (positive(specs.thermal_conductivity)) parts.push(`WLG ${String(Math.round(specs.thermal_conductivity * 1000)).padStart(3, "0")}`);
  return parts.join(" · ");
}
