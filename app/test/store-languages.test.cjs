const assert = require('node:assert/strict');
const { test } = require('node:test');
const { EventEmitter } = require('node:events');

test('loads only the store languages through its authenticated Admin session', async () => {
  const { loadStoreLanguages } = require('../src/service/store-languages');
  const calls = [];
  const result = await loadStoreLanguages('demo', 'token', async (url, options) => {
    calls.push({ url, authorization: options.headers.Authorization, contentType: options.headers['Content-Type'], accept: options.headers.Accept, userAgent: options.headers['User-Agent'], size: options.size });
    return { ok: true, json: async () => ({ data: { default_language: 'en', supported_languages: ['en', 'fr', 'fr'] } }) };
  });
  assert.deepEqual(result, { defaultLanguage: 'en', languages: ['en', 'fr'] });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/store\/languages\.json$/);
  assert.match(calls[0].url, /\/admin\/openapi\/v20260901\/store\/languages\.json$/);
  assert.equal(calls[0].authorization, 'Bearer token');
  assert.equal(calls[0].contentType, 'application/json; charset=utf-8');
  assert.equal(calls[0].accept, 'application/json');
  assert.equal(calls[0].userAgent, 'SHOPLINE-Quantity-Breaks-App/1.0');
  assert.equal(calls[0].size, 65_536);
});

test('accepts the live SHOPLINE languages response envelope', async () => {
  const { loadStoreLanguages } = require('../src/service/store-languages');
  const result = await loadStoreLanguages('demo', 'token', async () => ({
    ok: true,
    json: async () => ({ languages: { default_language: 'en', supported_languages: ['en', 'zh-hant-tw', 'ar'] } }),
  }));
  assert.deepEqual(result, { defaultLanguage: 'en', languages: ['en', 'zh-hant-tw', 'ar'] });
});

test('rejects invalid shop language responses and unauthenticated controller requests', async () => {
  const { loadStoreLanguages } = require('../src/service/store-languages');
  const { storeLanguagesController } = require('../src/controller/store-languages');
  const response = { locals: {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await storeLanguagesController({}, response);
  assert.equal(response.code, 401);
  await assert.rejects(() => loadStoreLanguages('demo', 'token', async () => ({ ok: true, json: async () => ({ data: { default_language: 'en', supported_languages: [] } }) })), /language/i);
  await assert.rejects(() => loadStoreLanguages('demo', 'token', async () => ({ ok: true, json: async () => ({ data: { default_language: 'en', supported_languages: ['fr'] } }) })), /default language/i);
});

test('language request trace correlates ingress and completion without logging credentials', () => {
  const { storeLanguagesTrace } = require('../src/controller/store-languages');
  const response = new EventEmitter();
  response.locals = {};
  response.statusCode = 502;
  response.writableEnded = true;
  const headers = {};
  response.setHeader = (name, value) => { headers[name] = value; };
  const logs = [];
  const previous = console.info;
  console.info = (...parts) => logs.push(parts);
  let nextCalled = false;
  try {
    storeLanguagesTrace({ method: 'GET', headers: { authorization: 'Bearer secret' } }, response, () => { nextCalled = true; });
    response.emit('finish');
  } finally { console.info = previous; }
  assert.equal(nextCalled, true);
  assert.equal(headers['X-Quantity-Breaks-Request-Id'], response.locals.storeLanguagesRequestId);
  assert.deepEqual(logs.map((entry) => entry[1].stage), ['ingress', 'completed']);
  assert.equal(logs[0][1].requestId, logs[1][1].requestId);
  assert.equal(logs[1][1].status, 502);
  assert.equal(JSON.stringify(logs).includes('secret'), false);
});

test('language request trace records an interrupted connection', () => {
  const { storeLanguagesTrace } = require('../src/controller/store-languages');
  const response = new EventEmitter();
  response.locals = {};
  response.statusCode = 200;
  response.writableEnded = false;
  response.setHeader = () => {};
  const warnings = [];
  const previousInfo = console.info;
  const previousWarn = console.warn;
  console.info = () => {};
  console.warn = (...parts) => warnings.push(parts);
  try {
    storeLanguagesTrace({ method: 'GET' }, response, () => {});
    response.emit('close');
  } finally { console.info = previousInfo; console.warn = previousWarn; }
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0][1].stage, 'connection_closed');
});

test('language upstream trace records status and traceId without token or response body', async () => {
  const { loadStoreLanguages } = require('../src/service/store-languages');
  const logs = [];
  const previous = console.info;
  console.info = (...parts) => logs.push(parts);
  try {
    await assert.rejects(() => loadStoreLanguages('demo', 'secret', async () => ({
      ok: false, status: 436, headers: { get: (name) => name === 'traceId' ? 'trace-123' : null },
    }), 'request-123'), /436/);
  } finally { console.info = previous; }
  assert.deepEqual(logs.map((entry) => entry[1].stage), ['upstream_request', 'upstream_response']);
  assert.equal(logs[0][1].version, 'v20260901');
  assert.equal(logs[1][1].status, 436);
  assert.equal(logs[1][1].traceId, 'trace-123');
  assert.equal(typeof logs[1][1].durationMs, 'number');
  assert.ok(logs[1][1].durationMs >= 0);
  assert.equal(logs.every((entry) => entry[1].requestId === 'request-123'), true);
  assert.equal(JSON.stringify(logs).includes('secret'), false);
});

