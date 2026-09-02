/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Playwright and the old CRA dev server both expect 3000.
  server: { port: 3000, host: true },
  preview: { port: 3000 },
  build: { outDir: 'build' },
  test: {
    globals: true,
    environment: 'jsdom',
    // Playwright owns e2e/; vitest only runs the unit tests under src/.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // CRA's jest served jsdom from http://localhost/; vitest defaults to :3000.
    environmentOptions: { jsdom: { url: 'http://localhost/' } },
    setupFiles: './src/setupTests.ts',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/testUtils.tsx', 'src/setupTests.ts', 'src/vite-env.d.ts'],
    },
  },
});
