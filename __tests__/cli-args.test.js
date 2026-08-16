/**
 * Tests for CLI argument parsing in bin/cli.js
 */

const path = require('path');
const fs = require('fs');

// Import parseArgs directly from cli.js (now exported for testing)
const { parseArgs, VALID_TOOLS, pickClaudeExecutable, claudeSpawnPlan, claudeExecutable } = require('../bin/cli.js');

describe('CLI argument parsing', () => {
  // Save original process.exit and restore after each test
  const originalExit = process.exit;
  const originalError = console.error;

  beforeEach(() => {
    // Mock process.exit to throw instead of exiting
    process.exit = jest.fn((code) => {
      throw new Error(`process.exit(${code})`);
    });
    // Suppress error output during tests
    console.error = jest.fn();
  });

  afterEach(() => {
    process.exit = originalExit;
    console.error = originalError;
  });

  describe('default values', () => {
    test('returns default values for empty args', () => {
      const result = parseArgs([]);

      expect(result.help).toBe(false);
      expect(result.version).toBe(false);
      expect(result.remove).toBe(false);
      expect(result.development).toBe(false);
      expect(result.stripModels).toBe(true);
      expect(result.tool).toBeNull();
      expect(result.tools).toEqual([]);
    });
  });

  describe('--help / -h', () => {
    test('parses --help', () => {
      const result = parseArgs(['--help']);
      expect(result.help).toBe(true);
    });

    test('parses -h', () => {
      const result = parseArgs(['-h']);
      expect(result.help).toBe(true);
    });
  });

  describe('--version / -v', () => {
    test('parses --version', () => {
      const result = parseArgs(['--version']);
      expect(result.version).toBe(true);
    });

    test('parses -v', () => {
      const result = parseArgs(['-v']);
      expect(result.version).toBe(true);
    });
  });

  describe('--remove / --uninstall', () => {
    test('parses --remove', () => {
      const result = parseArgs(['--remove']);
      expect(result.remove).toBe(true);
    });

    test('parses --uninstall', () => {
      const result = parseArgs(['--uninstall']);
      expect(result.remove).toBe(true);
    });
  });

  describe('--development / --dev', () => {
    test('parses --development', () => {
      const result = parseArgs(['--development']);
      expect(result.development).toBe(true);
    });

    test('parses --dev', () => {
      const result = parseArgs(['--dev']);
      expect(result.development).toBe(true);
    });
  });

  describe('model stripping flags', () => {
    test('stripModels defaults to true', () => {
      const result = parseArgs([]);
      expect(result.stripModels).toBe(true);
    });

    test('--no-strip sets stripModels to false', () => {
      const result = parseArgs(['--no-strip']);
      expect(result.stripModels).toBe(false);
    });

    test('-ns sets stripModels to false', () => {
      const result = parseArgs(['-ns']);
      expect(result.stripModels).toBe(false);
    });

    test('--strip-models keeps stripModels true (legacy)', () => {
      const result = parseArgs(['--strip-models']);
      expect(result.stripModels).toBe(true);
    });
  });

  describe('--tool', () => {
    test('parses --tool claude', () => {
      const result = parseArgs(['--tool', 'claude']);
      expect(result.tool).toBe('claude');
    });

    test('parses --tool opencode', () => {
      const result = parseArgs(['--tool', 'opencode']);
      expect(result.tool).toBe('opencode');
    });

    test('parses --tool codex', () => {
      const result = parseArgs(['--tool', 'codex']);
      expect(result.tool).toBe('codex');
    });

    test('handles case insensitivity', () => {
      const result = parseArgs(['--tool', 'CLAUDE']);
      expect(result.tool).toBe('claude');
    });

    test('exits with error for invalid tool names', () => {
      expect(() => parseArgs(['--tool', 'invalid'])).toThrow('process.exit(1)');
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Invalid tool'));
    });

    test('ignores --tool without value', () => {
      const result = parseArgs(['--tool']);
      expect(result.tool).toBeNull();
    });
  });

  describe('--tools', () => {
    test('parses single tool', () => {
      const result = parseArgs(['--tools', 'claude']);
      expect(result.tools).toEqual(['claude']);
    });

    test('parses comma-separated tools', () => {
      const result = parseArgs(['--tools', 'claude,opencode']);
      expect(result.tools).toEqual(['claude', 'opencode']);
    });

    test('parses comma-separated with spaces', () => {
      const result = parseArgs(['--tools', 'claude, opencode, codex']);
      expect(result.tools).toEqual(['claude', 'opencode', 'codex']);
    });

    test('handles case insensitivity', () => {
      const result = parseArgs(['--tools', 'CLAUDE,OpenCode']);
      expect(result.tools).toEqual(['claude', 'opencode']);
    });

    test('exits with error for invalid tools in list', () => {
      expect(() => parseArgs(['--tools', 'claude,invalid,opencode'])).toThrow('process.exit(1)');
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Invalid tool'));
    });
  });

  describe('combined flags', () => {
    test('parses multiple flags together', () => {
      const result = parseArgs(['--tool', 'opencode', '--no-strip', '--dev']);

      expect(result.tool).toBe('opencode');
      expect(result.stripModels).toBe(false);
      expect(result.development).toBe(true);
    });

    test('parses --tools with --no-strip', () => {
      const result = parseArgs(['--tools', 'claude,codex', '-ns']);

      expect(result.tools).toEqual(['claude', 'codex']);
      expect(result.stripModels).toBe(false);
    });
  });
});

