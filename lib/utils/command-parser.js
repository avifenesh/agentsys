/**
 * Command parsing helpers for shell-free process execution.
 *
 * @module lib/utils/command-parser
 */

'use strict';

const WINDOWS_CMD_SHIMS = new Set(['npm', 'npx', 'pnpm', 'yarn', 'yarnpkg', 'corepack', 'claude']);

function assertValidToken(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  if (value.includes('\0')) {
    throw new Error(`${label} contains invalid null byte`);
  }
}

function resolveExecutableForPlatform(executable, platform = process.platform) {
  assertValidToken(executable, 'Executable');

  if (platform !== 'win32') {
    return executable;
  }

  const isPathExecutable = executable.includes('/') || executable.includes('\\');

  if (isPathExecutable) {
    const normalizedPath = executable.replace(/\\/g, '/');
    const isNodeModulesBinPath = /\/\.bin\/[^/]+$/i.test(normalizedPath);

    if (isNodeModulesBinPath && !/\.[a-zA-Z0-9]+$/.test(executable)) {
      return executable + '.cmd';
    }

    return executable;
  }


  if (/\.[a-zA-Z0-9]+$/.test(executable)) {
    return executable;
  }

  return WINDOWS_CMD_SHIMS.has(executable.toLowerCase())
    ? `${executable}.cmd`
    : executable;
}

// Batch shims need a cmd.exe hop: since the CVE-2024-27980 fix (Node 18.20.2 /
// 20.12.2 / 21.7.3) src disallows direct .bat and .cmd spawning, so handing one
// to execFileSync fails with EINVAL rather than running it. Exported because
// callers that decide between executables have to know which ones cost the hop.
const WINDOWS_BATCH_SHIM = /\.(cmd|bat)$/i;

