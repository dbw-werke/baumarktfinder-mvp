import test from 'node:test';
import assert from 'node:assert/strict';
import { createToomReader, parseToomSellingState, parseToomBuybox, readToomIdentity, toomProductUrl, toomHardBlock, rankToomProductUrls } from '../scripts/shop-reader/toom-reader.mjs';
import { createShopReader } from '../scripts/shop-reader/shops.mjs';
import { createPoliteFetcher } from '../scripts/shop-reader/http.mjs';

// Synthetic proof fixtures: changing amounts ensures sale handling is general, not example-specific.
const url = 'https://toom.de/p/fixture-uniflott-25-kg/1234567';
const data = { basic_info: { name: 'Uniflott 25 kg', sku: '1234567' }, details: { base_quantity_unit: 'PCE', sap_artikelnummer: '1000000099999', brand: { name: 'Knauf' } },
  meta_data: { canonical_url: url, meta_price: 47.89 }, characteristics: {} };
const html = `<meta property="og:title" content="Uniflott 25 kg"><meta property="product:price:amount" content="47.89"><div id="root" data-props="${encodeURIComponent(JSON.stringify({ content: data }))}"></div>Alle Preisangaben in EUR inkl.`;
const now = new Date('2026-10-05T12:00:00Z');
const identity = readToomIdentity(html, url, now);
const state = { deliver: { state: 'available', price: { regular: 47.89, offer: 39.89, offer_valid_to: '10.10.2026' }, package: { price: { regular: 1.92, offer: 1.60, amount_unit: 'Kilogramm' }, size: '25 Kilogramm' } }, reserve: { price: { regular: 2.99 } } };
test('toom active sale, crossed-out and unit prices remain separate; metadata is not current evidence', () => {
  const result = parseToomSellingState(identity, state, now).products[0];
  assert.equal(result.price, 39.89); assert.equal(result.oldPrice, 47.89); assert.equal(result.declaredUnitPrice, 1.6);
  assert.equal(result.packageQuantity, 25); assert.equal(result.observedSpecs.weight_kg, 25);
  assert.equal(result.priceBasis, 'package'); assert.equal(result.metadata.price_channel, 'deliver');
  assert.equal(parseToomSellingState(identity, { reserve: state.reserve }, now).reason, 'active_online_price_missing');
});
test('toom regular price is active without a sale and stock does not become a branch assertion', () => {
  const regular = structuredClone(state); delete regular.deliver.price.offer; delete regular.deliver.package.price.offer;
  regular.deliver.state = 'unavailable';
  const product = parseToomSellingState(identity, regular, now).products[0];
  assert.equal(product.price, 47.89); assert.equal(product.oldPrice, null); assert.equal(product.availability, null);
  assert.equal(product.metadata.delivery_available, false);
});
test('toom equal offer and regular price is a regular selling price without a fictitious discount', () => {
  const equal = structuredClone(state);
  equal.deliver.price.offer = equal.deliver.price.regular;
  equal.deliver.package.price.offer = equal.deliver.package.price.regular;
  const product = parseToomSellingState(identity, equal, now).products[0];
  assert.equal(product.price, 47.89); assert.equal(product.oldPrice, null);
  assert.equal(product.declaredUnitPrice, 1.92);
});
test('toom sheets use independent package total, never the prominent square-metre price or bulk promotion', () => {
  const sheet = { deliver: { price: { regular: 4.49, amount_unit: 'm²' }, package: { price: { regular: 11.23, amount_unit: 'Pack' }, size: '2.5 m²' },
    promotions: [{ type: 'scaled_prices', data: [{ prices: [{ qty: 45, price: 4.19, price_per_unit: 10.48 }] }] }] } };
  const product = parseToomSellingState(identity, sheet, now).products[0];
  assert.equal(product.price, 11.23); assert.equal(product.declaredUnitPrice, 4.49); assert.equal(product.observedSpecs.area_m2, 2.5);
  delete sheet.deliver.package; assert.equal(parseToomSellingState(identity, sheet, now).reason, 'package_price_missing');
});
test('toom refuses expired, conflicting, malformed and unknown-unit prices', () => {
  for (const mutate of [s => s.deliver.price.offer_valid_to = '01.01.2000', s => s.deliver.price.offer = 89.99,
    s => s.deliver.price.offer = 3.999, s => s.deliver.package.price.offer = 0.99,
    s => s.deliver.price.amount_unit = 'mystery-unit']) {
    const invalid = structuredClone(state); mutate(invalid);
    assert.equal(parseToomSellingState(identity, invalid, now).products.length, 0);
  }
});
test('toom rendered buybox selects current and old explicitly; unit price is secondary', () => {
  const box = { name: 'Uniflott 25 kg', current: '39,89 €', previous: '47,89 €', packagePrice: '1,60 € / Kilogramm', size: 'Paketinhalt: 25 Kilogramm' };
  const product = parseToomBuybox(identity, box, now).products[0];
  assert.equal(product.price, 39.89); assert.equal(product.oldPrice, 47.89); assert.equal(product.declaredUnitPrice, 1.6);
  assert.equal(parseToomBuybox(identity, { ...box, name: 'Another product' }, now).products.length, 0);
  assert.equal(parseToomBuybox(identity, { ...box, conditional: true }, now).reason, 'conditional_price');
  const sheet = parseToomBuybox(identity, { ...box, current: '4,49 € / m²', packagePrice: '11,23 € / Pack', size: 'Paketinhalt: 2.5 m²' }, now).products[0];
  assert.equal(sheet.price, 11.23); assert.equal(sheet.oldPrice, null); assert.equal(sheet.declaredUnitPrice, 4.49);
});
test('toom identity and URL are bound to one official exact SKU', () => {
  assert.ok(identity); assert.equal(readToomIdentity(html, url.replace('1234567', '7777777')), null);
  for (const bad of ['https://evil.test/p/fixture/1234567', 'http://toom.de/p/fixture/1234567', 'https://toom.de:1234/p/fixture/1234567', 'https://toom.de/s/uniflott/']) assert.equal(toomProductUrl(bad), null);
});
test('toom identity survives current rendered price metadata without treating either metadata price as active', () => {
  const rendered = html.replace('content="47.89"', 'content="39.89"');
  const own = readToomIdentity(rendered, url, now);
  assert.ok(own); assert.equal(own.product.price, undefined);
  assert.equal(parseToomSellingState(own, {}, now).products.length, 0);
  assert.equal(parseToomBuybox(own, { name: 'Uniflott 25 kg', current: '39,89 €', previous: '47,89 €' }, now).products[0].price, 39.89);
});

