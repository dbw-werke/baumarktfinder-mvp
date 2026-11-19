import test from 'node:test';
import assert from 'node:assert/strict';
import { createPoliteFetcher } from '../scripts/shop-reader/http.mjs';

const url = 'https://shop.test/p/fixture';
const hosts = ['shop.test'];
function fixture(sequence, { minDelayMs = 0, robots = () => new Response('User-agent: *\nAllow: /'), maxBytes } = {}) {
  let current = Date.parse('2026-11-19T12:00:00Z'), index = 0;
  const calls = [], waits = [];
  const http = createPoliteFetcher({ minDelayMs, maxBytes, now: () => current,
    waitImpl: async delay => { waits.push(delay); current += delay; },
    fetchImpl: async (request, options) => {
      calls.push({ url: request, at: current, redirect: options.redirect });
      if (request.endsWith('/robots.txt')) return robots();
      const value = sequence[Math.min(index++, sequence.length - 1)];
      if (value instanceof Error) throw value;
      return typeof value === 'function' ? value(current) : value;
    },
  });
  return { http, calls, waits, products: () => calls.filter(call => !call.url.endsWith('/robots.txt')) };
}
const networkError = code => Object.assign(new TypeError('fetch failed'), { cause: { code } });

test('transient transport and gateway failures share a maximum of two exponential retries', async () => {
  const setup = fixture([networkError('ECONNRESET'), () => new Response('temporarily unavailable', { status: 503 }), () => new Response('verified page')]);
  assert.equal((await setup.http.get(url, hosts)).body, 'verified page');
  const calls = setup.products();
  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map(call => call.at - calls[0].at), [0, 1000, 3000]);
  assert.ok(calls.every(call => call.url === url && call.redirect === 'manual'));
});

test('gateway failure stops after three total requests', async () => {
  for (const status of [502, 503, 504]) {
    const setup = fixture([() => new Response('service unavailable', { status })]);
    await assert.rejects(setup.http.get(url, hosts), error => error.code === 'http-error');
    assert.equal(setup.products().length, 3);
  }
});

test('Retry-After seconds and dates never shorten the robots crawl delay', async () => {
  const setup = fixture([
    () => new Response('busy', { status: 503, headers: { 'Retry-After': '2' } }),
    current => new Response('busy', { status: 504, headers: { 'Retry-After': new Date(current + 9000).toUTCString() } }),
    () => new Response('ready'),
  ], { minDelayMs: 1000, robots: () => new Response('User-agent: *\nCrawl-delay: 7\nAllow: /') });
  await setup.http.get(url, hosts);
  assert.deepEqual(setup.products().map(call => call.at - setup.calls[0].at), [7000, 14000, 23000]);
});

test('Retry-After beyond the bounded retry budget ends the request instead of retrying too early', async () => {
  for (const value of ['31', '3600', '999999999999999999999999999999999999999999999999999999']) {
    const setup = fixture([() => new Response('busy', { status: 503, headers: { 'Retry-After': value } })]);
    await assert.rejects(setup.http.get(url, hosts), error => error.code === 'retry-after');
    assert.equal(setup.products().length, 1);
    assert.ok(setup.waits.every(wait => wait === 0));
  }
});

test('Retry-After remains effective for later products after the current request fails', async () => {
  const longBackoff = fixture([() => new Response('busy', { status: 503, headers: { 'Retry-After': '3600' } })]);
  await assert.rejects(longBackoff.http.get(url, hosts), error => error.code === 'retry-after');
  await assert.rejects(longBackoff.http.get('https://shop.test/p/another', hosts), error => error.code === 'retry-after');
  assert.equal(longBackoff.products().length, 1);

  const exhausted = fixture([
    () => new Response('busy', { status: 503 }),
    () => new Response('busy', { status: 503 }),
    () => new Response('busy', { status: 503, headers: { 'Retry-After': '10' } }),
    () => new Response('ready'),
  ]);
  await assert.rejects(exhausted.http.get(url, hosts), error => error.code === 'retry-after');
  assert.equal((await exhausted.http.get('https://shop.test/p/another', hosts)).body, 'ready');
  const calls = exhausted.products();
  assert.equal(calls[3].at - calls[2].at, 10000);
});

test('access denials, rate limits and CAPTCHA stop all subsequent product requests without retries', async () => {
  for (const [status, body] of [[401, 'unauthorized'], [403, 'forbidden'], [429, 'rate limited'],
    [200, '<title>CAPTCHA</title>'], [503, 'Please solve the CAPTCHA'], [502, 'Access denied'], [504, 'Checking your browser']]) {
    const setup = fixture([() => new Response(body, { status, headers: { 'Retry-After': '1' } })]);
    await assert.rejects(setup.http.get(url, hosts), error => error.code === 'blocked');
    await assert.rejects(setup.http.get(url, hosts), error => error.code === 'blocked');
    assert.equal(setup.products().length, 1);
  }
});

test('404, ordinary HTTP errors, TLS failures and caller aborts are never retried', async () => {
  for (const value of [() => new Response('missing', { status: 404 }), () => new Response('server error', { status: 500 }),
    networkError('CERT_HAS_EXPIRED'), networkError('ENOTFOUND'), new DOMException('aborted by caller', 'AbortError')]) {
    const setup = fixture([value]);
    await assert.rejects(setup.http.get(url, hosts));
    assert.equal(setup.products().length, 1);
  }
});

test('timeout and interrupted response-body reads can recover within the same retry limit', async () => {
  const brokenBody = () => new Response(new ReadableStream({ start(controller) {
    controller.error(networkError('UND_ERR_BODY_TIMEOUT'));
  } }));
  const setup = fixture([new DOMException('time limit', 'TimeoutError'), brokenBody, () => new Response('ready')]);
  assert.equal((await setup.http.get(url, hosts)).body, 'ready');
  assert.equal(setup.products().length, 3);
});

test('robots failures and restrictions never trigger retries or product requests', async () => {
  for (const robots of [() => new Response('down', { status: 503 }), () => { throw networkError('ECONNRESET'); },
    () => new Response('User-agent: *\nDisallow: /'), () => new Response('<html>invalid robots</html>')]) {
    const setup = fixture([() => new Response('must not read')], { robots });
    await assert.rejects(setup.http.get(url, hosts), error => ['robots-unavailable', 'robots-disallowed'].includes(error.code));
    assert.equal(setup.calls.length, 1);
    assert.equal(setup.products().length, 0);
  }
});

test('retries cannot follow a redirect outside the allowlist or reset their retry budget', async () => {
  const unsafe = fixture([networkError('EAI_AGAIN'), () => new Response(null, { status: 302, headers: { location: 'https://other.test/p/fixture' } })]);
  await assert.rejects(unsafe.http.get(url, hosts), error => error.code === 'unsafe-url');
  assert.equal(unsafe.products().length, 2);
  assert.ok(unsafe.calls.every(call => new URL(call.url).hostname === 'shop.test'));
  const bounded = fixture([networkError('EAI_AGAIN'), () => new Response(null, { status: 302, headers: { location: '/p/next' } }),
    () => new Response('busy', { status: 503 })]);
  await assert.rejects(bounded.http.get(url, hosts), error => error.code === 'http-error');
  assert.equal(bounded.products().length, 4); // one redirect plus the original request and two retries
});

test('oversized responses are rejected without retrying', async () => {
  const setup = fixture([() => new Response('12345678901')], { maxBytes: 10, robots: () => new Response('') });
  await assert.rejects(setup.http.get(url, hosts), error => error.code === 'response-too-large');
  assert.equal(setup.products().length, 1);
});
