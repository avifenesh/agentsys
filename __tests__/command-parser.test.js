const fs = require('fs');
const path = require('path');
const { parseCommand, resolveExecutableForPlatform } = require('../lib/utils/command-parser');

describe('command parser', () => {
  test('parses simple command into executable and args', () => {
    const parsed = parseCommand('npm test -- --watch');
    expect(parsed.executable).toBe('npm');
    expect(parsed.args).toEqual(['test', '--', '--watch']);
  });

  test('preserves original command text for display', () => {
    const parsed = parseCommand('  node -e "console.log(\"hello world\")"  ');
    expect(parsed.display).toBe('node -e "console.log(\"hello world\")"');
  });

  test('parses quoted arguments with spaces', () => {
    const parsed = parseCommand('node -e "console.log(\\"hello world\\")"');
    expect(parsed.executable).toBe('node');
    expect(parsed.args).toEqual(['-e', 'console.log("hello world")']);
  });

  test('preserves escaped sequences inside double quotes', () => {
    const parsed = parseCommand('node -e "console.log(\"line1\\nline2\")"');
    expect(parsed.args[1]).toContain('\\n');
  });

  test('throws on unterminated quote', () => {
    expect(() => parseCommand('node -e "console.log(1)')).toThrow('unterminated quote');
  });

  test('throws on empty command', () => {
    expect(() => parseCommand('   ')).toThrow('must be a non-empty string');
  });

  test('preserves empty quoted argument', () => {
    const parsed = parseCommand('node -e ""');
    expect(parsed.args).toEqual(['-e', '']);
  });

  test('preserves empty quoted argument in middle of argv', () => {
    const parsed = parseCommand('tool "" --flag');
    expect(parsed.args).toEqual(['', '--flag']);
  });
});

describe('resolveExecutableForPlatform', () => {
  test('uses cmd shim for npm on windows', () => {
    expect(resolveExecutableForPlatform('npm', 'win32')).toBe('npm.cmd');
  });

  test('keeps executable unchanged for non-windows', () => {
    expect(resolveExecutableForPlatform('npm', 'linux')).toBe('npm');
  });

  test('keeps explicit extension on windows', () => {
    expect(resolveExecutableForPlatform('npm.cmd', 'win32')).toBe('npm.cmd');
  });

  test('adds cmd extension for node_modules .bin paths on windows', () => {
    expect(resolveExecutableForPlatform('node_modules/.bin/vitest', 'win32')).toBe('node_modules/.bin/vitest.cmd');
  });

  test('keeps path executable unchanged when not from .bin', () => {
    expect(resolveExecutableForPlatform('tools/vitest', 'win32')).toBe('tools/vitest');
  });

  test('uses cmd shim for claude on windows', () => {
    expect(resolveExecutableForPlatform('claude', 'win32')).toBe('claude.cmd');
  });
});

describe('command-parser source hygiene', () => {
  test('rejects a null byte in an argument', () => {
    expect(() => parseCommand('node --eval a\0b')).toThrow(/null byte/);
  });

  test('source carries no raw null byte, so git and grep treat it as text', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'lib', 'utils', 'command-parser.js'));
    expect(source.indexOf(0)).toBe(-1);
  });
});
