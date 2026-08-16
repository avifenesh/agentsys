#!/usr/bin/env node
/**
 * AgentSys CLI installer
 *
 * Install:  npm install -g agentsys@latest
 * Run:      agentsys
 * Update:   npm update -g agentsys
 * Remove:   npm uninstall -g agentsys && agentsys --remove
 */

const { execSync, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const https = require('https');
const { createGunzip } = require('zlib');

const VERSION = require('../package.json').version;
// Use the installed npm package directory as source (no git clone needed)
const PACKAGE_DIR = path.join(__dirname, '..');
const discovery = require('../lib/discovery');
const transforms = require('../lib/adapter-transforms');
const { planShimSpawn, shimSpawnOptions, WINDOWS_BATCH_SHIM } = require('../lib/utils/command-parser');
const { claudeExecutable } = require('../lib/utils/claude-executable');

// Valid tool names
const VALID_TOOLS = ['claude', 'opencode', 'codex', 'cursor', 'kiro'];

function getInstallDir() {
  const home = process.env.HOME || process.env.USERPROFILE;
  return path.join(home, '.agentsys');
}

function getClaudePluginsDir() {
  const home = process.env.HOME || process.env.USERPROFILE;
  return path.join(home, '.claude', 'plugins');
}

function getOpenCodeConfigDir() {
  const home = process.env.HOME || process.env.USERPROFILE;
  const xdgConfigHome = process.env.XDG_CONFIG_HOME;
  if (xdgConfigHome && xdgConfigHome.trim()) {
    return path.join(xdgConfigHome, 'opencode');
  }
  return path.join(home, '.config', 'opencode');
}

function getConfigPath(platform) {
  if (platform === 'opencode') {
    return path.join(getOpenCodeConfigDir(), 'opencode.json');
  }
  if (platform === 'codex') {
    const home = process.env.HOME || process.env.USERPROFILE;
    return path.join(home, '.codex', 'config.toml');
  }
  return null;
}

function commandExists(cmd) {
  try {
    execFileSync(process.platform === 'win32' ? 'where.exe' : 'which', [cmd], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// Arguments safe to hand to cmd.exe: no whitespace, no shell metacharacters.
const CMD_SAFE_ARG = /^[A-Za-z0-9@._:\\/+-]+$/;

/**
 * Build the file and argv for one Claude Code invocation.
 *
 * planShimSpawn does the cmd.exe routing a batch shim needs, on win32 only.
 * Every argument is checked against a stricter rule than that quoting requires:
 * callers only ever pass literal subcommands and validated
 * `<plugin>@<marketplace>` ids, so anything carrying whitespace or a shell
 * metacharacter is a bug rather than a string to escape. The platform parameter
 * exists so the win32 path stays testable off Windows.
 */
function claudeSpawnPlan(executable, args, comspec, platform = process.platform) {
  if (platform === 'win32' && WINDOWS_BATCH_SHIM.test(executable)) {
    const unsafe = args.find(arg => !CMD_SAFE_ARG.test(arg));
    if (unsafe !== undefined) {
      throw new Error(`Refusing to pass ${JSON.stringify(unsafe)} to cmd.exe`);
    }
  }
  return planShimSpawn(executable, args, { comspec, platform });
}

/**
 * Run one Claude Code plugin command. Throws like execFileSync.
 */
function claudeSpawn(args, options) {
  const plan = claudeSpawnPlan(claudeExecutable(), args, process.env.comspec);
  return execFileSync(plan.file, plan.args, shimSpawnOptions(plan, options));
}

function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function parseArgs(args) {
  const result = {
    help: false,
    version: false,
    remove: false,
    development: false,
    stripModels: true, // Default: strip models
    tool: null,        // Single tool
    tools: [],         // Multiple tools
    only: [],          // --only flag: selective plugin install
    subcommand: null,  // 'update', 'list', 'install', 'remove', 'search'
    subcommandArg: null, // argument for subcommand (e.g. plugin name)
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else if (arg === '--version' || arg === '-v') {
      result.version = true;
    } else if (arg === '--remove' || arg === '--uninstall') {
      result.remove = true;
    } else if (arg === '--development' || arg === '--dev') {
      result.development = true;
    } else if (arg === '--no-strip' || arg === '-ns') {
      result.stripModels = false;
    } else if (arg === '--strip-models') {
      // Legacy flag, now default behavior
      result.stripModels = true;
    } else if (arg === '--only' && args[i + 1]) {
      const pluginList = args[i + 1].split(',').map(p => p.trim()).filter(Boolean);
      result.only.push(...pluginList);
      i++;
    } else if (arg === '--tool' && args[i + 1]) {
      const tool = args[i + 1].toLowerCase();
      if (VALID_TOOLS.includes(tool)) {
        result.tool = tool;
      } else {
        console.error(`[ERROR] Invalid tool: ${tool}. Valid options: ${VALID_TOOLS.join(', ')}`);
        process.exit(1);
      }
      i++;
    } else if (arg === '--tools' && args[i + 1]) {
      const toolList = args[i + 1].toLowerCase().split(',').map(t => t.trim());
      for (const tool of toolList) {
        if (!VALID_TOOLS.includes(tool)) {
          console.error(`[ERROR] Invalid tool: ${tool}. Valid options: ${VALID_TOOLS.join(', ')}`);
          process.exit(1);
        }
        result.tools.push(tool);
      }
      i++;
    } else if (['update', 'list', 'install', 'remove', 'search'].includes(arg)) {
      result.subcommand = arg;
      // Check for subcommand --help
      if (args[i + 1] && (args[i + 1] === '--help' || args[i + 1] === '-h')) {
        result.subcommandArg = '--help';
        i++;
      // For 'list': accept --all, --agents, --skills, --commands, --hooks, --plugins
      } else if (arg === 'list' && args[i + 1] && ['--all', '--agents', '--skills', '--commands', '--hooks', '--plugins'].includes(args[i + 1])) {
        result.subcommandArg = args[i + 1];
        i++;
      } else if (args[i + 1] && !args[i + 1].startsWith('-')) {
        result.subcommandArg = args[i + 1];
        i++;
      }
    }
  }

  // Environment variable override for strip models (legacy support)
  if (['0', 'false', 'no'].includes((process.env.AGENTSYS_STRIP_MODELS || '').toLowerCase())) {
    result.stripModels = false;
  }

  return result;
}

async function multiSelect(question, options) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log(`\n${question}\n`);
  console.log('Enter numbers separated by spaces (e.g., "1 2" or "1,2,3"), then press Enter:\n');

  options.forEach((opt, i) => {
    console.log(`  ${i + 1}) ${opt.label}`);
  });

  console.log();

  return new Promise((resolve) => {
    rl.question('Your selection: ', (answer) => {
      rl.close();

      // Parse input like "1 2 3" or "1,2,3" or "1, 2, 3"
      const nums = answer.split(/[\s,]+/).map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));

      const result = [];
      for (const num of nums) {
        if (num >= 1 && num <= options.length) {
          result.push(options[num - 1].value);
        }
      }

      resolve([...new Set(result)]); // Dedupe
    });
  });
}

function cleanOldInstallation(installDir) {
  if (fs.existsSync(installDir)) {
    console.log('Removing previous installation...');
    fs.rmSync(installDir, { recursive: true, force: true });
  }
}

function copyFromPackage(installDir) {
  console.log('Installing AgentSys files...');
  // Copy from npm package to ~/.agentsys
  fs.cpSync(PACKAGE_DIR, installDir, {
    recursive: true,
    filter: (src) => {
      // Skip node_modules and .git directories
      const basename = path.basename(src);
      return basename !== 'node_modules' && basename !== '.git';
    }
  });
}

function installDependencies(installDir) {
  console.log('Installing dependencies...');
  execSync('npm install --production', { cwd: installDir, stdio: 'inherit' });
}

// --- External Plugin Fetching ---

function getPluginCacheDir() {
  const home = process.env.HOME || process.env.USERPROFILE;
  return path.join(home, '.agentsys', 'plugins');
}

function loadMarketplace() {
  const marketplacePath = path.join(PACKAGE_DIR, '.claude-plugin', 'marketplace.json');
  if (!fs.existsSync(marketplacePath)) {
    console.error('[ERROR] marketplace.json not found at ' + marketplacePath);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(marketplacePath, 'utf8'));
}

/**
 * Normalize marketplace plugin source entries.
 *
 * Supported formats:
 * - string URL/path (legacy)
 * - object: { source: "url", url: "..." } (current)
 * - object: { source: "path", path: "..." } (local/bundled)
 *
 * @param {string|Object} source
 * @returns {{type: 'remote'|'local', value: string}|null}
 */
function resolvePluginSource(source) {
  if (typeof source === 'string') {
    const value = source.trim();
    if (!value) return null;
    if (value.startsWith('./') || value.startsWith('../')) {
      return { type: 'local', value };
    }
    return { type: 'remote', value };
  }

  if (!source || typeof source !== 'object') return null;

  const sourceType = typeof source.source === 'string' ? source.source.toLowerCase() : null;

  if ((sourceType === 'path' || sourceType === 'local') && typeof source.path === 'string') {
    return { type: 'local', value: source.path };
  }

  if (sourceType === 'url' && typeof source.url === 'string') {
    return { type: 'remote', value: source.url };
  }

  // Backward/forward-compatible fallbacks
  if (typeof source.path === 'string') {
    return { type: 'local', value: source.path };
  }
  if (typeof source.url === 'string') {
    return { type: 'remote', value: source.url };
  }

  return null;
}

/**
 * Backward-compatible helper returning only the source URL/path value.
 *
 * @param {string|Object} source
 * @returns {string|null}
 */
function resolveSourceUrl(source) {
  const normalized = resolvePluginSource(source);
  return normalized ? normalized.value : null;
}

/**
 * Resolve plugin dependencies transitively.
 *
 * Circular dependencies are expected and handled: the `visiting` Set tracks
 * the current DFS path and short-circuits any back-edge (e.g. next-task ->
 * ship -> next-task), adding the already-visited node to `resolved` and
 * returning immediately so the traversal terminates without infinite recursion.
 *
 * @param {string[]} names - Plugin names to resolve
 * @param {Object} marketplace - Parsed marketplace.json
 * @returns {string[]} All required plugin names (deduplicated, topologically ordered)
 */
function resolvePluginDeps(names, marketplace) {
  const pluginMap = {};
  for (const p of marketplace.plugins) {
    pluginMap[p.name] = p;
  }

  // Validate requested names exist
  for (const name of names) {
    if (!pluginMap[name]) {
      console.error(`[ERROR] Unknown plugin: ${name}. Available: ${marketplace.plugins.map(p => p.name).join(', ')}`);
      process.exit(1);
    }
  }

  const resolved = new Set();
  const visiting = new Set();

  function visit(name) {
    if (resolved.has(name)) return;
    if (visiting.has(name)) {
      // Circular dep - just add it and stop recursing
      resolved.add(name);
      return;
    }
    visiting.add(name);

    visiting.delete(name);
    resolved.add(name);
  }

  for (const name of names) {
    visit(name);
  }

  return [...resolved];
}

/**
 * Download a GitHub repo tarball and extract to cache directory.
 *
 * @param {string} name - Plugin name
 * @param {string} source - GitHub source URL (e.g. "github:agent-sh/agentsys-plugin-next-task")
 * @param {string} version - Expected version string
 * @returns {Promise<string>} Path to extracted plugin directory
 */
// TODO(agentsys-security): this local dev installer currently honors only
// `source.url` + `plugin.version` and ignores `source.ref` / `source.commit`
// from marketplace.json. Claude Code's plugin installer (the primary install
// path for end users) DOES honor `ref` and `commit` per the marketplace
// schema, so the pins added by scripts/pin-marketplace.js are authoritative
// for real users. This dev CLI should be updated to prefer `source.commit`
// (then `source.ref`, then `plugin.version`) when resolving the fetch ref,
// so local dev gets the same supply-chain guarantees as production installs.
// Tracked as a follow-up; not fixed in PR #347 to keep that PR scoped.
async function fetchPlugin(name, source, version) {
  const cacheDir = getPluginCacheDir();
  const pluginDir = path.join(cacheDir, name);
  const versionFile = path.join(pluginDir, '.version');

  // Check cache
  if (fs.existsSync(versionFile)) {
    const cached = fs.readFileSync(versionFile, 'utf8').trim();
    if (cached === version) {
      return pluginDir;
    }
  }

  const parsedSource = parseGitHubSource(source, version, name);
  const owner = parsedSource.owner;
  const repo = parsedSource.repo;

  const refCandidates = parsedSource.explicitRef
    ? [parsedSource.ref]
    : [parsedSource.ref, version, 'main', 'master'];

  let lastError = null;
  for (const ref of [...new Set(refCandidates.filter(Boolean))]) {
    const tarballUrl = `https://api.github.com/repos/${owner}/${repo}/tarball/${ref}`;

    try {
      console.log(`  Fetching ${name}@${version} from ${owner}/${repo} (${ref})...`);

      // Clean and recreate
      if (fs.existsSync(pluginDir)) {
        fs.rmSync(pluginDir, { recursive: true, force: true });
      }
      fs.mkdirSync(pluginDir, { recursive: true });

      // Download and extract tarball
      await downloadAndExtractTarball(tarballUrl, pluginDir);

      // Write version marker
      fs.writeFileSync(versionFile, version);
      return pluginDir;
    } catch (err) {
      lastError = err;
      const isNotFound = /HTTP 404/.test(err.message);
      if (isNotFound && !parsedSource.explicitRef) {
        continue;
      }
      throw err;
    }
  }

  throw new Error(
    `Unable to fetch ${name} from ${owner}/${repo}. Tried refs: ${[...new Set(refCandidates.filter(Boolean))].join(', ')}. Last error: ${lastError ? lastError.message : 'unknown error'}`
  );
}

/**
 * Parse GitHub source URL formats and normalize repo name.
 *
 * @param {string} source
 * @param {string} version
 * @param {string} [name]
 * @returns {{owner: string, repo: string, ref: string, explicitRef: boolean}}
 */
function parseGitHubSource(source, version, name = 'plugin') {
  // Parse source formats:
  //   "https://github.com/owner/repo" or "https://github.com/owner/repo#ref"
  //   "github:owner/repo" or "github:owner/repo#ref"
  const urlMatch = source.match(/github\.com\/([^/]+)\/([^/#]+)(?:#(.+))?/);
  const shortMatch = !urlMatch && source.match(/^github:([^/]+)\/([^#]+)(?:#(.+))?$/);
  const match = urlMatch || shortMatch;
  if (!match) {
    throw new Error(`Unsupported source format for ${name}: ${source}`);
  }

  const owner = match[1];
  const repo = match[2].replace(/\.git$/, '');
  const explicitRef = Boolean(match[3]);
  const ref = match[3] || `v${version}`;
  return { owner, repo, ref, explicitRef };
}

/**
 * Download a tarball from URL and extract to dest directory.
 * Strips the top-level directory from the tarball (GitHub tarballs have owner-repo-sha/).
 */
function downloadAndExtractTarball(url, dest) {
  return new Promise((resolve, reject) => {
    const ghToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    const request = (reqUrl, redirectCount = 0) => {
      if (redirectCount > 5) {
        reject(new Error(`Too many redirects fetching tarball from ${url}`));
        return;
      }
      const headers = {
        'User-Agent': `agentsys/${VERSION}`,
        'Accept': 'application/vnd.github+json'
      };
      if (ghToken) headers['Authorization'] = `Bearer ${ghToken}`;
      https.get(reqUrl, { headers }, (res) => {
        // Follow redirects (GitHub API returns 302 to S3)
        if (res.statusCode === 301 || res.statusCode === 302) {
          res.resume();
          request(res.headers.location, redirectCount + 1);
          return;
        }

        if (res.statusCode !== 200) {
          res.resume();
          const hint = res.statusCode === 403 ? ' (rate limited — set GITHUB_TOKEN env var)' : '';
          reject(new Error(`HTTP ${res.statusCode}${hint} fetching tarball from ${reqUrl}`));
          return;
        }

        // Use tar command to extract (available on all supported platforms)
        // On Windows/MSYS2, convert backslash paths to forward slashes for tar
        const tarDest = process.platform === 'win32' ? dest.replace(/\\/g, '/') : dest;
        const tar = require('child_process').spawn('tar', [
          'xz', '--strip-components=1', '-C', tarDest
        ], { stdio: ['pipe', 'inherit', 'pipe'] });

        let stderr = '';
        tar.stderr.on('data', (d) => { stderr += d; });

        res.pipe(tar.stdin);

        tar.on('close', (code) => {
          if (code !== 0) {
            reject(new Error(`tar extraction failed (code ${code}): ${stderr}`));
          } else {
            resolve();
          }
        });

        tar.on('error', reject);
      }).on('error', reject);
    };

    request(url);
  });
}

/**
 * Discover plugins from the external cache directory (~/.agentsys/plugins/).
 * Falls back to PACKAGE_DIR/plugins/ if cache doesn't exist (bundled install).
 *
 * @param {string[]} [onlyPlugins] - If provided, only return these plugins
 * @returns {string} The root directory to use for plugin discovery
 */
function resolvePluginRoot(onlyPlugins) {
  const cacheDir = getPluginCacheDir();
  // If we have cached external plugins, use the cache dir
  if (fs.existsSync(cacheDir)) {
    const entries = fs.readdirSync(cacheDir).filter(e => {
      const pluginJson = path.join(cacheDir, e, '.claude-plugin', 'plugin.json');
      return fs.existsSync(pluginJson);
    });
    if (entries.length > 0) {
      // Return a synthetic root where plugins/ is the cache dir
      // We need to restructure: cache has ~/.agentsys/plugins/<name>/
      // but discovery expects <root>/plugins/<name>/
      // The cache dir IS the plugins dir, so root is its parent
      return path.join(cacheDir, '..');
    }
  }
  // Fallback to bundled
  return PACKAGE_DIR;
}

/**
 * Fetch all requested plugins (with dependency resolution) to the cache.
 *
 * @param {string[]} pluginNames - Plugins to fetch (empty = all)
 * @param {Object} marketplace - Parsed marketplace.json
 * @returns {Promise<string[]>} Names of fetched plugins
 */
async function fetchExternalPlugins(pluginNames, marketplace) {
  const pluginMap = {};
  for (const p of marketplace.plugins) {
    pluginMap[p.name] = p;
  }

  // Determine which plugins to fetch
  let toFetch;
  if (pluginNames.length > 0) {
    toFetch = resolvePluginDeps(pluginNames, marketplace);
  } else {
    toFetch = marketplace.plugins.map(p => p.name);
  }

  console.log(`\nFetching ${toFetch.length} plugin(s): ${toFetch.join(', ')}\n`);

  const fetched = [];
  const failed = [];
  for (const name of toFetch) {
    const plugin = pluginMap[name];
    if (!plugin) continue;

    const source = resolvePluginSource(plugin.source);

    // Local/bundled plugin, no external fetch needed
    if (!source || source.type === 'local') {
      // Bundled plugin, no fetch needed
      fetched.push(name);
      continue;
    }

    try {
      await fetchPlugin(name, source.value, plugin.version);
      fetched.push(name);
    } catch (err) {
      failed.push(name);
      console.error(`  [ERROR] Failed to fetch ${name}: ${err.message}`);
    }
  }

  if (failed.length > 0) {
    const missingDeps = failed.filter(f => toFetch.includes(f) && !pluginNames.includes(f));
    if (missingDeps.length > 0) {
      console.error(`\n  [WARN] Missing dependencies: ${missingDeps.join(', ')}`);
      console.error(`  Some plugins may not work correctly without their dependencies.`);
    }

    throw new Error(`Failed to fetch ${failed.length} plugin(s): ${failed.join(', ')}`);
  }

  return fetched;
}

/**
 * List installed plugins and their components.
 * @param {string} [filter] - 'all', 'plugins', 'agents', 'skills', 'commands', 'hooks', or null (default: plugins summary)
 */
function listInstalledPlugins(filter) {
  const cacheDir = getPluginCacheDir();
  const installed = loadInstalledJson();
  const showAll = filter === 'all' || filter === '--all';
  const showPlugins = !filter || filter === 'plugins' || filter === '--plugins' || showAll;
  const showAgents = filter === 'agents' || filter === '--agents' || showAll;
  const showSkills = filter === 'skills' || filter === '--skills' || showAll;
  const showCommands = filter === 'commands' || filter === '--commands' || showAll;
  const showHooks = filter === 'hooks' || filter === '--hooks' || showAll;

  console.log(`\nagentsys v${VERSION}\n`);

  // Gather all cached plugins
  const plugins = [];
  if (fs.existsSync(cacheDir)) {
    const entries = fs.readdirSync(cacheDir).filter(e => {
      return fs.statSync(path.join(cacheDir, e)).isDirectory();
    }).sort();
    for (const name of entries) {
      const pluginDir = path.join(cacheDir, name);
      const versionFile = path.join(pluginDir, '.version');
      const ver = fs.existsSync(versionFile) ? fs.readFileSync(versionFile, 'utf8').trim() : 'unknown';
      const components = loadComponents(pluginDir);
      const entry = installed.plugins[name] || {};
      const hooksFile = path.join(pluginDir, 'hooks', 'hooks.json');
      const hasHooks = fs.existsSync(hooksFile);
      plugins.push({ name, version: ver, components, entry, hasHooks, dir: pluginDir });
    }
  }

  if (plugins.length === 0) {
    console.log('No plugins installed. Run: agentsys install <plugin>\n');
    return;
  }

  if (showPlugins && !showAll) {
    // Default view: plugin summary
    console.log('PLUGINS');
    for (const p of plugins) {
      const scope = p.entry.scope || 'full';
      const scopeTag = scope === 'partial' ? '[partial]' : '[full]';
      const platforms = p.entry.platforms ? p.entry.platforms.join(', ') : '';
      const counts = [];
      if (p.components.agents.length) counts.push(`${p.components.agents.length} agents`);
      if (p.components.skills.length) counts.push(`${p.components.skills.length} skills`);
      if (p.components.commands.length) counts.push(`${p.components.commands.length} cmds`);
      if (p.hasHooks) counts.push('hooks');
      console.log(`  ${p.name.padEnd(18)} ${p.version.padEnd(10)} ${scopeTag.padEnd(10)} ${counts.join(', ')}  ${platforms}`);
    }
    console.log();
    console.log(`  ${plugins.length} plugins. Use --all, --agents, --skills, --commands, --hooks for details.`);
    console.log();
    return;
  }

  if (showAll || showPlugins) {
    console.log('PLUGINS');
    for (const p of plugins) {
      const scope = p.entry.scope || 'full';
      const scopeTag = scope === 'partial' ? '[partial]' : '[full]';
      console.log(`  ${p.name}@${p.version}  ${scopeTag}`);
    }
    console.log();
  }

  if (showAgents) {
    console.log('AGENTS');
    let total = 0;
    for (const p of plugins) {
      for (const a of p.components.agents) {
        console.log(`  ${p.name}:${a.name.padEnd(28)} ${(a.model || '').padEnd(8)} ${a.description || ''}`);
        total++;
      }
    }
    if (total === 0) console.log('  (none)');
    console.log();
  }

  if (showSkills) {
    console.log('SKILLS');
    let total = 0;
    for (const p of plugins) {
      for (const s of p.components.skills) {
        console.log(`  ${p.name}:${s.name.padEnd(28)} ${s.description || ''}`);
        total++;
      }
    }
    if (total === 0) console.log('  (none)');
    console.log();
  }

  if (showCommands) {
    console.log('COMMANDS');
    let total = 0;
    for (const p of plugins) {
      for (const c of p.components.commands) {
        console.log(`  /${c.name.padEnd(29)} ${c.description || ''}`);
        total++;
      }
    }
    if (total === 0) console.log('  (none)');
    console.log();
  }

  if (showHooks) {
    console.log('HOOKS');
    let total = 0;
    for (const p of plugins) {
      if (p.hasHooks) {
        try {
          const hooks = JSON.parse(fs.readFileSync(path.join(p.dir, 'hooks', 'hooks.json'), 'utf8'));
          const hookList = Array.isArray(hooks) ? hooks : (hooks.hooks || []);
          for (const h of hookList) {
            const event = h.event || h.matcher || 'unknown';
            console.log(`  ${p.name}:${String(event).padEnd(28)} ${h.description || ''}`);
            total++;
          }
        } catch { /* skip malformed hooks */ }
      }
    }
    if (total === 0) console.log('  (none)');
    console.log();
  }
}

/**
 * Re-fetch all installed external plugins (update to latest versions).
 */
async function updatePlugins() {
  console.log(`\nagentsys v${VERSION} - Updating plugins\n`);

  const marketplace = loadMarketplace();
  const cacheDir = getPluginCacheDir();

  if (!fs.existsSync(cacheDir)) {
    console.log('No cached plugins found. Run agentsys to install first.');
    return;
  }

  // Get currently installed external plugins
  const installed = fs.readdirSync(cacheDir).filter(e => {
    return fs.statSync(path.join(cacheDir, e)).isDirectory();
  });

  if (installed.length === 0) {
    console.log('No external plugins installed.');
    return;
  }

  // Force re-fetch by removing version files
  for (const name of installed) {
    const versionFile = path.join(cacheDir, name, '.version');
    if (fs.existsSync(versionFile)) {
      fs.unlinkSync(versionFile);
    }
  }

  await fetchExternalPlugins(installed, marketplace);
  console.log('\n[OK] Plugins updated.');
}

// --- installed.json manifest ---

function getInstalledJsonPath() {
  const home = process.env.HOME || process.env.USERPROFILE;
  return path.join(home, '.agentsys', 'installed.json');
}

function loadInstalledJson() {
  const p = getInstalledJsonPath();
  if (fs.existsSync(p)) {
    try {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {
      return { plugins: {} };
    }
  }
  return { plugins: {} };
}

function saveInstalledJson(data) {
  const p = getInstalledJsonPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n');
}

/**
 * Drop platforms a plugin never actually reached from what gets recorded.
 *
 * installed.json is load-bearing: `list` prints these platforms back, and
 * removePlugin uses them to decide whether to run `claude plugin uninstall`.
 * Recording 'claude' for a plugin Claude Code never registered would make both
 * report an install that did not happen.
 *
 * recordInstall replaces the entry wholesale, so a platform already recorded is
 * kept: a failed re-install is not evidence that the earlier install never
 * landed, and dropping it would leave a plugin loaded in Claude Code that
 * removePlugin then refuses to uninstall.
 */
function recordedPlatforms(platforms, claudeFailures, depName, recordedBefore) {
  if (!claudeFailures || !claudeFailures.has(depName)) {
    return platforms;
  }
  if (Array.isArray(recordedBefore) && recordedBefore.includes('claude')) {
    return platforms;
  }
  return platforms.filter(platform => platform !== 'claude');
}

function recordInstall(name, version, platforms, granular) {
  const data = loadInstalledJson();
  const entry = {
    version,
    installedAt: new Date().toISOString(),
    platforms,
    scope: 'full'
  };
  if (granular && granular.scope === 'partial') {
    entry.scope = 'partial';
    entry.agents = granular.agents || [];
    entry.skills = granular.skills || [];
    entry.commands = granular.commands || [];
  }
  data.plugins[name] = entry;
  saveInstalledJson(data);
}

function recordRemove(name) {
  const data = loadInstalledJson();
  delete data.plugins[name];
  saveInstalledJson(data);
}

// --- Core version compatibility check ---

/**
 * Simple semver range check. Supports ">=X.Y.Z" format.
 * Returns true if ver satisfies the range.
 */
function satisfiesRange(ver, range) {
  if (!range) return true;
  const parseVer = (s) => {
    const m = s.match(/^(\d+)\.(\d+)\.(\d+)/);
    return m ? [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])] : null;
  };

  const greaterEq = range.match(/^>=(.+)$/);
  if (greaterEq) {
    const required = parseVer(greaterEq[1]);
    const actual = parseVer(ver);
    if (!required || !actual) return true;
    for (let i = 0; i < 3; i++) {
      if (actual[i] > required[i]) return true;
      if (actual[i] < required[i]) return false;
    }
    return true; // equal
  }
  return true; // unknown range format, don't block
}

function checkCoreCompat(pluginEntry) {
  // Core version compat check removed - field deprecated in schema
}

// --- Granular install helpers ---

/**
 * Parse "plugin:component" install target format.
 * @param {string} arg - e.g. "next-task:ci-fixer" or "next-task" or "next-task@1.0.0"
 * @returns {{ plugin: string, component: string|null, version: string|null }}
 */
function parseInstallTarget(arg) {
  if (!arg || typeof arg !== 'string') {
    return { plugin: null, component: null, version: null };
  }

  let plugin = arg;
  let component = null;
  let version = null;

  // Check for colon (component separator) before @ (version separator)
  const colonIdx = plugin.indexOf(':');
  if (colonIdx > 0) {
    component = plugin.slice(colonIdx + 1) || null;
    plugin = plugin.slice(0, colonIdx);
  }

  // Check for @version on the plugin part
  const atIdx = plugin.indexOf('@');
  if (atIdx > 0) {
    version = plugin.slice(atIdx + 1) || null;
    plugin = plugin.slice(0, atIdx);
  }

  return { plugin: plugin || null, component, version };
}

/**
 * Load components.json from a cached plugin directory.
 * @param {string} pluginDir - Path to the cached plugin directory
 * @returns {{ agents: Array, skills: Array, commands: Array }}
 */
function loadComponents(pluginDir) {
  const componentsPath = path.join(pluginDir, 'components.json');
  if (fs.existsSync(componentsPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(componentsPath, 'utf8'));
      const normalize = (arr) => (arr || []).map(item =>
        typeof item === 'string' ? { name: item } : item
      );
      return {
        agents: normalize(data.agents),
        skills: normalize(data.skills),
        commands: normalize(data.commands)
      };
    } catch {
      // Fall through to filesystem scan
    }
  }

  // Fallback: scan filesystem
  const components = { agents: [], skills: [], commands: [] };

  const agentsDir = path.join(pluginDir, 'agents');
  if (fs.existsSync(agentsDir)) {
    const files = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));
    for (const f of files) {
      components.agents.push({ name: f.replace(/\.md$/, ''), file: `agents/${f}` });
    }
  }

  const skillsDir = path.join(pluginDir, 'skills');
  if (fs.existsSync(skillsDir)) {
    const dirs = fs.readdirSync(skillsDir, { withFileTypes: true }).filter(d => d.isDirectory());
    for (const d of dirs) {
      if (fs.existsSync(path.join(skillsDir, d.name, 'SKILL.md'))) {
        components.skills.push({ name: d.name, dir: `skills/${d.name}` });
      }
    }
  }

  const commandsDir = path.join(pluginDir, 'commands');
  if (fs.existsSync(commandsDir)) {
    const files = fs.readdirSync(commandsDir).filter(f => f.endsWith('.md'));
    for (const f of files) {
      components.commands.push({ name: f.replace(/\.md$/, ''), file: `commands/${f}` });
    }
  }

  return components;
}

/**
 * Resolve which type a component belongs to.
 * @param {{ agents: Array, skills: Array, commands: Array }} components
 * @param {string} name - Component name to find
 * @returns {{ type: string, name: string, file?: string, dir?: string }|null}
 */
function resolveComponent(components, name) {
  if (!name || !components) return null;

  for (const agent of components.agents) {
    if (agent.name === name) return { type: 'agent', name: agent.name, file: agent.file };
  }
  for (const skill of components.skills) {
    if (skill.name === name) return { type: 'skill', name: skill.name, dir: skill.dir };
  }
  for (const cmd of components.commands) {
    if (cmd.name === name) return { type: 'command', name: cmd.name, file: cmd.file };
  }
  return null;
}

/**
 * Build a filter object from a resolved component.
 * @param {{ type: string, name: string }} resolved
 * @returns {{ agents: string[], skills: string[], commands: string[] }}
 */
function buildFilterFromComponent(resolved) {
  const filter = { agents: [], skills: [], commands: [] };
  if (resolved.type === 'agent') filter.agents.push(resolved.name);
  else if (resolved.type === 'skill') filter.skills.push(resolved.name);
  else if (resolved.type === 'command') filter.commands.push(resolved.name);
  return filter;
}

// --- Detect which platforms are installed ---

function detectInstalledPlatforms() {
  const home = process.env.HOME || process.env.USERPROFILE;
  const platforms = [];
  if (fs.existsSync(path.join(home, '.claude'))) platforms.push('claude');
  const opencodeDir = getOpenCodeConfigDir();
  if (fs.existsSync(opencodeDir)) platforms.push('opencode');
  if (fs.existsSync(path.join(home, '.codex'))) platforms.push('codex');
  // Cursor: detect global ~/.cursor/ or project .cursor/
  if (fs.existsSync(path.join(home, '.cursor')) || fs.existsSync(path.join(process.cwd(), '.cursor'))) platforms.push('cursor');
  // Kiro: detect global ~/.kiro/ or project .kiro/
  if (fs.existsSync(path.join(home, '.kiro')) || fs.existsSync(path.join(process.cwd(), '.kiro'))) platforms.push('kiro');
  return platforms;
}

// --- install subcommand ---

async function installPlugin(nameWithVersion, args) {
  // Parse plugin:component and name[@version]
  const target = parseInstallTarget(nameWithVersion);
  let name = target.plugin;
  let requestedVersion = target.version;
  const componentName = target.component;

  // Legacy fallback: handle plain name@version (parseInstallTarget already handles this)
  if (!name) {
    console.error('[ERROR] Usage: agentsys install <plugin[:component][@version]>');
    process.exit(1);
  }

  const marketplace = loadMarketplace();
  const pluginMap = {};
  for (const p of marketplace.plugins) {
    pluginMap[p.name] = p;
  }

  if (!pluginMap[name]) {
    console.error(`[ERROR] Unknown plugin: ${name}`);
    console.error(`Available: ${marketplace.plugins.map(p => p.name).join(', ')}`);
    process.exit(1);
  }

  const plugin = pluginMap[name];
  checkCoreCompat(plugin);

  // Resolve deps
  const toFetch = resolvePluginDeps([name], marketplace);
  console.log(`\nInstalling ${name} (+ deps: ${toFetch.filter(n => n !== name).join(', ') || 'none'})\n`);

  // Fetch all
  for (const depName of toFetch) {
    const dep = pluginMap[depName];
    if (!dep) continue;

    const source = resolvePluginSource(dep.source);
    if (!source || source.type === 'local') continue;

    checkCoreCompat(dep);
    const ver = depName === name && requestedVersion ? requestedVersion : dep.version;
    try {
      await fetchPlugin(depName, source.value, ver);
    } catch (err) {
      console.error(`  [ERROR] Failed to fetch ${depName}: ${err.message}`);
    }
  }

  // Determine platforms
  let platforms;
  if (args.tool) {
    platforms = [args.tool];
  } else if (args.tools.length > 0) {
    platforms = args.tools;
  } else {
    platforms = detectInstalledPlatforms();
    if (platforms.length === 0) platforms = ['claude']; // default
  }

  console.log(`Installing for platforms: ${platforms.join(', ')}`);

  // Resolve component filter if a specific component was requested
  let filter = null;
  if (componentName) {
    const cacheDir = getPluginCacheDir();
    const pluginDir = path.join(cacheDir, name);
    if (!fs.existsSync(pluginDir)) {
      console.error(`[ERROR] Plugin ${name} not found in cache after fetch.`);
      process.exit(1);
    }
    const components = loadComponents(pluginDir);
    const resolved = resolveComponent(components, componentName);
    if (!resolved) {
      const allNames = [
        ...components.agents.map(a => a.name),
        ...components.skills.map(s => s.name),
        ...components.commands.map(c => c.name)
      ];
      console.error(`[ERROR] Component "${componentName}" not found in plugin ${name}.`);
      if (allNames.length > 0) {
        console.error(`Available components: ${allNames.join(', ')}`);
      }
      process.exit(1);
    }
    filter = buildFilterFromComponent(resolved);
    console.log(`  Installing ${resolved.type}: ${resolved.name}`);
  }

  // Use cache as install source
  const installDir = getInstallDir();
  const needsLocal = platforms.includes('opencode') || platforms.includes('codex') || platforms.includes('cursor') || platforms.includes('kiro');
  if (needsLocal && !fs.existsSync(path.join(installDir, 'lib'))) {
    // Need local install for transforms
    cleanOldInstallation(installDir);
    copyFromPackage(installDir);
  }

  // depName -> errno, or null when Claude Code itself rejected the plugin
  const claudeFailures = new Map();

  for (const platform of platforms) {
    if (platform === 'claude') {
      if (filter) {
        console.log('  [NOTE] Claude Code installs whole plugins (granular not supported). Installing full plugin.');
      }
      // Claude uses marketplace install
      if (!commandExists('claude')) {
        // detectInstalledPlatforms reports 'claude' whenever ~/.claude exists,
        // so the CLI can still be missing - nothing was registered.
        for (const depName of toFetch) {
          claudeFailures.set(depName, 'claude not on PATH');
        }
      } else {
        try { claudeSpawn(['plugin', 'marketplace', 'add', 'agent-sh/agentsys'], { stdio: 'pipe' }); } catch {}
        for (const depName of toFetch) {
          if (!/^[a-z0-9][a-z0-9-]*$/.test(depName)) {
            claudeFailures.set(depName, 'unsupported plugin id');
            continue;
          }
          try {
            claudeSpawn(['plugin', 'install', `${depName}@agentsys`], { stdio: 'pipe' });
          } catch {
            try {
              claudeSpawn(['plugin', 'update', `${depName}@agentsys`], { stdio: 'pipe' });
            } catch (err) {
              // Do not report success for a plugin Claude Code never received.
              // Keep the errno: a rejected plugin and a shim we could not spawn
              // at all need different fixes.
              claudeFailures.set(depName, (err && err.code) || null);
            }
          }
        }
      }
    }
    // OpenCode and Codex get handled through normal install flow with cached plugins
  }

  if (platforms.includes('opencode') && installDir) {
    installForOpenCode(installDir, { stripModels: args.stripModels, filter });
  }
  if (platforms.includes('codex') && installDir) {
    installForCodex(installDir, { filter });
  }
  if (platforms.includes('cursor') && installDir) {
    installForCursor(installDir, { filter });
  }
  if (platforms.includes('kiro') && installDir) {
    installForKiro(installDir, { filter });
  }

  // Record in installed.json
  const recordedBefore = loadInstalledJson().plugins;
  for (const depName of toFetch) {
    const dep = pluginMap[depName];
    const ver = depName === name && requestedVersion ? requestedVersion : (dep ? dep.version : 'unknown');
    const previous = recordedBefore[depName] && recordedBefore[depName].platforms;
    const recorded = recordedPlatforms(platforms, claudeFailures, depName, previous);
    if (depName === name && filter) {
      recordInstall(depName, ver, recorded, {
        scope: 'partial',
        agents: filter.agents,
        skills: filter.skills,
        commands: filter.commands
      });
    } else {
      recordInstall(depName, ver, recorded);
    }
  }

  if (claudeFailures.size > 0) {
    const failures = [...claudeFailures].map(([depName, code]) => (code ? `${depName} (${code})` : depName));
    console.log(`\n[WARN] Installed ${name}, but Claude Code did not register: ${failures.join(', ')}`);
    console.log(`       Retry with: claude plugin install <name>@agentsys`);
    // Match the --tool path, so `agentsys install x && next-step` stops here.
    process.exitCode = 1;
  } else {
    console.log(`\n[OK] Installed ${name} successfully.`);
  }
}

// --- remove subcommand ---

function removePlugin(name) {
  const installed = loadInstalledJson();

  if (!installed.plugins[name]) {
    console.error(`[ERROR] Plugin ${name} is not installed.`);
    process.exit(1);
  }

  const platforms = installed.plugins[name].platforms || [];

  // Remove from cache
  const cacheDir = getPluginCacheDir();
  const pluginCacheDir = path.join(cacheDir, name);
  if (fs.existsSync(pluginCacheDir)) {
    fs.rmSync(pluginCacheDir, { recursive: true, force: true });
    console.log(`  Removed from cache: ${name}`);
  }

  // Remove from platforms
  if (platforms.includes('claude') && commandExists('claude')) {
    try {
      claudeSpawn(['plugin', 'uninstall', `${name}@agentsys`], { stdio: 'pipe' });
      console.log(`  Removed from Claude Code: ${name}`);
    } catch {}
  }

  if (platforms.includes('opencode')) {
    const opencodeDir = getOpenCodeConfigDir();
    console.log(`  [NOTE] OpenCode files may need manual cleanup in ${opencodeDir}`);
  }

  if (platforms.includes('codex')) {
    const home = process.env.HOME || process.env.USERPROFILE;
    const skillsDir = path.join(home, '.codex', 'skills');
    console.log(`  [NOTE] Codex skill files may need manual cleanup in ${skillsDir}`);
  }

  // Update installed.json
  recordRemove(name);
  console.log(`\n[OK] Removed ${name}.`);
}

// --- search subcommand ---

function searchPlugins(term) {
  const marketplace = loadMarketplace();

  // Handle "plugin:" prefix to list components of a specific plugin
  if (term && term.endsWith(':')) {
    const pluginName = term.slice(0, -1);
    const cacheDir = getPluginCacheDir();
    const pluginDir = path.join(cacheDir, pluginName);
    if (!fs.existsSync(pluginDir)) {
      console.log(`Plugin "${pluginName}" is not cached. Install it first: agentsys install ${pluginName}`);
      return;
    }
    const components = loadComponents(pluginDir);
    console.log(`\nComponents of ${pluginName}:\n`);
    if (components.agents.length > 0) {
      console.log('  Agents:');
      for (const a of components.agents) {
        const desc = a.description ? ` - ${a.description}` : '';
        console.log(`    ${a.name}${desc}`);
      }
    }
    if (components.skills.length > 0) {
      console.log('  Skills:');
      for (const s of components.skills) {
        const desc = s.description ? ` - ${s.description}` : '';
        console.log(`    ${s.name}${desc}`);
      }
    }
    if (components.commands.length > 0) {
      console.log('  Commands:');
      for (const c of components.commands) {
        const desc = c.description ? ` - ${c.description}` : '';
        console.log(`    ${c.name}${desc}`);
      }
    }
    const total = components.agents.length + components.skills.length + components.commands.length;
    console.log(`\n${total} component(s) found.`);
    return;
  }

  let plugins = marketplace.plugins;

  if (term) {
    const lower = term.toLowerCase();
    plugins = plugins.filter(p =>
      p.name.toLowerCase().includes(lower) ||
      (p.description && p.description.toLowerCase().includes(lower))
    );
  }

  if (plugins.length === 0) {
    console.log(`No plugins found${term ? ` matching "${term}"` : ''}.`);
    return;
  }

  // Print table
  const nameWidth = Math.max(14, ...plugins.map(p => p.name.length)) + 2;
  const verWidth = 10;
  console.log(`\n${'NAME'.padEnd(nameWidth)}${'VERSION'.padEnd(verWidth)}DESCRIPTION`);
  console.log(`${'─'.repeat(nameWidth)}${'─'.repeat(verWidth)}${'─'.repeat(40)}`);
  for (const p of plugins) {
    const desc = p.description ? (p.description.length > 60 ? p.description.slice(0, 57) + '...' : p.description) : '';
    console.log(`${p.name.padEnd(nameWidth)}${(p.version || '').padEnd(verWidth)}${desc}`);
  }
  console.log(`\n${plugins.length} plugin(s) found.`);
}

function installForClaude() {
  console.log('\n[INSTALL] Installing for Claude Code...\n');

  if (!commandExists('claude')) {
    console.log('[WARN]  Claude Code CLI not detected.');
    console.log('   Install it first: https://claude.ai/code\n');
    console.log('   Then run in Claude Code:');
    console.log('   /plugin marketplace add agent-sh/agentsys');
    console.log('   /plugin install next-task@agentsys\n');
    return false;
  }

  try {
    // Add GitHub marketplace
    console.log('Adding marketplace...');
    try {
      claudeSpawn(['plugin', 'marketplace', 'add', 'agent-sh/agentsys'], { stdio: 'pipe' });
    } catch {
      // May already exist
    }

    // Discover plugins from filesystem convention
    const plugins = discovery.discoverPlugins(PACKAGE_DIR);
    const failedPlugins = [];
    for (const plugin of plugins) {
      // Validate plugin name before shell use (prevents injection)
      if (!/^[a-z0-9][a-z0-9-]*$/.test(plugin)) continue;
      console.log(`  Installing ${plugin}...`);
      // Remove pre-rename plugin ID to prevent dual loading on upgrade
      try {
        claudeSpawn(['plugin', 'uninstall', `${plugin}@awesome-slash`], { stdio: 'pipe' });
      } catch {
        // Not installed under old name
      }
      try {
        // Try install first
        claudeSpawn(['plugin', 'install', `${plugin}@agentsys`], { stdio: 'pipe' });
      } catch {
        // If install fails (already installed), try update
        try {
          claudeSpawn(['plugin', 'update', `${plugin}@agentsys`], { stdio: 'pipe' });
        } catch {
          failedPlugins.push(plugin);
        }
      }
    }

    if (failedPlugins.length > 0) {
      console.log(`\n[ERROR] Failed to install/update ${failedPlugins.length} plugin(s): ${failedPlugins.join(', ')}`);
      console.log('Retry with: /plugin install <plugin>@agentsys');
      return false;
    }

    console.log('\n[OK] Claude Code installation complete!\n');
    console.log('Commands: ' + plugins.map(p => '/' + p).join(', '));
    return true;
  } catch (err) {
    console.log('[ERROR] Auto-install failed. Manual installation:');
    console.log('   /plugin marketplace add agent-sh/agentsys');
    console.log('   /plugin install next-task@agentsys');
    return false;
  }
}

function installForClaudeDevelopment() {
  console.log('\n[INSTALL] Installing for Claude Code (DEVELOPMENT MODE)...\n');

  if (!commandExists('claude')) {
    console.log('[WARN]  Claude Code CLI not detected.');
    console.log('   Install it first: https://claude.ai/code\n');
    return false;
  }

  const pluginsDir = getClaudePluginsDir();
  const plugins = discovery.discoverPlugins(PACKAGE_DIR);

  // Remove marketplace plugins first
  console.log('Removing marketplace plugins...');
  try {
    claudeSpawn(['plugin', 'marketplace', 'remove', 'agent-sh/agentsys'], { stdio: 'pipe' });
    console.log('  [OK] Removed marketplace');
  } catch {
    // May not exist
  }

  for (const plugin of plugins) {
    // Validate plugin name before shell use (prevents injection)
    if (!/^[a-z0-9][a-z0-9-]*$/.test(plugin)) continue;
    // Uninstall both current and pre-rename plugin IDs
    for (const suffix of ['agentsys', 'awesome-slash']) {
      try {
        claudeSpawn(['plugin', 'uninstall', `${plugin}@${suffix}`], { stdio: 'pipe' });
        console.log(`  [OK] Uninstalled ${plugin}@${suffix}`);
      } catch {
        // May not be installed
      }
    }
  }

  // Create plugins directory
  fs.mkdirSync(pluginsDir, { recursive: true });

  // Copy each plugin directly
  console.log('\nCopying plugins from package...');
  for (const plugin of plugins) {
    const srcDir = path.join(PACKAGE_DIR, 'plugins', plugin);
    const destDir = path.join(pluginsDir, `${plugin}@agentsys`);

    if (fs.existsSync(srcDir)) {
      // Remove existing
      if (fs.existsSync(destDir)) {
        fs.rmSync(destDir, { recursive: true, force: true });
      }

      // Copy plugin
      fs.cpSync(srcDir, destDir, {
        recursive: true,
        filter: (src) => {
          const basename = path.basename(src);
          return basename !== 'node_modules' && basename !== '.git';
        }
      });
      console.log(`  [OK] Installed ${plugin}`);
    }
  }

  console.log('\n[OK] Claude Code development installation complete!');
  console.log('  Plugins installed to: ' + pluginsDir);
  console.log('  Commands: ' + plugins.map(p => '/' + p).join(', '));
  console.log('\n[NOTE] To revert to marketplace version:');
  console.log('  rm -rf ~/.claude/plugins/*@agentsys');
  console.log('  agentsys --tool claude');
  return true;
}

function installForOpenCode(installDir, options = {}) {
  console.log('\n[INSTALL] Installing for OpenCode...\n');
  const { stripModels = true, filter = null } = options;

  if (stripModels) {
    console.log('  [INFO] Model specifications stripped (default). Use --no-strip to include.');
  } else {
    console.log('  [INFO] Model specifications included (--no-strip).');
  }

  const home = process.env.HOME || process.env.USERPROFILE;
  const opencodeConfigDir = getOpenCodeConfigDir();
  // OpenCode global locations are under ~/.config/opencode (or $XDG_CONFIG_HOME/opencode).
  const commandsDir = path.join(opencodeConfigDir, 'commands');
  const pluginDir = path.join(opencodeConfigDir, 'plugins');
  const agentsDir = path.join(opencodeConfigDir, 'agents');

  fs.mkdirSync(commandsDir, { recursive: true });
  fs.mkdirSync(pluginDir, { recursive: true });
  fs.mkdirSync(agentsDir, { recursive: true });

  // Install native OpenCode plugin (auto-thinking, workflow enforcement, compaction)
  const pluginSrcDir = path.join(installDir, 'adapters', 'opencode-plugin');
  if (fs.existsSync(pluginSrcDir)) {
    // OpenCode loads plugin files directly from the plugins directory.
    const srcPath = path.join(pluginSrcDir, 'index.ts');
    const destPath = path.join(pluginDir, 'agentsys.ts');
    // Remove legacy plugin file from pre-rename installs to prevent dual loading
    const legacyPluginFile = path.join(pluginDir, 'awesome-slash.ts');
    if (fs.existsSync(legacyPluginFile)) {
      fs.unlinkSync(legacyPluginFile);
    }
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, destPath);
      console.log('  [OK] Installed native plugin (auto-thinking, workflow enforcement)');
    }
  }

  // Clean up the legacy (pre-XDG) install location if it exists.
  // This location is not used by OpenCode and was used by older versions.
  const legacyCommandsDir = path.join(home, '.opencode', 'commands', 'agentsys');
  if (fs.existsSync(legacyCommandsDir)) {
    fs.rmSync(legacyCommandsDir, { recursive: true, force: true });
  }
  const legacyPluginDir = path.join(home, '.opencode', 'plugins', 'agentsys');
  if (fs.existsSync(legacyPluginDir)) {
    fs.rmSync(legacyPluginDir, { recursive: true, force: true });
  }
  // Also clean pre-rename paths (awesome-slash) for users upgrading from v4.x
  const preRenameCommandsDir = path.join(home, '.opencode', 'commands', 'awesome-slash');
  if (fs.existsSync(preRenameCommandsDir)) {
    fs.rmSync(preRenameCommandsDir, { recursive: true, force: true });
  }
  const preRenamePluginDir = path.join(home, '.opencode', 'plugins', 'awesome-slash');
  if (fs.existsSync(preRenamePluginDir)) {
    fs.rmSync(preRenamePluginDir, { recursive: true, force: true });
  }

  // Discover command mappings from filesystem
  const commandMappings = discovery.getCommandMappings(installDir);

  // Transform and copy command files
  for (const [target, plugin, source] of commandMappings) {
    // Apply filter: skip commands not in the filter list
    if (filter && filter.commands.length > 0) {
      const cmdName = target.replace(/\.md$/, '');
      if (!filter.commands.includes(cmdName)) continue;
    }
    const srcPath = path.join(installDir, 'plugins', plugin, 'commands', source);
    const destPath = path.join(commandsDir, target);
    if (fs.existsSync(srcPath)) {
      let content = fs.readFileSync(srcPath, 'utf8');
      content = transforms.transformBodyForOpenCode(content, installDir);
      content = transforms.transformCommandFrontmatterForOpenCode(content);
      fs.writeFileSync(destPath, content);
    }
  }

  // Remove legacy agent files from pre-rename installs.
  const legacyAgentFiles = ['review.md', 'ship.md', 'workflow.md'];
  for (const legacyFile of legacyAgentFiles) {
    const legacyPath = path.join(agentsDir, legacyFile);
    if (fs.existsSync(legacyPath)) {
      fs.unlinkSync(legacyPath);
    }
  }

  // Install agents to global OpenCode location
  // OpenCode looks for agents in ~/.config/opencode/agents/ (global) or .opencode/agents/ (per-project)

  console.log('  Installing agents for OpenCode...');
  const pluginDirs = discovery.discoverPlugins(installDir);
  let agentCount = 0;

  for (const pluginName of pluginDirs) {
    const srcAgentsDir = path.join(installDir, 'plugins', pluginName, 'agents');
    if (fs.existsSync(srcAgentsDir)) {
      const agentFiles = fs.readdirSync(srcAgentsDir).filter(f => f.endsWith('.md'));
      for (const agentFile of agentFiles) {
        // Apply filter: skip agents not in the filter list
        if (filter && filter.agents.length > 0) {
          const agentName = agentFile.replace(/\.md$/, '');
          if (!filter.agents.includes(agentName)) continue;
        }
        const srcPath = path.join(srcAgentsDir, agentFile);
        const destPath = path.join(agentsDir, agentFile);
        let content = fs.readFileSync(srcPath, 'utf8');

        // Transform body and frontmatter for OpenCode
        content = transforms.transformBodyForOpenCode(content, installDir);
        content = transforms.transformAgentFrontmatterForOpenCode(content, { stripModels });

        fs.writeFileSync(destPath, content);
        agentCount++;
      }
    }
  }
  console.log(`  [OK] Installed ${agentCount} agents to ${agentsDir}`);

  // Copy lib files to commands directory for require() access
  const libSrcDir = path.join(installDir, 'lib');
  const libDestDir = path.join(commandsDir, 'lib');
  if (fs.existsSync(libSrcDir)) {
    console.log('  Installing lib files...');
    copyDirRecursive(libSrcDir, libDestDir);
    console.log(`  [OK] Installed lib to ${libDestDir}`);
  }

  // Install skills to the OpenCode global skills directory (~/.config/opencode/skills/<skill-name>/SKILL.md)
  const skillsDestDir = path.join(opencodeConfigDir, 'skills');
  fs.mkdirSync(skillsDestDir, { recursive: true });
  console.log('  Installing skills...');
  let skillCount = 0;

  for (const pluginName of pluginDirs) {
    const srcSkillsDir = path.join(installDir, 'plugins', pluginName, 'skills');
    if (fs.existsSync(srcSkillsDir)) {
      const skillDirs = fs.readdirSync(srcSkillsDir, { withFileTypes: true })
        .filter(d => d.isDirectory());
      for (const skillDir of skillDirs) {
        const skillName = skillDir.name;
        // Apply filter: skip skills not in the filter list
        if (filter && filter.skills.length > 0) {
          if (!filter.skills.includes(skillName)) continue;
        }
        const srcSkillPath = path.join(srcSkillsDir, skillName, 'SKILL.md');
        if (fs.existsSync(srcSkillPath)) {
          const destSkillDir = path.join(skillsDestDir, skillName);
          fs.mkdirSync(destSkillDir, { recursive: true });
          let content = fs.readFileSync(srcSkillPath, 'utf8');
          content = transforms.transformSkillBodyForOpenCode(content, installDir);
          fs.writeFileSync(path.join(destSkillDir, 'SKILL.md'), content);
          skillCount++;
        }
      }
    }
  }
  console.log(`  [OK] Installed ${skillCount} skills to ${skillsDestDir}`);

  console.log('[OK] OpenCode installation complete!');
  console.log(`   Commands: ${commandsDir}`);
  console.log(`   Agents: ${agentsDir}`);
  console.log(`   Plugin: ${pluginDir}`);
  console.log('   Access via: ' + commandMappings.map(([target]) => '/' + target.replace(/\.md$/, '')).join(', '));
  console.log('   Native features: Auto-thinking selection, workflow enforcement, session compaction\n');
  return true;
}

function installForCodex(installDir, options = {}) {
  console.log('\n[INSTALL] Installing for Codex CLI...\n');
  const { filter = null } = options;

  const home = process.env.HOME || process.env.USERPROFILE;
  const configDir = path.join(home, '.codex');
  const skillsDir = path.join(configDir, 'skills');

  fs.mkdirSync(configDir, { recursive: true });
  fs.mkdirSync(skillsDir, { recursive: true });

  // Remove old/deprecated prompts directory if it exists
  const oldPromptsDir = path.join(configDir, 'prompts');
  if (fs.existsSync(oldPromptsDir)) {
    const oldFiles = ['next-task.md', 'ship.md', 'deslop.md', 'audit-project.md',
                      'drift-detect.md', 'delivery-approval.md', 'sync-docs.md',
                      'drift-detect-set.md', 'pr-merge.md'];
    for (const file of oldFiles) {
      const oldPath = path.join(oldPromptsDir, file);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
        console.log(`  Removed old prompt: ${file}`);
      }
    }
  }

  // Remove old/deprecated skills
  const oldSkillDirs = ['deslop', 'review', 'drift-detect-set', 'pr-merge'];
  for (const dir of oldSkillDirs) {
    const oldPath = path.join(skillsDir, dir);
    if (fs.existsSync(oldPath)) {
      fs.rmSync(oldPath, { recursive: true, force: true });
      console.log(`  Removed deprecated skill: ${dir}`);
    }
  }

  // Discover skill mappings from filesystem (descriptions from codex-description frontmatter)
  const skillMappings = discovery.getCodexSkillMappings(installDir);

  for (const [skillName, plugin, sourceFile, description] of skillMappings) {
    // Apply filter: skip commands/skills not in the filter list
    if (filter && filter.commands.length > 0) {
      if (!filter.commands.includes(skillName)) continue;
    }
    if (!description) {
      console.log(`  [WARN] Skipping skill ${skillName}: missing description`);
      continue;
    }
    const srcPath = path.join(installDir, 'plugins', plugin, 'commands', sourceFile);
    const skillDir = path.join(skillsDir, skillName);
    const destPath = path.join(skillDir, 'SKILL.md');

    if (fs.existsSync(srcPath)) {
      if (fs.existsSync(skillDir)) {
        fs.rmSync(skillDir, { recursive: true, force: true });
      }
      // Create skill directory
      fs.mkdirSync(skillDir, { recursive: true });

      // Read source file and transform using shared transforms
      let content = fs.readFileSync(srcPath, 'utf8');
      const pluginInstallPath = path.join(installDir, 'plugins', plugin);
      content = transforms.transformForCodex(content, {
        skillName,
        description,
        pluginInstallPath
      });

      fs.writeFileSync(destPath, content);
      console.log(`  [OK] Installed skill: ${skillName}`);
    }
  }

  console.log('\n[OK] Codex CLI installation complete!');
  console.log(`   Config: ${configDir}`);
  console.log(`   Skills: ${skillsDir}`);
  console.log('   Access via: $next-task, $ship, $deslop, etc.\n');
  return true;
}

