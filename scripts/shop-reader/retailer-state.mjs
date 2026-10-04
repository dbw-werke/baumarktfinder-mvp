/** Parse public page hydration data as JSON only. Never execute retailer JavaScript. */
const text = (value) => String(value || "").replace(/\s+/g, " ").trim();
const sameUrl = (left, right) => {
  try { const a = new URL(left), b = new URL(right); return a.origin === b.origin && a.pathname.replace(/\/$/, "") === b.pathname.replace(/\/$/, ""); }
  catch { return false; }
};
const decode = (value) => value.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#39;/g, "'")
  .replace(/&#x([a-f0-9]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
function meta(html, property) {
  const values = [];
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = Object.fromEntries([...match[0].matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)].map((item) => [item[1], decode(item[2])]));
    if (attributes.property === property && attributes.content) values.push(attributes.content);
  }
  return new Set(values).size === 1 ? values[0] : null;
}
const packageUnit = (unit) => ["ST", "Stück", "PCE", "Pack", "Paket", "Rolle", "Sack", "Eimer", "Kartusche"].includes(unit);
const euro = (price) => price && (price.currencyCode === "EUR" || price.currency === "€");
const plain = (value) => text(decode(String(value || "").replace(/<[^>]*>/g, " ")));

/** JSON-LD totals need independent package-unit confirmation for sheets and profiles. */
export function confirmHornbachPackagePrices(html, products, pageUrl) {
  let state;
  try { state = JSON.parse(html.match(/window\.__ARTICLE_DETAIL_APOLLO_STATE__\s*=\s*([^\r\n]+)/)?.[1].replace(/;\s*$/, "") || "null"); }
  catch { return products; }
  if (!state || typeof state !== "object") return products;
  return products.map((product) => {
    const matches = Object.values(state).filter((row) => row?.__typename === "Product" && sameUrl(row.url, pageUrl)
      && sameUrl(row.url, product.url) && text(row.title) === text(product.name)
      && String(row.abstractProductId) === String(product.externalId));
    if (matches.length !== 1) return product;
    const row = matches[0];
    // A marketplace seller's offer is not a chain price, including mass/volume products.
    if (row.offerDV?.merchant?.isMarketplaceMerchant === true) return null;
    const identityAttributes = (row.attributeList || []).filter((attribute) =>
      ["Inhaltsstoffe", "Baustoffklasse"].includes(attribute.key)).map((attribute) => text(attribute.value));
    if (/\bDieser einkomponentige PU-Schaum\b/.test(row.description || "")) identityAttributes.push("einkomponentiger PU-Schaum");
    const enriched = { ...product,
      ...(identityAttributes.length ? { name: `${product.name}; ${identityAttributes.join("; ")}` } : {}),
      brand: text(row.brand?.name) || null,
      category: (row.breadcrumbList || []).map((entry) => text((entry.__ref ? state[entry.__ref] : entry)?.name)).filter(Boolean).join(" > ") || null,
      description: plain(row.description),
      attributes: (row.attributeList || []).filter((attribute) => typeof attribute.key === "string" && typeof attribute.value === "string")
        .map((attribute) => ({ name: text(attribute.key), value: plain(attribute.value) })) };
    if (product.priceBasis != null) return enriched;
    if (row.offerDV?.merchant?.isMarketplaceMerchant !== false || row.offerDV?.canBeAddedToCart !== true
      || !packageUnit(row.defaultSalesUnit?.productMeasurementUnitCode)) return enriched;
    const prices = [row.defaultPrice, row.basicPrice].filter((price) => packageUnit(price?.unit) && euro(price));
    if (!prices.length || prices.some((price) => typeof price.price !== "number" || price.price !== product.price)) return enriched;
    const unitPrice = [row.defaultPrice, row.basicPrice].find((price) => ["kg", "l", "m", "m²"].includes(price?.unit) && euro(price));
    return { ...enriched, priceBasis: "package", priceBasisEvidence: "hornbach-same-sku-sales-unit",
      ...(unitPrice ? { declaredUnitPrice: unitPrice.price } : {}) };
  }).filter(Boolean);
}

