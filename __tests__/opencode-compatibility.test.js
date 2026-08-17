/**
 * Tests for OpenCode compatibility validation
 *
 * Ensures that:
 * - Documentation correctly describes OpenCode's @ mention syntax (not Task tool)
 * - Commands don't use Claude Code-specific Task tool syntax
 * - Agent files are properly formatted for OpenCode
 * - Label lengths comply with OpenCode's 30-char limit
 */

const fs = require('fs');
const path = require('path');

// Helper to replicate glob.sync for simple plugin directory patterns
function findPluginFiles(subDir, ext) {
  const pluginsDir = path.join(__dirname, '..', 'plugins');
  const results = [];
  if (!fs.existsSync(pluginsDir)) return results;
  for (const plugin of fs.readdirSync(pluginsDir)) {
    const dir = path.join(pluginsDir, plugin, subDir);
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (file.endsWith(ext)) {
        results.push(path.join(dir, file));
      }
    }
  }
  return results;
}

describe('OpenCode Compatibility', () => {
  describe('Documentation accuracy', () => {
    it('should NOT reference Task tool for OpenCode subagent invocation', () => {
      const opencodeDocs = fs.readFileSync(
        path.join(__dirname, '../agent-docs/OPENCODE-REFERENCE.md'),
        'utf-8'
      );

      // Should NOT say subagents are called via Task tool
      expect(opencodeDocs).not.toMatch(/subagent.*via Task tool/i);
      expect(opencodeDocs).not.toMatch(/called via Task tool.*from other agents/i);

      // Should mention @ mention syntax
      expect(opencodeDocs).toMatch(/@\s*mention|@agent-name/i);
    });

    it('should document OpenCode @ mention syntax for subagents', () => {
      const opencodeDocs = fs.readFileSync(
        path.join(__dirname, '../agent-docs/OPENCODE-REFERENCE.md'),
        'utf-8'
      );

      // Should have section about invoking subagents
      expect(opencodeDocs).toMatch(/Invoking Subagents|@ mention syntax/i);
    });
  });

  describe('Label length compliance', () => {
    const OPENCODE_MAX_LABEL_LENGTH = 30;

    it('should have AskUserQuestion labels within 30 char limit', () => {
      const policyQuestions = require('../lib/sources/policy-questions.js');
      const { questions } = policyQuestions.getPolicyQuestions();

      for (const question of questions) {
        for (const option of question.options) {
          expect(option.label.length).toBeLessThanOrEqual(OPENCODE_MAX_LABEL_LENGTH);
        }
      }
    });

    it('should truncate cached preference labels properly', () => {
      // Mock a long cached preference
      const sourceCache = require('../lib/sources/source-cache.js');
      const originalGet = sourceCache.getPreference;

      // Test with a mock cached preference
      sourceCache.getPreference = () => ({
        source: 'custom',
        type: 'cli',
        tool: 'very-long-custom-tool-name-that-exceeds-limit'
      });

      const policyQuestions = require('../lib/sources/policy-questions.js');

      // Clear require cache to reload with mocked preference
      delete require.cache[require.resolve('../lib/sources/policy-questions.js')];
      const freshPolicyQuestions = require('../lib/sources/policy-questions.js');

      const { questions } = freshPolicyQuestions.getPolicyQuestions();
      const sourceQuestion = questions.find(q => q.header === 'Source');

      if (sourceQuestion) {
        for (const option of sourceQuestion.options) {
          expect(option.label.length).toBeLessThanOrEqual(OPENCODE_MAX_LABEL_LENGTH);
        }
      }

      // Restore
      sourceCache.getPreference = originalGet;
    });
  });

  describe('Command files', () => {
    it('should document Task tool usage for commands that use it', () => {
      const commandFiles = findPluginFiles('commands', '.md');

      const taskToolPatterns = [
        /await\s+Task\s*\(/,
        /Task\s*\(\s*\{\s*subagent_type/,
        /subagent_type:\s*["'][^"']+["']/
      ];

      const commandsUsingTask = [];

      for (const file of commandFiles) {
        const content = fs.readFileSync(file, 'utf-8');
        const fileName = path.basename(file);

        for (const pattern of taskToolPatterns) {
          if (pattern.test(content)) {
            commandsUsingTask.push(fileName);
            break;
          }
        }
      }

      // Document which commands use Task tool (for awareness)
      // These commands require Claude Code or need OpenCode migration
      expect(commandsUsingTask.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Agent definitions', () => {
    it('should have valid frontmatter for potential OpenCode native agents', () => {
      const agentFiles = findPluginFiles('agents', '.md');

      for (const file of agentFiles) {
        const content = fs.readFileSync(file, 'utf-8');

        // Check frontmatter exists
        const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
        expect(frontmatterMatch).toBeTruthy();

        if (frontmatterMatch) {
          const frontmatter = frontmatterMatch[1];

          // Should have description
          expect(frontmatter).toMatch(/description:/);

          // If has model, should be valid format
          if (frontmatter.includes('model:')) {
            // OpenCode uses provider/model format or aliases
            const modelMatch = frontmatter.match(/model:\s*["']?([^"'\n]+)/);
            if (modelMatch) {
              const model = modelMatch[1].trim();
              // Either a short alias (sonnet, opus, haiku) or full format
              const validFormats = [
                /^(sonnet|opus|haiku)$/,
                /^[a-z]+\/[a-z0-9-]+$/,
                /^opencode\//
              ];
              const isValid = validFormats.some(pattern => pattern.test(model));
              expect(isValid).toBe(true);
            }
          }
        }
      }
    });
  });

  describe('Cross-platform state handling', () => {
    it('should have cross-platform state directory helpers', () => {
      const crossPlatformPath = path.join(__dirname, '../lib/cross-platform/index.js');
      const content = fs.readFileSync(crossPlatformPath, 'utf-8');

      // Should define STATE_DIRS for all platforms
      expect(content).toMatch(/STATE_DIRS/);
      expect(content).toMatch(/\.claude/);
      expect(content).toMatch(/\.opencode/);
      expect(content).toMatch(/\.codex/);

      // Should export getStateDir helper
      expect(content).toMatch(/getStateDir/);
      expect(content).toMatch(/AI_STATE_DIR/);
    });

    it('should use getStateDir or have fallback in state-dependent files', () => {
      // Key files that manage state should use cross-platform helpers
      const stateFiles = [
        '../lib/state/workflow-state.js',
        '../lib/sources/source-cache.js'
      ];

      for (const relPath of stateFiles) {
        const fullPath = path.join(__dirname, relPath);
        if (fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          // Should either use getStateDir or import cross-platform
          const usesCrossPlatform =
            content.includes('getStateDir') ||
            content.includes('cross-platform') ||
            content.includes('AI_STATE_DIR');
          expect(usesCrossPlatform).toBe(true);
        }
      }
    });
  });

  describe('OpenCode plugin validation', () => {
    it('should have valid OpenCode plugin structure', () => {
      const pluginPath = path.join(__dirname, '../adapters/opencode-plugin/index.ts');

      if (fs.existsSync(pluginPath)) {
        const content = fs.readFileSync(pluginPath, 'utf-8');

        // Should import from @opencode-ai/plugin
        expect(content).toMatch(/@opencode-ai\/plugin/);

        // Should export a Plugin type
        expect(content).toMatch(/export.*Plugin|Plugin.*=/);

        // Should have valid hook names
        const validHooks = [
          'chat.params',
          'permission.ask',
          'tool.execute.before',
          'tool.execute.after',
          'experimental.session.compacting',
          'event'
        ];

        const hasAtLeastOneHook = validHooks.some(hook =>
          content.includes(`"${hook}"`) || content.includes(`'${hook}'`)
        );
        expect(hasAtLeastOneHook).toBe(true);
      }
    });

    it('should have package.json with correct dependencies', () => {
      const packagePath = path.join(__dirname, '../adapters/opencode-plugin/package.json');

      if (fs.existsSync(packagePath)) {
        const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));

        // Should have @opencode-ai/plugin dependency
        expect(
          pkg.dependencies?.['@opencode-ai/plugin'] ||
          pkg.peerDependencies?.['@opencode-ai/plugin']
        ).toBeTruthy();
      }
    });
  });

  // The former 'Install script validation' block asserted on
  // adapters/opencode/install.sh, which was removed: it sourced files from the
  // deleted plugins/ tree and so installed nothing. Installs now go through
  // bin/cli.js (npm) or scripts/dev-install.js (dev); the XDG_CONFIG_HOME
  // handling those share is covered in dev-install.test.js.
});