function installForCursor(installDir, options = {}) {
  console.log('\n[INSTALL] Installing for Cursor...\n');
  const { filter = null } = options;
  const home = process.env.HOME || process.env.USERPROFILE;

  // Install globally to ~/.cursor/ (same as other platforms)
  const cursorHome = path.join(home, '.cursor');
  const skillsDir = path.join(cursorHome, 'skills');
  const commandsDir = path.join(cursorHome, 'commands');
  const rulesDir = path.join(cursorHome, 'rules');
  fs.mkdirSync(skillsDir, { recursive: true });
  fs.mkdirSync(commandsDir, { recursive: true });
  fs.mkdirSync(rulesDir, { recursive: true });

  // Cleanup old agentsys files from rules dir
  for (const f of fs.readdirSync(rulesDir).filter(f => f.startsWith('agentsys-') && f.endsWith('.mdc'))) {
    fs.unlinkSync(path.join(rulesDir, f));
  }

  // Cleanup old agentsys files from commands dir (only those matching known commands)
  const commandMappingsForCleanup = discovery.getCommandMappings(installDir);
  const knownCommandFiles = new Set(commandMappingsForCleanup.map(([target]) => target));
  for (const f of fs.readdirSync(commandsDir).filter(f => f.endsWith('.md'))) {
    if (knownCommandFiles.has(f)) {
      fs.unlinkSync(path.join(commandsDir, f));
    }
  }

  // Collect known skill names from discovery before cleanup
  const pluginDirs = discovery.discoverPlugins(installDir);
  const knownSkillNames = new Set();
  for (const pluginName of pluginDirs) {
    const srcSkillsDir = path.join(installDir, 'plugins', pluginName, 'skills');
    if (!fs.existsSync(srcSkillsDir)) continue;
    for (const d of fs.readdirSync(srcSkillsDir, { withFileTypes: true })) {
      if (d.isDirectory() && /^[a-zA-Z0-9_-]+$/.test(d.name)) knownSkillNames.add(d.name);
    }
  }

  // Cleanup old agentsys skill dirs (only known names, preserve user-created skills)
  for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
    if (entry.isDirectory() && knownSkillNames.has(entry.name)) {
      fs.rmSync(path.join(skillsDir, entry.name), { recursive: true, force: true });
    }
  }

  // Install skills
  let skillCount = 0;
  for (const pluginName of pluginDirs) {
    const srcSkillsDir = path.join(installDir, 'plugins', pluginName, 'skills');
    if (!fs.existsSync(srcSkillsDir)) continue;
    const entries = fs.readdirSync(srcSkillsDir, { withFileTypes: true }).filter(d => d.isDirectory());
    for (const entry of entries) {
      if (!/^[a-zA-Z0-9_-]+$/.test(entry.name)) continue;
      if (filter && filter.skills && filter.skills.length > 0 && !filter.skills.includes(entry.name)) continue;
      const srcPath = path.join(srcSkillsDir, entry.name, 'SKILL.md');
      if (!fs.existsSync(srcPath)) continue;
      const destDir = path.join(skillsDir, entry.name);
      fs.mkdirSync(destDir, { recursive: true });
      let content = fs.readFileSync(srcPath, 'utf8');
      content = transforms.transformSkillForCursor(content, {
        pluginInstallPath: path.join(installDir, 'plugins', pluginName)
      });
      fs.writeFileSync(path.join(destDir, 'SKILL.md'), content);
      skillCount++;
    }
  }

  // Install commands
  const commandMappings = discovery.getCommandMappings(installDir);
  let cmdCount = 0;
  for (const [target, plugin, source] of commandMappings) {
    if (filter && filter.commands && filter.commands.length > 0) {
      const cmdName = target.replace(/\.md$/, '');
      if (!filter.commands.includes(cmdName)) continue;
    }
    const srcPath = path.join(installDir, 'plugins', plugin, 'commands', source);
    if (!fs.existsSync(srcPath)) {
      console.log(`  [WARN] Source file not found: ${srcPath}`);
      continue;
    }
    let content = fs.readFileSync(srcPath, 'utf8');
    content = transforms.transformCommandForCursor(content, {
      pluginInstallPath: path.join(installDir, 'plugins', plugin)
    });
    fs.writeFileSync(path.join(commandsDir, target), content);
    cmdCount++;
  }

  console.log(`\n[OK] Cursor installation complete!`);
  console.log(`   Skills: ${skillCount} installed to ${skillsDir}`);
  console.log(`   Commands: ${cmdCount} installed to ${commandsDir}`);
  console.log(`   Global install: ${cursorHome}\n`);
  return true;
}

