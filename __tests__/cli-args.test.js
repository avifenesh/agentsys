/**
 * Tests for CLI argument parsing in bin/cli.js
 */

const path = require('path');
const fs = require('fs');

// Import parseArgs directly from cli.js (now exported for testing)
const { parseArgs, VALID_TOOLS, claudeExecutable } = require('../bin/cli.js');

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

describe('VALID_TOOLS constant', () => {
  test('contains expected tools', () => {
    expect(VALID_TOOLS).toEqual(['claude', 'opencode', 'codex', 'cursor', 'kiro']);
  });
});

describe('claudeExecutable', () => {
  test('uses claude.cmd on win32 because execFileSync skips PATHEXT', () => {
    expect(claudeExecutable('win32')).toBe('claude.cmd');
  });

  test('uses extensionless claude on posix', () => {
    expect(claudeExecutable('linux')).toBe('claude');
    expect(claudeExecutable('darwin')).toBe('claude');
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

  test('claude plugin commands use execFileSync without a shell', () => {
    expect(cliSource).toContain('function runClaudePlugin');
    expect(cliSource).toContain('execFileSync(claudeExecutable()');
    expect(cliSource).not.toMatch(/execSync\(`claude plugin/);
    expect(cliSource).not.toMatch(/execSync\('claude plugin/);
    expect(cliSource).toContain("platform === 'win32' ? 'claude.cmd' : 'claude'");
  });
});

