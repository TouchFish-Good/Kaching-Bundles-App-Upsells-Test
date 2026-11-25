import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';
import { configDefaults } from 'vitest/config';

export default defineWorkersConfig({
  test: {
    exclude: [...configDefaults.exclude, 'test/no-legacy-runtime-imports.test.mjs', 'test/vitest-config.test.mjs'],
    poolOptions: {
      workers: {
        miniflare: {
          compatibilityDate: '2025-03-21',
          d1Databases: ['DB'],
        },
      },
    },
  },
});
