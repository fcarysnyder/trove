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

## The terminal's native module

The agent's terminal in the Agent pane is a pty from [node-pty](https://github.com/microsoft/node-pty), the app's one native module. node-pty 1.1 is built on N-API and ships prebuilt binaries, so the same `pty.node` loads in Node and in Electron 45 without an `electron-rebuild` step, and nothing compiles on install (`pnpm-workspace.yaml` still lists it in `onlyBuiltDependencies` so its install script runs). `electron.vite.config.ts` copies its `lib/` and this platform's prebuild (`pty.node` and the `spawn-helper` executable, whose execute bit pnpm's store drops) into `out/node-pty`, and `electron-builder.yml` unpacks `out/node-pty/**` from the asar, since neither file can run from inside it. Both Mach-O files are signed with the rest of the bundle; the release workflow checks that `pty.node` is there and that `spawn-helper`'s signature verifies. A node-pty upgrade that drops the prebuilds would need `@electron/rebuild` in a desktop `postinstall`.

## Signing

Released builds are signed with a Developer ID certificate and notarized, so they open without a Gatekeeper prompt. electron-builder signs with the certificate in `CSC_LINK` and notarizes with the `APPLE_*` credentials; the release workflow passes them from repository secrets and, on a tag, fails unless the app is Developer ID signed, notarized and accepted by `spctl`.

Builds without the certificate (pull requests, local `pnpm dist` without it in the keychain) fall back to an ad-hoc signature: the `afterPack` hook, `apps/desktop/scripts/adhoc-sign.cjs`, signs the whole bundle ad hoc, because Apple silicon will not launch code without a valid signature, and electron-builder signs over it when it has a Developer ID. An ad-hoc build runs, but a downloaded copy needs System Settings › Privacy & Security › **Open Anyway** once.

### Setting up the certificate

Needs a paid Apple Developer Program membership.

1. Make a key and certificate signing request (kept outside the repository):

   ```sh
   umask 077; mkdir -p ~/.trove-signing && cd ~/.trove-signing
   openssl req -new -newkey rsa:2048 -nodes -keyout developer-id.key -out developer-id.csr -subj "/CN=<your name>/C=US"
   ```

2. At [Certificates](https://developer.apple.com/account/resources/certificates/add), choose **Developer ID Application** (G2 Sub-CA), upload `developer-id.csr`, and download the certificate to `~/.trove-signing/developer_id.cer`.
3. Bundle the key, the certificate and Apple's intermediate into a password-protected `.p12`:

   ```sh
   cd ~/.trove-signing
   curl -fsSLO https://www.apple.com/certificateauthority/DeveloperIDG2CA.cer
   openssl x509 -inform der -in developer_id.cer -out developer_id.pem
   openssl x509 -inform der -in DeveloperIDG2CA.cer -out DeveloperIDG2CA.pem
   openssl pkcs12 -export -legacy -inkey developer-id.key -in developer_id.pem -certfile DeveloperIDG2CA.pem -out trove-developer-id.p12
   ```

   Double-click the `.p12` to add it to the login keychain for local signed builds.
4. Make an app-specific password at [account.apple.com](https://account.apple.com) › Sign-In and Security, and find the team ID at [Membership details](https://developer.apple.com/account#MembershipDetailsCard).
5. Add the repository secrets:

   ```sh
   base64 -i trove-developer-id.p12 | gh secret set CSC_LINK
   gh secret set CSC_KEY_PASSWORD          # the .p12 export password
   gh secret set APPLE_ID                  # Apple Account email
   gh secret set APPLE_APP_SPECIFIC_PASSWORD
   gh secret set APPLE_TEAM_ID
   ```

The certificate lasts five years. To renew, repeat the steps and replace the secrets.

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
