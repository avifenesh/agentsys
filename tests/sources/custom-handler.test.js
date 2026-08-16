/**
 * Custom Handler Tests
 * Tests for custom source handling: type questions, CLI probing, config building
 */

const customHandler = require('@agentsys/lib/sources/custom-handler');
const sourceCache = require('@agentsys/lib/sources/source-cache');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Mock execFileSync for CLI probing tests
jest.mock('child_process', () => ({
  execFileSync: jest.fn()
}));

// Mock source-cache to avoid file system side effects
jest.mock('@agentsys/lib/sources/source-cache', () => ({
  savePreference: jest.fn(),
  saveToolCapabilities: jest.fn(),
  getPreference: jest.fn()
}));

describe('Custom Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('SOURCE_TYPES', () => {
    it('should expose all source type constants', () => {
      expect(customHandler.SOURCE_TYPES).toEqual({
        MCP: 'mcp',
        CLI: 'cli',
        SKILL: 'skill',
        FILE: 'file'
      });
    });
  });

  describe('isValidToolName', () => {
    it('should accept valid alphanumeric tool names', () => {
      expect(customHandler.isValidToolName('gh')).toBe(true);
      expect(customHandler.isValidToolName('glab')).toBe(true);
      expect(customHandler.isValidToolName('tea')).toBe(true);
      expect(customHandler.isValidToolName('jira-cli')).toBe(true);
      expect(customHandler.isValidToolName('my_tool')).toBe(true);
      expect(customHandler.isValidToolName('Tool123')).toBe(true);
    });

    it('should reject tool names with shell metacharacters', () => {
      expect(customHandler.isValidToolName('tool;rm -rf /')).toBe(false);
      expect(customHandler.isValidToolName('tool$(whoami)')).toBe(false);
      expect(customHandler.isValidToolName('tool`id`')).toBe(false);
      expect(customHandler.isValidToolName('../passwd')).toBe(false);
      expect(customHandler.isValidToolName('tool|cat')).toBe(false);
      expect(customHandler.isValidToolName('tool&bg')).toBe(false);
    });

    it('should reject empty or whitespace-only names', () => {
      expect(customHandler.isValidToolName('')).toBe(false);
      expect(customHandler.isValidToolName(' ')).toBe(false);
      expect(customHandler.isValidToolName('tool name')).toBe(false);
    });
  });

  describe('getCustomTypeQuestion', () => {
    it('should return question structure for AskUserQuestion', () => {
      const question = customHandler.getCustomTypeQuestion();

      expect(question).toHaveProperty('header', 'Source Type');
      expect(question).toHaveProperty('question', 'What type of source is this?');
      expect(question).toHaveProperty('multiSelect', false);
      expect(question.options).toHaveLength(4);
    });

    it('should include all source type options', () => {
      const question = customHandler.getCustomTypeQuestion();
      const labels = question.options.map(opt => opt.label);

      expect(labels).toContain('CLI Tool');
      expect(labels).toContain('MCP Server');
      expect(labels).toContain('Skill/Plugin');
      expect(labels).toContain('File Path');
    });

    it('should include descriptions for each option', () => {
      const question = customHandler.getCustomTypeQuestion();

      question.options.forEach(opt => {
        expect(opt).toHaveProperty('description');
        expect(typeof opt.description).toBe('string');
        expect(opt.description.length).toBeGreaterThan(0);
      });
    });
  });

  describe('getCustomNameQuestion', () => {
    it('should return CLI-specific question for cli type', () => {
      const question = customHandler.getCustomNameQuestion('cli');

      expect(question.header).toBe('CLI Tool');
      expect(question.question).toBe('What is the CLI tool name?');
      expect(question.hint).toContain('tea');
    });

    it('should return MCP-specific question for mcp type', () => {
      const question = customHandler.getCustomNameQuestion('mcp');

      expect(question.header).toBe('MCP Server');
      expect(question.question).toBe('What is the MCP server name?');
      expect(question.hint).toContain('mcp');
    });

    it('should return skill-specific question for skill type', () => {
      const question = customHandler.getCustomNameQuestion('skill');

      expect(question.header).toBe('Skill Name');
      expect(question.question).toBe('What is the skill name?');
    });

    it('should return file-specific question for file type', () => {
      const question = customHandler.getCustomNameQuestion('file');

      expect(question.header).toBe('File Path');
      expect(question.question).toBe('What is the file path?');
      expect(question.hint).toContain('.md');
    });

    it('should default to CLI question for unknown type', () => {
      const question = customHandler.getCustomNameQuestion('unknown');

      expect(question.header).toBe('CLI Tool');
    });
  });

  describe('mapTypeSelection', () => {
    it('should map user selection labels to internal types', () => {
      expect(customHandler.mapTypeSelection('CLI Tool')).toBe('cli');
      expect(customHandler.mapTypeSelection('MCP Server')).toBe('mcp');
      expect(customHandler.mapTypeSelection('Skill/Plugin')).toBe('skill');
      expect(customHandler.mapTypeSelection('File Path')).toBe('file');
    });

    it('should default to CLI for unknown selections', () => {
      expect(customHandler.mapTypeSelection('Unknown')).toBe('cli');
      expect(customHandler.mapTypeSelection('')).toBe('cli');
    });
  });

  describe('probeCLI', () => {
    beforeEach(() => {
      execFileSync.mockReset();
    });

    it('should return unavailable for invalid tool names', () => {
      const result = customHandler.probeCLI('tool;rm -rf');

      expect(result.available).toBe(false);
      expect(result.type).toBe('cli');
      expect(execFileSync).not.toHaveBeenCalled();
    });

    it('should return unavailable when tool not found', () => {
      execFileSync.mockImplementation(() => {
        const error = new Error('Command not found');
        error.code = 'ENOENT';
        throw error;
      });

      const result = customHandler.probeCLI('nonexistent-tool');

      expect(result.available).toBe(false);
      expect(result.tool).toBe('nonexistent-tool');
    });

    it('should probe an npm-shipped tool through its Windows shim', () => {
      // execFileSync applies no PATHEXT, so a bare 'npx' is ENOENT on Windows -
      // and npx.cmd cannot be spawned directly since the CVE-2024-27980 fix, so
      // the probe would report an installed tool as unavailable either way.
      execFileSync.mockReturnValue('11.0.0');
      const platform = process.platform;
      // A real Windows host has COMSPEC set to an absolute path, so it is pinned
      // here as well - otherwise the expected shell differs per host.
      const comspec = process.env.comspec;
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      process.env.comspec = 'cmd.exe';

      let result;
      try {
        result = customHandler.probeCLI('npx');
      } finally {
        Object.defineProperty(process, 'platform', { value: platform, configurable: true });
        if (comspec === undefined) {
          delete process.env.comspec;
        } else {
          process.env.comspec = comspec;
        }
      }

      expect(result.available).toBe(true);
      expect(execFileSync).toHaveBeenCalledWith(
        'cmd.exe',
        ['/d', '/s', '/c', '""npx.cmd" "--version""'],
        expect.objectContaining({ windowsVerbatimArguments: true })
      );
    });

    it('should probe a plain executable directly off Windows', () => {
      execFileSync.mockReturnValue('gh version 2.0.0');

      customHandler.probeCLI('gh');

      expect(execFileSync).toHaveBeenCalledWith('gh', ['--version'], expect.objectContaining({
        stdio: 'pipe'
      }));
    });

    it('should return known patterns for gh tool', () => {
      execFileSync.mockReturnValue('gh version 2.0.0');

      const result = customHandler.probeCLI('gh');

      expect(result.available).toBe(true);
      expect(result.pattern).toBe('known');
      expect(result.features).toContain('issues');
      expect(result.features).toContain('prs');
      expect(result.features).toContain('ci');
      expect(result.commands).toHaveProperty('list_issues');
      expect(result.commands).toHaveProperty('create_pr');
    });

    it('should return known patterns for tea tool', () => {
      execFileSync.mockReturnValue('tea version 0.9.0');

      const result = customHandler.probeCLI('tea');

      expect(result.available).toBe(true);
      expect(result.pattern).toBe('known');
      expect(result.features).toContain('issues');
      expect(result.features).toContain('prs');
    });

    it('should return known patterns for glab tool', () => {
      execFileSync.mockReturnValue('glab version 1.0.0');

      const result = customHandler.probeCLI('glab');

      expect(result.available).toBe(true);
      expect(result.pattern).toBe('known');
      expect(result.features).toContain('ci');
    });

    it('should return discovered pattern for unknown tools', () => {
      execFileSync.mockReturnValue('unknown-tool 1.0.0');

      const result = customHandler.probeCLI('unknown-tool');

      expect(result.available).toBe(true);
      expect(result.pattern).toBe('discovered');
      expect(result.features).toContain('unknown');
      expect(result.commands.help).toBe('unknown-tool --help');
    });
  });

  describe('buildCustomConfig', () => {
    beforeEach(() => {
      execFileSync.mockReset();
      sourceCache.savePreference.mockClear();
      sourceCache.saveToolCapabilities.mockClear();
    });

    it('should build config for CLI type and probe capabilities', () => {
      execFileSync.mockReturnValue('gh version 2.0.0');

      const config = customHandler.buildCustomConfig('cli', 'gh');

      expect(config.source).toBe('custom');
      expect(config.type).toBe('cli');
      expect(config.tool).toBe('gh');
      expect(config.capabilities).toBeDefined();
      expect(config.capabilities.available).toBe(true);
    });

    it('should cache capabilities for available CLI tools', () => {
      execFileSync.mockReturnValue('tea version 0.9.0');

      customHandler.buildCustomConfig('cli', 'tea');

      expect(sourceCache.saveToolCapabilities).toHaveBeenCalledWith(
        'tea',
        expect.objectContaining({ available: true })
      );
    });

    it('should not cache capabilities for unavailable tools', () => {
      execFileSync.mockImplementation(() => {
        throw new Error('Command not found');
      });

      customHandler.buildCustomConfig('cli', 'missing-tool');

      expect(sourceCache.saveToolCapabilities).not.toHaveBeenCalled();
    });

    it('should save preference for all types', () => {
      const config = customHandler.buildCustomConfig('mcp', 'linear-mcp');

      expect(config.source).toBe('custom');
      expect(config.type).toBe('mcp');
      expect(config.tool).toBe('linear-mcp');
      expect(sourceCache.savePreference).toHaveBeenCalledWith(config);
    });

    it('should not probe for non-CLI types', () => {
      customHandler.buildCustomConfig('skill', 'linear:list-issues');

      expect(execFileSync).not.toHaveBeenCalled();
    });

    it('should build config for file type', () => {
      const config = customHandler.buildCustomConfig('file', './backlog.md');

      expect(config.source).toBe('custom');
      expect(config.type).toBe('file');
      expect(config.tool).toBe('./backlog.md');
      expect(config.capabilities).toBeUndefined();
    });
  });
});