// Since November 2026 the public PDP streams productData as Next.js Flight props.
const flightPage = (rows, split = false) => {
  const stream = rows.map((row, i) => `${i.toString(16)}:${JSON.stringify(['$', '$L6e', null, { productData: row }])}\n`).join('');
  const chunks = split ? [stream.slice(0, 47), stream.slice(47)] : [stream];
  return chunks.map(chunk => `<script>self.__next_f.push(${JSON.stringify([1, chunk])})</script>`).join('');
};
test('toom reads exact product identity from split Flight JSON without accepting its stale metadata price', () => {
  const own = readToomIdentity(flightPage([data], true), url, now);
  assert.ok(own); assert.equal(own.sapId, data.details.sap_artikelnummer);
  assert.equal(own.product.externalId, '1234567'); assert.equal(own.product.price, undefined);
  assert.equal(parseToomSellingState(own, state, now).products[0].price, 39.89);
  assert.equal(parseToomSellingState(own, {}, now).products.length, 0);
});
test('toom Flight identity rejects wrong URLs, SKUs, conflicting objects and executable or incomplete payloads', () => {
  const wrongSku = { ...data, basic_info: { ...data.basic_info, sku: '7777777' } };
  const wrongUrl = { ...data, meta_data: { ...data.meta_data, canonical_url: 'https://toom.de/p/other/7777777' } };
  const conflict = { ...data, details: { ...data.details, sap_artikelnummer: '1000000000000' } };
  for (const page of [flightPage([wrongSku]), flightPage([wrongUrl]), flightPage([data, conflict]),
    flightPage([data]).replace('self.__next_f.push(', 'self.__next_f.push(globalThis.sideEffect = '),
    flightPage([data]).slice(0, -20),
    `<script>self.__next_f.push(${JSON.stringify([1, `0:${JSON.stringify({ recommendations: [{ productData: data }] })}\n`])})</script>`]) {
    assert.equal(readToomIdentity(page, url, now), null);
  }
  assert.equal(globalThis.sideEffect, undefined);
  assert.ok(readToomIdentity(flightPage([data, data]), url, now));
});
test('toom reads byte-counted Flight text and forward references without interpreting text as records', () => {
  const description = 'Schenkellänge 125 mm, für große Räume.\n0:["$","$Lx",null,{"productData":{"untrusted":true}}]';
  const ownData = { ...data, basic_info: { ...data.basic_info, description: '$a' }, details: { ...data.details, brand: '$b' } };
  const model = `0:${JSON.stringify(['$', '$L6e', null, { productData: '$c' }])}\n`;
  const stream = ':HL["/style.css","style"]\n9:R\n9:C\n' + model
    + `a:T${Buffer.byteLength(description).toString(16)},${description}`
    + `b:${JSON.stringify({ name: 'Knauf' })}\nc:${JSON.stringify(ownData)}\n`;
  const page = [stream.slice(0, 110), stream.slice(110)].map(chunk => `<script>self.__next_f.push(${JSON.stringify([1, chunk])})</script>`).join('');
  const own = readToomIdentity(page, url, now);
  assert.ok(own); assert.equal(own.product.brand, 'Knauf');
  assert.equal(own.product.description, description.replace(/\s+/g, ' '));
  assert.equal(own.sapId, data.details.sap_artikelnummer);
});
test('toom rejects truncated text, invalid byte lengths, duplicate models and missing or cyclic Flight references', () => {
  const ownData = { ...data, basic_info: { ...data.basic_info, description: '$a' } };
  const model = `0:${JSON.stringify(['$', '$L6e', null, { productData: ownData }])}\n`;
  for (const stream of [model, `${model}a:Tff,short`, `a:T1,ü${model}`, `${model}${model}`,
    `${model}a:"$b"\nb:"$a"\n`]) {
    const page = `<script>self.__next_f.push(${JSON.stringify([1, stream])})</script>`;
    assert.equal(readToomIdentity(page, url, now), null);
  }
});
test('toom reads single-piece contents and actual hanger leg length without inventing a profile dimension', () => {
  const hanger = { ...data, basic_info: { ...data.basic_info, name: 'Direktabhänger für CD-Profile', description: 'Die Direktabhänger haben eine Schenkellänge von 125 mm.' },
    characteristics: { own: [{ code: 'mca_inhalt', label: 'Inhalt', value: '1 Stk.' }, { code: 'mcv_dim_laenge', label: 'Länge', value: '33 cm' }] } };
  const ownHtml = `<div id="root" data-props="${encodeURIComponent(JSON.stringify({ content: hanger }))}"></div>`;
  const own = readToomIdentity(ownHtml, url, now).product;
  assert.equal(own.observedSpecs.pieces, 1); assert.equal(own.observedSpecs.length_mm, 125); assert.equal(own.observedSpecs.profile, undefined);
});
test('toom prioritizes actual profile identity and requested width before bounded PDP reads', () => {
  const links = ['https://toom.de/p/tuersturzprofil-50-mm/1234561', 'https://toom.de/p/uw-db-profil-100-mm/1234562',
    'https://toom.de/p/cw-db-profil-2600-x-50-mm/1234563', 'https://toom.de/p/uw-db-profil-50-mm/1234564'];
  assert.equal(rankToomProductUrls(links, 'UW Profil 50')[0], links[3]);
  assert.equal(rankToomProductUrls(links, 'CW Profil 50')[0], links[2]);
});
test('toom discovery follows the product own variants within the same conservative page budget', async () => {
  const oldUrl = 'https://toom.de/p/uw-db-profil-100-mm/1234562', wanted = 'https://toom.de/p/uw-db-profil-50-mm/1234564', visited = [];
  const reader = createToomReader({ maxProducts: 2, http: { get: async request => {
    visited.push(request);
    if (request.includes('/s/')) return { url: request, body: `<a href="${oldUrl}">UW100</a>` };
    if (request.includes('/jsonview/')) return { url: request, body: JSON.stringify({ deliver: { price: { regular: 4.79 } } }) };
    const own = { ...data, basic_info: { ...data.basic_info, sku: request.split('/').at(-1), name: 'UW-Profil' }, meta_data: { ...data.meta_data, canonical_url: request },
      variants: { variant_attributes: [{ variants: [{ options: { wanted } }] }] } };
    return { url: request, body: `<div id="root" data-props="${encodeURIComponent(JSON.stringify({ content: own }))}"></div>` };
  } } });
  const result = await reader.search('UW Profil 50');
  assert.deepEqual(result.products.map(product => product.url), [oldUrl, wanted]);
  assert.equal(visited.filter(value => value.includes('/p/')).length, 2);
  await reader.close();
});
test('toom direct reader uses the PDP SAP identity and active official endpoint without launching browser', async () => {
  for (const page of [html, flightPage([data], true)]) {
    const calls = [];
    const reader = createToomReader({ http: { get: async request => { calls.push(request); return { url: request, body: request.includes('/jsonview/') ? JSON.stringify({ deliver: { price: { regular: 35.79 } } }) : page }; } },
      chromiumImpl: { launch: () => { throw new Error('must-not-launch'); } } });
    const result = await reader.readProduct(url);
    assert.equal(result.method, 'direct'); assert.equal(result.products[0].price, 35.79);
    assert.equal(calls[1], 'https://api.toom.de/public/v1/jsonview/1000000099999/3248');
    await reader.close();
  }
});
test('legacy daily worker also confirms the active toom price rather than re-saving crossed-out metadata', async () => {
  const regular = { deliver: { price: { regular: 47.89, offer: 39.89 } } };
  const reader = createShopReader({ http: { get: async request => ({ url: request, body: request.includes('/jsonview/') ? JSON.stringify(regular) : html }) } });
  const products = await reader.readProduct('toom', url);
  assert.equal(products[0].price, 39.89); assert.equal(products[0].oldPrice, 47.89);
  const empty = createShopReader({ http: { get: async request => ({ url: request, body: request.includes('/jsonview/') ? '{}' : html }) } });
  await assert.rejects(empty.readProduct('toom', url), /active_online_price_missing/);
});
test('toom sale expiry uses the German calendar also in winter time', () => {
  const winter = structuredClone(state); winter.deliver.price.offer_valid_to = '10.12.2026';
  assert.equal(parseToomSellingState(identity, winter, new Date('2026-12-10T22:30:00Z')).products[0].price, 39.89);
  assert.equal(parseToomSellingState(identity, winter, new Date('2026-12-10T23:30:00Z')).products.length, 0);
  winter.deliver.price.offer_valid_to = '31.02.2027';
  assert.equal(parseToomSellingState(identity, winter, now).products.length, 0);
  winter.deliver.price.offer_valid_to = '10.12.2026'; winter.deliver.price.offer_valid_from = '01.12.2026';
  assert.equal(parseToomSellingState(identity, winter, now).products.length, 0);
});
test('toom hard blocks stop the run instead of falling back around the protection', async () => {
  let requests = 0, launches = 0;
  const reader = createToomReader({ http: { get: async () => { requests++; throw Object.assign(new Error('HTTP 403'), { code: 'blocked' }); } }, chromiumImpl: { launch: async () => { launches++; } } });
  assert.equal((await reader.readProduct(url)).reason, 'hard_bot_block');
  assert.equal((await reader.readProduct(url)).reason, 'hard_bot_block');
  assert.equal(requests, 1); assert.equal(launches, 0);
  assert.equal(toomHardBlock(200, 'CAPTCHA'), 'captcha'); assert.equal(toomHardBlock(429), 'hard_bot_block');
});

