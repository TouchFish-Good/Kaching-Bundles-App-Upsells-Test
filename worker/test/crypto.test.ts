import { describe, expect, it } from 'vitest';

import {
  decryptToken,
  encryptToken,
  hmacBase64,
  hmacHex,
  timingSafeEqual,
} from '../src/crypto';

const testKey = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY';

describe('Worker crypto', () => {
  it('creates a standard SHA-256 HMAC without Node crypto', async () => {
    await expect(hmacHex('secret', 'message')).resolves.toBe(
      '8b5f48702995c1598c573db1e21866a9b825d4a794d169d7060a03605796360b',
    );
  });

  it('encodes the same HMAC as standard base64', async () => {
    await expect(hmacBase64('secret', 'message')).resolves.toBe('i19IcCmVwVmMVz2x4hhmqbgl1KeU0WnXBgoDYFeWNgs=');
  });

  it('compares equal-length values without accepting a mismatch', () => {
    expect(timingSafeEqual('abc123', 'abc123')).toBe(true);
    expect(timingSafeEqual('abc123', 'abc124')).toBe(false);
    expect(timingSafeEqual('abc123', 'abc')).toBe(false);
  });

  it('rejects ciphertext authenticated for another store', async () => {
    const cipher = await encryptToken(testKey, 'alpha', 'token-value');

    await expect(decryptToken(testKey, 'beta', cipher)).rejects.toThrow(
      'Token decryption failed',
    );
  });
});
