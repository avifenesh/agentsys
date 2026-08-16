/**
 * Tests for the unified dev CLI (bin/dev-cli.js)
 */

const path = require('path');
const fs = require('fs');

const { parseArgs, COMMANDS, VALIDATE_SUBCOMMANDS, NEW_SUBCOMMANDS, route } = require('../bin/dev-cli.js');

// ---------------------------------------------------------------------------
// parseArgs
// ---------------------------------------------------------------------------

describe('parseArgs', () => {
  test('returns defaults for empty args', () => {
    const result = parseArgs([]);
    expect(result.help).toBe(false);
    expect(result.version).toBe(false);
    expect(result.command).toBeNull();
    expect(result.subcommand).toBeNull();
    expect(result.rest).toEqual([]);
  });

  test('parses --help', () => {
    expect(parseArgs(['--help']).help).toBe(true);
  });

  test('parses -h', () => {
    expect(parseArgs(['-h']).help).toBe(true);
  });

  test('parses --version', () => {
    expect(parseArgs(['--version']).version).toBe(true);
  });

  test('parses -v', () => {
    expect(parseArgs(['-v']).version).toBe(true);
  });

  test('extracts command', () => {
    const result = parseArgs(['status']);
    expect(result.command).toBe('status');
  });

  test('extracts validate subcommand', () => {
    const result = parseArgs(['validate', 'plugins']);
    expect(result.command).toBe('validate');
    expect(result.subcommand).toBe('plugins');
  });

  test('does not extract subcommand for commands without subcommands', () => {
    const result = parseArgs(['bump', '4.2.0']);
    expect(result.command).toBe('bump');
    expect(result.subcommand).toBeNull();
    expect(result.rest).toEqual(['4.2.0']);
  });

  test('extracts new subcommand', () => {
    const result = parseArgs(['new', 'plugin', 'my-plugin']);
    expect(result.command).toBe('new');
    expect(result.subcommand).toBe('plugin');
    expect(result.rest).toEqual(['my-plugin']);
  });

  test('extracts new agent subcommand with --plugin flag', () => {
    const result = parseArgs(['new', 'agent', 'my-agent', '--plugin', 'foo']);
    expect(result.command).toBe('new');
    expect(result.subcommand).toBe('agent');
    expect(result.rest).toEqual(['my-agent', '--plugin', 'foo']);
  });

  test('new with no subcommand leaves subcommand null', () => {
    const result = parseArgs(['new']);
    expect(result.command).toBe('new');
    expect(result.subcommand).toBeNull();
    expect(result.rest).toEqual([]);
  });

  test('captures rest args after subcommand', () => {
    const result = parseArgs(['validate', 'counts', '--json']);
    expect(result.command).toBe('validate');
    expect(result.subcommand).toBe('counts');
    expect(result.rest).toEqual(['--json']);
  });

  test('captures --help after command', () => {
    const result = parseArgs(['validate', '--help']);
    expect(result.command).toBe('validate');
    expect(result.help).toBe(true);
  });

  test('captures --help after subcommand', () => {
    const result = parseArgs(['validate', 'plugins', '--help']);
    expect(result.command).toBe('validate');
    expect(result.subcommand).toBe('plugins');
    expect(result.help).toBe(true);
  });

  test('global --help before command', () => {
    const result = parseArgs(['--help', 'validate']);
    expect(result.help).toBe(true);
    expect(result.command).toBe('validate');
  });
});

// ---------------------------------------------------------------------------
// COMMANDS registry
// ---------------------------------------------------------------------------

describe('COMMANDS registry', () => {
  test('has expected top-level commands', () => {
    const expected = [
      'validate', 'bump', 'setup-hooks', 'dev-install',
      'detect', 'verify', 'status', 'test', 'migrate-opencode', 'test-transform',
      'preflight', 'gen-docs', 'expand-templates', 'gen-adapters', 'new'
    ];
    for (const name of expected) {
      expect(COMMANDS).toHaveProperty(name);
      expect(typeof COMMANDS[name].handler).toBe('function');
      expect(typeof COMMANDS[name].description).toBe('string');
    }
  });
});

