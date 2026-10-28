import { chmodSync, cpSync, existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';

// The UI is @trove/ui's build (index.html, start.html, assets/), reached through the workspace
// dependency and copied into out/ui after each main build, so dev, build and the packaged .app
// all load it from <appPath>/out/ui.
const root = import.meta.dirname;
const uiDist = resolve(root, 'node_modules/@trove/ui/dist');
const uiOut = resolve(root, 'out/ui');
// node-pty is N-API, so its prebuilt binary loads in Electron without a rebuild. It is copied into
// out/node-pty the same way (main requires it from there), with this platform's prebuild as its
// build/Release; pnpm's store drops spawn-helper's execute bit, which the copy puts back.
const ptySrc = resolve(root, 'node_modules/node-pty');
const ptyOut = resolve(root, 'out/node-pty');

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
          const prebuild = resolve(ptySrc, `prebuilds/${process.platform}-${process.arch}`);
          if (!existsSync(prebuild)) throw new Error(`node-pty has no prebuild for ${process.platform}-${process.arch}`);
          rmSync(ptyOut, { recursive: true, force: true });
          cpSync(resolve(ptySrc, 'package.json'), resolve(ptyOut, 'package.json'));
          cpSync(resolve(ptySrc, 'lib'), resolve(ptyOut, 'lib'), { recursive: true, filter: (p) => !/\.(test\.js|map)$/.test(p) });
          cpSync(prebuild, resolve(ptyOut, 'build/Release'), { recursive: true });
          chmodSync(resolve(ptyOut, 'build/Release/spawn-helper'), 0o755);
        },
      },
    ],
  },
  preload: {
    // Sandboxed preloads must be CommonJS.
    build: { rolldownOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } } },
  },
});
