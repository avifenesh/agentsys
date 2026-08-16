#!/usr/bin/env node
/**
 * Generate Platform Adapters from Canonical Plugin Definitions
 *
 * Reads plugin source files and generates adapter files for OpenCode and
 * Codex platforms. The generated files are committed to the repo so that
 * install scripts can reference pre-built adapters instead of transforming
 * at install time.
 *
 * Usage:
 *   node scripts/gen-adapters.js           Write generated adapter files
 *   node scripts/gen-adapters.js --check   Validate freshness (exit 1 if stale)
 *   node scripts/gen-adapters.js --dry-run Show what would change without writing
 *
 * Exit codes:
 *   0 - Success (or up-to-date in --check mode)
 *   1 - Stale adapters detected (--check mode) or write error
 *
 * @author Avi Fenesh
 * @license MIT
 */

const fs = require('fs');
const path = require('path');
const discovery = require(path.join(__dirname, '..', 'lib', 'discovery'));
const transforms = require(path.join(__dirname, '..', 'lib', 'adapter-transforms'));

const ROOT_DIR = path.join(__dirname, '..');
const ADAPTERS_DIR = path.join(ROOT_DIR, 'adapters');



// Codex uses a placeholder since it doesn't have runtime PLUGIN_ROOT
const CODEX_PLUGIN_ROOT_PLACEHOLDER = '{{PLUGIN_INSTALL_PATH}}';

// Normalize path separators to forward slashes for cross-platform consistency
function normalizePath(p) {
  return p.replace(/\\/g, '/');
}