describe('pickClaudeExecutable', () => {
  test('uses plain claude on posix and ignores any where output', () => {
    expect(pickClaudeExecutable('linux', '')).toBe('claude');
    expect(pickClaudeExecutable('darwin', 'C:\\npm\\claude.cmd')).toBe('claude');
  });

  test('uses the npm global shim path that where.exe resolved', () => {
    const shim = 'C:\\Users\\u\\AppData\\Roaming\\npm\\claude.cmd';
    expect(pickClaudeExecutable('win32', `${shim}\r\n`)).toBe(shim);
  });

  test('uses claude.exe from the native installer instead of assuming .cmd', () => {
    const native = 'C:\\Users\\u\\.local\\bin\\claude.exe';
    expect(pickClaudeExecutable('win32', `${native}\r\n`)).toBe(native);
  });

  test('prefers claude.exe over a batch shim in either PATH order', () => {
    const exe = 'C:\\Users\\u\\.local\\bin\\claude.exe';
    const cmd = 'C:\\npm\\claude.cmd';
    expect(pickClaudeExecutable('win32', `${exe}\r\n${cmd}\r\n`)).toBe(exe);
    expect(pickClaudeExecutable('win32', `${cmd}\r\n${exe}\r\n`)).toBe(exe);
  });

  test('skips entries CreateProcess cannot launch', () => {
    // npm ships an extensionless shell script and a .ps1 alongside the .cmd
    const out = 'C:\\npm\\claude\r\nC:\\npm\\claude.ps1\r\nC:\\npm\\claude.cmd\r\n';
    expect(pickClaudeExecutable('win32', out)).toBe('C:\\npm\\claude.cmd');
  });

  test('falls back to the cmd shim when nothing spawnable was resolved', () => {
    expect(pickClaudeExecutable('win32', '')).toBe('claude.cmd');
    expect(pickClaudeExecutable('win32', '  \r\n \r\n')).toBe('claude.cmd');
    expect(pickClaudeExecutable('win32', undefined)).toBe('claude.cmd');
    expect(pickClaudeExecutable('win32', 'C:\\npm\\claude.ps1\r\n')).toBe('claude.cmd');
  });
});

describe('claudeSpawnPlan', () => {
  const args = ['plugin', 'install', 'agentsys-core@agentsys'];

  test('spawns a posix or native executable directly', () => {
    expect(claudeSpawnPlan('claude', args)).toEqual({ file: 'claude', args });
    expect(claudeSpawnPlan('C:\\bin\\claude.exe', args)).toEqual({ file: 'C:\\bin\\claude.exe', args });
  });

  test('routes a batch shim through cmd.exe, which execFileSync cannot spawn', () => {
    // Node's src disallows direct .bat/.cmd spawning since the CVE-2024-27980
    // fix, so a shim handed to execFileSync fails with EINVAL.
    const shim = 'C:\\npm\\claude.cmd';
    expect(claudeSpawnPlan(shim, args)).toEqual({
      file: 'cmd.exe',
      args: ['/d', '/s', '/c', '""C:\\npm\\claude.cmd" plugin install agentsys-core@agentsys"'],
      verbatim: true
    });
    expect(claudeSpawnPlan('C:\\npm\\claude.bat', args).file).toBe('cmd.exe');
  });

  test('honours COMSPEC when routing through a shell', () => {
    expect(claudeSpawnPlan('claude.cmd', args, 'C:\\Windows\\system32\\cmd.exe').file)
      .toBe('C:\\Windows\\system32\\cmd.exe');
  });

  test('refuses arguments cmd.exe would reparse', () => {
    // cmd.exe re-splits its command line, so an unquoted metacharacter would be
    // a command injection - the exact hazard behind CVE-2024-27980.
    expect(() => claudeSpawnPlan('claude.cmd', ['plugin', 'install', 'x&calc'])).toThrow(/Refusing to pass/);
    expect(() => claudeSpawnPlan('claude.cmd', ['plugin', 'install', 'a|b'])).toThrow(/Refusing to pass/);
    expect(() => claudeSpawnPlan('claude.cmd', ['plugin', 'install', 'a b'])).toThrow(/Refusing to pass/);
    expect(() => claudeSpawnPlan('claude.cmd', ['plugin', 'install', 'a"b'])).toThrow(/Refusing to pass/);
  });

  test('passes the same arguments through unchecked when no shell is involved', () => {
    // Nothing reparses an execFileSync argv, so it needs no metacharacter guard.
    expect(claudeSpawnPlan('claude', ['plugin', 'install', 'x&calc']).args)
      .toEqual(['plugin', 'install', 'x&calc']);
  });

  test('claudeExecutable resolves and caches without a shell on this platform', () => {
    const first = claudeExecutable();
    expect(typeof first).toBe('string');
    expect(first.length).toBeGreaterThan(0);
    expect(claudeExecutable()).toBe(first);
    if (process.platform !== 'win32') {
      expect(first).toBe('claude');
    }
  });
});