test('toom Retry-After from product, price API or search never falls back around the cooldown', async () => {
  for (const source of ['product', 'price-api', 'search']) {
    let launches = 0, rejectedRequests = 0;
    const http = createPoliteFetcher({ minDelayMs: 0, fetchImpl: async request => {
      if (request.endsWith('/robots.txt')) return new Response('User-agent: *\nAllow: /');
      if (source === 'price-api' && !request.includes('/jsonview/')) return new Response(html);
      rejectedRequests++;
      return new Response('temporarily unavailable', { status: 503, headers: { 'Retry-After': '3600' } });
    } });
    const reader = createToomReader({ http, chromiumImpl: { launch: async () => { launches++; throw new Error('must-not-launch'); } } });
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = source === 'search' ? await reader.search('Uniflott') : await reader.readProduct(url);
      assert.equal(result.reason, 'retry-after');
      assert.equal(result.method, 'direct');
      assert.equal(result.products.length, 0);
    }
    assert.equal(rejectedRequests, 1);
    assert.equal(launches, 0);
    await reader.close();
  }
});
function browserFixture({ status = 200, title = 'toom product', navigationError = null } = {}) {
  let launches = 0, closes = 0;
  const locator = { first() { return this; }, waitFor: async () => {}, innerText: async () => 'Uniflott 25 kg' };
  const page = { goto: async () => { if (navigationError) throw navigationError; return { status: () => status }; }, title: async () => title, locator: () => locator, frames: () => [],
    url: () => url, content: async () => html, setDefaultTimeout() {},
    evaluate: async () => ({ name: 'Uniflott 25 kg', current: '39,89 €', previous: '47,89 €', packagePrice: '1,60 € / Kilogramm', size: 'Paketinhalt: 25 Kilogramm' }) };
  return { chromiumImpl: { launch: async () => { launches++; return { newContext: async () => ({ newPage: async () => page, close: async () => {} }), close: async () => { closes++; } }; } },
    counts: () => ({ launches, closes }) };
}
test('toom missing direct active state falls back to one reused normal browser session', async () => {
  const browser = browserFixture();
  const reader = createToomReader({ ...browser, minDelayMs: 0, http: { get: async request => ({ url: request, body: request.includes('/jsonview/') ? '{}' : html }),
    getRobots: async () => ({ rules: [], delay: 0 }) } });
  for (let i = 0; i < 2; i++) {
    const result = await reader.readProduct(url);
    assert.equal(result.method, 'playwright'); assert.equal(result.products[0].price, 39.89);
    assert.equal(result.directReason, 'active_online_price_missing');
  }
  await reader.close(); assert.deepEqual(browser.counts(), { launches: 1, closes: 1 });
});

