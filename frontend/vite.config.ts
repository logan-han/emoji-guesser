/// <reference types="vitest/config" />
import type { IncomingMessage } from 'node:http';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { handle } from './server/http.js';
import { memoryStore } from './server/store.js';

const readBody = (req: IncomingMessage) =>
  new Promise<string>((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });

/**
 * The game server on the dev server, from memory: `yarn dev` plays a whole game across tabs with
 * no database. In production the same handler runs as Vercel Functions on Neon (api/).
 */
function devApi(): Plugin {
  const store = memoryStore();
  return {
    name: 'emoji-guesser-dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();
        const abort = new AbortController();
        res.on('close', () => abort.abort());
        const headers = new Headers();
        for (const [key, value] of Object.entries(req.headers)) {
          if (typeof value === 'string') headers.set(key, value);
        }
        const response = await handle(
          new Request(`http://localhost${req.url}`, {
            method: req.method,
            headers,
            body: req.method === 'POST' ? await readBody(req) : undefined,
            signal: abort.signal,
          }),
          { store },
        );
        res.statusCode = response.status;
        response.headers.forEach((value, key) => res.setHeader(key, value));
        if (!response.body) return res.end();
        const reader = response.body.getReader();
        abort.signal.addEventListener('abort', () => void reader.cancel().catch(() => {}));
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
          }
        } catch {
          // The browser went away mid-stream.
        }
        res.end();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), devApi()],
  // Playwright and the old CRA dev server both expect 3000.
  server: { port: 3000, host: true },
  preview: { port: 3000 },
  build: { outDir: 'build' },
  test: {
    globals: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'web',
          environment: 'jsdom',
          // Playwright owns e2e/; the server suite runs in node.
          include: ['src/**/*.{test,spec}.{ts,tsx}'],
          // CRA's jest served jsdom from http://localhost/; vitest defaults to :3000.
          environmentOptions: { jsdom: { url: 'http://localhost/' } },
          setupFiles: './src/setupTests.ts',
        },
      },
      {
        extends: true,
        test: { name: 'server', environment: 'node', include: ['server/**/*.test.ts'] },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}', 'server/**/*.ts', 'api/**/*.ts'],
      exclude: [
        '**/*.test.{ts,tsx}',
        'src/testUtils.tsx',
        'src/setupTests.ts',
        'src/vite-env.d.ts',
        'server/testing.ts',
      ],
    },
  },
});
