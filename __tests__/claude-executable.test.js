/**
 * Tests for Claude executable resolution in lib/utils/claude-executable.js
 */

const childProcess = require('child_process');

const { pickClaudeExecutable, claudeExecutable } = require('../lib/utils/claude-executable');

/**
 * Load the module fresh with a faked platform and a stubbed execFileSync.
 *
 * The module destructures execFileSync at require time, so the spy has to exist
 * before the require - and the cache has to be a fresh one per test, which a
 * reset module gives for free.
 */
function loadWithPlatform(platform, whereImpl) {
  const originalPlatform = process.platform;
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
  jest.resetModules();
  const execFileSync = jest.spyOn(childProcess, 'execFileSync').mockImplementation(whereImpl);
  const loaded = require('../lib/utils/claude-executable');
  return {
    ...loaded,
    execFileSync,
    restore: () => Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
  };
}

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

describe('claudeExecutable', () => {
  test('resolves and caches without a shell on this platform', () => {
    const first = claudeExecutable();
    expect(typeof first).toBe('string');
    expect(first.length).toBeGreaterThan(0);
    expect(claudeExecutable()).toBe(first);
    if (process.platform !== 'win32') {
      expect(first).toBe('claude');
    }
  });

  test('does not ask where.exe anything off Windows', () => {
    const mod = loadWithPlatform('linux', () => 'C:\\npm\\claude.cmd\r\n');
    try {
      expect(mod.claudeExecutable()).toBe('claude');
      expect(mod.execFileSync).not.toHaveBeenCalled();
    } finally {
      mod.restore();
    }
  });

  test('takes the win32 answer from where.exe and asks only once', () => {
    const native = 'C:\\Users\\u\\.local\\bin\\claude.exe';
    const mod = loadWithPlatform('win32', () => `${native}\r\n`);
    try {
      expect(mod.claudeExecutable()).toBe(native);
      expect(mod.claudeExecutable()).toBe(native);
      expect(mod.execFileSync).toHaveBeenCalledTimes(1);
      expect(mod.execFileSync).toHaveBeenCalledWith('where.exe', ['claude'], expect.objectContaining({ encoding: 'utf8' }));
    } finally {
      mod.restore();
    }
  });

  test('falls back to the shim mapping when where.exe itself fails', () => {
    const mod = loadWithPlatform('win32', () => {
      throw Object.assign(new Error('spawnSync where.exe ENOENT'), { code: 'ENOENT' });
    });
    try {
      expect(mod.claudeExecutable()).toBe('claude.cmd');
    } finally {
      mod.restore();
    }
  });

  test('resetClaudeExecutableCache forces a second resolution', () => {
    let answer = 'C:\\npm\\claude.cmd\r\n';
    const mod = loadWithPlatform('win32', () => answer);
    try {
      expect(mod.claudeExecutable()).toBe('C:\\npm\\claude.cmd');
      answer = 'C:\\Users\\u\\.local\\bin\\claude.exe\r\n';
      expect(mod.claudeExecutable()).toBe('C:\\npm\\claude.cmd');
      mod.resetClaudeExecutableCache();
      expect(mod.claudeExecutable()).toBe('C:\\Users\\u\\.local\\bin\\claude.exe');
    } finally {
      mod.restore();
    }
  });
});
