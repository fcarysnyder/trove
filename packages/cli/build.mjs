// @ts-check
// Bundles bin/trove.mjs and @trove/core (with the vendored marked) into one ESM file with no
// runtime dependencies: dist/trove.mjs. Core is bundled from source, so it needs no build first.
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const { version } = JSON.parse(readFileSync(new URL('package.json', import.meta.url), 'utf8'));
await build({
  entryPoints: [new URL('bin/trove.mjs', import.meta.url).pathname],
  outfile: new URL('dist/trove.mjs', import.meta.url).pathname,
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  alias: { '@trove/core': new URL('../core/src/index.ts', import.meta.url).pathname },
  banner: { js: `// trove ${version}: bundled CLI and engine (@trove/core, marked). Node 22+, no dependencies.` },
  logLevel: 'warning',
});