function installForKiro(installDir, options = {}) {
  console.log('\n[INSTALL] Installing for Kiro...\n');
  const { filter = null } = options;

  // Install globally to ~/.kiro/ (same as OpenCode → ~/.config/opencode/, Codex → ~/.codex/)
  const home = process.env.HOME || process.env.USERPROFILE;
  const kiroHome = path.join(home, '.kiro');
  const skillsDir = path.join(kiroHome, 'skills');
  const promptsDir = path.join(kiroHome, 'prompts');
  const agentsDir = path.join(kiroHome, 'agents');
  fs.mkdirSync(skillsDir, { recursive: true });
  fs.mkdirSync(promptsDir, { recursive: true });
  fs.mkdirSync(agentsDir, { recursive: true });

  // Get known command names for cleanup
  const steeringMappingsForCleanup = discovery.getKiroSteeringMappings(installDir);
  const knownCommandFiles = new Set(steeringMappingsForCleanup.map(([name]) => `${name}.md`));

  // Clean up legacy agentsys files from steering dir (renamed to prompts)
  const legacySteeringDir = path.join(kiroHome, 'steering');
  if (fs.existsSync(legacySteeringDir)) {
    for (const f of fs.readdirSync(legacySteeringDir).filter(f => f.endsWith('.md'))) {
      if (knownCommandFiles.has(f)) {
        fs.unlinkSync(path.join(legacySteeringDir, f));
      }
    }
  }

  // Cleanup old agentsys prompt files
  for (const f of fs.readdirSync(promptsDir).filter(f => f.endsWith('.md'))) {
    if (knownCommandFiles.has(f)) {
      fs.unlinkSync(path.join(promptsDir, f));
    }
  }

  // Collect known skill names from discovery before cleanup
  const pluginDirs = discovery.discoverPlugins(installDir);
  const knownSkillNames = new Set();
  for (const pluginName of pluginDirs) {
    const srcSkillsDir = path.join(installDir, 'plugins', pluginName, 'skills');
    if (!fs.existsSync(srcSkillsDir)) continue;
    for (const d of fs.readdirSync(srcSkillsDir, { withFileTypes: true })) {
      if (d.isDirectory() && /^[a-zA-Z0-9_-]+$/.test(d.name)) knownSkillNames.add(d.name);
    }
  }

  // Cleanup old agentsys skill dirs (only known names, preserve user-created skills)
  for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
    if (entry.isDirectory() && knownSkillNames.has(entry.name)) {
      fs.rmSync(path.join(skillsDir, entry.name), { recursive: true, force: true });
    }
  }

  // Cleanup old agentsys agent JSON files (only those matching known agents)
  const knownAgentFiles = new Set();
  for (const pluginName of pluginDirs) {
    const srcAgentsDir = path.join(installDir, 'plugins', pluginName, 'agents');
    if (!fs.existsSync(srcAgentsDir)) continue;
    for (const f of fs.readdirSync(srcAgentsDir).filter(f => f.endsWith('.md'))) {
      knownAgentFiles.add(f.replace(/\.md$/, '.json'));
    }
  }
  for (const f of fs.readdirSync(agentsDir).filter(f => f.endsWith('.json'))) {
    if (knownAgentFiles.has(f)) {
      fs.unlinkSync(path.join(agentsDir, f));
    }
  }

  // Install skills
  let skillCount = 0;
  for (const pluginName of pluginDirs) {
    const srcSkillsDir = path.join(installDir, 'plugins', pluginName, 'skills');
    if (!fs.existsSync(srcSkillsDir)) continue;
    const entries = fs.readdirSync(srcSkillsDir, { withFileTypes: true }).filter(d => d.isDirectory());
    for (const entry of entries) {
      if (!/^[a-zA-Z0-9_-]+$/.test(entry.name)) continue;
      if (filter && filter.skills && filter.skills.length > 0 && !filter.skills.includes(entry.name)) continue;
      const srcPath = path.join(srcSkillsDir, entry.name, 'SKILL.md');
      if (!fs.existsSync(srcPath)) continue;
      const destDir = path.join(skillsDir, entry.name);
      fs.mkdirSync(destDir, { recursive: true });
      let content = fs.readFileSync(srcPath, 'utf8');
      content = transforms.transformSkillForKiro(content, {
        pluginInstallPath: path.join(installDir, 'plugins', pluginName)
      });
      fs.writeFileSync(path.join(destDir, 'SKILL.md'), content);
      skillCount++;
    }
  }

  // Install commands as prompts (invoked with @ in kiro-cli)
  const steeringMappings = discovery.getKiroSteeringMappings(installDir);
  let promptCount = 0;
  for (const [promptName, plugin, sourceFile, description] of steeringMappings) {
    if (filter && filter.commands && filter.commands.length > 0) {
      if (!filter.commands.includes(promptName)) continue;
    }
    const srcPath = path.join(installDir, 'plugins', plugin, 'commands', sourceFile);
    if (!fs.existsSync(srcPath)) {
      console.log(`  [WARN] Source file not found: ${srcPath}`);
      continue;
    }
    let content = fs.readFileSync(srcPath, 'utf8');
    content = transforms.transformCommandForKiro(content, {
      pluginInstallPath: path.join(installDir, 'plugins', plugin),
      name: promptName,
      description
    });
    fs.writeFileSync(path.join(promptsDir, `${promptName}.md`), content);
    promptCount++;
  }

  // Install agents as JSON files
  let agentCount = 0;
  for (const pluginName of pluginDirs) {
    const srcAgentsDir = path.join(installDir, 'plugins', pluginName, 'agents');
    if (!fs.existsSync(srcAgentsDir)) continue;
    const agentFiles = fs.readdirSync(srcAgentsDir).filter(f => f.endsWith('.md'));
    for (const agentFile of agentFiles) {
      const agentName = agentFile.replace(/\.md$/, '');
      if (filter && filter.agents && filter.agents.length > 0 && !filter.agents.includes(agentName)) continue;
      const srcPath = path.join(srcAgentsDir, agentFile);
      let content = fs.readFileSync(srcPath, 'utf8');
      const jsonContent = transforms.transformAgentForKiro(content, {
        pluginInstallPath: path.join(installDir, 'plugins', pluginName)
      });
      fs.writeFileSync(path.join(agentsDir, `${agentName}.json`), jsonContent);
      agentCount++;
    }
  }

  // Generate combined reviewer agents for Kiro's 4-agent experimental limit.
  // These are fallback agents that merge 2 review passes into 1 agent session.
  const combinedReviewers = [
    {
      name: 'reviewer-quality-security',
      description: 'Combined code quality and security reviewer for Kiro',
      roles: [
        { name: 'Code Quality', focus: 'Error handling, maintainability, naming, duplication, dead code, logging quality' },
        { name: 'Security', focus: 'Auth vulnerabilities, input validation, injection risks, secrets exposure, OWASP top 10' },
      ]
    },
    {
      name: 'reviewer-perf-test',
      description: 'Combined performance and test coverage reviewer for Kiro',
      roles: [
        { name: 'Performance', focus: 'Hot paths, algorithmic complexity, unnecessary allocations, N+1 queries, caching opportunities' },
        { name: 'Test Coverage', focus: 'Missing tests, edge cases, assertion quality, test isolation, mock correctness' },
      ]
    },
  ];
  for (const cr of combinedReviewers) {
    const json = transforms.generateCombinedReviewerAgent(cr.roles, cr.name, cr.description);
    fs.writeFileSync(path.join(agentsDir, `${cr.name}.json`), json);
    agentCount++;
  }

  console.log(`\n[OK] Kiro installation complete!`);
  console.log(`   Skills: ${skillCount} installed to ${skillsDir}`);
  console.log(`   Prompts: ${promptCount} installed to ${promptsDir} (invoke with @name in kiro-cli)`);
  console.log(`   Agents: ${agentCount} installed to ${agentsDir} (includes 2 combined reviewers)`);
  console.log(`   Global install: ${kiroHome}\n`);
  return true;
}