describe('VALID_TOOLS constant', () => {
  test('contains expected tools', () => {
    expect(VALID_TOOLS).toEqual(['claude', 'opencode', 'codex', 'cursor', 'kiro']);
  });
});

describe('CLI integration', () => {
  const cliPath = path.join(__dirname, '..', 'bin', 'cli.js');
  const cliSource = fs.readFileSync(cliPath, 'utf8');

  test('cli.js file exists', () => {
    expect(fs.existsSync(cliPath)).toBe(true);
  });

  test('cli.js has shebang', () => {
    expect(cliSource.startsWith('#!/usr/bin/env node')).toBe(true);
  });

  test('cli.js exports parseArgs and VALID_TOOLS for testing', () => {
    expect(cliSource.includes('module.exports')).toBe(true);
    expect(cliSource.includes('parseArgs')).toBe(true);
    expect(cliSource.includes('VALID_TOOLS')).toBe(true);
  });

  test('cli.js only runs main when executed directly', () => {
    expect(cliSource.includes('require.main === module')).toBe(true);
  });

  test('cli.js has installForClaudeDevelopment function', () => {
    expect(cliSource.includes('function installForClaudeDevelopment()')).toBe(true);
  });

  test('cli.js has installForOpenCode function', () => {
    expect(cliSource.includes('function installForOpenCode(')).toBe(true);
  });

  test('cli.js has installForCodex function', () => {
    expect(cliSource.includes('function installForCodex(')).toBe(true);
  });

  test('cli.js has installForCursor function', () => {
    expect(cliSource.includes('function installForCursor(')).toBe(true);
  });

  test('cli.js has installForKiro function', () => {
    expect(cliSource.includes('function installForKiro(')).toBe(true);
  });

  test('claude plugin commands go through claudeSpawn, never a shell string', () => {
    expect(cliSource).toMatch(/claudeSpawn\(\['plugin', 'install'/);
    expect(cliSource).not.toMatch(/execSync\(`claude plugin/);
    expect(cliSource).not.toMatch(/execSync\('claude plugin/);
    expect(cliSource).not.toMatch(/shell: true/);
  });

  test('every claude invocation is planned, so no call site can bypass the cmd.exe hop', () => {
    const planned = cliSource.match(/claudeSpawn\(\[/g) || [];
    expect(planned.length).toBeGreaterThanOrEqual(10);
    expect(cliSource).not.toMatch(/execFileSync\(claudeExecutable\(\)/);
  });

  test('every skipped claude install is recorded as a failure', () => {
    // detectInstalledPlatforms reports 'claude' from ~/.claude alone, so the CLI
    // can be missing; and a dep whose id would be rejected is skipped. Both must
    // reach claudeFailures or installed.json records an install that never ran.
    expect(cliSource).toMatch(/if \(!commandExists\('claude'\)\)[\s\S]{0,300}claudeFailures\.set/);
    expect(cliSource).toMatch(/test\(depName\)\) \{[\s\S]{0,160}claudeFailures\.set/);
  });

  test('a plugin Claude Code did not register fails the process', () => {
    // `agentsys install x && next-step` must not proceed on a partial install.
    expect(cliSource).toMatch(/Claude Code did not register[\s\S]{0,400}process\.exitCode = 1/);
  });

  test('claude executable is never hardcoded to a single windows suffix', () => {
    expect(cliSource).not.toMatch(/claudeBin = resolveExecutableForPlatform\('claude'\)/);
  });
});