test('language network failures record upstream duration without leaking the error message', async () => {
  const { loadStoreLanguages } = require('../src/service/store-languages');
  const logs = [];
  const previous = console.error;
  console.error = (...parts) => logs.push(parts);
  try {
    await assert.rejects(() => loadStoreLanguages('demo', 'secret', async () => {
      throw new Error('Bearer secret was rejected');
    }, 'request-network'), /secret was rejected/);
  } finally { console.error = previous; }
  assert.equal(logs[0][1].stage, 'upstream_network_error');
  assert.equal(typeof logs[0][1].durationMs, 'number');
  assert.ok(logs[0][1].durationMs >= 0);
  assert.equal(JSON.stringify(logs).includes('secret'), false);
});

test('436 trace reads alternate trace header and reports absence explicitly without leaking headers', async () => {
  const { loadStoreLanguages } = require('../src/service/store-languages');
  const logs = [];
  const previous = console.info;
  console.info = (...parts) => logs.push(parts);
  try {
    await assert.rejects(() => loadStoreLanguages('demo', 'secret', async () => ({
      ok: false, status: 436, headers: { get: (name) => name === 'x-trace-id' ? 'shopline-trace-456' : null, keys: function* () { yield 'x-trace-id'; yield 'set-cookie'; } },
    }), 'request-456'), /436/);
    assert.equal(logs.at(-1)[1].traceId, 'shopline-trace-456');
    assert.deepEqual(logs.at(-1)[1].traceHeaderNames, ['x-trace-id']);
    assert.equal(JSON.stringify(logs).includes('private-cookie'), false);
    await assert.rejects(() => loadStoreLanguages('demo', 'secret', async () => ({
      ok: false, status: 436, headers: { get: () => null, keys: function* () { yield 'content-type'; } },
    }), 'request-789'), /436/);
    assert.equal(logs.at(-1)[1].traceId, null);
    assert.equal(logs.at(-1)[1].traceHeaderPresent, false);
    assert.deepEqual(logs.at(-1)[1].traceHeaderNames, []);
    assert.equal(JSON.stringify(logs).includes('secret'), false);
  } finally { console.info = previous; }
});

test('language responses log safe diagnostic headers for successful and failed statuses', async () => {
  const { loadStoreLanguages } = require('../src/service/store-languages');
  const logs = [];
  const previous = console.info;
  console.info = (...parts) => logs.push(parts);
  const headers = new Map([
    ['content-type', 'application/json'], ['cf-ray', 'edge-123'], ['x-request-id', 'request-456'],
    ['set-cookie', 'private-cookie'], ['authorization', 'Bearer private-token'],
  ]);
  try {
    for (const status of [200, 436]) {
      const run = () => loadStoreLanguages('demo', 'secret', async () => ({
        ok: status === 200, status,
        headers: { get: (name) => headers.get(name.toLowerCase()) ?? null, keys: () => headers.keys() },
        json: async () => ({ data: { default_language: 'en', supported_languages: ['en'] } }),
      }), `request-${status}`);
      if (status === 200) await run();
      else await assert.rejects(run, /436/);
      const response = [...logs].reverse().find((entry) => entry[1].stage === 'upstream_response')[1];
      assert.deepEqual(response.diagnosticHeaders, {
        'content-type': 'application/json', 'cf-ray': 'edge-123', 'x-request-id': 'request-456',
      });
      assert.equal(response.status, status);
    }
    assert.equal(JSON.stringify(logs).includes('private-cookie'), false);
    assert.equal(JSON.stringify(logs).includes('private-token'), false);
    assert.equal(JSON.stringify(logs).includes('secret'), false);
  } finally { console.info = previous; }
});

test('language trace prints the actual request shape with a redacted Bearer curl', async () => {
  const { loadStoreLanguages } = require('../src/service/store-languages');
  const logs = [];
  const previous = console.info;
  console.info = (...parts) => logs.push(parts);
  try {
    await loadStoreLanguages('demo', 'private-token', async () => ({
      ok: true, status: 200, headers: { get: () => null },
      json: async () => ({ data: { default_language: 'en', supported_languages: ['en'] } }),
    }), 'request-curl');
  } finally { console.info = previous; }
  const sent = logs.find((entry) => entry[1].stage === 'upstream_request')[1];
  assert.equal(sent.method, 'GET');
  assert.equal(sent.url, 'https://demo.myshopline.com/admin/openapi/v20260901/store/languages.json');
  assert.deepEqual(sent.requestHeaders, {
    Authorization: 'Bearer [REDACTED]', 'Content-Type': 'application/json; charset=utf-8',
    Accept: 'application/json', 'User-Agent': 'SHOPLINE-Quantity-Breaks-App/1.0',
  });
  assert.match(sent.curl, /^curl --request GET /);
  assert.match(sent.curl, /-H 'Authorization: Bearer \[REDACTED\]'/);
  assert.match(sent.curl, /-H 'Accept: application\/json'/);
  assert.match(sent.curl, /-H 'User-Agent: SHOPLINE-Quantity-Breaks-App\/1\.0'/);
  const received = logs.find((entry) => entry[1].stage === 'upstream_data');
  assert.deepEqual(received?.[1].responseData, { defaultLanguage: 'en', languages: ['en'] });
  assert.equal(JSON.stringify(logs).includes('private-token'), false);
});

