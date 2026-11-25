import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';

async function loadFactory() {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try { return await vite.ssrLoadModule('/src/prototype/authenticated-fetch.ts'); }
  finally { await vite.close(); }
}

const origin = 'https://app.example.com';
const jwtFor = (exp) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ handle: 'test-store', exp })).toString('base64url')}.test-signature`;

test('sequential requests reuse a valid JWT and refresh it before expiry', async () => {
  const { createAuthenticatedFetch } = await loadFactory();
  let clock = 1_800_000_000_000;
  let tokenReads = 0;
  const sent = [];
  const client = createAuthenticatedFetch({
    origin, embedded: true, now: () => clock, redirectToAuth: () => {},
    getSessionToken: async () => { tokenReads++; return jwtFor(clock / 1000 + 120); },
    fetcher: async (_input, init) => { sent.push(new Headers(init.headers).get('Authorization')); return new Response('ok'); },
  });
  await client('/api/quantity-breaks/shop');
  clock += 60_000;
  await client('/api/quantity-breaks/subscription');
  assert.equal(tokenReads, 1);
  assert.equal(sent[1], sent[0]);
  clock += 35_000;
  await client('/api/quantity-breaks/campaigns');
  assert.equal(tokenReads, 2);
  assert.notEqual(sent[2], sent[0]);
});

test('a rejected cached JWT is discarded even when a write must not be retried', async () => {
  const { createAuthenticatedFetch } = await loadFactory();
  let tokenReads = 0;
  let requests = 0;
  const tokens = [jwtFor(1_900_000_000), jwtFor(1_900_000_001)];
  const sent = [];
  const client = createAuthenticatedFetch({
    origin, embedded: true, now: () => 1_800_000_000_000, redirectToAuth: () => {},
    getSessionToken: async () => tokens[Math.min(tokenReads++, 1)],
    fetcher: async (_input, init) => { sent.push(new Headers(init.headers).get('Authorization')); return new Response('', { status: ++requests === 2 ? 401 : 200 }); },
  });
  await client('/api/quantity-breaks/shop');
  assert.equal((await client('/api/quantity-breaks/campaigns', { method: 'POST', body: '{}' })).status, 401);
  assert.equal(requests, 2);
  await client('/api/quantity-breaks/shop');
  assert.equal(tokenReads, 2);
  assert.equal(sent[2], `Bearer ${tokens[1]}`);
});

test('changing store scope invalidates the cached session', async () => {
  const { createAuthenticatedFetch } = await loadFactory();
  let scope = 'shop-a';
  let tokenReads = 0;
  const client = createAuthenticatedFetch({
    origin, embedded: true, now: () => 1_800_000_000_000, getSessionScope: () => scope,
    getSessionToken: async () => { tokenReads++; return jwtFor(1_900_000_000); }, redirectToAuth: () => {},
    fetcher: async () => new Response('ok'),
  });
  await client('/api/quantity-breaks/shop');
  scope = 'shop-b';
  await client('/api/quantity-breaks/shop');
  assert.equal(tokenReads, 2);
});

test('a pending session for an old store cannot send a request after the store changes', async () => {
  const { createAuthenticatedFetch } = await loadFactory();
  let scope = 'shop-a';
  let release;
  let sent = 0;
  const pending = new Promise((resolve) => { release = resolve; });
  const client = createAuthenticatedFetch({
    origin, embedded: true, getSessionScope: () => scope,
    getSessionToken: () => pending, redirectToAuth: () => {}, fetcher: async () => { sent++; return new Response('ok'); },
  });
  const result = client('/api/quantity-breaks/shop');
  scope = 'shop-b';
  release(jwtFor(1_900_000_000));
  await assert.rejects(result, { code: 'SESSION_CONTEXT_CHANGED' });
  assert.equal(sent, 0);
});

test('a stalled App Bridge call cannot exceed the session wait budget or spawn overlapping SDK calls', async (t) => {
  const { createAuthenticatedFetch } = await loadFactory();
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let tokenReads = 0;
  let requests = 0;
  const reports = [];
  let resolveToken;
  const sdkRequest = new Promise((resolve) => { resolveToken = resolve; });
  const client = createAuthenticatedFetch({
    origin, embedded: true, redirectToAuth: () => {},
    getSessionToken: () => { tokenReads++; return sdkRequest; },
    fetcher: async (input, init) => {
      if (String(input).endsWith('/api/observability/errors')) { reports.push(init); return new Response(null, { status: 204 }); }
      requests++; return new Response('ok');
    },
  });
  t.after(() => resolveToken('cleanup-token'));
  let failure;
  const first = client('/api/quantity-breaks/shop').catch((error) => { failure = error; });
  t.mock.timers.tick(5000);
  for (let i = 0; i < 12; i++) await Promise.resolve();
  assert.match(failure?.message ?? 'still waiting', /session token.*timed out/i);
  await first;
  assert.equal(requests, 0);
  const retry = client('/api/quantity-breaks/shop');
  assert.equal(tokenReads, 1);
  resolveToken('late-but-valid-token');
  assert.equal((await retry).status, 200);
  assert.equal(requests, 1);
  assert.equal(reports.length, 1);
  assert.equal(JSON.parse(reports[0].body).code, 'SESSION_TOKEN_TIMEOUT');
  assert.equal(new Headers(reports[0].headers).get('Authorization'), 'Bearer late-but-valid-token');
});
const stale = (url = '/?uninstalled=true&embedded=1&appkey=test-app&handle=test-store&shop=test-store&host=test-store.myshopline.com&scope=read_products&redirectUri=https%3A%2F%2Fapp.example.com%2Fapi%2Fauth%2Fcallback') => new Response('', {
  status: 403,
  headers: {
    'X-SHOPLINE-API-Request-Failure-Reauthorize': '1',
    'X-SHOPLINE-API-Request-Failure-Reauthorize-Url': url,
  },
});

test('embedded request sends a token without losing method, body or headers', async () => {
  const { createAuthenticatedFetch } = await loadFactory();
  let sent;
  const client = createAuthenticatedFetch({
    origin, embedded: true, getSessionToken: async () => 'fresh-token', redirectToAuth: () => {},
    fetcher: async (input, init) => { sent = { input, init }; return new Response(null, { status: 204 }); },
  });
  await client('/api/quantity-breaks/campaigns', { method: 'POST', body: '{"draft":true}', headers: { 'Content-Type': 'application/json', 'X-Custom': 'value' } });
  assert.equal(sent.input, '/api/quantity-breaks/campaigns');
  assert.equal(sent.init.method, 'POST');
  assert.equal(sent.init.body, '{"draft":true}');
  assert.equal(new Headers(sent.init.headers).get('Authorization'), 'Bearer fresh-token');
  assert.equal(new Headers(sent.init.headers).get('Content-Type'), 'application/json');
  assert.equal(new Headers(sent.init.headers).get('X-Custom'), 'value');
});

test('parallel stale sessions navigate once without retrying writes', async () => {
  const { createAuthenticatedFetch } = await loadFactory();
  const redirects = [];
  let calls = 0;
  const client = createAuthenticatedFetch({
    origin, embedded: true, getSessionToken: async () => 'old-token',
    redirectToAuth: (url) => redirects.push(url),
    fetcher: async () => { calls++; return stale(); },
  });
  const results = await Promise.all([
    client('/api/quantity-breaks/shop'),
    client('/api/quantity-breaks/campaigns', { method: 'POST', body: '{}' }),
  ]);
  assert.equal(calls, 2);
  assert.deepEqual(results.map((result) => result.status), [403, 403]);
  assert.deepEqual(redirects, [`${origin}/?uninstalled=true&embedded=1&appkey=test-app&handle=test-store&shop=test-store&host=test-store.myshopline.com&scope=read_products&redirectUri=https%3A%2F%2Fapp.example.com%2Fapi%2Fauth%2Fcallback`]);
});

test('malicious reauthorization destinations cannot trigger navigation', async () => {
  const { createAuthenticatedFetch } = await loadFactory();
  const redirects = [];
  for (const url of ['https://evil.example/?uninstalled=true', '/other', '//evil.example/?uninstalled=true', '/?uninstalled=true#fragment', 'https://user@app.example.com/?uninstalled=true', '/?uninstalled=false&embedded=1']) {
    const client = createAuthenticatedFetch({ origin, embedded: true, getSessionToken: async () => 'token', redirectToAuth: (value) => redirects.push(value), fetcher: async () => stale(url) });
    assert.equal((await client('/api/quantity-breaks/shop')).status, 403);
  }
  assert.deepEqual(redirects, []);
});

test('nonembedded preview does not request token or redirect', async () => {
  const { createAuthenticatedFetch } = await loadFactory();
  let tokenCalls = 0;
  let redirects = 0;
  let headers;
  const client = createAuthenticatedFetch({
    origin, embedded: false, getSessionToken: async () => { tokenCalls++; return 'token'; },
    redirectToAuth: () => { redirects++; },
    fetcher: async (_input, init) => { headers = new Headers(init.headers); return stale(); },
  });
  assert.equal((await client('/api/quantity-breaks/shop')).status, 403);
  assert.equal(tokenCalls, 0);
  assert.equal(redirects, 0);
  assert.equal(headers.get('Authorization'), null);
});

test('routes subscription-required responses to the plan page and clears stale workspace data', async () => {
  const { createAuthenticatedFetch } = await loadFactory();
  let required = 0;
  const client = createAuthenticatedFetch({
    origin, embedded: false, getSessionToken: async () => '', redirectToAuth: () => {},
    onSubscriptionRequired: () => { required += 1; },
    fetcher: async () => new Response(JSON.stringify({ code: 'SUBSCRIPTION_REQUIRED' }), { status: 403, headers: { 'Content-Type': 'application/json' } }),
  });
  const response = await client('/api/quantity-breaks/campaigns');
  assert.equal(response.status, 403);
  assert.equal(required, 1);
});

test('missing embedded session token prevents an unauthenticated write', async () => {
  const { createAuthenticatedFetch } = await loadFactory();
  let calls = 0;
  let clock = 0;
  const client = createAuthenticatedFetch({
    origin, embedded: true, getSessionToken: async () => '', redirectToAuth: () => {},
    now: () => clock,
    wait: async (ms) => { clock += ms; },
    fetcher: async () => { calls++; return new Response(''); },
  });
  await assert.rejects(() => client('/api/quantity-breaks/campaigns', { method: 'POST' }), /session token/i);
  assert.equal(calls, 0);
});

test('transient session token acquisition failure retries before sending the request', async () => {
  const { createAuthenticatedFetch } = await loadFactory();
  let tokenReads = 0;
  let requests = 0;
  const waits = [];
  const client = createAuthenticatedFetch({
    origin, embedded: true,
    getSessionToken: async () => {
      tokenReads += 1;
      if (tokenReads < 3) throw new Error('App Bridge is still initializing');
      return 'ready-token';
    },
    redirectToAuth: () => {},
    wait: async (ms) => { waits.push(ms); },
    fetcher: async (_input, init) => {
      requests += 1;
      assert.equal(new Headers(init.headers).get('Authorization'), 'Bearer ready-token');
      return new Response('ok', { status: 200 });
    },
  });

  assert.equal((await client('/api/quantity-breaks/store-languages')).status, 200);
  assert.equal(tokenReads, 3);
  assert.equal(requests, 1);
  assert.deepEqual(waits, [200, 200]);
});

test('waits beyond the former three attempts for App Bridge to finish initializing', async () => {
  const { createAuthenticatedFetch } = await loadFactory();
  let tokenReads = 0;
  let requests = 0;
  const client = createAuthenticatedFetch({
    origin, embedded: true,
    getSessionToken: async () => {
      tokenReads += 1;
      if (tokenReads < 5) throw new Error('App Bridge is still initializing');
      return 'ready-token';
    },
    redirectToAuth: () => {},
    wait: async () => {},
    fetcher: async (_input, init) => {
      requests += 1;
      assert.equal(new Headers(init.headers).get('Authorization'), 'Bearer ready-token');
      return new Response('ok', { status: 200 });
    },
  });

  assert.equal((await client('/api/quantity-breaks/campaigns')).status, 200);
  assert.equal(tokenReads, 5);
  assert.equal(requests, 1);
});

test('parallel startup reads share one pending session-token request', async () => {
  const { createAuthenticatedFetch } = await loadFactory();
  let tokenReads = 0;
  let requests = 0;
  let releaseToken;
  const tokenReady = new Promise((resolve) => { releaseToken = resolve; });
  const client = createAuthenticatedFetch({
    origin, embedded: true,
    getSessionToken: async () => {
      tokenReads += 1;
      await tokenReady;
      return 'shared-token';
    },
    redirectToAuth: () => {},
    fetcher: async (_input, init) => {
      requests += 1;
      assert.equal(new Headers(init.headers).get('Authorization'), 'Bearer shared-token');
      return new Response('ok', { status: 200 });
    },
  });

  const responses = [
    client('/api/quantity-breaks/subscription'),
    client('/api/quantity-breaks/shop'),
    client('/api/quantity-breaks/campaigns'),
  ];
  await Promise.resolve();
  assert.equal(tokenReads, 1);
  releaseToken();
  assert.deepEqual((await Promise.all(responses)).map((response) => response.status), [200, 200, 200]);
  assert.equal(requests, 3);
});

test('short-lived inactive session token retries a read with a new token', async () => {
  const { createAuthenticatedFetch } = await loadFactory();
  let requests = 0;
  let tokenReads = 0;
  const waits = [];
  const client = createAuthenticatedFetch({
    origin, embedded: true, getSessionToken: async () => `token-${++tokenReads}`,
    redirectToAuth: () => {}, wait: async (ms) => { waits.push(ms); },
    fetcher: async () => ++requests === 1
      ? new Response('jwt not active', { status: 401 })
      : new Response('ok', { status: 200 }),
  });
  assert.equal((await client('/api/quantity-breaks/shop')).status, 200);
  assert.equal(requests, 2);
  assert.equal(tokenReads, 2);
  assert.equal(waits.length, 1);
});

test('embedded reads retry an ordinary unauthorized response with a fresh token', async () => {
  const { createAuthenticatedFetch } = await loadFactory();
  let requests = 0;
  let tokenReads = 0;
  const client = createAuthenticatedFetch({
    origin, embedded: true,
    getSessionToken: async () => `token-${++tokenReads}`,
    redirectToAuth: () => {},
    wait: async () => {},
    fetcher: async () => ++requests === 1
      ? new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
      : new Response('ok', { status: 200 }),
  });

  assert.equal((await client('/api/quantity-breaks/feedback')).status, 200);
  assert.equal(requests, 2);
  assert.equal(tokenReads, 2);
});

test('inactive session token never causes a write to be sent twice', async () => {
  const { createAuthenticatedFetch } = await loadFactory();
  let requests = 0;
  const client = createAuthenticatedFetch({
    origin, embedded: true, getSessionToken: async () => 'token',
    redirectToAuth: () => {}, wait: async () => {},
    fetcher: async () => { requests++; return new Response('jwt not active', { status: 401 }); },
  });
  assert.equal((await client('/api/quantity-breaks/campaigns', { method: 'POST', body: '{}' })).status, 401);
  assert.equal(requests, 1);
});

test('reauthorization response header works on non-403 responses', async () => {
  const { createAuthenticatedFetch } = await loadFactory();
  const redirects = [];
  const client = createAuthenticatedFetch({
    origin, embedded: true, getSessionToken: async () => 'token',
    redirectToAuth: (url) => redirects.push(url),
    fetcher: async () => new Response('', { status: 401, headers: {
      'X-SHOPLINE-API-Request-Failure-Reauthorize': '1',
      'X-SHOPLINE-API-Request-Failure-Reauthorize-Url': '/?uninstalled=true&embedded=1&appkey=test-app&handle=test-store&shop=test-store&host=test-store.myshopline.com&scope=read_products&redirectUri=https%3A%2F%2Fapp.example.com%2Fapi%2Fauth%2Fcallback',
    } }),
  });
  assert.equal((await client('/api/quantity-breaks/shop')).status, 401);
  assert.deepEqual(redirects, [`${origin}/?uninstalled=true&embedded=1&appkey=test-app&handle=test-store&shop=test-store&host=test-store.myshopline.com&scope=read_products&redirectUri=https%3A%2F%2Fapp.example.com%2Fapi%2Fauth%2Fcallback`]);
});
