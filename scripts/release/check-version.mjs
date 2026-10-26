#!/usr/bin/env node
// Checks that every place Trove records its version agrees, and that CHANGELOG.md has a dated
// section for it. With a tag argument (v1.2.3) the tag must match too. Prints the version.
//
//   node scripts/release/check-version.mjs          # on a branch
//   node scripts/release/check-version.mjs v0.5.0   # on a tag, as the release workflow runs it
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..', '..');
const json = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'));

const sources = {
  'apps/desktop/package.json': json('apps/desktop/package.json').version,
  'packages/cli/package.json': json('packages/cli/package.json').version,
  'plugins/trove/.claude-plugin/plugin.json': json('plugins/trove/.claude-plugin/plugin.json').version,
  '.claude-plugin/marketplace.json': json('.claude-plugin/marketplace.json').version,
};

const problems = [];
const version = sources['apps/desktop/package.json'];
for (const [path, v] of Object.entries(sources)) {
  if (v !== version) problems.push(`${path} says ${v}, apps/desktop/package.json says ${version}`);
}
if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) problems.push(`${version} is not a plain major.minor.patch version`);

const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');
const escaped = version.replaceAll('.', '\\.');
if (!new RegExp(`^## \\[${escaped}\\] - \\d{4}-\\d{2}-\\d{2}$`, 'm').test(changelog)) {
  problems.push(`CHANGELOG.md has no "## [${version}] - YYYY-MM-DD" section`);
}

const tag = process.argv[2];
if (tag && tag !== `v${version}`) problems.push(`tag ${tag} does not match version ${version} (expected v${version})`);

if (problems.length) {
  for (const p of problems) console.error(`check-version: ${p}`);
  process.exit(1);
}
console.log(version);
