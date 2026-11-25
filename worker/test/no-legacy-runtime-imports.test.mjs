import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const workerRoot = fileURLToPath(new URL('..', import.meta.url));

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() && /\.(?:ts|mjs)$/.test(path) ? [path] : [];
  });
}

test('Worker source and tests do not import the retired app runtime', () => {
  const files = [
    ...sourceFiles(join(workerRoot, 'src')),
    ...sourceFiles(join(workerRoot, 'test')),
  ];

  for (const file of files) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /from\s+['"][^'"]*app\/src\//);
  }
});
