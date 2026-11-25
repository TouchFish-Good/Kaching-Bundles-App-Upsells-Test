import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/authorization-renewal-response.test.ts'],
  },
});