function removeInstallation() {
  const installDir = getInstallDir();

  if (!fs.existsSync(installDir)) {
    console.log('Nothing to remove. agentsys is not installed.');
    return;
  }

  console.log('Removing agentsys...');
  fs.rmSync(installDir, { recursive: true, force: true });

  console.log('\n[OK] Removed ~/.agentsys');
  console.log('\nTo fully uninstall, also remove:');
  console.log('  - Claude: /plugin marketplace remove agentsys');
  console.log('  - OpenCode: Remove files under ~/.config/opencode/ (commands/*.md, agents/*.md, skills/*/SKILL.md) and ~/.config/opencode/plugins/agentsys.ts');
  console.log('  - Codex: Remove ~/.codex/skills/*/');
  console.log('  - Cursor: Remove ~/.cursor/skills/, ~/.cursor/commands/, and ~/.cursor/rules/agentsys-*.mdc');
  console.log('  - Kiro: Remove ~/.kiro/skills/, ~/.kiro/prompts/, and ~/.kiro/agents/');
}

function printSubcommandHelp(subcommand) {
  const helps = {
    install: `
agentsys install — Install plugins and components

Usage:
  agentsys install <plugin>              Install a full plugin (all agents, skills, commands)
  agentsys install <plugin>:<component>  Install a single agent, skill, or command
  agentsys install <plugin>@<version>    Install a specific version

Examples:
  agentsys install next-task             Install next-task + dependencies (deslop, ship, sync-docs)
  agentsys install next-task:ci-fixer    Install just the ci-fixer agent
  agentsys install deslop:deslop         Install just the deslop skill
  agentsys install enhance:enhance-docs  Install just the enhance-docs skill
  agentsys install perf@1.2.0            Install perf at version 1.2.0

Options:
  --tool <name>     Install for a specific platform (claude, opencode, codex, cursor, kiro)
  --tools <list>    Install for multiple platforms (comma-separated)

Notes:
  - Dependencies are resolved automatically (e.g., deslop requires next-task)
  - The full plugin is cached locally; granular install only affects what gets
    copied to platform directories (OpenCode, Codex)
  - Claude Code always installs whole plugins (platform limitation)
  - Use "agentsys search <plugin>:" to list available components
`,
    list: `
agentsys list — List installed plugins and components

Usage:
  agentsys list               Plugin summary (name, version, scope, counts)
  agentsys list --all         Show everything (plugins, agents, skills, commands, hooks)
  agentsys list --plugins     Show plugins with version and scope
  agentsys list --agents      Show all agents across all installed plugins
  agentsys list --skills      Show all skills across all installed plugins
  agentsys list --commands    Show all commands (slash commands)
  agentsys list --hooks       Show all hooks

Output format:
  AGENTS
    plugin:agent-name          model    description
  SKILLS
    plugin:skill-name          description
  COMMANDS
    /command-name              description
  HOOKS
    plugin:event               description

Scope tags:
  [full]     All components of the plugin are installed
  [partial]  Only selected components are installed
`,
    search: `
agentsys search — Search available plugins and components

Usage:
  agentsys search              List all available plugins
  agentsys search <term>       Filter plugins by name or description
  agentsys search <plugin>:    List all components (agents, skills, commands) of a plugin

Examples:
  agentsys search              Show all 13 plugins
  agentsys search perf         Find plugins matching "perf"
  agentsys search next-task:   Show next-task's 10 agents, 3 skills, 2 commands
  agentsys search :ci-fixer    Search all plugins for "ci-fixer"

Output:
  NAME          VERSION  DESCRIPTION
  next-task     1.0.0    Master workflow orchestrator
  deslop        1.0.0    Clean AI slop from code
`,
    remove: `
agentsys remove — Remove an installed plugin

Usage:
  agentsys remove <plugin>     Remove plugin from cache and platform directories

Notes:
  - Warns if another installed plugin depends on the one being removed
  - Claude Code: runs "claude plugin uninstall <plugin>@agentsys"
  - OpenCode/Codex: notes manual cleanup may be needed
  - Updates installed.json manifest
`,
    update: `
agentsys update — Update installed plugins to latest versions

Usage:
  agentsys update              Re-fetch all installed plugins from GitHub

Notes:
  - Clears cached versions and re-downloads latest from each plugin's GitHub repo
  - Only updates plugins already in the cache (~/.agentsys/plugins/)
  - Does not change platform installations — run "agentsys" again to re-install
`
  };

  const text = helps[subcommand];
  if (text) {
    console.log(text);
  } else {
    console.log(`No help available for "${subcommand}". Run: agentsys --help`);
  }
}

