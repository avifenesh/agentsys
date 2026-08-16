#!/usr/bin/env node
/**
 * Development installer for AgentSys
 *
 * Installs the current local version to all tools at once for quick testing.
 * Use this during development to test changes before publishing.
 *
 * Usage:
 *   node scripts/dev-install.js           # Install to all tools (Claude, OpenCode, Codex)
 *   node scripts/dev-install.js claude    # Install to Claude only
 *   node scripts/dev-install.js opencode  # Install to OpenCode only
 *   node scripts/dev-install.js codex     # Install to Codex only
 *   node scripts/dev-install.js --clean   # Remove all installations first
 *
 * This script:
 *   - Uses local source files (not npm package)
 *   - Installs Claude in development mode (bypasses marketplace)
 *   - Strips models from OpenCode agents (default)
 *   - Runs synchronously for quick feedback
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Source directory is the project root
const SOURCE_DIR = path.join(__dirname, '..');
const VERSION = require(path.join(SOURCE_DIR, 'package.json')).version;
const discovery = require(path.join(SOURCE_DIR, 'lib', 'discovery'));
const transforms = require(path.join(SOURCE_DIR, 'lib', 'adapter-transforms'));
const {
  resolveExecutableForPlatform,
  planShimSpawn,
  shimSpawnOptions,
  WINDOWS_BATCH_SHIM
} = require(path.join(SOURCE_DIR, 'lib', 'utils', 'command-parser'));
const { claudeExecutable } = require(path.join(SOURCE_DIR, 'lib', 'utils', 'claude-executable'));

// Target directories
const HOME = process.env.HOME || process.env.USERPROFILE;
const CLAUDE_PLUGINS_DIR = path.join(HOME, '.claude', 'plugins');

function getOpenCodeConfigDir() {
  const xdgConfigHome = process.env.XDG_CONFIG_HOME;
  if (xdgConfigHome && xdgConfigHome.trim()) {
    return path.join(xdgConfigHome, 'opencode');
  }
  return path.join(HOME, '.config', 'opencode');
}

const OPENCODE_CONFIG_DIR = getOpenCodeConfigDir();
// Legacy path - kept for cleanup of old installations
const LEGACY_OPENCODE_DIR = path.join(HOME, '.opencode');
const CODEX_DIR = path.join(HOME, '.codex');
const AGENTSYS_DIR = path.join(HOME, '.agentsys');

// Discover plugins from filesystem
const PLUGINS = discovery.discoverPlugins(SOURCE_DIR);

// cmd.exe's exit code for a command it could not find or launch.
const CMD_NOT_RECOGNIZED = 9009;

function log(msg) {
  console.log(`[dev-install] ${msg}`);
}

/**
 * Run one external command with an argv list instead of a shell string.
 *
 * A Windows command needs two separate fixes: resolveExecutableForPlatform
 * supplies the extension that execFileSync will not look up itself, and
 * planShimSpawn routes a .cmd or .bat through cmd.exe, since Node has refused to
 * spawn those directly since the CVE-2024-27980 fix. An executable that already
 * carries an extension - what claudeExecutable() returns - passes through the
 * first step untouched. Plugin names reach this from discovery on disk, so they
 * stay argv elements - a shell string would make a directory named `a & b` a
 * second command.
 */
function runCommand(command, args, options = {}) {
  const plan = planShimSpawn(resolveExecutableForPlatform(command), args);
  return execFileSync(plan.file, plan.args, shimSpawnOptions(plan, options));
}

