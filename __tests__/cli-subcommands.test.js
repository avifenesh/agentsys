/**
 * Tests for CLI subcommands: search, install, remove, list
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  parseArgs,
  searchPlugins,
  loadMarketplace,
  satisfiesRange,
  loadInstalledJson,
  saveInstalledJson,
  recordInstall,
  recordedPlatforms,
  recordRemove,
  getInstalledJsonPath,
  detectInstalledPlatforms,
  parseInstallTarget,
  loadComponents,
  resolveComponent,
  buildFilterFromComponent,
  resolvePluginSource,
  parseGitHubSource
} = require('../bin/cli.js');

describe('CLI subcommand parsing', () => {
  const originalExit = process.exit;
  const originalError = console.error;

  beforeEach(() => {
    process.exit = jest.fn((code) => {
      throw new Error(`process.exit(${code})`);
    });
    console.error = jest.fn();
  });

  afterEach(() => {
    process.exit = originalExit;
    console.error = originalError;
  });

  test('parses "install next-task"', () => {
    const result = parseArgs(['install', 'next-task']);
    expect(result.subcommand).toBe('install');
    expect(result.subcommandArg).toBe('next-task');
  });

  test('parses "install next-task@1.2.0"', () => {
    const result = parseArgs(['install', 'next-task@1.2.0']);
    expect(result.subcommand).toBe('install');
    expect(result.subcommandArg).toBe('next-task@1.2.0');
  });

  test('parses "install next-task --tool claude"', () => {
    const result = parseArgs(['install', 'next-task', '--tool', 'claude']);
    expect(result.subcommand).toBe('install');
    expect(result.subcommandArg).toBe('next-task');
    expect(result.tool).toBe('claude');
  });

  test('parses "remove deslop"', () => {
    const result = parseArgs(['remove', 'deslop']);
    expect(result.subcommand).toBe('remove');
    expect(result.subcommandArg).toBe('deslop');
  });

  test('parses "search" without term', () => {
    const result = parseArgs(['search']);
    expect(result.subcommand).toBe('search');
    expect(result.subcommandArg).toBeNull();
  });

  test('parses "search perf"', () => {
    const result = parseArgs(['search', 'perf']);
    expect(result.subcommand).toBe('search');
    expect(result.subcommandArg).toBe('perf');
  });

  test('parses "list" subcommand', () => {
    const result = parseArgs(['list']);
    expect(result.subcommand).toBe('list');
  });

  test('parses "update" subcommand', () => {
    const result = parseArgs(['update']);
    expect(result.subcommand).toBe('update');
  });
});

describe('searchPlugins', () => {
  const originalLog = console.log;
  let logOutput;

  beforeEach(() => {
    logOutput = [];
    console.log = jest.fn((...args) => logOutput.push(args.join(' ')));
  });

  afterEach(() => {
    console.log = originalLog;
  });

  test('lists all plugins when no term given', () => {
    searchPlugins(undefined);
    const output = logOutput.join('\n');
    expect(output).toContain('next-task');
    expect(output).toContain('deslop');
    // Count derived from marketplace.json so this test stays stable as
    // the marketplace grows. Asserts the suffix and uses the same
    // source-of-truth the production code reads.
    const expectedCount = loadMarketplace().plugins.length;
    expect(output).toContain(`${expectedCount} plugin(s) found`);
  });

  test('filters by name', () => {
    searchPlugins('perf');
    const output = logOutput.join('\n');
    expect(output).toContain('perf');
    // Count derived from marketplace.json using the same name-or-description
    // match the production code uses, so this stays stable as the marketplace
    // grows or descriptions evolve (e.g. "performance" also contains "perf").
    const lower = 'perf';
    const expectedCount = loadMarketplace().plugins.filter(p =>
      p.name.toLowerCase().includes(lower) ||
      (p.description && p.description.toLowerCase().includes(lower))
    ).length;
    expect(output).toContain(`${expectedCount} plugin(s) found`);
  });

  test('filters by description', () => {
    searchPlugins('slop');
    const output = logOutput.join('\n');
    expect(output).toContain('deslop');
  });

  test('shows message when no results', () => {
    searchPlugins('zzzznonexistent');
    const output = logOutput.join('\n');
    expect(output).toContain('No plugins found');
  });
});

describe('satisfiesRange', () => {
  test('>=1.0.0 satisfied by 5.1.0', () => {
    expect(satisfiesRange('5.1.0', '>=1.0.0')).toBe(true);
  });

  test('>=1.0.0 satisfied by 1.0.0', () => {
    expect(satisfiesRange('1.0.0', '>=1.0.0')).toBe(true);
  });

  test('>=2.0.0 not satisfied by 1.9.9', () => {
    expect(satisfiesRange('1.9.9', '>=2.0.0')).toBe(false);
  });

  test('null range always passes', () => {
    expect(satisfiesRange('1.0.0', null)).toBe(true);
  });

  test('undefined range always passes', () => {
    expect(satisfiesRange('1.0.0', undefined)).toBe(true);
  });

  test('unknown format always passes', () => {
    expect(satisfiesRange('1.0.0', '~1.0.0')).toBe(true);
  });
});

describe('installed.json operations', () => {
  let tmpDir;
  let origHome;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsys-test-'));
    origHome = process.env.HOME;
    process.env.HOME = tmpDir;
  });

  afterEach(() => {
    process.env.HOME = origHome;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('loadInstalledJson returns empty when file missing', () => {
    const data = loadInstalledJson();
    expect(data).toEqual({ plugins: {} });
  });

  test('recordInstall creates and updates installed.json', () => {
    recordInstall('deslop', '1.0.0', ['claude']);
    const data = loadInstalledJson();
    expect(data.plugins.deslop).toBeDefined();
    expect(data.plugins.deslop.version).toBe('1.0.0');
    expect(data.plugins.deslop.platforms).toEqual(['claude']);
    expect(data.plugins.deslop.installedAt).toBeTruthy();
  });

  test('recordRemove removes plugin from installed.json', () => {
    recordInstall('deslop', '1.0.0', ['claude']);
    recordRemove('deslop');
    const data = loadInstalledJson();
    expect(data.plugins.deslop).toBeUndefined();
  });

  test('multiple plugins in installed.json', () => {
    recordInstall('deslop', '1.0.0', ['claude']);
    recordInstall('perf', '1.0.0', ['opencode']);
    const data = loadInstalledJson();
    expect(Object.keys(data.plugins)).toEqual(['deslop', 'perf']);
  });

  test('a plugin Claude Code never registered is not recorded against claude', () => {
    // removePlugin reads these platforms back to decide whether to run
    // `claude plugin uninstall`, and `list` prints them, so recording a
    // failed Claude install would make both report something that never landed.
    const failures = new Map([['deslop', 'EINVAL']]);
    recordInstall('deslop', '1.0.0', recordedPlatforms(['claude', 'opencode'], failures, 'deslop'));
    recordInstall('perf', '1.0.0', recordedPlatforms(['claude', 'opencode'], failures, 'perf'));
    const data = loadInstalledJson();
    expect(data.plugins.deslop.platforms).toEqual(['opencode']);
    expect(data.plugins.perf.platforms).toEqual(['claude', 'opencode']);
  });

  test('claude-only install that failed records no platforms at all', () => {
    const failures = new Map([['deslop', null]]);
    recordInstall('deslop', '1.0.0', recordedPlatforms(['claude'], failures, 'deslop'));
    expect(loadInstalledJson().plugins.deslop.platforms).toEqual([]);
  });

  test('recordedPlatforms passes the list through when nothing failed', () => {
    const platforms = ['claude', 'codex'];
    expect(recordedPlatforms(platforms, new Map(), 'deslop')).toBe(platforms);
    expect(recordedPlatforms(platforms, null, 'deslop')).toBe(platforms);
  });

  test('a failed re-install does not erase a Claude registration that already exists', () => {
    // recordInstall replaces the entry wholesale, so dropping 'claude' after a
    // failed re-install would leave the plugin loaded in Claude Code while
    // removePlugin refuses to uninstall it.
    recordInstall('deslop', '1.0.0', ['claude', 'opencode']);
    const before = loadInstalledJson().plugins.deslop.platforms;
    const failures = new Map([['deslop', 'ETIMEDOUT']]);
    recordInstall('deslop', '1.1.0', recordedPlatforms(['claude', 'opencode'], failures, 'deslop', before));
    const entry = loadInstalledJson().plugins.deslop;
    expect(entry.platforms).toEqual(['claude', 'opencode']);
    expect(entry.version).toBe('1.1.0');
  });

  test('a first install that failed still drops claude', () => {
    const failures = new Map([['deslop', 'EINVAL']]);
    expect(recordedPlatforms(['claude', 'opencode'], failures, 'deslop', undefined)).toEqual(['opencode']);
    expect(recordedPlatforms(['claude', 'opencode'], failures, 'deslop', ['opencode'])).toEqual(['opencode']);
  });
});

describe('parseInstallTarget', () => {
  test('parses plain plugin name', () => {
    const result = parseInstallTarget('next-task');
    expect(result).toEqual({ plugin: 'next-task', component: null, version: null });
  });

  test('parses plugin:component', () => {
    const result = parseInstallTarget('next-task:ci-fixer');
    expect(result).toEqual({ plugin: 'next-task', component: 'ci-fixer', version: null });
  });

  test('parses plugin@version', () => {
    const result = parseInstallTarget('next-task@1.2.0');
    expect(result).toEqual({ plugin: 'next-task', component: null, version: '1.2.0' });
  });

  test('parses plugin:component with version on plugin', () => {
    const result = parseInstallTarget('next-task:ci-fixer');
    expect(result.plugin).toBe('next-task');
    expect(result.component).toBe('ci-fixer');
  });

  test('returns nulls for empty input', () => {
    expect(parseInstallTarget('')).toEqual({ plugin: null, component: null, version: null });
    expect(parseInstallTarget(null)).toEqual({ plugin: null, component: null, version: null });
    expect(parseInstallTarget(undefined)).toEqual({ plugin: null, component: null, version: null });
  });

  test('handles colon at end (no component)', () => {
    const result = parseInstallTarget('next-task:');
    expect(result).toEqual({ plugin: 'next-task', component: null, version: null });
  });
});

describe('loadComponents', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsys-comp-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('loads from components.json when present', () => {
    fs.writeFileSync(path.join(tmpDir, 'components.json'), JSON.stringify({
      agents: [{ name: 'ci-fixer', file: 'agents/ci-fixer.md' }],
      skills: [{ name: 'discover-tasks', dir: 'skills/discover-tasks' }],
      commands: [{ name: 'next-task', file: 'commands/next-task.md' }]
    }));
    const result = loadComponents(tmpDir);
    expect(result.agents).toHaveLength(1);
    expect(result.agents[0].name).toBe('ci-fixer');
    expect(result.skills).toHaveLength(1);
    expect(result.commands).toHaveLength(1);
  });

  test('scans filesystem when no components.json', () => {
    // Create mock plugin structure
    fs.mkdirSync(path.join(tmpDir, 'agents'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'agents', 'my-agent.md'), '# Agent');
    fs.mkdirSync(path.join(tmpDir, 'skills', 'my-skill'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'skills', 'my-skill', 'SKILL.md'), '# Skill');
    fs.mkdirSync(path.join(tmpDir, 'commands'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'commands', 'my-cmd.md'), '# Cmd');

    const result = loadComponents(tmpDir);
    expect(result.agents).toEqual([{ name: 'my-agent', file: 'agents/my-agent.md' }]);
    expect(result.skills).toEqual([{ name: 'my-skill', dir: 'skills/my-skill' }]);
    expect(result.commands).toEqual([{ name: 'my-cmd', file: 'commands/my-cmd.md' }]);
  });

  test('returns empty arrays for empty directory', () => {
    const result = loadComponents(tmpDir);
    expect(result).toEqual({ agents: [], skills: [], commands: [] });
  });
});

describe('resolveComponent', () => {
  const components = {
    agents: [{ name: 'ci-fixer', file: 'agents/ci-fixer.md' }],
    skills: [{ name: 'discover-tasks', dir: 'skills/discover-tasks' }],
    commands: [{ name: 'next-task', file: 'commands/next-task.md' }]
  };

  test('resolves agent', () => {
    const result = resolveComponent(components, 'ci-fixer');
    expect(result).toEqual({ type: 'agent', name: 'ci-fixer', file: 'agents/ci-fixer.md' });
  });

  test('resolves skill', () => {
    const result = resolveComponent(components, 'discover-tasks');
    expect(result).toEqual({ type: 'skill', name: 'discover-tasks', dir: 'skills/discover-tasks' });
  });

  test('resolves command', () => {
    const result = resolveComponent(components, 'next-task');
    expect(result).toEqual({ type: 'command', name: 'next-task', file: 'commands/next-task.md' });
  });

  test('returns null for unknown component', () => {
    expect(resolveComponent(components, 'nonexistent')).toBeNull();
  });

  test('returns null for null inputs', () => {
    expect(resolveComponent(components, null)).toBeNull();
    expect(resolveComponent(null, 'ci-fixer')).toBeNull();
  });
});

describe('buildFilterFromComponent', () => {
  test('builds agent filter', () => {
    const filter = buildFilterFromComponent({ type: 'agent', name: 'ci-fixer' });
    expect(filter).toEqual({ agents: ['ci-fixer'], skills: [], commands: [] });
  });

  test('builds skill filter', () => {
    const filter = buildFilterFromComponent({ type: 'skill', name: 'discover-tasks' });
    expect(filter).toEqual({ agents: [], skills: ['discover-tasks'], commands: [] });
  });

  test('builds command filter', () => {
    const filter = buildFilterFromComponent({ type: 'command', name: 'next-task' });
    expect(filter).toEqual({ agents: [], skills: [], commands: ['next-task'] });
  });
});

describe('granular install recording', () => {
  let tmpDir;
  let origHome;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsys-granular-test-'));
    origHome = process.env.HOME;
    process.env.HOME = tmpDir;
  });

  afterEach(() => {
    process.env.HOME = origHome;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('recordInstall with scope full (default)', () => {
    recordInstall('next-task', '1.0.0', ['claude']);
    const data = loadInstalledJson();
    expect(data.plugins['next-task'].scope).toBe('full');
    expect(data.plugins['next-task'].agents).toBeUndefined();
  });

  test('recordInstall with scope partial', () => {
    recordInstall('next-task', '1.0.0', ['opencode'], {
      scope: 'partial',
      agents: ['ci-fixer'],
      skills: [],
      commands: []
    });
    const data = loadInstalledJson();
    expect(data.plugins['next-task'].scope).toBe('partial');
    expect(data.plugins['next-task'].agents).toEqual(['ci-fixer']);
    expect(data.plugins['next-task'].skills).toEqual([]);
    expect(data.plugins['next-task'].commands).toEqual([]);
  });
});

describe('loadMarketplace', () => {
  test('loads marketplace.json with at least one plugin including the canonical core set', () => {
    const marketplace = loadMarketplace();
    expect(marketplace.plugins).toBeDefined();
    expect(marketplace.plugins.length).toBeGreaterThan(0);
    // Spot-check a few plugins that anchor the marketplace identity.
    // These are unlikely to ever be removed - if any of them is, the
    // change deserves an explicit, visible test update.
    const names = marketplace.plugins.map(p => p.name);
    for (const required of ['next-task', 'ship', 'agnix']) {
      expect(names).toContain(required);
    }
  });

  test('all plugins have name, source, version', () => {
    const marketplace = loadMarketplace();
    for (const p of marketplace.plugins) {
      expect(p.name).toBeTruthy();
      expect(p.source).toBeTruthy();
      expect(p.version).toBeTruthy();
    }
  });
});

describe('resolvePluginSource', () => {
  test('supports legacy string URL sources', () => {
    expect(resolvePluginSource('https://github.com/agent-sh/ship.git')).toEqual({
      type: 'remote',
      value: 'https://github.com/agent-sh/ship.git'
    });
  });

  test('supports structured URL source objects', () => {
    expect(resolvePluginSource({
      source: 'url',
      url: 'https://github.com/agent-sh/ship.git'
    })).toEqual({
      type: 'remote',
      value: 'https://github.com/agent-sh/ship.git'
    });
  });

  test('classifies local path sources as local', () => {
    expect(resolvePluginSource({
      source: 'path',
      path: './plugins/ship'
    })).toEqual({
      type: 'local',
      value: './plugins/ship'
    });
  });
});

describe('parseGitHubSource', () => {
  test('normalizes .git suffix in https URLs', () => {
    expect(parseGitHubSource('https://github.com/agent-sh/ship.git', '1.0.0')).toEqual({
      owner: 'agent-sh',
      repo: 'ship',
      ref: 'v1.0.0',
      explicitRef: false
    });
  });

  test('preserves explicit refs', () => {
    expect(parseGitHubSource('https://github.com/agent-sh/ship.git#main', '1.0.0')).toEqual({
      owner: 'agent-sh',
      repo: 'ship',
      ref: 'main',
      explicitRef: true
    });
  });
});