function computeAdapters() {
  discovery.invalidateCache();

  const files = new Map();

  const plugins = discovery.discoverPlugins(ROOT_DIR);
  const commandMappings = discovery.getCommandMappings(ROOT_DIR);
  const codexSkillMappings = discovery.getCodexSkillMappings(ROOT_DIR);

  for (const [target, plugin, source] of commandMappings) {
    const srcPath = path.join(ROOT_DIR, 'plugins', plugin, 'commands', source);
    if (!fs.existsSync(srcPath)) continue;

    let content = fs.readFileSync(srcPath, 'utf8');
    content = transforms.transformBodyForOpenCode(content, ROOT_DIR);
    content = transforms.transformCommandFrontmatterForOpenCode(content);

    const relPath = normalizePath(path.join('adapters', 'opencode', 'commands', target));
    files.set(relPath, content);
  }

  for (const pluginName of plugins) {
    const srcAgentsDir = path.join(ROOT_DIR, 'plugins', pluginName, 'agents');
    if (!fs.existsSync(srcAgentsDir)) continue;

    const agentFiles = fs.readdirSync(srcAgentsDir).filter(f => f.endsWith('.md'));
    for (const agentFile of agentFiles) {
      const srcPath = path.join(srcAgentsDir, agentFile);
      let content = fs.readFileSync(srcPath, 'utf8');

      content = transforms.transformBodyForOpenCode(content, ROOT_DIR);
      content = transforms.transformAgentFrontmatterForOpenCode(content, { stripModels: true });

      const relPath = normalizePath(path.join('adapters', 'opencode', 'agents', agentFile));
      files.set(relPath, content);
    }
  }

  for (const pluginName of plugins) {
    const srcSkillsDir = path.join(ROOT_DIR, 'plugins', pluginName, 'skills');
    if (!fs.existsSync(srcSkillsDir)) continue;

    const skillDirs = fs.readdirSync(srcSkillsDir, { withFileTypes: true })
      .filter(d => d.isDirectory());
    for (const skillDir of skillDirs) {
      const skillName = skillDir.name;
      const srcSkillPath = path.join(srcSkillsDir, skillName, 'SKILL.md');
      if (!fs.existsSync(srcSkillPath)) continue;

      let content = fs.readFileSync(srcSkillPath, 'utf8');
      content = transforms.transformSkillBodyForOpenCode(content, ROOT_DIR);

      const relPath = normalizePath(path.join('adapters', 'opencode', 'skills', skillName, 'SKILL.md'));
      files.set(relPath, content);
    }
  }

  const emptyDescSkills = [];
  for (const [skillName, plugin, sourceFile, description] of codexSkillMappings) {
    if (!description) {
      emptyDescSkills.push(skillName);
    }
    const srcPath = path.join(ROOT_DIR, 'plugins', plugin, 'commands', sourceFile);
    if (!fs.existsSync(srcPath)) continue;

    let content = fs.readFileSync(srcPath, 'utf8');
    content = transforms.transformForCodex(content, {
      skillName,
      description,
      pluginInstallPath: CODEX_PLUGIN_ROOT_PLACEHOLDER
    });

    const relPath = normalizePath(path.join('adapters', 'codex', 'skills', skillName, 'SKILL.md'));
    files.set(relPath, content);
  }

  if (emptyDescSkills.length > 0) {
    console.error(`[ERROR] Codex skills with empty description: ${emptyDescSkills.join(', ')}`);
    console.error('  Add a description (or codex-description) to the source command frontmatter.');
    process.exit(1);
  }

  // --- Kiro adapters (disabled - Kiro adapter generation removed) ---
  const KIRO_PLUGIN_ROOT_PLACEHOLDER = '{{PLUGIN_INSTALL_PATH}}';

  // Kiro steering files (from commands)
  const kiroSteeringMappings = typeof discovery.getKiroSteeringMappings === 'function'
    ? discovery.getKiroSteeringMappings(ROOT_DIR)
    : [];
  for (const [steeringName, plugin, sourceFile, description] of kiroSteeringMappings) {
    const srcPath = path.join(ROOT_DIR, 'plugins', plugin, 'commands', sourceFile);
    if (!fs.existsSync(srcPath)) continue;

    let content = fs.readFileSync(srcPath, 'utf8');
    content = transforms.transformCommandForKiro(content, {
      pluginInstallPath: KIRO_PLUGIN_ROOT_PLACEHOLDER,
      name: steeringName,
      description
    });

    const relPath = normalizePath(path.join('adapters', 'kiro', 'steering', `${steeringName}.md`));
    files.set(relPath, content);
  }

  // Kiro agents (JSON)
  for (const pluginName of plugins) {
    const srcAgentsDir = path.join(ROOT_DIR, 'plugins', pluginName, 'agents');
    if (!fs.existsSync(srcAgentsDir)) continue;

    const agentFiles = fs.readdirSync(srcAgentsDir).filter(f => f.endsWith('.md'));
    for (const agentFile of agentFiles) {
      const srcPath = path.join(srcAgentsDir, agentFile);
      let content = fs.readFileSync(srcPath, 'utf8');

      const jsonContent = transforms.transformAgentForKiro(content, {
        pluginInstallPath: KIRO_PLUGIN_ROOT_PLACEHOLDER
      });

      const agentName = agentFile.replace(/\.md$/, '');
      const relPath = normalizePath(path.join('adapters', 'kiro', 'agents', `${agentName}.json`));
      files.set(relPath, jsonContent);
    }
  }

  // Kiro skills
  for (const pluginName of plugins) {
    const srcSkillsDir = path.join(ROOT_DIR, 'plugins', pluginName, 'skills');
    if (!fs.existsSync(srcSkillsDir)) continue;

    const skillDirs = fs.readdirSync(srcSkillsDir, { withFileTypes: true })
      .filter(d => d.isDirectory());
    for (const skillDir of skillDirs) {
      const skillName = skillDir.name;
      const srcSkillPath = path.join(srcSkillsDir, skillName, 'SKILL.md');
      if (!fs.existsSync(srcSkillPath)) continue;

      let content = fs.readFileSync(srcSkillPath, 'utf8');
      content = transforms.transformSkillForKiro(content, {
        pluginInstallPath: KIRO_PLUGIN_ROOT_PLACEHOLDER
      });

      const relPath = normalizePath(path.join('adapters', 'kiro', 'skills', skillName, 'SKILL.md'));
      files.set(relPath, content);
    }
  }

  const staleFiles = [];
  for (const [relPath, newContent] of files) {
    const absPath = path.resolve(ROOT_DIR, relPath);
    if (!absPath.startsWith(path.join(ROOT_DIR, 'adapters'))) {
      throw new Error('Path traversal detected: ' + relPath);
    }
    if (!fs.existsSync(absPath)) {
      staleFiles.push(relPath);
      continue;
    }
    const current = fs.readFileSync(absPath, 'utf8');
    if (current !== newContent) {
      staleFiles.push(relPath);
    }
  }

  // Check for orphaned adapter files
  const orphanedFiles = findOrphanedAdapters(files);

  return { files, staleFiles, orphanedFiles };
}

/**
 * Find orphaned adapter files that exist on disk but have no corresponding source
 * @param {Map<string, string>} generatedFiles - Map of generated file paths
 * @returns {string[]} Array of relative paths to orphaned files
 */