// Characters no amount of quoting carries through cmd.exe: % is expanded even
// inside double quotes, a literal " ends the quoting, and CR or LF ends the
// command line cmd.exe parses - anything after it would be dropped or run as a
// separate command.
const CMD_UNPASSABLE = /["%\r\n]/;

function assertCmdPassable(value, executable, label) {
  if (CMD_UNPASSABLE.test(value)) {
    throw new Error(
      `Cannot run ${executable} with ${label} ${JSON.stringify(value)}: ` +
      'a literal ", % or newline is not representable through cmd.exe'
    );
  }
}

/**
 * Quote one token for a cmd.exe command line.
 *
 * Inside double quotes cmd.exe leaves & | < > ^ ( ) alone, so quoting every
 * token is what keeps it from reinterpreting the command. Trailing backslashes
 * are doubled: otherwise the closing quote reads as escaped when the child's
 * CRT parses the command line back into argv.
 *
 * The run of trailing backslashes is counted rather than matched with /(\\+)$/,
 * which backtracks once per start position and so is quadratic in the length of
 * an all-backslash token.
 */
function quoteForCmd(token) {
  let trailing = 0;
  while (trailing < token.length && token[token.length - 1 - trailing] === '\\') {
    trailing += 1;
  }
  return `"${token}${'\\'.repeat(trailing)}"`;
}

/**
 * Plan a spawn for an executable that may be a Windows batch shim.
 *
 * Node's src has disallowed direct .bat and .cmd spawning since the
 * CVE-2024-27980 fix (18.20.2 / 20.12.2 / 21.7.3), so handing a shim to
 * spawnSync or execFileSync fails with EINVAL instead of running it. Route it
 * through cmd.exe, whose command line is rebuilt here rather than delegated to
 * `shell: true` - that option concatenates arguments unquoted, which is the
 * injection the CVE was about (Node warns about it as DEP0190).
 *
 * A literal ", % or newline cannot be carried across cmd.exe faithfully (% is
 * expanded even inside quotes, a " ends the quoting, and a newline ends the
 * command line), so those are refused rather than silently mangled. That covers
 * the executable too: it lands on the same command line, so a shim path holding
 * a % would be expanded before cmd.exe resolved it.
 *
 * Only win32 gets the rewrite. The extension alone is not evidence a file needs
 * cmd.exe - a repo-local `build.cmd` on Linux is spawnable as it stands, and
 * routing it through a cmd.exe that does not exist would only turn a working
 * command into ENOENT. Pass options.platform to exercise the win32 path.
 *
 * Returns { file, args, verbatim }. When verbatim is true the caller must pass
 * windowsVerbatimArguments so Node does not re-quote the payload.
 */
function planShimSpawn(executable, args = [], options = {}) {
  assertValidToken(executable, 'Executable');

  const platform = options.platform || process.platform;

  if (platform !== 'win32' || !WINDOWS_BATCH_SHIM.test(executable)) {
    return { file: executable, args, verbatim: false };
  }

  assertCmdPassable(executable, executable, 'executable path');

  for (const arg of args) {
    if (typeof arg !== 'string') {
      throw new Error('Spawn argument must be a string');
    }
    if (arg.includes('\0')) {
      throw new Error('Spawn argument contains invalid null byte');
    }
    assertCmdPassable(arg, executable, 'argument');
  }

  const command = [executable, ...args].map(quoteForCmd).join(' ');

  return {
    // /s strips the outer quote pair, leaving the quoted shim path as the first
    // token - the same shape Node builds for a shell command.
    file: options.comspec || process.env.comspec || 'cmd.exe',
    // CodeQL reports the concatenation below as a shell command built from input
    // (js/shell-command-constructed-from-input), which is what a /c payload is:
    // cmd.exe takes one command-line string and nothing else. The per-token
    // quoting and the "/%/newline refusals above are the mitigation, which the
    // query cannot model. Suppression comments are ignored by default-setup code
    // scanning, so the alert is dismissed in the security tab instead.
    args: ['/d', '/s', '/c', `"${command}"`],
    verbatim: true
  };
}

/**
 * Merge a spawn plan's verbatim flag into caller-supplied spawn options.
 */
function shimSpawnOptions(plan, options = {}) {
  return plan.verbatim ? { ...options, windowsVerbatimArguments: true } : options;
}

function tokenize(command) {
  const trimmed = command.trim();
  if (!trimmed) {
    return [];
  }

  const tokens = [];
  let current = '';
  let quote = null;
  let tokenHadQuotes = false;

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];

    if (ch === '\\') {
      const next = trimmed[i + 1];

      if (quote === "'") {
        current += ch;
        continue;
      }

      if (quote === '"') {
        if (next === '"' || next === '\\' || next === '$' || next === '`') {
          current += next;
          i += 1;
        } else {
          current += ch;
        }
        continue;
      }

      if (next && (/\s/.test(next) || next === '"' || next === "'" || next === '\\')) {
        current += next;
        i += 1;
      } else {
        current += ch;
      }
      continue;
    }

    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      tokenHadQuotes = true;
      continue;
    }

    if (/\s/.test(ch)) {
      if (current.length > 0 || tokenHadQuotes) {
        tokens.push(current);
        current = '';
        tokenHadQuotes = false;
      }
      continue;
    }

    current += ch;
  }

  if (quote) {
    throw new Error('Command contains unterminated quote');
  }

  if (current.length > 0 || tokenHadQuotes) {
    tokens.push(current);
  }

  return tokens;
}

function parseCommand(command, label = 'Command') {
  if (typeof command !== 'string' || command.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }

  const tokens = tokenize(command);
  if (tokens.length === 0) {
    throw new Error(`${label} must include an executable`);
  }

  const [executable, ...args] = tokens;
  assertValidToken(executable, `${label} executable`);
  for (const arg of args) {
    if (typeof arg !== 'string') {
      throw new Error(`${label} argument must be a string`);
    }
    if (arg.includes('\0')) {
      throw new Error(`${label} argument contains invalid null byte`);
    }
  }

  return {
    executable,
    args,
    display: command.trim()
  };
}

module.exports = {
  parseCommand,
  resolveExecutableForPlatform,
  planShimSpawn,
  shimSpawnOptions,
  WINDOWS_BATCH_SHIM
};