export function extractToomProductState(html, pageUrl, now = new Date()) {
  let data;
  try { const encoded = html.match(/<div\b(?=[^>]*\bid="root")(?=[^>]*\bdata-props="([^"]+)")[^>]*>/)?.[1];
    data = JSON.parse(decodeURIComponent(decode(encoded || "")))?.content; }
  catch { return []; }
  const info = data?.basic_info, details = data?.details, metadata = data?.meta_data;
  if (!info || !metadata || details?.base_quantity_unit !== "PCE" || !sameUrl(metadata.canonical_url, pageUrl)
    || !pageUrl.replace(/\/$/, "").endsWith(`/${info.sku}`) || typeof metadata.meta_price !== "number" || metadata.meta_price <= 0
    || Number(meta(html, "product:price:amount")) !== metadata.meta_price || text(meta(html, "og:title")) !== text(info.name)
    || !/Alle Preisangaben in EUR inkl\./.test(html)) return [];
  const observedSpecs = {};
  const characteristics = Object.values(data.characteristics || {}).flatMap((group) => Array.isArray(group) ? group : []);
  const identityProperties = [];
  let conflictingSpecs = false;
  const addSpec = (key, value) => {
    if (observedSpecs[key] != null && Math.abs(observedSpecs[key] - value) > 0.001) conflictingSpecs = true;
    observedSpecs[key] = value;
  };
  // Product-bound GKB technical documentation positively identifies a standard board.
  if (Array.isArray(data.documents) && data.documents.some((doc) => doc.type === "technischesdatenblatt" && /(?:_|\b)gkb(?:_|\b)/i.test(doc.filename))) observedSpecs.type = "standard";
  for (const spec of characteristics) {
    const key = ({ mcv_dim_laenge: "length_mm", mca_laenge: "length_mm", mcv_dim_breite: "width_mm", mca_breite: "width_mm", mcv_dim_staerke: "thickness_mm" })[spec.code];
    const measure = String(spec.value).match(/^(\d+(?:[.,]\d+)?)\s*(mm|cm|m)$/);
    if (key && measure) addSpec(key, Number(measure[1].replace(",", ".")) * ({ mm: 1, cm: 10, m: 1000 })[measure[2]]);
    const area = String(spec.value).match(/^(\d+(?:[.,]\d+)?)\s*m[²2]$/);
    if (["mca_inhalt", "mca_inhaltpropackung"].includes(spec.code) && area) addSpec("area_m2", Number(area[1].replace(",", ".")));
    if (spec.code === "mca_material" && /^(?:Glaswolle|Steinwolle)$/i.test(spec.value)) identityProperties.push(text(spec.value));
    if (spec.code === "mca_thermal_conductivity_level" && /^0?\d{2}$/.test(spec.value)) {
      const level = Number(spec.value);
      const conductivity = characteristics.filter((s) => s.code === "mca_waermeleitfaehigkeit").map((s) => Number(String(s.value).match(/^(0[,.]\d+)/)?.[1].replace(",", ".")));
      if (conductivity.some((value) => !Number.isFinite(value) || Math.abs(value - level / 1000) > 0.00001)) return [];
      identityProperties.push(`WLS ${String(level).padStart(3, "0")}`);
    }
  }
  if (conflictingSpecs) return [];
  // The bound SKU's brand is authoritative even when the retailer omits it from its title.
  const brand = text(details.brand?.name), title = text(info.name);
  let name = brand && !title.toLocaleLowerCase("de").includes(brand.toLocaleLowerCase("de")) ? `${brand} ${title}` : title;
  if (identityProperties.length) name += `; ${[...new Set(identityProperties)].join("; ")}`;
  // Only a positive product-bound property may supplement a missing title term.
  // Avoid negations and recommendations; do not scan arbitrary page descriptions.
  const properties = Array.isArray(details.selling_points?.items) ? details.selling_points.items.map(text) : [];
  if (properties.some((value) => /^(?:bereits nach \d+ min )?überstreichbar$/i.test(value))) name += "; überstreichbar";
  return [{ name, url: metadata.canonical_url, externalId: String(info.sku), price: metadata.meta_price,
    priceBasis: "package", priceSource: "retailer-product-state", priceBasisEvidence: "toom-same-sku-PCE-and-price-metadata",
    currency: "EUR", availability: null, soldIndividually: true, observedSpecs, retrievedAt: now.toISOString(),
    brand: brand || null, category: Array.isArray(data.breadcrumb) ? data.breadcrumb.map((entry) => text(entry.name || entry.title || entry.label)).filter(Boolean).join(" > ") || null : null,
    description: plain(info.description),
    attributes: [...characteristics.filter((entry) => entry.label && typeof entry.value === "string").map((entry) => ({ name: text(entry.label), value: plain(entry.value) })),
      ...properties.map((value) => ({ name: "Eigenschaft", value }))] }];
}

export function extractGlobusProductState(html, pageUrl, now = new Date()) {
  let data;
  try { const raw = html.match(/var onEventDataLayer\s*=\s*JSON\.parse\('([^'\r\n]+)'\)/)?.[1]; data = JSON.parse(raw || "null"); }
  catch { return []; }
  const ecommerce = data?.ecommerce, items = ecommerce?.items;
  if (data?.event !== "view_item" || ecommerce.currency !== "EUR" || !Array.isArray(items) || items.length !== 1
    || !sameUrl(meta(html, "product:product_link"), pageUrl) || !sameUrl(meta(html, "og:url"), pageUrl)) return [];
  const item = items[0], number = pageUrl.match(/-(\d+)\/?$/)?.[1];
  const displayed = meta(html, "product:price")?.match(/^(\d+(?:,\d{2})?)\s*€$/);
  const name = decode(text(item.item_name));
  if (!number || item.item_id !== `GLO${number.replace(/^0+/, "")}` || item.quantity !== 1 || item.location_id || item.affiliation
    || typeof item.price !== "number" || item.price <= 0 || item.price !== ecommerce.value || !displayed
    || Number(displayed[1].replace(",", ".")) !== item.price || !text(meta(html, "og:title")).startsWith(`${name} kaufen`)) return [];
  const ownDescription = html.split('class="product-detail-description-text"')[1]?.split('</ul>')[0] || "";
  const onePiece = /Inhalt:\s*(?:<[^>]*>\s*)*1\s*Stück/.test(ownDescription);
  // The independent package identity must be explicit, never inferred from €/m² or €/kg.
  if (!onePiece && !/\d+(?:[.,]\d+)?\s*(?:kg|ml|l|Liter)\b/.test(name)) return [];
  return [{ name, url: pageUrl, externalId: number, price: item.price, currency: "EUR", priceBasis: "package",
    priceSource: "retailer-product-state", priceBasisEvidence: "globus-same-sku-price-metadata-and-single-sale-unit",
    availability: null, soldIndividually: true, observedSpecs: onePiece ? { pieces: 1 } : {}, retrievedAt: now.toISOString(),
    brand: text(item.item_brand) || null, category: [item.item_category, item.item_category2, item.item_category3].map(plain).filter(Boolean).join(" > ") || null,
    description: plain(ownDescription),
    attributes: [...ownDescription.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((match) => plain(match[1])).filter((value) => value.includes(":"))
      .map((value) => ({ name: value.slice(0, value.indexOf(":")), value: value.slice(value.indexOf(":") + 1).trim() })) }];
}
