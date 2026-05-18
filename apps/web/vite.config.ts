import path from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import svgr from 'vite-plugin-svgr';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PROXY_PREFIX = '/prod-api';

export default defineConfig(({ mode }) => {
  if (mode === 'remote' && !process.env.PROD_API_URL) {
    throw new Error(
      'PROD_API_URL must be set. Usage: PROD_API_URL=https://your-api.example.com pnpm dev:remote',
    );
  }

  return {
    plugins: [
      // Runs before Vite's env plugin so it wins over the .env VITE_API_URL value.
      // Only active in remote mode — rewrites import.meta.env.VITE_API_URL to the
      // local proxy prefix so all apiFetch calls route through server.proxy below.
      ...(mode === 'remote'
        ? [
            {
              name: 'remote-api-url',
              enforce: 'pre' as const,
              transform(code: string) {
                if (!code.includes('import.meta.env.VITE_API_URL')) return;
                return code.replace(
                  /import\.meta\.env\.VITE_API_URL/g,
                  JSON.stringify(`http://localhost:5173${PROXY_PREFIX}`),
                );
              },
            },
          ]
        : []),
      react(),
      svgr(),
    ],
    envDir: path.resolve(__dirname, '..', '..'),
    server: {
      port: 5173,
      ...(mode === 'remote'
        ? {
            proxy: {
              [PROXY_PREFIX]: {
                // Guarded above (line 13): in `remote` mode this is required.
                target: process.env.PROD_API_URL!,
                changeOrigin: true,
                rewrite: (p) => p.replace(new RegExp(`^${PROXY_PREFIX}`), ''),
                configure: (proxy) => {
                  proxy.on('proxyReq', (proxyReq) => {
                    // Strip the browser Origin header so the production API's
                    // origin-check allowlist treats this as a server-to-server
                    // request (missing Origin passes per origin-check.ts).
                    proxyReq.removeHeader('origin');
                  });
                },
              },
            },
          }
        : {}),
    },
  };
});
