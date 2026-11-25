const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { test } = require('node:test');

test('Quantity Breaks API requests are traced before authentication without logging credentials', () => {
  const { quantityBreaksTrace } = require('../src/controller/quantity-breaks-trace');
  const response = new EventEmitter();
  response.locals = {};
  response.statusCode = 302;
  response.setHeader = (name, value) => { response.headers[name] = value; };
  response.headers = {};
  const entries = [];
  const previous = console.info;
  console.info = (...parts) => entries.push(parts);
  let nextCalled = false;
  try {
    quantityBreaksTrace({ method: 'GET', path: '/markets', headers: { authorization: 'Bearer private-token' } }, response, () => { nextCalled = true; });
    response.emit('finish');
  } finally { console.info = previous; }
  assert.equal(nextCalled, true);
  assert.equal(response.headers['X-Quantity-Breaks-Request-Id'], response.locals.quantityBreaksRequestId);
  assert.deepEqual(entries.map((entry) => entry[1].stage), ['ingress', 'completed']);
  assert.equal(entries[0][1].endpoint, '/markets');
  assert.equal(entries[1][1].status, 302);
  assert.equal(typeof entries[1][1].durationMs, 'number');
  assert.equal(JSON.stringify(entries).includes('private-token'), false);
});