describe('VALIDATE_SUBCOMMANDS registry', () => {
  test('has expected subcommands', () => {
    const expected = [
      'plugins', 'cross-platform', 'consistency', 'paths',
      'counts', 'platform-docs', 'agent-skill-compliance', 'opencode-install'
    ];
    for (const name of expected) {
      expect(VALIDATE_SUBCOMMANDS).toHaveProperty(name);
      expect(typeof VALIDATE_SUBCOMMANDS[name].handler).toBe('function');
      expect(typeof VALIDATE_SUBCOMMANDS[name].description).toBe('string');
    }
  });
});

describe('NEW_SUBCOMMANDS registry', () => {
  test('has expected subcommands', () => {
    const expected = ['plugin', 'agent', 'skill', 'command'];
    for (const name of expected) {
      expect(NEW_SUBCOMMANDS).toHaveProperty(name);
      expect(typeof NEW_SUBCOMMANDS[name].handler).toBe('function');
      expect(typeof NEW_SUBCOMMANDS[name].description).toBe('string');
    }
  });

  test('COMMANDS.new references NEW_SUBCOMMANDS', () => {
    expect(COMMANDS['new'].subcommands).toBe(NEW_SUBCOMMANDS);
  });
});

// ---------------------------------------------------------------------------
// route
// ---------------------------------------------------------------------------

describe('route', () => {
  const originalLog = console.log;
  const originalError = console.error;

  beforeEach(() => {
    console.log = jest.fn();
    console.error = jest.fn();
  });

  afterEach(() => {
    console.log = originalLog;
    console.error = originalError;
  });

  test('--version prints version', () => {
    const code = route({ version: true, help: false, command: null, subcommand: null, rest: [] });
    expect(code).toBe(0);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('agentsys-dev v'));
  });

  test('--help with no command prints help', () => {
    const code = route({ version: false, help: true, command: null, subcommand: null, rest: [] });
    expect(code).toBe(0);
    expect(console.log).toHaveBeenCalled();
  });

  test('no command shows help', () => {
    const code = route({ version: false, help: false, command: null, subcommand: null, rest: [] });
    expect(code).toBe(0);
  });

  test('unknown command returns 1', () => {
    const code = route({ version: false, help: false, command: 'nonexistent', subcommand: null, rest: [] });
    expect(code).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Unknown command'));
  });

  test('unknown validate subcommand returns 1', () => {
    const code = route({ version: false, help: false, command: 'validate', subcommand: 'nonexistent', rest: [] });
    expect(code).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Unknown subcommand'));
  });

  test('validate --help shows subcommands', () => {
    const code = route({ version: false, help: true, command: 'validate', subcommand: null, rest: [] });
    expect(code).toBe(0);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Subcommands'));
  });

  test('new with no subcommand shows usage', () => {
    const code = route({ version: false, help: false, command: 'new', subcommand: null, rest: [] });
    expect(code).toBe(1);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Available types'));
  });

  test('new --help shows subcommands', () => {
    const code = route({ version: false, help: true, command: 'new', subcommand: null, rest: [] });
    expect(code).toBe(0);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Subcommands'));
  });

  test('unknown new subcommand returns 1', () => {
    const code = route({ version: false, help: false, command: 'new', subcommand: 'nonexistent', rest: [] });
    expect(code).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Unknown subcommand'));
  });
});

// ---------------------------------------------------------------------------
// Module structure
// ---------------------------------------------------------------------------