function printHelp() {
  console.log(`
agentsys v${VERSION} - Workflow automation for AI coding assistants

Usage:
  agentsys                    Interactive installer (select platforms)
  agentsys --tool <name>      Install for single tool (claude, opencode, codex, cursor, kiro)
  agentsys --tools <list>     Install for multiple tools (comma-separated)
  agentsys --only <plugins>   Install only specified plugins (comma-separated, resolves deps)
  agentsys --development      Development mode: install to ~/.claude/plugins
  agentsys --no-strip, -ns    Include model specifications (stripped by default)
  agentsys --remove           Remove local installation
  agentsys --version, -v      Show version
  agentsys --help, -h         Show this help
  agentsys install <plugin>    Install a specific plugin (resolves deps)
  agentsys install <p>:<comp>  Install a single agent, skill, or command
  agentsys install <p>@<ver>  Install a specific version
  agentsys remove <plugin>    Remove an installed plugin
  agentsys search [term]      Search available plugins
  agentsys search <plugin>:   List components of a plugin
  agentsys list               List installed plugins (summary)
  agentsys list --all         List everything (plugins, agents, skills, commands, hooks)
  agentsys list --plugins     List plugins only
  agentsys list --agents      List all agents across plugins
  agentsys list --skills      List all skills across plugins
  agentsys list --commands    List all commands across plugins
  agentsys list --hooks       List all hooks across plugins
  agentsys update             Re-fetch latest versions of installed plugins

Non-Interactive Examples:
  agentsys --tool claude              # Install for Claude Code only
  agentsys --tool opencode            # Install for OpenCode only
  agentsys --tools "claude,opencode"  # Install for both
  agentsys --tools claude,opencode,codex,cursor,kiro  # Install for all
  agentsys --only next-task           # Install next-task + its dependencies
  agentsys --only "next-task,perf"    # Install specific plugins + deps

Development Mode:
  agentsys --development      # Install plugins directly to ~/.claude/plugins
                                   # Bypasses marketplace for testing RC versions

Model Handling:
  By default, model specifications (sonnet/opus/haiku) are stripped from agents
  when installing for OpenCode. This is because most users don't have the
  required model mappings configured. Use --no-strip or -ns to include models.

Environment Variables:
  AGENTSYS_STRIP_MODELS=0     Same as --no-strip

Supported Platforms:
  claude   - Claude Code (marketplace install or development mode)
  opencode - OpenCode (local commands + native plugin)
  codex    - Codex CLI (local skills)
  cursor   - Cursor (global ~/.cursor/ skills + commands)
  kiro     - Kiro (global ~/.kiro/ prompts + skills + agents)

Install:  npm install -g agentsys && agentsys
Update:   npm update -g agentsys && agentsys
Remove:   npm uninstall -g agentsys && agentsys --remove

Docs: https://github.com/agent-sh/agentsys
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // Handle --remove / --uninstall
  if (args.remove) {
    removeInstallation();
    return;
  }

  // Handle --version
  if (args.version) {
    console.log(`agentsys v${VERSION}`);
    return;
  }

  // Handle --help
  if (args.help) {
    printHelp();
    return;
  }

  // Handle subcommand help
  if (args.subcommandArg === '--help') {
    printSubcommandHelp(args.subcommand);
    return;
  }

  // Handle subcommands
  if (args.subcommand === 'list') {
    listInstalledPlugins(args.subcommandArg);
    return;
  }

  if (args.subcommand === 'update') {
    await updatePlugins();
    return;
  }

  if (args.subcommand === 'search') {
    searchPlugins(args.subcommandArg);
    return;
  }

  if (args.subcommand === 'install') {
    if (!args.subcommandArg) {
      console.error('[ERROR] Usage: agentsys install <plugin[@version]>');
      process.exit(1);
    }
    await installPlugin(args.subcommandArg, args);
    return;
  }

  if (args.subcommand === 'remove') {
    if (!args.subcommandArg) {
      console.error('[ERROR] Usage: agentsys remove <plugin>');
      process.exit(1);
    }
    removePlugin(args.subcommandArg);
    return;
  }

  // Determine which tools to install
  let selected = [];

  if (args.tool) {
    // Single tool specified
    selected = [args.tool];
  } else if (args.tools.length > 0) {
    // Multiple tools specified
    selected = args.tools;
  }

  // If no tools specified via flags, show interactive prompt
  if (selected.length === 0) {
    const title = `agentsys v${VERSION}`;
    const subtitle = 'Workflow automation for AI assistants';
    const width = Math.max(title.length, subtitle.length) + 6;
    const pad = (str) => {
      const left = Math.floor((width - str.length) / 2);
      const right = width - str.length - left;
      return ' '.repeat(left) + str + ' '.repeat(right);
    };

    console.log(`
┌${'─'.repeat(width)}┐
│${pad(title)}│
│${' '.repeat(width)}│
│${pad(subtitle)}│
└${'─'.repeat(width)}┘
`);

    // Multi-select platforms
    const options = [
      { value: 'claude', label: 'Claude Code' },
      { value: 'opencode', label: 'OpenCode' },
      { value: 'codex', label: 'Codex CLI' },
      { value: 'cursor', label: 'Cursor' },
      { value: 'kiro', label: 'Kiro' }
    ];

    selected = await multiSelect(
      'Which platforms do you want to install for?',
      options
    );

    if (selected.length === 0) {
      console.log('\nNo platforms selected. Exiting.');
      console.log('\nFor Claude Code, you can also install directly:');
      console.log('  /plugin marketplace add agent-sh/agentsys');
      process.exit(0);
    }
  }

  console.log(`\nInstalling for: ${selected.join(', ')}\n`);

  // Fetch external plugins to cache
  const marketplace = loadMarketplace();
  const onlyPlugins = args.only;
  const pluginNames = onlyPlugins.length > 0 ? onlyPlugins : marketplace.plugins.map(p => p.name);

  // Check core version compatibility
  for (const pName of pluginNames) {
    const entry = marketplace.plugins.find(p => p.name === pName);
    if (entry) checkCoreCompat(entry);
  }

  // Only copy to ~/.agentsys if OpenCode, Codex, or Cursor selected (they need local files)
  const needsLocalInstall = selected.includes('opencode') || selected.includes('codex') || selected.includes('cursor') || selected.includes('kiro');
  let installDir = null;

  if (needsLocalInstall) {
    installDir = getInstallDir();
    cleanOldInstallation(installDir);
    copyFromPackage(installDir);
    installDependencies(installDir);
  }

  await fetchExternalPlugins(pluginNames, marketplace);

  // Install for each platform
  const failedPlatforms = [];
  for (const platform of selected) {
    switch (platform) {
      case 'claude':
        if (args.development && !installForClaudeDevelopment()) {
          failedPlatforms.push('claude');
        } else {
          if (!args.development && !installForClaude()) {
            failedPlatforms.push('claude');
          }
        }
        break;
      case 'opencode':
        if (!installForOpenCode(installDir, { stripModels: args.stripModels })) {
          failedPlatforms.push('opencode');
        }
        break;
      case 'codex':
        if (!installForCodex(installDir)) {
          failedPlatforms.push('codex');
        }
        break;
      case 'cursor':
        if (!installForCursor(installDir)) {
          failedPlatforms.push('cursor');
        }
        break;
      case 'kiro':
        if (!installForKiro(installDir)) {
          failedPlatforms.push('kiro');
        }
        break;
    }
  }

  if (failedPlatforms.length > 0) {
    console.log(`\n[ERROR] Installation failed for: ${failedPlatforms.join(', ')}`);
    process.exitCode = 1;
  }

  console.log('─'.repeat(45));
  if (installDir) {
    console.log(`\nInstallation directory: ${installDir}`);
  }
  console.log('\nTo update:  npm update -g agentsys');
  console.log('To remove:  npm uninstall -g agentsys && agentsys --remove');
  console.log('\nDocs: https://github.com/agent-sh/agentsys');
}

// Export for testing when required as module
if (require.main === module) {
  main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  VALID_TOOLS,
  resolvePluginDeps,
  fetchPlugin,
  fetchExternalPlugins,
  resolvePluginRoot,
  loadMarketplace,
  getPluginCacheDir,
  listInstalledPlugins,
  updatePlugins,
  installPlugin,
  removePlugin,
  searchPlugins,
  loadInstalledJson,
  saveInstalledJson,
  recordInstall,
  recordedPlatforms,
  recordRemove,
  satisfiesRange,
  checkCoreCompat,
  detectInstalledPlatforms,
  getInstalledJsonPath,
  parseInstallTarget,
  loadComponents,
  resolveComponent,
  buildFilterFromComponent,
  resolvePluginSource,
  parseGitHubSource,
  installForCursor,
  installForKiro,
  claudeSpawnPlan
};
