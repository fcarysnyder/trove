# Distribution

Trove ships three ways, all from this repository:

- **Mac app:** a disk image on [GitHub Releases](https://github.com/fcarysnyder/trove/releases), built for Apple silicon.
- **CLI:** `trove-<version>.mjs` on the same release, one file that runs with Node 22. It is the same bundle as `plugins/trove/dist/trove.mjs`.
- **Claude Code plugin:** installed from this repository's marketplace (`/plugin marketplace add fcarysnyder/trove`), which reads `plugins/trove` on `main`.

There is one release channel, stable. Every release is the `Latest` release on GitHub; there are no nightly or prerelease builds yet.

## Release assets

| Asset | What it is |
| --- | --- |
| `Installer-Trove-<version>-arm64.dmg` | The Mac app. Drag Trove to Applications. |
| `Checksum-Trove-<version>-arm64.dmg.sha256` | SHA-256 of the disk image, for `shasum -a 256 -c`. |
| `trove-<version>.mjs` | The CLI bundle. `node trove-<version>.mjs serve --root <repo>`. |
| `Checksum-trove-<version>.mjs.sha256` | SHA-256 of the CLI bundle. |

The disk image and the CLI bundle carry a GitHub build provenance attestation, so anyone can check that a download was built by this repository's release workflow from the tagged commit:

```sh
gh attestation verify Installer-Trove-0.5.0-arm64.dmg --repo fcarysnyder/trove
```

## Signing

The Mac app is signed ad hoc and is not notarized. electron-builder does no signing (`identity: null`); its `afterPack` hook, `apps/desktop/scripts/adhoc-sign.cjs`, signs the whole assembled bundle ad hoc before the disk image is made, and the release workflow checks that the signature verifies. Apple silicon refuses to launch code without a valid signature, and Electron's own ad-hoc signature stops covering the bundle once Trove's files are added, which a downloaded copy reports as "damaged". An ad-hoc signature is enough to run, but Gatekeeper still blocks the first launch of a downloaded copy: users open System Settings › Privacy & Security and choose **Open Anyway** once.

Moving to a Developer ID signature and notarization needs an Apple Developer account. When there is one: add the certificate as `CSC_LINK` / `CSC_KEY_PASSWORD` secrets and the notarization credentials as `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID`; remove `identity: null` and the `afterPack` hook; set `hardenedRuntime: true` and `notarize: true`; and drop the Open Anyway notes from the README and the release notes script.

## Releasing

1. Pick the version. Trove uses semantic versioning; while it is 0.x, a minor bump carries new features.
2. Set it in all four places that record it: `apps/desktop/package.json`, `packages/cli/package.json`, `plugins/trove/.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`.
3. In `CHANGELOG.md`, rename `## [Unreleased]` to `## [<version>] - <YYYY-MM-DD>`, add a new empty `## [Unreleased]` above it, and write the summary paragraph. The release notes are made from this section, so write it for people who use Trove: what they can do now, in full sentences.
4. Run `pnpm build:plugin` and commit, so the plugin and the CLI asset carry the new version.
5. Check: `node scripts/release/check-version.mjs v<version>` prints the version, and `node scripts/release/release-notes.mjs <version>` shows the notes as they will appear.
6. Merge to `main`, then tag the merge commit and push the tag:

   ```sh
   git tag v<version> && git push origin v<version>
   ```

The **Release** workflow (`.github/workflows/release.yml`) does the rest: it checks that the tag, the four versions and the changelog agree, builds the app on an Apple silicon runner, checks the packaged app's version, icon, signature and architecture, then attests and publishes the release. The publish job runs in the `release` environment, so protection rules added to that environment in the repository settings (a required reviewer, for example) apply to every release.

Pull requests that touch the app, the UI, the icon, the changelog or the release scripts run the same build and checks without publishing, and upload the assets as a workflow artifact to try before merging.

## Icon

The app icon, favicon and README mark come from `design/icon/`; see its README. `apps/desktop/assets/icon.icns` and `icon.png` are copies of the dark set.
