const fs = require('fs');
const path = require('path');
const { withAppBuildGradle } = require('expo/config-plugins');

// The RN template signs *release* builds with the shared Android debug key (password
// "android", identical in every RN/Expo project). That key's SHA-1 would be the one
// registered for Google Sign-In, so anyone could build an `app.quietfeed` clone and use
// our OAuth client. This plugin points release builds at our own keystore instead.
//
// It runs on every `expo prebuild`, because android/ is regenerated each time and would
// otherwise silently revert to the debug key.
//
// Credentials come from credentials/keystore.json (gitignored). If that file is absent
// the build falls back to the template default rather than failing — so a fresh clone
// still builds, just unsigned-for-release.
module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    const projectRoot = cfg.modRequest.projectRoot;
    const credPath = path.join(projectRoot, 'credentials', 'keystore.json');
    if (!fs.existsSync(credPath)) {
      console.warn('[withReleaseSigning] credentials/keystore.json not found — release will use the DEBUG key.');
      return cfg;
    }

    const cred = JSON.parse(fs.readFileSync(credPath, 'utf8'));
    const storeFile = path.resolve(projectRoot, cred.keystorePath);
    if (!fs.existsSync(storeFile)) {
      throw new Error(`[withReleaseSigning] keystore missing at ${storeFile}`);
    }

    let src = cfg.modResults.contents;

    // 1. Repoint the release buildType. Anchored on the template's own caution comment so
    //    we can't accidentally match the debug buildType's identical line.
    const buildTypeAnchor = /(see https:\/\/reactnative\.dev\/docs\/signed-apk-android\.\s*\n\s*)signingConfig signingConfigs\.debug/;
    if (!buildTypeAnchor.test(src)) {
      throw new Error('[withReleaseSigning] could not find the release buildType signingConfig — the RN template changed.');
    }
    src = src.replace(buildTypeAnchor, '$1signingConfig signingConfigs.release');

    // 2. Declare the release signingConfig. Done after step 1 so the inserted block's own
    //    `release {` cannot be matched by the anchor above.
    const signingAnchor = /signingConfigs \{\n(\s*)debug \{/;
    if (!signingAnchor.test(src)) {
      throw new Error('[withReleaseSigning] could not find signingConfigs block — the RN template changed.');
    }
    src = src.replace(
      signingAnchor,
      `signingConfigs {\n$1release {\n$1    storeFile file('${storeFile}')\n$1    storePassword '${cred.storePassword}'\n$1    keyAlias '${cred.keyAlias}'\n$1    keyPassword '${cred.keyPassword}'\n$1}\n$1debug {`,
    );

    cfg.modResults.contents = src;
    return cfg;
  });
};
