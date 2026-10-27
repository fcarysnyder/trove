// electron-builder afterPack hook: sign the assembled Trove.app ad hoc, before the DMG is made, when
// there is no Developer ID certificate (CSC_LINK) to sign it with; with one, electron-builder signs.
//
// Apple silicon refuses to run code without a valid signature. The Electron binary arrives with
// its own ad-hoc signature, but that signature does not cover the bundle once Trove's resources
// are added, so a downloaded copy is reported as damaged. Re-signing the whole bundle ad hoc
// fixes that. It is not a Developer ID signature: Gatekeeper still asks for Open Anyway once.
const { execFileSync } = require('node:child_process');
const { join } = require('node:path');

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin' || process.env.CSC_LINK) return;
  const app = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', '--timestamp=none', app], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app], { stdio: 'inherit' });
};
