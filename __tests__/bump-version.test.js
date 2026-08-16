/**
 * Tests for scripts/bump-version.js
 *
 * Tests the validation logic and interface.
 * Does NOT test actual npm execution (requires integration setup).
 */

// Mock child_process before requiring the module under test
jest.mock('child_process', () => ({
  execFileSync: jest.fn()
}));

const { main } = require('../scripts/bump-version');

// Mock console methods to suppress output during tests
let consoleLogSpy;
let consoleErrorSpy;

beforeEach(() => {
  consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
  consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  require('child_process').execFileSync.mockClear();
});

afterEach(() => {
  consoleLogSpy.mockRestore();
  consoleErrorSpy.mockRestore();
});

describe('bump-version', () => {
  describe('help text', () => {
    test('displays help with --help flag', () => {
      const code = main(['--help']);
      expect(code).toBe(0);
      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls.join('\n');
      expect(output).toContain('Version Bump Tool');
      expect(output).toContain('Usage:');
      expect(output).toContain('Examples:');
    });

    test('displays help with -h flag', () => {
      const code = main(['-h']);
      expect(code).toBe(0);
      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls.join('\n');
      expect(output).toContain('Version Bump Tool');
    });

    test('displays help when no args provided', () => {
      const code = main([]);
      expect(code).toBe(0);
      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls.join('\n');
      expect(output).toContain('Version Bump Tool');
    });
  });

  describe('version validation', () => {
    test('accepts valid stable version format', () => {
      const code = main(['3.7.3']);
      expect(code).toBe(0);
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    test('accepts valid prerelease version with rc', () => {
      const code = main(['3.7.3-rc.1']);
      expect(code).toBe(0);
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    test('accepts valid prerelease version with beta', () => {
      const code = main(['3.8.0-beta.1']);
      expect(code).toBe(0);
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    test('accepts valid prerelease version with alpha', () => {
      const code = main(['1.0.0-alpha.1']);
      expect(code).toBe(0);
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    test('spawns npm directly off Windows', () => {
      const { execFileSync } = require('child_process');
      const platform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });

      try {
        expect(main(['3.7.3'])).toBe(0);
      } finally {
        Object.defineProperty(process, 'platform', { value: platform, configurable: true });
      }

      expect(execFileSync).toHaveBeenCalledWith(
        'npm',
        ['version', '3.7.3', '--no-git-tag-version'],
        expect.not.objectContaining({ windowsVerbatimArguments: true })
      );
    });

    test('routes the npm.cmd shim through cmd.exe on Windows', () => {
      // A direct .cmd spawn fails with EINVAL since the CVE-2024-27980 fix, so
      // `agentsys-dev bump` needs the same hop as the rest of the CLI.
      const { execFileSync } = require('child_process');
      const platform = process.platform;
      // A real Windows host has COMSPEC set to an absolute path, so it is pinned
      // here as well - otherwise the expected shell differs per host.
      const comspec = process.env.comspec;
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      process.env.comspec = 'cmd.exe';

      try {
        expect(main(['3.7.3'])).toBe(0);
      } finally {
        Object.defineProperty(process, 'platform', { value: platform, configurable: true });
        if (comspec === undefined) {
          delete process.env.comspec;
        } else {
          process.env.comspec = comspec;
        }
      }

      expect(execFileSync).toHaveBeenCalledWith(
        'cmd.exe',
        ['/d', '/s', '/c', '""npm.cmd" "version" "3.7.3" "--no-git-tag-version""'],
        expect.objectContaining({ windowsVerbatimArguments: true })
      );
    });

    test('rejects invalid version format - missing patch', () => {
      const code = main(['3.7']);
      expect(code).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ERROR] Invalid version format: 3.7')
      );
    });

    test('rejects invalid version format - non-numeric', () => {
      const code = main(['v3.7.3']);
      expect(code).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ERROR] Invalid version format: v3.7.3')
      );
    });

    test('rejects invalid version format - missing minor', () => {
      const code = main(['3']);
      expect(code).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ERROR] Invalid version format: 3')
      );
    });

    test('rejects invalid version format - arbitrary text', () => {
      const code = main(['invalid']);
      expect(code).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ERROR] Invalid version format: invalid')
      );
    });

    test('rejects invalid version format - spaces', () => {
      const code = main(['3.7.3 rc.1']);
      expect(code).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ERROR] Invalid version format: 3.7.3 rc.1')
      );
    });
  });

  describe('module exports', () => {
    test('exports main function', () => {
      expect(typeof main).toBe('function');
    });

    test('main function accepts args parameter', () => {
      const code = main(['--help']);
      expect(typeof code).toBe('number');
    });
  });
});