function commandExists(cmd) {
  try {
    runCommand(process.platform === 'win32' ? 'where.exe' : 'which', [cmd], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function cleanAll() {
  log('Cleaning all installations...');

  // Clean Claude plugins (current and pre-rename)
  for (const plugin of PLUGINS) {
    for (const suffix of ['agentsys', 'awesome-slash']) {
      const pluginDir = path.join(CLAUDE_PLUGINS_DIR, `${plugin}@${suffix}`);
      if (fs.existsSync(pluginDir)) {
        fs.rmSync(pluginDir, { recursive: true, force: true });
        log(`  Removed Claude plugin: ${plugin}@${suffix}`);
      }
    }
  }

  // Clean OpenCode (correct XDG path: ~/.config/opencode/)
  // OpenCode expects commands directly in commands/, not a subdirectory
  const opencodeCommandsDir = path.join(OPENCODE_CONFIG_DIR, 'commands');
  const opencodePluginDir = path.join(OPENCODE_CONFIG_DIR, 'plugins');
  const opencodeAgentsDir = path.join(OPENCODE_CONFIG_DIR, 'agents');
  // Note: Skills cleanup not implemented yet - would need skill list similar to agents

  // Discover agent and command filenames from filesystem
  const knownAgents = discovery.discoverAgents(SOURCE_DIR).map(a => a.file);
  const knownCommands = discovery.discoverCommands(SOURCE_DIR).map(c => c.file);

  // Clean commands (remove our files, not the whole directory)
  if (fs.existsSync(opencodeCommandsDir)) {
    let removedCount = 0;
    for (const file of knownCommands) {
      const filePath = path.join(opencodeCommandsDir, file);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        removedCount++;
      }
    }
    // Also clean lib directory we install
    const libDir = path.join(opencodeCommandsDir, 'lib');
    if (fs.existsSync(libDir)) {
      fs.rmSync(libDir, { recursive: true, force: true });
      removedCount++;
    }
    if (removedCount > 0) {
      log(`  Removed ${removedCount} OpenCode commands/lib`);
    }
  }

  // Clean plugin files (current and pre-rename)
  for (const name of ['agentsys.ts', 'awesome-slash.ts']) {
    const pluginFile = path.join(opencodePluginDir, name);
    if (fs.existsSync(pluginFile)) {
      fs.unlinkSync(pluginFile);
      log(`  Removed OpenCode plugin ${name}`);
    }
  }

  // Clean agent files installed by us - only known agentsys agents
  if (fs.existsSync(opencodeAgentsDir)) {
    let removedCount = 0;
    for (const file of knownAgents) {
      const filePath = path.join(opencodeAgentsDir, file);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        removedCount++;
      }
    }
    // Remove legacy agent files from pre-rename installs
    const legacyAgentFiles = ['review.md', 'ship.md', 'workflow.md'];
    for (const legacyFile of legacyAgentFiles) {
      const legacyPath = path.join(opencodeAgentsDir, legacyFile);
      if (fs.existsSync(legacyPath)) {
        fs.unlinkSync(legacyPath);
        removedCount++;
      }
    }
    if (removedCount > 0) {
      log(`  Removed ${removedCount} OpenCode agents`);
    }
  }

  // Clean legacy OpenCode paths (~/.opencode/ - incorrect, pre-XDG)
  // Also clean pre-rename paths (awesome-slash) for users upgrading from v4.x
  const legacyCommandsDir = path.join(LEGACY_OPENCODE_DIR, 'commands', 'agentsys');
  const legacyPluginDir = path.join(LEGACY_OPENCODE_DIR, 'plugins', 'agentsys');
  const preRenameCommandsDir = path.join(LEGACY_OPENCODE_DIR, 'commands', 'awesome-slash');
  const preRenamePluginDir = path.join(LEGACY_OPENCODE_DIR, 'plugins', 'awesome-slash');
  const legacyAgentsDir = path.join(LEGACY_OPENCODE_DIR, 'agents');

  if (fs.existsSync(legacyCommandsDir)) {
    fs.rmSync(legacyCommandsDir, { recursive: true, force: true });
    log('  Removed legacy ~/.opencode/commands/agentsys');
  }
  if (fs.existsSync(legacyPluginDir)) {
    fs.rmSync(legacyPluginDir, { recursive: true, force: true });
    log('  Removed legacy ~/.opencode/plugins/agentsys');
  }
  if (fs.existsSync(preRenameCommandsDir)) {
    fs.rmSync(preRenameCommandsDir, { recursive: true, force: true });
    log('  Removed pre-rename ~/.opencode/commands/awesome-slash');
  }
  if (fs.existsSync(preRenamePluginDir)) {
    fs.rmSync(preRenamePluginDir, { recursive: true, force: true });
    log('  Removed pre-rename ~/.opencode/plugins/awesome-slash');
  }
  if (fs.existsSync(legacyAgentsDir)) {
    let removedCount = 0;
    for (const file of knownAgents) {
      const filePath = path.join(legacyAgentsDir, file);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        removedCount++;
      }
    }
    if (removedCount > 0) {
      log(`  Removed ${removedCount} legacy OpenCode agents from ~/.opencode/`);
    }
  }

  // Clean Codex
  const codexSkillsDir = path.join(CODEX_DIR, 'skills');
  if (fs.existsSync(codexSkillsDir)) {
    const ourSkills = discovery.getCodexSkillMappings(SOURCE_DIR).map(([name]) => name);
    for (const skill of fs.readdirSync(codexSkillsDir)) {
      const skillPath = path.join(codexSkillsDir, skill);
      // Only remove skills we know are ours (discovered from filesystem)
      if (ourSkills.includes(skill)) {
        fs.rmSync(skillPath, { recursive: true, force: true });
        log(`  Removed Codex skill: ${skill}`);
      }
    }
  }

  // Clean Kiro (project-scoped in CWD)
  const cwd = process.cwd();
  const kiroDir = path.join(cwd, '.kiro');
  if (fs.existsSync(kiroDir)) {
    const knownSteeringNames = new Set(discovery.getKiroSteeringMappings(SOURCE_DIR).map(([name]) => `${name}.md`));
    const kiroSteeringDir = path.join(kiroDir, 'steering');
    if (fs.existsSync(kiroSteeringDir)) {
      let removedCount = 0;
      for (const f of fs.readdirSync(kiroSteeringDir).filter(f => f.endsWith('.md'))) {
        if (knownSteeringNames.has(f)) {
          fs.unlinkSync(path.join(kiroSteeringDir, f));
          removedCount++;
        }
      }
      if (removedCount > 0) log(`  Removed ${removedCount} Kiro steering files`);
    }
    const kiroAgentsDir = path.join(kiroDir, 'agents');
    if (fs.existsSync(kiroAgentsDir)) {
      const knownAgentFiles = new Set();
      for (const plugin of PLUGINS) {
        const srcAgentsDir = path.join(SOURCE_DIR, 'plugins', plugin, 'agents');
        if (!fs.existsSync(srcAgentsDir)) continue;
        for (const f of fs.readdirSync(srcAgentsDir).filter(f => f.endsWith('.md'))) {
          knownAgentFiles.add(f.replace(/\.md$/, '.json'));
        }
      }
      let removedCount = 0;
      for (const f of fs.readdirSync(kiroAgentsDir).filter(f => f.endsWith('.json'))) {
        if (knownAgentFiles.has(f)) {
          fs.unlinkSync(path.join(kiroAgentsDir, f));
          removedCount++;
        }
      }
      if (removedCount > 0) log(`  Removed ${removedCount} Kiro agent files`);
    }
    const kiroSkillsDir = path.join(kiroDir, 'skills');
    if (fs.existsSync(kiroSkillsDir)) {
      const knownSkillNames = new Set();
      for (const plugin of PLUGINS) {
        const srcSkillsDir = path.join(SOURCE_DIR, 'plugins', plugin, 'skills');
        if (!fs.existsSync(srcSkillsDir)) continue;
        for (const d of fs.readdirSync(srcSkillsDir, { withFileTypes: true })) {
          if (d.isDirectory()) knownSkillNames.add(d.name);
        }
      }
      let removedCount = 0;
      for (const entry of fs.readdirSync(kiroSkillsDir, { withFileTypes: true })) {
        if (entry.isDirectory() && knownSkillNames.has(entry.name)) {
          fs.rmSync(path.join(kiroSkillsDir, entry.name), { recursive: true, force: true });
          removedCount++;
        }
      }
      if (removedCount > 0) log(`  Removed ${removedCount} Kiro skill dirs`);
    }
  }

  // Clean ~/.agentsys
  if (fs.existsSync(AGENTSYS_DIR)) {
    fs.rmSync(AGENTSYS_DIR, { recursive: true, force: true });
    log('  Removed ~/.agentsys');
  }

  log('Clean complete.');
}

