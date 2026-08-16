'use strict';

const fs = require('fs');
const path = require('path');

const marketplace = require('../.claude-plugin/marketplace.json');
const codexPlugin = require('../.codex-plugin/plugin.json');
const siteContent = require('../site/content.json');

const repoRoot = path.join(__dirname, '..');

const expectedStandalonePlugins = {
  'skill-curator': {
    version: '1.0.1',
    ref: 'v1.0.1',
    commit: '4cca0b7c161710e3fb4f2d0aec477fc7b1e7cc88',
    command: '/skill-curator',
    category: 'development',
  },
  'system-prompt-curator': {
    version: '2.0.1',
    ref: 'v2.0.1',
    commit: '1ccf70fef983384a1d025c5882135abe16c32d1f',
    command: '/system-prompt-curator',
    category: 'development',
  },
  banthis: {
    version: '0.3.1',
    ref: 'v0.3.1',
    commit: '197c8f8b2a074ba22791ee04407f60344f5eee7c',
    command: '/banthis',
    category: 'productivity',
  },
};

function pluginByName(name) {
  return marketplace.plugins.find((plugin) => plugin.name === name);
}

test('marketplace plugin names are unique and mirrored in plugins.txt', () => {
  const names = marketplace.plugins.map((plugin) => plugin.name);
  expect(new Set(names).size).toBe(names.length);

  const pluginsTxt = fs
    .readFileSync(path.join(repoRoot, 'scripts/plugins.txt'), 'utf8')
    .trim()
    // Tolerate CRLF so a checkout's line endings cannot masquerade as a
    // mismatched plugin name. Nothing else is normalised: the file is generated
    // by scripts/generate-plugin-list.js, so stray whitespace in it is a defect
    // this test should still catch.
    .split(/\r?\n/)
    .filter(Boolean);

  expect([...pluginsTxt].sort()).toEqual([...names].sort());
});

test('standalone curator and memory plugins are pinned to immutable release commits', () => {
  for (const [name, expected] of Object.entries(expectedStandalonePlugins)) {
    const plugin = pluginByName(name);
    expect(plugin).toBeTruthy();
    expect(plugin.version).toBe(expected.version);
    expect(plugin.category).toBe(expected.category);
    expect(plugin.homepage).toBe(`https://github.com/agent-sh/${name}`);
    expect(plugin.source).toEqual({
      source: 'url',
      url: `https://github.com/agent-sh/${name}.git`,
      ref: expected.ref,
      commit: expected.commit,
    });
  }
});

test('standalone plugins are represented in user-facing docs and Codex metadata', () => {
  const readme = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8');
  const architecture = fs.readFileSync(path.join(repoRoot, 'docs/ARCHITECTURE.md'), 'utf8');
  const siteCommands = new Set(siteContent.commands.map((command) => command.name));
  const codexDescription = codexPlugin.interface.longDescription;

  for (const [name, expected] of Object.entries(expectedStandalonePlugins)) {
    expect(siteCommands.has(expected.command)).toBe(true);
    expect(readme).toContain(expected.command);
    expect(architecture).toContain(expected.command);
    expect(codexDescription).toContain(expected.command);
    expect(codexDescription).toContain(name);
  }
});

test('all url-sourced marketplace plugins carry a commit pin', () => {
  for (const plugin of marketplace.plugins) {
    if (plugin.source?.source !== 'url') continue;

    expect(plugin.source.url).toMatch(/^https:\/\/github\.com\/agent-sh\/.+\.git$/);
    expect(plugin.source.commit).toMatch(/^[0-9a-f]{40}$/);
    if (plugin.source.ref) {
      expect(plugin.source.ref).toBe(`v${plugin.version}`);
    }
  }
});
