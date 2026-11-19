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
const packageUnit = (unit) => {
  if (["ST", "Stück", "PCE"].includes(unit)) return "piece";
  if (["PAK", "Pack", "Paket"].includes(unit)) return "pack";
  if (["ROL", "Rolle", "Rolle(n)"].includes(unit)) return "roll";
  return ["Sack", "Eimer", "Kartusche"].includes(unit) ? unit : null;
};
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
    const saleUnit = packageUnit(row.defaultSalesUnit.productMeasurementUnitCode);
    // A PAK can have a secondary ST price; that is not another pack total.
    const prices = [row.defaultPrice, row.basicPrice].filter((price) => packageUnit(price?.unit) === saleUnit && euro(price));
    if (!prices.length || prices.some((price) => typeof price.price !== "number" || price.price !== product.price)) return enriched;
    const unitPrice = [row.defaultPrice, row.basicPrice].find((price) => ["kg", "l", "m", "m²"].includes(price?.unit) && euro(price));
    return { ...enriched, priceBasis: "package", priceBasisEvidence: "hornbach-same-sku-sales-unit",
      ...(unitPrice ? { declaredUnitPrice: unitPrice.price } : {}) };
  }).filter(Boolean);
}

function flightRecords(chunks) {
  const bytes = Buffer.from(chunks.join(""), "utf8"), records = new Map();
  let offset = 0;
  while (offset < bytes.length) {
    const colon = bytes.indexOf(58, offset);
    if (colon < 0) return null;
    const id = bytes.subarray(offset, colon).toString("utf8");
    if (!id && bytes[colon + 1] === 72) { // Anonymous resource-hint records have no product data.
      const newline = bytes.indexOf(10, colon);
      if (newline < 0) return null;
      offset = newline + 1; continue;
    }
    if (!/^[\da-f]+$/i.test(id)) return null;
    offset = colon + 1;
    // Flight text uses a hexadecimal UTF-8 byte count, with no trailing newline.
    // Its contents may include newlines or text resembling another Flight record.
    if (bytes[offset] === 84) {
      const comma = bytes.indexOf(44, offset), size = bytes.subarray(offset + 1, comma).toString("utf8");
      if (comma < 0 || !/^[\da-f]+$/i.test(size)) return null;
      const end = comma + 1 + Number.parseInt(size, 16);
      if (!Number.isSafeInteger(end) || end > bytes.length || records.has(id)) return null;
      records.set(id, { kind: "text", value: bytes.subarray(comma + 1, end).toString("utf8") });
      offset = end;
    } else {
      const newline = bytes.indexOf(10, offset);
      if (newline < 0) return null;
      const value = bytes.subarray(offset, newline).toString("utf8");
      try {
        const model = JSON.parse(value);
        if (records.has(id)) return null;
        records.set(id, { kind: "model", value: model });
      } catch { /* Module, resource and stream-control records do not contain product data. */ }
      offset = newline + 1;
    }
  }
  return records;
}
function flightValue(value, records, path = new Set(), depth = 0) {
  if (depth > 100) throw new Error("flight_depth_limit");
  if (typeof value === "string") {
    if (value.startsWith("$$")) return value.slice(1);
    const reference = value.match(/^\$([\da-f]+)$/i)?.[1];
    if (!reference) return value;
    const record = records.get(reference);
    if (!record || record.kind === "unsupported" || path.has(reference)) throw new Error("flight_reference_invalid");
    return record.kind === "text" ? record.value : flightValue(record.value, records, new Set([...path, reference]), depth + 1);
  }
  if (Array.isArray(value)) return value.map(child => flightValue(child, records, path, depth + 1));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, flightValue(child, records, path, depth + 1)]));
  return value;
}

/** Both toom page generations carry the same product object; decode data, never execute scripts. */
export function readToomProductData(html, pageUrl) {
  const candidates = [];
  const add = data => {
    if (data?.basic_info?.sku && sameUrl(data?.meta_data?.canonical_url, pageUrl)
      && pageUrl.replace(/\/$/, "").endsWith(`/${data.basic_info.sku}`)) candidates.push(data);
  };
  try { const encoded = html.match(/<div\b(?=[^>]*\bid="root")(?=[^>]*\bdata-props="([^"]+)")[^>]*>/)?.[1];
    if (encoded) add(JSON.parse(decodeURIComponent(decode(encoded)))?.content); }
  catch { /* A malformed legacy payload cannot supply identity. */ }
  const chunks = [];
  for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    const push = script[1].trim().match(/^self\.__next_f\.push\((\[[\s\S]*\])\);?$/);
    if (!push) continue;
    try { const chunk = JSON.parse(push[1]);
      if (chunk[0] === 1 && typeof chunk[1] === "string") chunks.push(chunk[1]); }
    catch { /* Only JSON arguments from ordinary Flight text chunks are supported. */ }
  }
  const records = flightRecords(chunks);
  // Flight records can span script tags. Product data belongs to a rendered component's
  // props, not a metadata offer, a recommendation, or an arbitrary object in page text.
  const visit = value => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value) && value[0] === "$" && value[3]?.productData) add(flightValue(value[3].productData, records));
    for (const child of Object.values(value)) visit(child);
  };
  for (const record of records?.values() || []) {
    if (record.kind !== "model") continue;
    try { visit(record.value); } catch { return null; /* Unresolved product data cannot supply identity. */ }
  }
  const distinct = [...new Map(candidates.map(data => [JSON.stringify(data), data])).values()];
  return distinct.length === 1 ? distinct[0] : null;
}

export function extractToomProductState(html, pageUrl, now = new Date(), { identityOnly = false } = {}) {
  const data = readToomProductData(html, pageUrl);
  const info = data?.basic_info, details = data?.details, metadata = data?.meta_data;
  if (!info || !text(info.name) || !metadata || details?.base_quantity_unit !== "PCE" || !sameUrl(metadata.canonical_url, pageUrl)
    || !pageUrl.replace(/\/$/, "").endsWith(`/${info.sku}`)) return [];
  // Hydrated head metadata changes during a sale while root.meta_price keeps the old price.
  // Identity-only callers must obtain a separate current price from the official API/buybox.
  if (!identityOnly && (typeof metadata.meta_price !== "number" || metadata.meta_price <= 0
    || Number(meta(html, "product:price:amount")) !== metadata.meta_price || text(meta(html, "og:title")) !== text(info.name)
    || !/Alle Preisangaben in EUR inkl\./.test(html))) return [];
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
  return [{ name, url: metadata.canonical_url, externalId: String(info.sku), ...(!identityOnly ? { price: metadata.meta_price } : {}),
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