function installClaude() {
  log('Installing for Claude Code (development mode)...');

  if (!commandExists('claude')) {
    log('  [SKIP] Claude CLI not found');
    return false;
  }

  // Ask where.exe which claude this is instead of assuming a suffix: the npm
  // global install ships claude.cmd and the native installer ships claude.exe.
  const claudeBin = claudeExecutable();

  // A .cmd claude is launched through cmd.exe rather than directly, so the two
  // failure shapes below differ by which process is the one that fails.
  const viaCmdShim = process.platform === 'win32' && WINDOWS_BATCH_SHIM.test(claudeBin);

  // The removals below are best-effort - a marketplace that was never added and
  // a plugin that was never installed both exit non-zero, and that is fine. A
  // claude that could not be started at all is not: it would make every removal
  // a silent no-op, so say so once.
  let spawnFailureReported = false;
  const reportIfNeverRan = (err) => {
    // execFileSync sets a numeric status when the child ran and exited non-zero;
    // a spawn failure leaves status null and carries the errno code instead. That
    // alone misses the shim host: there the child is cmd.exe, which starts fine
    // and reports a shim it could not launch as exit 9009, its code for "not
    // recognized as an internal or external command".
    const neverRan = typeof err.status !== 'number'
      || (viaCmdShim && err.status === CMD_NOT_RECOGNIZED);
    if (!neverRan || spawnFailureReported) return;
    spawnFailureReported = true;
    const reason = err.code || (typeof err.status === 'number' ? `exit ${err.status}` : err.message);
    log(`  [WARN] Could not run ${claudeBin} (${reason}); leaving any marketplace or installed plugins in place`);
  };

  // Remove marketplace plugins first
  try {
    runCommand(claudeBin, ['plugin', 'marketplace', 'remove', 'agent-sh/agentsys'], { stdio: 'pipe' });
    log('  Removed marketplace');
  } catch (err) {
    reportIfNeverRan(err);
  }

  for (const plugin of PLUGINS) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(plugin)) continue;
    // Uninstall both current and pre-rename plugin IDs
    for (const suffix of ['agentsys', 'awesome-slash']) {
      try {
        runCommand(claudeBin, ['plugin', 'uninstall', `${plugin}@${suffix}`], { stdio: 'pipe' });
      } catch (err) {
        reportIfNeverRan(err);
      }
    }
  }

  // Create plugins directory
  fs.mkdirSync(CLAUDE_PLUGINS_DIR, { recursive: true });

  // Copy each plugin directly from source
  const installedPlugins = {};
  for (const plugin of PLUGINS) {
    const srcDir = path.join(SOURCE_DIR, 'plugins', plugin);
    const destDir = path.join(CLAUDE_PLUGINS_DIR, `${plugin}@agentsys`);

    if (fs.existsSync(srcDir)) {
      if (fs.existsSync(destDir)) {
        fs.rmSync(destDir, { recursive: true, force: true });
      }

      fs.cpSync(srcDir, destDir, {
        recursive: true,
        filter: (src) => {
          const basename = path.basename(src);
          return basename !== 'node_modules' && basename !== '.git';
        }
      });

      // Register the plugin
      installedPlugins[`${plugin}@agentsys`] = {
        source: 'local',
        installedAt: new Date().toISOString()
      };
      log(`  [OK] ${plugin}`);
    }
  }

  // Write installed_plugins.json
  const installedPluginsPath = path.join(CLAUDE_PLUGINS_DIR, 'installed_plugins.json');
  fs.writeFileSync(installedPluginsPath, JSON.stringify({
    version: 2,
    plugins: installedPlugins
  }, null, 2));

  // Enable plugins in settings.json
  const settingsPath = path.join(HOME, '.claude', 'settings.json');
  if (fs.existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      settings.enabledPlugins = settings.enabledPlugins || {};
      for (const plugin of PLUGINS) {
        // Remove pre-rename entries and add current ones
        delete settings.enabledPlugins[`${plugin}@awesome-slash`];
        settings.enabledPlugins[`${plugin}@agentsys`] = true;
      }
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      log('  [OK] Enabled in settings.json');
    } catch (e) {
      log(`  [WARN] Could not update settings.json: ${e.message}`);
    }
  }

  log('Claude installation complete.');
  return true;
}

