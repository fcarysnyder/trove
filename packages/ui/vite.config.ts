import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The API the dev server proxies to: the old doc-review server or `trove serve`.
const api = process.env.TROVE_API ?? 'http://127.0.0.1:4824';

export default defineConfig({
  base: './', // the same build loads from the core server at / and from Electron over file://
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': resolve(import.meta.dirname, 'src') } },
  build: {
    rollupOptions: { input: { index: resolve(import.meta.dirname, 'index.html'), start: resolve(import.meta.dirname, 'start.html') } },
  },
  server: {
    proxy: {
      // The server refuses POSTs from another origin, so the proxy presents the API's own.
      '/api': { target: api, changeOrigin: true, configure: (proxy) => proxy.on('proxyReq', (req) => req.setHeader('origin', api)) },
    },
  },
});