function findOrphanedAdapters(generatedFiles) {
  const orphans = [];
  // Hand-maintained files that should not be treated as orphans
  const EXCLUDED_FILES = new Set(['README.md']);

  function scanDirectory(dir, relativeBase) {
    if (!fs.existsSync(dir)) return;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const absPath = path.join(dir, entry.name);
      const relPath = normalizePath(path.join(relativeBase, entry.name));

      if (entry.isDirectory()) {
        scanDirectory(absPath, relPath);
      } else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.json')) && !EXCLUDED_FILES.has(entry.name)) {
        if (!generatedFiles.has(relPath)) {
          orphans.push(relPath);
        }
      }
    }
  }

  // Scan opencode/, codex/, and kiro/ subdirectories
  for (const subdir of ['opencode', 'codex', 'kiro']) {
    const dir = path.join(ADAPTERS_DIR, subdir);
    const relativeBase = normalizePath(path.join('adapters', subdir));
    scanDirectory(dir, relativeBase);
  }

  return orphans;
}

function main(args) {
  args = args || [];
  const checkMode = args.includes('--check');
  const dryRun = args.includes('--dry-run');

  const { files, staleFiles, orphanedFiles } = computeAdapters();

  if (checkMode) {
    const hasStale = staleFiles.length > 0;
    const hasOrphans = orphanedFiles.length > 0;

    if (hasStale) {
      console.log(`[ERROR] Stale adapters detected in ${staleFiles.length} file(s):`);
      for (const f of staleFiles) {
        console.log(`  - ${f}`);
      }
    }

    if (hasOrphans) {
      console.log(`[ERROR] Orphaned adapter files detected in ${orphanedFiles.length} file(s):`);
      for (const f of orphanedFiles) {
        console.log(`  - ${f}`);
      }
    }

    if (hasStale || hasOrphans) {
      console.log('\nRun: node scripts/gen-adapters.js');
      return 1;
    }
    return 0;
  }

  if (!dryRun) {
    console.log(`[OK] Generating adapters: ${files.size} files across OpenCode, Codex, and Kiro`);
  }

  const changedFiles = [];

  for (const [relPath, content] of files) {
    const absPath = path.resolve(ROOT_DIR, relPath);
    if (!absPath.startsWith(path.join(ROOT_DIR, 'adapters'))) {
      throw new Error('Path traversal detected: ' + relPath);
    }
    const dir = path.dirname(absPath);

    // Check if file needs updating
    let needsUpdate = true;
    if (fs.existsSync(absPath)) {
      const current = fs.readFileSync(absPath, 'utf8');
      if (current === content) {
        needsUpdate = false;
      }
    }

    if (needsUpdate) {
      changedFiles.push(relPath);

      if (dryRun) {
        console.log(`[CHANGE] Would write: ${relPath}`);
      } else {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(absPath, content, 'utf8');
      }
    }
  }

  // Handle orphaned files
  const deletedFiles = [];
  for (const relPath of orphanedFiles) {
    const absPath = path.resolve(ROOT_DIR, relPath);
    if (!absPath.startsWith(path.join(ROOT_DIR, 'adapters'))) {
      throw new Error('Path traversal detected: ' + relPath);
    }

    deletedFiles.push(relPath);

    if (dryRun) {
      console.log(`[DELETE] Would delete orphan: ${relPath}`);
    } else {
      fs.unlinkSync(absPath);
    }
  }

  if (!dryRun) {
    if (changedFiles.length > 0) {
      console.log(`[OK] ${changedFiles.length} file(s) updated`);
      for (const f of changedFiles) {
        console.log(`  - ${f}`);
      }
    }
    if (deletedFiles.length > 0) {
      console.log(`[OK] ${deletedFiles.length} orphaned file(s) deleted`);
      for (const f of deletedFiles) {
        console.log(`  - ${f}`);
      }
    }
    if (changedFiles.length === 0 && deletedFiles.length === 0) {
      console.log('[OK] All adapters up to date');
    }
  }

  return {
    changed: changedFiles.length > 0 || deletedFiles.length > 0,
    files: changedFiles,
    deleted: deletedFiles
  };
}

function checkFreshness() {
  const { staleFiles, orphanedFiles } = computeAdapters();

  if (staleFiles.length === 0 && orphanedFiles.length === 0) {
    return {
      status: 'fresh',
      message: 'All generated adapters are up to date',
      staleFiles: [],
      orphanedFiles: []
    };
  }

  const totalIssues = staleFiles.length + orphanedFiles.length;
  return {
    status: 'stale',
    message: `${staleFiles.length} adapter file(s) are stale, ${orphanedFiles.length} orphaned`,
    staleFiles,
    orphanedFiles
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const result = main(args);

  // In --check mode, main returns an exit code number
  if (typeof result === 'number') {
    process.exit(result);
  }
}

module.exports = { main, checkFreshness, computeAdapters, findOrphanedAdapters };