function installOpenCode() {
  log('Installing for OpenCode...');

  // Create directories in correct XDG location (~/.config/opencode/)
  // OpenCode expects commands directly in commands/, not a subdirectory
  const commandsDir = path.join(OPENCODE_CONFIG_DIR, 'commands');
  const pluginDir = path.join(OPENCODE_CONFIG_DIR, 'plugins');
  const agentsDir = path.join(OPENCODE_CONFIG_DIR, 'agents');

  fs.mkdirSync(commandsDir, { recursive: true });
  fs.mkdirSync(pluginDir, { recursive: true });
  fs.mkdirSync(agentsDir, { recursive: true });

  // Clean up legacy paths (~/.opencode/) if they exist
  const legacyCommandsDir = path.join(LEGACY_OPENCODE_DIR, 'commands', 'agentsys');
  const legacyPluginDir = path.join(LEGACY_OPENCODE_DIR, 'plugins', 'agentsys');
  if (fs.existsSync(legacyCommandsDir)) {
    fs.rmSync(legacyCommandsDir, { recursive: true, force: true });
    log('  Cleaned up legacy ~/.opencode/commands/agentsys');
  }
  if (fs.existsSync(legacyPluginDir)) {
    fs.rmSync(legacyPluginDir, { recursive: true, force: true });
    log('  Cleaned up legacy ~/.opencode/plugins/agentsys');
  }

  // Copy to ~/.agentsys first (OpenCode needs local files)
  copyToAgentSys();

  // Copy native plugin (OpenCode expects plugins as single .ts files in ~/.config/opencode/plugins/)
  const pluginSrcDir = path.join(SOURCE_DIR, 'adapters', 'opencode-plugin');
  if (fs.existsSync(pluginSrcDir)) {
    const srcPath = path.join(pluginSrcDir, 'index.ts');
    const destPath = path.join(pluginDir, 'agentsys.ts');
    // Remove legacy plugin file from pre-rename installs to prevent dual loading
    const legacyPluginFile = path.join(pluginDir, 'awesome-slash.ts');
    if (fs.existsSync(legacyPluginFile)) {
      fs.unlinkSync(legacyPluginFile);
    }
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, destPath);
      log('  [OK] Native plugin');
    }
  }

  // Discover command mappings from filesystem
  const commandMappings = discovery.getCommandMappings(SOURCE_DIR);

  for (const [target, plugin, source] of commandMappings) {
    const srcPath = path.join(SOURCE_DIR, 'plugins', plugin, 'commands', source);
    const destPath = path.join(commandsDir, target);
    if (fs.existsSync(srcPath)) {
      let content = fs.readFileSync(srcPath, 'utf8');
      content = transforms.transformBodyForOpenCode(content, SOURCE_DIR);
      content = transforms.transformCommandFrontmatterForOpenCode(content);
      fs.writeFileSync(destPath, content);
    }
  }
  log('  [OK] Commands');

  // Copy agents (strip models by default, use full body transform)
  let agentCount = 0;
  for (const plugin of PLUGINS) {
    const srcAgentsDir = path.join(SOURCE_DIR, 'plugins', plugin, 'agents');
    if (fs.existsSync(srcAgentsDir)) {
      const agentFiles = fs.readdirSync(srcAgentsDir).filter(f => f.endsWith('.md'));
      for (const agentFile of agentFiles) {
        const srcPath = path.join(srcAgentsDir, agentFile);
        const destPath = path.join(agentsDir, agentFile);
        let content = fs.readFileSync(srcPath, 'utf8');

        content = transforms.transformBodyForOpenCode(content, SOURCE_DIR);
        content = transforms.transformAgentFrontmatterForOpenCode(content, { stripModels: true });

        fs.writeFileSync(destPath, content);
        agentCount++;
      }
    }
  }
  log(`  [OK] ${agentCount} agents`);
  log('OpenCode installation complete.');
  return true;
}

