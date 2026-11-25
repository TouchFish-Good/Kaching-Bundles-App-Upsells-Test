import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('keeps dependency test files out of the Worker test suite', () => {
  const config = readFileSync(new URL('../vitest.config.ts', import.meta.url), 'utf8');
  assert.match(config, /exclude:\s*\[\.\.\.configDefaults\.exclude,/);
});