describe('dev-cli module', () => {
  const cliPath = path.join(__dirname, '..', 'bin', 'dev-cli.js');
  const cliSource = fs.readFileSync(cliPath, 'utf8');

  test('file exists', () => {
    expect(fs.existsSync(cliPath)).toBe(true);
  });

  test('has shebang', () => {
    expect(cliSource.startsWith('#!/usr/bin/env node')).toBe(true);
  });

  test('has require.main guard', () => {
    expect(cliSource).toContain('require.main === module');
  });

  test('test command resolves npm executable without shell interpolation', () => {
    expect(cliSource).toContain('resolveExecutableForPlatform');
    expect(cliSource).toContain('shell: false');
  });

  test('test command routes the npm.cmd shim through a spawn plan', () => {
    // npm resolves to npm.cmd on Windows, and a direct spawn of it fails with
    // EINVAL since the CVE-2024-27980 fix, so the plan must not be bypassed.
    expect(cliSource).toContain('planShimSpawn(npmExecutable');
    expect(cliSource).toContain('spawnSync(plan.file, plan.args, shimSpawnOptions(plan');
    expect(cliSource).not.toContain('spawnSync(npmExecutable');
  });

  test('exports parseArgs, COMMANDS, VALIDATE_SUBCOMMANDS, NEW_SUBCOMMANDS, route', () => {
    expect(cliSource).toContain('module.exports');
    expect(typeof parseArgs).toBe('function');
    expect(typeof COMMANDS).toBe('object');
    expect(typeof VALIDATE_SUBCOMMANDS).toBe('object');
    expect(typeof NEW_SUBCOMMANDS).toBe('object');
    expect(typeof route).toBe('function');
  });

  test('is executable', () => {
    if (process.platform === 'win32') {
      // Windows doesn't have Unix-style executable bits; verify shebang instead
      const content = fs.readFileSync(cliPath, 'utf8');
      expect(content).toMatch(/^#!/);
      return;
    }
    const stats = fs.statSync(cliPath);
    // Check owner execute bit
    expect(stats.mode & 0o100).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Async handler support
// ---------------------------------------------------------------------------

describe('async handler support', () => {
  const originalLog = console.log;
  const originalError = console.error;

  beforeEach(() => {
    console.log = jest.fn();
    console.error = jest.fn();
  });

  afterEach(() => {
    console.log = originalLog;
    console.error = originalError;
  });

  test('detect handler returns a promise that resolves to 0', async () => {
    const result = COMMANDS['detect'].handler([]);
    expect(result).toBeInstanceOf(Promise);
    const code = await result;
    expect(code).toBe(0);
  });

  test('verify handler returns a promise that resolves to 0', async () => {
    const result = COMMANDS['verify'].handler([]);
    expect(result).toBeInstanceOf(Promise);
    const code = await result;
    expect(code).toBe(0);
  }, 15000);

  test('route returns promise for async commands', async () => {
    const result = route({ version: false, help: false, command: 'detect', subcommand: null, rest: [] });
    expect(result && typeof result.then === 'function').toBe(true);
    await result;
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('error handling', () => {
  const originalLog = console.log;
  const originalError = console.error;

  beforeEach(() => {
    console.log = jest.fn();
    console.error = jest.fn();
  });

  afterEach(() => {
    console.log = originalLog;
    console.error = originalError;
  });

  test('status handler returns 0', () => {
    const code = COMMANDS['status'].handler([]);
    expect(code).toBe(0);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('agentsys v'));
  });

  test('bump handler with no version returns help (exits 0)', () => {
    const code = COMMANDS['bump'].handler([]);
    expect(code).toBe(0);
  });

  test('bump handler with --help returns 0', () => {
    const code = COMMANDS['bump'].handler(['--help']);
    expect(code).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Handler argument forwarding
// ---------------------------------------------------------------------------

describe('argument forwarding', () => {
  const originalLog = console.log;

  beforeEach(() => {
    console.log = jest.fn();
  });

  afterEach(() => {
    console.log = originalLog;
  });

  test('validate counts forwards --json flag', () => {
    // validate-counts reads plugins/ dir which no longer exists (plugins extracted to standalone repos).
    // Verify the handler is callable and forwards args correctly.
    // The ENOENT from missing plugins/ is expected in the marketplace-only repo.
    const fs = require('fs');
    const pluginsDir = path.join(__dirname, '..', 'plugins');
    if (!fs.existsSync(pluginsDir)) {
      // plugins/ extracted - just verify handler is a function that accepts args
      expect(typeof VALIDATE_SUBCOMMANDS['counts'].handler).toBe('function');
      return;
    }
    const code = VALIDATE_SUBCOMMANDS['counts'].handler(['--json']);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('{'));
  });

  test('validate platform-docs forwards --json flag', () => {
    VALIDATE_SUBCOMMANDS['platform-docs'].handler(['--json']);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('{'));
  });
});