function installCodex() {
  log('Installing for Codex CLI...');

  const configDir = CODEX_DIR;
  const skillsDir = path.join(configDir, 'skills');

  fs.mkdirSync(configDir, { recursive: true });
  fs.mkdirSync(skillsDir, { recursive: true });

  // Copy to ~/.agentsys first
  copyToAgentSys();

  // Discover skill mappings from filesystem (descriptions from codex-description frontmatter)
  const skillMappings = discovery.getCodexSkillMappings(SOURCE_DIR);

  for (const [skillName, plugin, sourceFile, description] of skillMappings) {
    const srcPath = path.join(SOURCE_DIR, 'plugins', plugin, 'commands', sourceFile);
    const skillDir = path.join(skillsDir, skillName);
    const destPath = path.join(skillDir, 'SKILL.md');

    if (fs.existsSync(srcPath)) {
      if (fs.existsSync(skillDir)) {
        fs.rmSync(skillDir, { recursive: true, force: true });
      }
      fs.mkdirSync(skillDir, { recursive: true });

      let content = fs.readFileSync(srcPath, 'utf8');
      const pluginInstallPath = path.join(AGENTSYS_DIR, 'plugins', plugin);
      content = transforms.transformForCodex(content, {
        skillName,
        description,
        pluginInstallPath
      });

      fs.writeFileSync(destPath, content);
      log(`  [OK] ${skillName}`);
    }
  }

  log('Codex installation complete.');
  return true;
}