test('toom reports the browser network failure category without arbitrary exception details', async () => {
  const browser = browserFixture({ navigationError: new Error('page.goto: net::ERR_HTTP2_PROTOCOL_ERROR at https://toom.de/?secret=do-not-log') });
  const reader = createToomReader({ ...browser, minDelayMs: 0, http: { get: async () => ({ url, body: '<html></html>' }),
    getRobots: async () => ({ rules: [], delay: 0 }) } });
  const result = await reader.readProduct(url);
  assert.equal(result.reason, 'playwright_navigation_failed');
  assert.equal(result.directReason, 'product_identity_missing');
  assert.deepEqual(result.errors, [{ stage: 'navigation', reason: 'net::ERR_HTTP2_PROTOCOL_ERROR' }]);
  assert.equal(JSON.stringify(result).includes('do-not-log'), false);
  await reader.close();
});
test('toom direct 404 is only removed after browser confirms; browser CAPTCHA stops further requests', async () => {
  for (const options of [{ status: 404 }, { status: 200, title: 'CAPTCHA' }]) {
    const browser = browserFixture(options);
    const reader = createToomReader({ ...browser, minDelayMs: 0, http: { get: async () => { throw Object.assign(new Error('HTTP 404'), { code: 'not-found' }); },
      getRobots: async () => ({ rules: [], delay: 0 }) } });
    const result = await reader.readProduct(url);
    assert.equal(result.directReason, 'direct_fetch_404');
    assert.equal(result.removed, options.status === 404);
    assert.equal(result.reason, options.status === 404 ? 'not-found' : 'captcha');
    await reader.close();
  }
});
