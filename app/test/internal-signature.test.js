const test = require('node:test');
const assert = require('node:assert/strict');
const { signRequest, verifyRequest } = require('../src/admin-read/signature');

test('signed request is accepted once and rejects replay', () => {
  const now = 1791940000000;
  const timestamp = String(now);
  const nonce = 'unique-nonce';
  const path = '/internal/admin-read/v1/stores?limit=25';
  const signature = signRequest('a-long-secret', 'GET', path, timestamp, nonce);
  const seen = new Set();
  assert.equal(verifyRequest('a-long-secret', 'GET', path, { timestamp, nonce, signature }, now, seen), true);
  assert.equal(verifyRequest('a-long-secret', 'GET', path, { timestamp, nonce, signature }, now, seen), false);
});

test('signed request rejects changed path and expired timestamp', () => {
  const now = 1791940000000;
  const timestamp = String(now);
  const signature = signRequest('a-long-secret', 'GET', '/stores', timestamp, 'nonce-2');
  assert.equal(verifyRequest('a-long-secret', 'GET', '/stores/other', { timestamp, nonce: 'nonce-2', signature }, now, new Set()), false);
  assert.equal(verifyRequest('a-long-secret', 'GET', '/stores', { timestamp, nonce: 'nonce-2', signature }, now + 120000, new Set()), false);
});
