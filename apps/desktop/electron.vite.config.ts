import { cpSync, existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';

// The UI is @trove/ui's build (index.html, start.html, assets/), reached through the workspace
// dependency and copied into out/ui after each main build, so dev, build and the packaged .app
// all load it from <appPath>/out/ui.
const root = import.meta.dirname;
const uiDist = resolve(root, 'node_modules/@trove/ui/dist');
const uiOut = resolve(root, 'out/ui');

export default defineConfig({
  main: {
    // @trove/core is Node built-ins only: bundle it so the packaged app needs no node_modules.
    build: { externalizeDeps: { exclude: ['@trove/core'] } },
    plugins: [
      {
        name: 'trove-ui-dist',
        closeBundle() {
          if (!existsSync(resolve(uiDist, 'start.html'))) {
            throw new Error(`@trove/ui is not built (${uiDist}); run pnpm --filter @trove/ui build`);
          }
          rmSync(uiOut, { recursive: true, force: true });
          cpSync(uiDist, uiOut, { recursive: true });
        },
      },
    ],
  },
  preload: {
    // Sandboxed preloads must be CommonJS.
    build: { rolldownOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } } },
  },
});
