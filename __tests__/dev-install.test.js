/**
 * Tests for scripts/dev-install.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const devInstallPath = path.join(__dirname, '..', 'scripts', 'dev-install.js');
const devInstallSource = fs.readFileSync(devInstallPath, 'utf8');

describe('dev-install script', () => {
  describe('script structure', () => {
    test('file exists', () => {
      expect(fs.existsSync(devInstallPath)).toBe(true);
    });

    test('has shebang', () => {
      expect(devInstallSource.startsWith('#!/usr/bin/env node')).toBe(true);
    });

    test('defines PLUGINS via discovery', () => {
      expect(devInstallSource.includes('discovery.discoverPlugins')).toBe(true);
    });

    test('uses discovery module', () => {
      expect(devInstallSource.includes("require(")).toBe(true);
      expect(devInstallSource.includes("discovery")).toBe(true);
    });

    test('defines installClaude function', () => {
      expect(devInstallSource.includes('function installClaude()')).toBe(true);
    });

    test('defines installOpenCode function', () => {
      expect(devInstallSource.includes('function installOpenCode()')).toBe(true);
    });

    test('defines installCodex function', () => {
      expect(devInstallSource.includes('function installCodex()')).toBe(true);
    });

    test('defines cleanAll function', () => {
      expect(devInstallSource.includes('function cleanAll()')).toBe(true);
    });

    test('defines copyToAgentSys function', () => {
      expect(devInstallSource.includes('function copyToAgentSys()')).toBe(true);
    });
  });

  describe('CLI argument handling', () => {
    test('handles --clean flag', () => {
      expect(devInstallSource.includes("args.includes('--clean')")).toBe(true);
    });

    test('handles specific tool arguments', () => {
      expect(devInstallSource.includes("validTools.includes(")).toBe(true);
    });

    test('defaults to all tools when no args', () => {
      expect(devInstallSource.includes('tools = validTools')).toBe(true);
    });
  });

  describe('target directories', () => {
    test('defines CLAUDE_PLUGINS_DIR', () => {
      expect(devInstallSource.includes('CLAUDE_PLUGINS_DIR')).toBe(true);
      expect(devInstallSource.includes(".claude', 'plugins'")).toBe(true);
    });

    test('defines OPENCODE_CONFIG_DIR using XDG path', () => {
      // Should use ~/.config/opencode/ (XDG) not ~/.opencode/
      expect(devInstallSource.includes('OPENCODE_CONFIG_DIR')).toBe(true);
      expect(devInstallSource.includes('getOpenCodeConfigDir')).toBe(true);
      expect(devInstallSource.includes(".config', 'opencode'")).toBe(true);
    });

    test('defines LEGACY_OPENCODE_DIR for cleanup', () => {
      // Legacy path kept for cleaning up old installations
      expect(devInstallSource.includes('LEGACY_OPENCODE_DIR')).toBe(true);
      expect(devInstallSource.includes(".opencode'")).toBe(true);
    });

    test('defines CODEX_DIR', () => {
      expect(devInstallSource.includes('CODEX_DIR')).toBe(true);
      expect(devInstallSource.includes(".codex'")).toBe(true);
    });

    test('defines AGENTSYS_DIR', () => {
      expect(devInstallSource.includes('AGENTSYS_DIR')).toBe(true);
      expect(devInstallSource.includes(".agentsys'")).toBe(true);
    });
  });

  describe('getOpenCodeConfigDir() logic', () => {
    // Extract and test the function logic directly
    const path = require('path');

    function getOpenCodeConfigDir(env) {
      const HOME = env.HOME || env.USERPROFILE;
      const xdgConfigHome = env.XDG_CONFIG_HOME;
      if (xdgConfigHome && xdgConfigHome.trim()) {
        return path.join(xdgConfigHome, 'opencode');
      }
      return path.join(HOME, '.config', 'opencode');
    }

    test('uses XDG_CONFIG_HOME when set', () => {
      const result = getOpenCodeConfigDir({
        HOME: '/home/user',
        XDG_CONFIG_HOME: '/custom/config'
      });
      expect(result).toBe(path.join('/custom/config', 'opencode'));
    });

    test('falls back to ~/.config/opencode when XDG_CONFIG_HOME unset', () => {
      const result = getOpenCodeConfigDir({
        HOME: '/home/user'
      });
      expect(result).toBe(path.join('/home/user', '.config', 'opencode'));
    });

    test('falls back when XDG_CONFIG_HOME is empty string', () => {
      const result = getOpenCodeConfigDir({
        HOME: '/home/user',
        XDG_CONFIG_HOME: ''
      });
      expect(result).toBe(path.join('/home/user', '.config', 'opencode'));
    });

    test('falls back when XDG_CONFIG_HOME is whitespace only', () => {
      const result = getOpenCodeConfigDir({
        HOME: '/home/user',
        XDG_CONFIG_HOME: '   '
      });
      expect(result).toBe(path.join('/home/user', '.config', 'opencode'));
    });

    test('uses USERPROFILE on Windows when HOME not set', () => {
      const result = getOpenCodeConfigDir({
        USERPROFILE: 'C:\\Users\\user'
      });
      expect(result).toBe(path.join('C:\\Users\\user', '.config', 'opencode'));
    });

    test('script implementation matches expected pattern', () => {
      // Verify the script has the exact logic we tested above
      expect(devInstallSource).toMatch(/if\s*\(\s*xdgConfigHome\s*&&\s*xdgConfigHome\.trim\(\)\s*\)/);
      expect(devInstallSource).toMatch(/path\.join\s*\(\s*xdgConfigHome\s*,\s*['"]opencode['"]\s*\)/);
      expect(devInstallSource).toMatch(/path\.join\s*\(\s*HOME\s*,\s*['"]\.config['"]\s*,\s*['"]opencode['"]\s*\)/);
    });
  });

  describe('installation logic', () => {
    test('uses shared transforms for OpenCode', () => {
      // Should use shared adapter-transforms module (stripModels: true by default)
      expect(devInstallSource.includes('transforms.transformBodyForOpenCode')).toBe(true);
      expect(devInstallSource.includes('transforms.transformAgentFrontmatterForOpenCode')).toBe(true);
    });

    test('uses shared transforms for commands', () => {
      expect(devInstallSource.includes('transforms.transformCommandFrontmatterForOpenCode')).toBe(true);
    });

    test('removes marketplace for Claude', () => {
      expect(devInstallSource.includes("'plugin', 'marketplace', 'remove', 'agent-sh/agentsys'")).toBe(true);
    });

    test('copies to ~/.agentsys for OpenCode/Codex', () => {
      expect(devInstallSource.includes('copyToAgentSys')).toBe(true);
    });
  });

  describe('external commands', () => {
    const realPlatform = process.platform;
    const realComspec = process.env.comspec;

    function setPlatform(platform) {
      Object.defineProperty(process, 'platform', { value: platform, configurable: true });
    }

    afterEach(() => {
      setPlatform(realPlatform);
      if (realComspec === undefined) {
        delete process.env.comspec;
      } else {
        process.env.comspec = realComspec;
      }
      jest.resetModules();
      jest.clearAllMocks();
    });

    /**
     * Load dev-install with child_process mocked, on the given platform.
     *
     * The platform is set before the require because resolveExecutableForPlatform
     * and planShimSpawn read process.platform when runCommand calls them. comspec
     * is pinned for the same reason: a real Windows host has COMSPEC set to an
     * absolute path, so reading it would make the expected shell differ per host.
     */
    function loadWithPlatform(platform) {
      setPlatform(platform);
      process.env.comspec = 'cmd.exe';
      jest.resetModules();
      const childProcess = require('child_process');
      jest.spyOn(childProcess, 'execFileSync').mockReturnValue('');
      return {
        devInstall: require(devInstallPath),
        execFileSync: childProcess.execFileSync
      };
    }

    test('no execSync anywhere - every command is an argv list', () => {
      expect(devInstallSource.includes('execSync(')).toBe(false);
      expect(devInstallSource.includes('execFileSync')).toBe(true);
    });

    test('routes the claude shim through cmd.exe on Windows', () => {
      const { devInstall, execFileSync } = loadWithPlatform('win32');

      devInstall.runCommand('claude', ['plugin', 'uninstall', 'core@agentsys'], { stdio: 'pipe' });

      expect(execFileSync).toHaveBeenCalledWith(
        'cmd.exe',
        ['/d', '/s', '/c', '""claude.cmd" "plugin" "uninstall" "core@agentsys""'],
        { stdio: 'pipe', windowsVerbatimArguments: true }
      );
    });

    test('spawns claude directly on other platforms', () => {
      const { devInstall, execFileSync } = loadWithPlatform('linux');

      devInstall.runCommand('claude', ['plugin', 'uninstall', 'core@agentsys'], { stdio: 'pipe' });

      expect(execFileSync).toHaveBeenCalledWith(
        'claude',
        ['plugin', 'uninstall', 'core@agentsys'],
        { stdio: 'pipe' }
      );
    });

    test('resolves npm to its shim and keeps the cwd', () => {
      const { devInstall, execFileSync } = loadWithPlatform('win32');

      devInstall.runCommand('npm', ['install', '--production'], { cwd: 'C:\\Users\\dev\\.agentsys', stdio: 'pipe' });

      expect(execFileSync).toHaveBeenCalledWith(
        'cmd.exe',
        ['/d', '/s', '/c', '""npm.cmd" "install" "--production""'],
        { cwd: 'C:\\Users\\dev\\.agentsys', stdio: 'pipe', windowsVerbatimArguments: true }
      );
    });

    test('a plugin name holding shell metacharacters stays one argument', () => {
      const { devInstall, execFileSync } = loadWithPlatform('linux');

      devInstall.runCommand('claude', ['plugin', 'uninstall', 'core & calc@agentsys'], { stdio: 'pipe' });

      const [, args] = execFileSync.mock.calls[0];
      expect(args).toEqual(['plugin', 'uninstall', 'core & calc@agentsys']);
    });

    test('commandExists asks where.exe on Windows and which elsewhere', () => {
      const win = loadWithPlatform('win32');
      win.devInstall.commandExists('claude');
      expect(win.execFileSync.mock.calls[0][0]).toBe('where.exe');
      expect(win.execFileSync.mock.calls[0][1]).toEqual(['claude']);

      const linux = loadWithPlatform('linux');
      linux.devInstall.commandExists('claude');
      expect(linux.execFileSync).toHaveBeenCalledWith('which', ['claude'], { stdio: 'pipe' });
    });

    test('commandExists reports false when the lookup fails', () => {
      setPlatform('linux');
      jest.resetModules();
      const childProcess = require('child_process');
      jest.spyOn(childProcess, 'execFileSync').mockImplementation(() => {
        throw new Error('not found');
      });

      expect(require(devInstallPath).commandExists('claude')).toBe(false);
    });
  });

  describe('installClaude external commands', () => {
    const realPlatform = process.platform;
    const realComspec = process.env.comspec;
    const realHome = process.env.HOME;
    const realUserProfile = process.env.USERPROFILE;
    let home;

    beforeEach(() => {
      // installClaude writes under HOME - point it at a scratch dir so the run
      // cannot touch the developer's own ~/.claude.
      home = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-install-claude-'));
      process.env.HOME = home;
      process.env.USERPROFILE = home;
      process.env.comspec = 'cmd.exe';
    });

    afterEach(() => {
      Object.defineProperty(process, 'platform', { value: realPlatform, configurable: true });
      restoreEnv('HOME', realHome);
      restoreEnv('USERPROFILE', realUserProfile);
      restoreEnv('comspec', realComspec);
      fs.rmSync(home, { recursive: true, force: true });
      jest.resetModules();
      jest.clearAllMocks();
    });

    function restoreEnv(name, value) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }

    /**
     * Run installClaude with a faked platform and a stubbed child_process.
     *
     * whereOutput is what `where.exe claude` answers, which is what decides the
     * executable on win32; spawn is what every other command does, so a test can
     * make the claude call fail the way a real spawn failure does.
     */
    function runInstallClaude(platform, { whereOutput = '', spawn = () => '' } = {}) {
      Object.defineProperty(process, 'platform', { value: platform, configurable: true });
      jest.resetModules();
      const childProcess = require('child_process');
      const execFileSync = jest.spyOn(childProcess, 'execFileSync').mockImplementation((file, args, options) => {
        if (/where\.exe$/i.test(file) && args[0] === 'claude') {
          return whereOutput;
        }
        return spawn(file, args, options);
      });
      const logs = [];
      const consoleLog = jest.spyOn(console, 'log').mockImplementation(msg => logs.push(String(msg)));
      require(devInstallPath).installClaude();
      consoleLog.mockRestore();
      const claudeCalls = execFileSync.mock.calls.filter(([, args]) => args.includes('marketplace') || args.join(' ').includes('"marketplace"'));
      return { execFileSync, logs, claudeCalls };
    }

    test('spawns the claude.exe where.exe resolved, with no cmd.exe hop', () => {
      const native = 'C:\\Users\\u\\.local\\bin\\claude.exe';
      const { claudeCalls, execFileSync } = runInstallClaude('win32', { whereOutput: `${native}\r\n` });

      expect(claudeCalls).toEqual([[native, ['plugin', 'marketplace', 'remove', 'agent-sh/agentsys'], { stdio: 'pipe' }]]);
      expect(execFileSync.mock.calls.some(([file]) => file === 'cmd.exe')).toBe(false);
    });

    test('routes the claude.cmd where.exe resolved through cmd.exe', () => {
      const shim = 'C:\\npm\\claude.cmd';
      const { claudeCalls } = runInstallClaude('win32', { whereOutput: `${shim}\r\n` });

      expect(claudeCalls).toEqual([[
        'cmd.exe',
        ['/d', '/s', '/c', `""${shim}" "plugin" "marketplace" "remove" "agent-sh/agentsys""`],
        { stdio: 'pipe', windowsVerbatimArguments: true }
      ]]);
    });

    test('spawns plain claude off Windows', () => {
      const { claudeCalls } = runInstallClaude('linux');

      expect(claudeCalls).toEqual([['claude', ['plugin', 'marketplace', 'remove', 'agent-sh/agentsys'], { stdio: 'pipe' }]]);
    });

    test('reports a claude that could not be started at all', () => {
      // A wrong executable used to be indistinguishable from nothing to remove:
      // the catch swallowed it and the run claimed success having done nothing.
      const { logs } = runInstallClaude('linux', {
        spawn: (file, args) => {
          if (args.includes('marketplace')) {
            throw Object.assign(new Error('spawnSync claude ENOENT'), { code: 'ENOENT', status: null });
          }
          return '';
        }
      });

      expect(logs.some(line => line.includes('[WARN]') && line.includes('Could not run claude') && line.includes('ENOENT'))).toBe(true);
    });

    test('reports a claude.cmd cmd.exe could not launch', () => {
      // The shim host is the one this whole fix is about, and there the child is
      // cmd.exe: it starts fine, so a shim it cannot launch shows up only as its
      // 9009 exit code. status === null alone would never see it.
      const { logs } = runInstallClaude('win32', {
        whereOutput: 'C:\\npm\\claude.cmd\r\n',
        spawn: (file, args) => {
          if (args.join(' ').includes('"marketplace"')) {
            throw Object.assign(new Error('Command failed'), { status: 9009 });
          }
          return '';
        }
      });

      expect(logs.some(line => line.includes('[WARN]') && line.includes('C:\\npm\\claude.cmd') && line.includes('exit 9009'))).toBe(true);
    });

    test('stays quiet when a claude.cmd ran and exited non-zero', () => {
      // Through cmd.exe as well, the shim's own exit code still means claude ran.
      const { logs } = runInstallClaude('win32', {
        whereOutput: 'C:\\npm\\claude.cmd\r\n',
        spawn: (file, args) => {
          if (args.join(' ').includes('"marketplace"')) {
            throw Object.assign(new Error('Command failed'), { status: 1 });
          }
          return '';
        }
      });

      expect(logs.some(line => line.includes('[WARN]'))).toBe(false);
    });

    test('9009 from a direct executable is the executable talking, not cmd.exe', () => {
      // Only the shim route goes through cmd.exe, so 9009 from a .exe is just an
      // exit code and has to stay a normal best-effort failure.
      const { logs } = runInstallClaude('win32', {
        whereOutput: 'C:\\Users\\u\\.local\\bin\\claude.exe\r\n',
        spawn: (file, args) => {
          if (args.includes('marketplace')) {
            throw Object.assign(new Error('Command failed'), { status: 9009 });
          }
          return '';
        }
      });

      expect(logs.some(line => line.includes('[WARN]'))).toBe(false);
    });

    test('stays quiet when claude ran and exited non-zero', () => {
      // Nothing to remove is the normal case, not a failure worth a warning.
      const { logs } = runInstallClaude('linux', {
        spawn: (file, args) => {
          if (args.includes('marketplace')) {
            throw Object.assign(new Error('Command failed'), { status: 1 });
          }
          return '';
        }
      });

      expect(logs.some(line => line.includes('[WARN]'))).toBe(false);
    });
  });

  describe('output', () => {
    test('logs with [dev-install] prefix', () => {
      expect(devInstallSource.includes('[dev-install]')).toBe(true);
    });

    test('shows summary at end', () => {
      expect(devInstallSource.includes('Summary:')).toBe(true);
    });

    test('shows clean command', () => {
      expect(devInstallSource.includes('node scripts/dev-install.js --clean')).toBe(true);
    });
  });
});
