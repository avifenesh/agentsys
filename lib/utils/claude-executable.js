/**
 * Resolution of the Claude Code executable, shared by every caller that spawns it.
 *
 * Lives here rather than in bin/cli.js because scripts/dev-install.js needs the
 * same answer: a second resolution that guesses the Windows suffix drifts from
 * this one the moment an install layout changes.
 *
 * @module lib/utils/claude-executable
 */

'use strict';

const { execFileSync } = require('child_process');
const { resolveExecutableForPlatform, WINDOWS_BATCH_SHIM } = require('./command-parser');

// Extensions CreateProcess can launch directly. A .ps1 and an extensionless npm
// shell script also show up in `where.exe` output but can never be spawned.
const WINDOWS_DIRECT_EXEC = /\.(exe|com)$/i;

/**
 * Pick the Claude Code executable from a `where.exe claude` result.
 *
 * execFileSync does not apply PATHEXT, so an extensionless 'claude' cannot be
 * spawned on Windows - but the suffix is not knowable either: the npm global
 * install provides claude.cmd while the native installer provides claude.exe.
 * Rank the directly launchable .exe/.com ahead of a batch shim regardless of
 * PATH order, since the shim costs an extra cmd.exe hop, and fall back to the
 * shim mapping. Kept pure so the win32 branch is testable off Windows.
 */
function pickClaudeExecutable(platform, whereOutput) {
  if (platform !== 'win32') {
    return 'claude';
  }
  const candidates = String(whereOutput || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  return candidates.find(candidate => WINDOWS_DIRECT_EXEC.test(candidate))
    || candidates.find(candidate => WINDOWS_BATCH_SHIM.test(candidate))
    || resolveExecutableForPlatform('claude', platform);
}

let claudeBinCache;

/**
 * Resolve the Claude Code executable once per process.
 */
function claudeExecutable() {
  if (claudeBinCache === undefined) {
    let whereOutput = '';
    if (process.platform === 'win32') {
      try {
        whereOutput = execFileSync('where.exe', ['claude'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      } catch {
        // Fall back to the shim mapping below.
      }
    }
    claudeBinCache = pickClaudeExecutable(process.platform, whereOutput);
  }
  return claudeBinCache;
}

/**
 * Drop the cached executable. Only for tests that fake the platform or where.exe.
 */
function resetClaudeExecutableCache() {
  claudeBinCache = undefined;
}

module.exports = {
  pickClaudeExecutable,
  claudeExecutable,
  resetClaudeExecutableCache
};