function installKiro() {
  log('Installing for Kiro...');

  const cwd = process.cwd();
  const skillsDir = path.join(cwd, '.kiro', 'skills');
  const steeringDir = path.join(cwd, '.kiro', 'steering');
  const agentsDir = path.join(cwd, '.kiro', 'agents');

  fs.mkdirSync(skillsDir, { recursive: true });
  fs.mkdirSync(steeringDir, { recursive: true });
  fs.mkdirSync(agentsDir, { recursive: true });

  // Copy to ~/.agentsys first (Kiro needs local files for transforms)
  copyToAgentSys();

  // Install skills
  let skillCount = 0;
  for (const plugin of PLUGINS) {
    const srcSkillsDir = path.join(SOURCE_DIR, 'plugins', plugin, 'skills');
    if (!fs.existsSync(srcSkillsDir)) continue;
    const entries = fs.readdirSync(srcSkillsDir, { withFileTypes: true }).filter(d => d.isDirectory());
    for (const entry of entries) {
      if (!/^[a-zA-Z0-9_-]+$/.test(entry.name)) continue;
      const srcPath = path.join(srcSkillsDir, entry.name, 'SKILL.md');
      if (!fs.existsSync(srcPath)) continue;
      const destDir = path.join(skillsDir, entry.name);
      fs.mkdirSync(destDir, { recursive: true });
      let content = fs.readFileSync(srcPath, 'utf8');
      content = transforms.transformSkillForKiro(content, {
        pluginInstallPath: path.join(AGENTSYS_DIR, 'plugins', plugin)
      });
      fs.writeFileSync(path.join(destDir, 'SKILL.md'), content);
      skillCount++;
    }
  }
  log(`  [OK] ${skillCount} skills`);

  // Install commands as steering files
  const steeringMappings = discovery.getKiroSteeringMappings(SOURCE_DIR);
  let steeringCount = 0;
  for (const [steeringName, plugin, sourceFile, description] of steeringMappings) {
    const srcPath = path.join(SOURCE_DIR, 'plugins', plugin, 'commands', sourceFile);
    if (!fs.existsSync(srcPath)) continue;
    let content = fs.readFileSync(srcPath, 'utf8');
    content = transforms.transformCommandForKiro(content, {
      pluginInstallPath: path.join(AGENTSYS_DIR, 'plugins', plugin),
      name: steeringName,
      description
    });
    fs.writeFileSync(path.join(steeringDir, `${steeringName}.md`), content);
    steeringCount++;
  }
  log(`  [OK] ${steeringCount} steering files`);

  // Install agents as JSON
  let agentCount = 0;
  for (const plugin of PLUGINS) {
    const srcAgentsDir = path.join(SOURCE_DIR, 'plugins', plugin, 'agents');
    if (!fs.existsSync(srcAgentsDir)) continue;
    const agentFiles = fs.readdirSync(srcAgentsDir).filter(f => f.endsWith('.md'));
    for (const agentFile of agentFiles) {
      const agentName = agentFile.replace(/\.md$/, '');
      const srcPath = path.join(srcAgentsDir, agentFile);
      let content = fs.readFileSync(srcPath, 'utf8');
      const jsonContent = transforms.transformAgentForKiro(content, {
        pluginInstallPath: path.join(AGENTSYS_DIR, 'plugins', plugin)
      });
      fs.writeFileSync(path.join(agentsDir, `${agentName}.json`), jsonContent);
      agentCount++;
    }
  }
  log(`  [OK] ${agentCount} agents`);

  log('Kiro installation complete.');
  return true;
}

