import { defineConfig } from 'vitest/config';

// Relative base: the site is served from https://<user>.github.io/<repo>/.
export default defineConfig({
  base: './',
  server: { port: 5180 },
  test: { include: ['tests/**/*.test.ts'] },
});
