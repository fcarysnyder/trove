#!/usr/bin/env node
// Writes the GitHub release body for one version from its CHANGELOG.md section: the summary
// paragraph as Highlights, the Added/Changed/Fixed/Upgrading sections as written, then download,
// first-launch and verification notes.
//
//   node scripts/release/release-notes.mjs 0.5.0 [--repo owner/name] > release-notes.md
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..', '..');
const args = process.argv.slice(2);
const version = args[0];
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const repo = opt('repo', process.env.GITHUB_REPOSITORY || 'fcarysnyder/trove');
if (!version) {
  console.error('usage: release-notes.mjs <version> [--repo owner/name]');
  process.exit(2);
}

// ---- the version's section of the changelog ----
const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');
const sections = changelog.split(/^## /m).slice(1);
const section = sections.find((s) => s.startsWith(`[${version}]`));
if (!section) {
  console.error(`release-notes: CHANGELOG.md has no section for ${version}`);
  process.exit(1);
}
const body = section.slice(section.indexOf('\n') + 1).trim();
const firstSub = body.search(/^### /m);
const summary = (firstSub === -1 ? body : body.slice(0, firstSub)).trim().replace(/\n(?!\n)/g, ' ');
const rest = firstSub === -1 ? '' : body.slice(firstSub).trim();

// ---- the previous released version, for the compare link ----
const semver = (t) => t.slice(1).split('.').map(Number);
const older = (a, b) => { for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i]; return false; };
let previous = null;
try {
  const tags = execFileSync('git', ['tag', '--list', 'v*.*.*'], { cwd: root, encoding: 'utf8' }).split('\n').filter((t) => /^v\d+\.\d+\.\d+$/.test(t));
  for (const t of tags) if (older(semver(t), semver(`v${version}`)) && (!previous || older(semver(previous), semver(t)))) previous = t;
} catch {
  // no git: leave the compare link out
}

const tag = `v${version}`;
const base = `https://github.com/${repo}`;
const dmg = `Installer-Trove-${version}-arm64.dmg`;
const cli = `trove-${version}.mjs`;
const checksum = `Checksum-Trove-${version}-arm64.dmg.sha256`;
const changes = previous ? `${base}/compare/${previous}...${tag}` : `${base}/commits/${tag}`;

process.stdout.write(`## Highlights

${summary}

${rest}

## Download

- **Mac (Apple silicon):** [${dmg}](${base}/releases/download/${tag}/${dmg}). Open the disk image and drag Trove to Applications.
- **CLI:** [${cli}](${base}/releases/download/${tag}/${cli}), a single file that runs with Node 22: \`node ${cli} serve --root <repo>\`.
- **Claude Code plugin:** \`/plugin marketplace add ${repo}\`, then \`/plugin install trove@trove\`.

To check a download, run \`shasum -a 256 -c ${checksum}\` beside it, or verify where it was built with \`gh attestation verify ${dmg} --repo ${repo}\`.

[View all changes](${changes}) · [Changelog](${base}/blob/${tag}/CHANGELOG.md) · [All releases](${base}/releases)

Releases are built and published by GitHub Actions from the tagged commit.
`.replace(/\n{3,}/g, '\n\n'));