test('local debug mode and production both keep the Bearer token out of diagnostics', async () => {
  const { loadStoreLanguages } = require('../src/service/store-languages');
  const previousDebug = process.env.SHOPLINE_LOG_FULL_CURL;
  const previousNodeEnv = process.env.NODE_ENV;
  const previousInfo = console.info;
  const logs = [];
  console.info = (...parts) => logs.push(parts);
  const fetcher = async () => ({
    ok: true, status: 200, headers: { get: () => null },
    json: async () => ({ data: { default_language: 'en', supported_languages: ['en'] } }),
  });
  try {
    process.env.SHOPLINE_LOG_FULL_CURL = '1';
    process.env.NODE_ENV = 'development';
    await loadStoreLanguages('demo', 'test-token-only', fetcher, 'debug-request');
    const localCurl = logs.find((entry) => entry[1].stage === 'upstream_request')[1].curl;
    assert.match(localCurl, /-H 'Authorization: Bearer \[REDACTED\]'/);
    assert.equal(JSON.stringify(logs).includes('test-token-only'), false);
    logs.length = 0;
    process.env.NODE_ENV = 'production';
    await loadStoreLanguages('demo', 'test-token-only', fetcher, 'production-request');
    const productionCurl = logs.find((entry) => entry[1].stage === 'upstream_request')[1].curl;
    assert.match(productionCurl, /-H 'Authorization: Bearer \[REDACTED\]'/);
    assert.equal(JSON.stringify(logs).includes('test-token-only'), false);
  } finally {
    console.info = previousInfo;
    if (previousDebug === undefined) delete process.env.SHOPLINE_LOG_FULL_CURL;
    else process.env.SHOPLINE_LOG_FULL_CURL = previousDebug;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

test('language trace lists returned headers while masking secret values and summarizes HTML errors', async () => {
  const { loadStoreLanguages } = require('../src/service/store-languages');
  const logs = [];
  const previous = console.info;
  console.info = (...parts) => logs.push(parts);
  const headers = new Map([
    ['content-type', 'text/html; charset=utf-8'], ['cf-ray', 'ray-123'],
    ['set-cookie', 'private-cookie'], ['x-private-header', 'private-value'],
  ]);
  try {
    await assert.rejects(() => loadStoreLanguages('demo', 'private-token', async () => ({
      ok: false, status: 436, statusText: 'Unknown',
      headers: { get: (name) => headers.get(name.toLowerCase()) ?? null, keys: () => headers.keys() },
      text: async () => '<html><title>Cloudflare Error 436</title><body>private-token</body></html>',
    }), 'request-html'), /436/);
  } finally { console.info = previous; }
  const received = logs.find((entry) => entry[1].stage === 'upstream_response')[1];
  assert.equal(received.status, 436);
  assert.equal(received.statusText, 'Unknown');
  assert.deepEqual(received.responseHeaders, {
    'content-type': 'text/html; charset=utf-8',
    'cf-ray': 'ray-123',
    'set-cookie': '[REDACTED]',
    'x-private-header': '[REDACTED]',
  });
  assert.deepEqual(received.responseBody, { kind: 'html', title: 'Cloudflare Error 436' });
  assert.equal(JSON.stringify(logs).includes('private-token'), false);
  assert.equal(JSON.stringify(logs).includes('private-cookie'), false);
  assert.equal(JSON.stringify(logs).includes('private-value'), false);
});

test('JSON error diagnostics include only bounded, redacted error fields', async () => {
  const { loadStoreLanguages } = require('../src/service/store-languages');
  const logs = [];
  const previous = console.info;
  console.info = (...parts) => logs.push(parts);
  try {
    await assert.rejects(() => loadStoreLanguages('demo', 'private-token', async () => ({
      ok: false, status: 436,
      headers: { get: (name) => name === 'content-type' ? 'application/json' : null },
      text: async () => JSON.stringify({ code: 436, message: 'Bearer private-token rejected', details: 'private-detail' }),
    }), 'request-json'), /436/);
  } finally { console.info = previous; }
  const received = logs.find((entry) => entry[1].stage === 'upstream_response')[1];
  assert.deepEqual(received.responseBody, { kind: 'json', code: 436, message: 'Bearer [REDACTED] rejected' });
  assert.equal(JSON.stringify(logs).includes('private-token'), false);
  assert.equal(JSON.stringify(logs).includes('private-detail'), false);
});
