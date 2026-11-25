import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const extensionRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('the SHOPLINE single-file entry compiles without sibling Go files', () => {
  const output = execFileSync(process.env.GO_BIN ?? 'go', ['test', 'main.go'], {
    cwd: extensionRoot,
    encoding: 'utf8',
    env: { ...process.env, GOWORK: 'off' },
  });
  assert.match(output, /command-line-arguments/);
});
