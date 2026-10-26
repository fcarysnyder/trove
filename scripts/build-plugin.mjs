#!/usr/bin/env node
// Builds core, ui and the CLI, then refreshes plugins/trove/dist: the bundled server (trove.mjs),
// the page (ui/) and BUILD.json. Node built-ins only. Run with `pnpm build:plugin`.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bundle = join(root, 'packages/cli/dist/trove.mjs');
const ui = join(root, 'packages/ui/dist');
const out = join(root, 'plugins/trove/dist');

function fail(message) {
  console.error(`build-plugin: ${message}`);
  process.exit(1);
}

for (const pkg of ['@trove/core', '@trove/ui', 'trove']) {
  console.log(`build-plugin: pnpm --filter ${pkg} build`);
  try {
    execFileSync('pnpm', ['--filter', pkg, 'build'], { cwd: root, stdio: 'inherit' });
  } catch {
    fail(`building ${pkg} failed; plugins/trove/dist is unchanged.`);
  }
}

// Check before emptying, so a half-built tree never replaces the committed dist.
for (const input of [bundle, join(ui, 'index.html')]) {
  if (!existsSync(input)) fail(`${relative(root, input)} is missing after the build; plugins/trove/dist is unchanged.`);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(bundle, join(out, 'trove.mjs'));
cpSync(ui, join(out, 'ui'), { recursive: true });

const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
writeFileSync(join(out, 'BUILD.json'), JSON.stringify({ sha, builtAt: new Date().toISOString() }, null, 2) + '\n');
console.log(`build-plugin: wrote ${relative(root, out)} (${sha})`);
