#!/usr/bin/env node
/**
 * Version Bump Tool
 *
 * Usage:
 *   node scripts/bump-version.js <version>
 *   node scripts/bump-version.js 3.7.3
 *   node scripts/bump-version.js 3.7.3-rc.1
 *
 * Delegates to `npm version` which:
 * 1. Updates package.json + package-lock.json (npm handles natively)
 * 2. Triggers the `version` lifecycle script (stamp-version.js)
 *    which stamps all plugin.json, marketplace.json, and site/content.json
 *
 * Uses --no-git-tag-version so existing release workflow controls commits/tags.
 */

const { execFileSync } = require('child_process');
const path = require('path');
const {
  resolveExecutableForPlatform,
  planShimSpawn,
  shimSpawnOptions
} = require('../lib/utils/command-parser');
const VERSION_PATTERN = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/;

function main(args) {
  if (!args) args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
Version Bump Tool

Usage:
  node scripts/bump-version.js <version>

Examples:
  node scripts/bump-version.js 3.7.3        # Stable release
  node scripts/bump-version.js 3.7.3-rc.1   # Release candidate
  node scripts/bump-version.js 3.8.0-beta.1 # Beta release

Files updated (via npm version + stamp-version.js):
  - package.json + package-lock.json (npm native)
  - .claude-plugin/plugin.json
  - .claude-plugin/marketplace.json (all occurrences)
  - site/content.json (meta.version)
  (Plugin repos have independent versions — not stamped here)
`);
    return 0;
  }

  const newVersion = args[0];

  if (!VERSION_PATTERN.test(newVersion)) {
    console.error(`[ERROR] Invalid version format: ${newVersion}`);
    console.error('Expected: X.Y.Z or X.Y.Z-prerelease (e.g., 3.7.3, 3.7.3-rc.1)');
    return 1;
  }

  console.log(`\nBumping version to: ${newVersion}\n`);

  try {
    // npm version updates package.json + package-lock.json, then triggers
    // the "version" lifecycle script which runs stamp-version.js.
    // Version is validated by VERSION_PATTERN above (safe for shell use).
    // On Windows, execFileSync does not resolve npm via PATHEXT - and the
    // npm.cmd shim it needs cannot be spawned directly either, so route it
    // through the same planner the CLI and the perf runners use.
    const npmCommand = resolveExecutableForPlatform('npm');
    const plan = planShimSpawn(npmCommand, ['version', newVersion, '--no-git-tag-version']);
    execFileSync(plan.file, plan.args, shimSpawnOptions(plan, {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit'
    }));
  } catch (err) {
    console.error(`[ERROR] npm version failed: ${err.message}`);
    return 1;
  }

  console.log(`
[OK] Version bump complete!

Next steps:
  1. Update CHANGELOG.md with release notes
  2. git add -A && git commit -m "chore: release v${newVersion}"
  3. git tag v${newVersion}
  4. git push origin main v${newVersion}
`);
  return 0;
}

if (require.main === module) {
  const code = main();
  if (typeof code === 'number') process.exit(code);
}

module.exports = { main };