let agentSysCopied = false;
function copyToAgentSys() {
  if (agentSysCopied) return;

  log('Copying to ~/.agentsys...');

  if (fs.existsSync(AGENTSYS_DIR)) {
    fs.rmSync(AGENTSYS_DIR, { recursive: true, force: true });
  }

  fs.cpSync(SOURCE_DIR, AGENTSYS_DIR, {
    recursive: true,
    filter: (src) => {
      const basename = path.basename(src);
      return basename !== 'node_modules' && basename !== '.git';
    }
  });

  // Install dependencies
  log('  Installing dependencies...');
  runCommand('npm', ['install', '--production'], { cwd: AGENTSYS_DIR, stdio: 'pipe' });

  agentSysCopied = true;
  log('  [OK] ~/.agentsys');
}

function main() {
  const args = process.argv.slice(2);

  console.log(`\n[dev-install] agentsys v${VERSION}\n`);

  // Handle --clean flag
  if (args.includes('--clean')) {
    cleanAll();
    console.log();
    return;
  }

  // Determine which tools to install
  const validTools = ['claude', 'opencode', 'codex', 'kiro'];
  let tools = args.filter(a => validTools.includes(a.toLowerCase())).map(a => a.toLowerCase());

  if (tools.length === 0) {
    // Default: install to all tools
    tools = validTools;
  }

  log(`Installing to: ${tools.join(', ')}\n`);

  const results = {};

  for (const tool of tools) {
    switch (tool) {
      case 'claude':
        results.claude = installClaude();
        break;
      case 'opencode':
        results.opencode = installOpenCode();
        break;
      case 'codex':
        results.codex = installCodex();
        break;
      case 'kiro':
        results.kiro = installKiro();
        break;
    }
    console.log();
  }

  // Summary
  console.log('─'.repeat(50));
  log('Summary:');
  for (const [tool, success] of Object.entries(results)) {
    log(`  ${tool}: ${success ? '[OK]' : '[SKIP]'}`);
  }
  console.log();
  log('To clean all: node scripts/dev-install.js --clean');
  log('To revert Claude to marketplace: agentsys --tool claude');
  console.log();
}

if (require.main === module) {
  main();
}

module.exports = { main, runCommand, commandExists, installClaude };
