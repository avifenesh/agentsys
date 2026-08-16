const fs = require('fs');
const path = require('path');
const { parseCommand, resolveExecutableForPlatform, planShimSpawn, shimSpawnOptions } = require('../lib/utils/command-parser');

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

describe('planShimSpawn', () => {
  // The .bat/.cmd rewrite is win32-only, so every shim case names the platform
  // rather than depending on the host running the suite. comspec is pinned for
  // the same reason: a real Windows host has COMSPEC set to an absolute path, so
  // reading it here would make the expected file differ per host.
  const plan = (executable, args, options = {}) =>
    planShimSpawn(executable, args, { platform: 'win32', comspec: 'cmd.exe', ...options });

  test('leaves a directly spawnable executable alone', () => {
    const args = ['run', 'bench'];
    expect(plan('npm', args)).toEqual({ file: 'npm', args, verbatim: false });
    expect(plan('node.exe', args)).toEqual({ file: 'node.exe', args, verbatim: false });
    expect(plan('/usr/bin/node', args)).toEqual({ file: '/usr/bin/node', args, verbatim: false });
  });

  test('leaves a .cmd alone off Windows, where cmd.exe does not exist', () => {
    // A repo-local build.cmd on Linux spawns as it stands; rewriting it to a
    // cmd.exe that is not there would turn a working command into ENOENT.
    const args = ['run', 'bench'];
    for (const platform of ['linux', 'darwin']) {
      expect(planShimSpawn('./build.cmd', args, { platform }))
        .toEqual({ file: './build.cmd', args, verbatim: false });
    }
  });

  test('routes a batch shim through cmd.exe, which spawn cannot launch', () => {
    // Node's src disallows direct .bat/.cmd spawning since the CVE-2024-27980
    // fix, so spawnSync/execFileSync fail with EINVAL on a shim.
    expect(plan('npm.cmd', ['run', 'bench'])).toEqual({
      file: 'cmd.exe',
      args: ['/d', '/s', '/c', '""npm.cmd" "run" "bench""'],
      verbatim: true
    });
    expect(plan('yarn.bat', []).args).toEqual(['/d', '/s', '/c', '""yarn.bat""']);
  });

  test('quotes arguments so cmd.exe cannot reinterpret them', () => {
    // Inside double quotes cmd.exe leaves these alone, so a benchmark command
    // carrying them runs instead of being split into extra commands.
    const [, , , payload] = plan('npm.cmd', ['run', 'a && calc', 'x|y', 'a>b']).args;
    expect(payload).toBe('""npm.cmd" "run" "a && calc" "x|y" "a>b""');
  });

  test('preserves an empty argument', () => {
    const [, , , payload] = plan('npm.cmd', ['run', '']).args;
    expect(payload).toBe('""npm.cmd" "run" """');
  });

  test('doubles trailing backslashes so the closing quote survives', () => {
    // "C:\dir\" would read as an escaped quote when the child parses argv back.
    const [, , , payload] = plan('npm.cmd', ['--cwd', 'C:\\dir\\']).args;
    expect(payload).toBe('""npm.cmd" "--cwd" "C:\\dir\\\\""');
  });

  test('doubles a long run of backslashes without backtracking', () => {
    const [, , , payload] = plan('npm.cmd', ['\\'.repeat(5000)]).args;
    expect(payload).toBe(`""npm.cmd" "${'\\'.repeat(10000)}""`);
  });

  test('refuses arguments cmd.exe cannot carry faithfully', () => {
    // % is expanded even inside quotes, and a literal " ends the quoting.
    expect(() => plan('npm.cmd', ['run', '%PATH%'])).toThrow(/not representable/);
    expect(() => plan('npm.cmd', ['run', 'say "hi"'])).toThrow(/not representable/);
    // A newline ends the command line, so what follows is dropped or run alone.
    expect(() => plan('npm.cmd', ['run', 'bench\ncalc'])).toThrow(/not representable/);
    expect(() => plan('npm.cmd', ['run', 'bench\r'])).toThrow(/not representable/);
    expect(() => plan('npm.cmd', ['run', 'a\0b'])).toThrow(/null byte/);
    expect(() => plan('npm.cmd', ['run', 42])).toThrow(/must be a string/);
  });

  test('refuses a shim path cmd.exe would rewrite before resolving it', () => {
    // The executable lands on the same command line as the arguments, and
    // cmd.exe expands %TEMP% there too - the path it opens is then not the one
    // the caller named.
    expect(() => plan('C:\\build%TEMP%\\.bin\\vitest.cmd', ['run']))
      .toThrow(/executable path.*not representable/s);
  });

  test('leaves those arguments alone when no shell is involved', () => {
    // Nothing reparses an execFileSync argv, so the restriction is shim-only.
    expect(plan('npm', ['run', '%PATH%', 'say "hi"']).args)
      .toEqual(['run', '%PATH%', 'say "hi"']);
  });

  test('honours an explicit comspec', () => {
    expect(plan('npm.cmd', [], { comspec: 'C:\\Windows\\system32\\cmd.exe' }).file)
      .toBe('C:\\Windows\\system32\\cmd.exe');
  });

  test('falls back to COMSPEC, then to a bare cmd.exe', () => {
    // Callers that have no comspec to pass get whatever Windows set, which is
    // where a hardened box points COMSPEC somewhere other than System32.
    const comspec = process.env.comspec;
    try {
      process.env.comspec = 'D:\\shells\\cmd.exe';
      expect(planShimSpawn('npm.cmd', [], { platform: 'win32' }).file).toBe('D:\\shells\\cmd.exe');

      delete process.env.comspec;
      expect(planShimSpawn('npm.cmd', [], { platform: 'win32' }).file).toBe('cmd.exe');
    } finally {
      if (comspec === undefined) {
        delete process.env.comspec;
      } else {
        process.env.comspec = comspec;
      }
    }
  });

  test('shimSpawnOptions adds windowsVerbatimArguments only for a shim', () => {
    expect(shimSpawnOptions(plan('npm.cmd', ['run']), { cwd: '/tmp' }))
      .toEqual({ cwd: '/tmp', windowsVerbatimArguments: true });
    expect(shimSpawnOptions(plan('npm', ['run']), { cwd: '/tmp' }))
      .toEqual({ cwd: '/tmp' });
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
