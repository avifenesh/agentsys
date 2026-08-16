---
name: maintain-cross-platform
description: "Use when preparing releases, validating cross-platform compatibility, or updating installation infrastructure. Meta-skill for maintaining AgentSys's 3-platform architecture."
metadata:
  short-description: "Meta-skill: maintain 3-platform architecture"
  scope: local
  audience: repo-maintainers
---

# Maintain Cross-Platform Architecture

**Purpose:** Comprehensive knowledge of AgentSys's cross-platform infrastructure for release preparation, validation, and maintenance.

**Scope:** LOCAL skill for this repository only. Contains specific file locations, transformation rules, and automation patterns for maintaining Claude Code + OpenCode + Codex CLI compatibility.

## Critical Rules

1. **3 platforms MUST work** - Claude Code, OpenCode, Codex CLI. No exceptions.
2. **Validation before every push** - Pre-push hook runs 6 validators automatically.
3. **All version fields must align** - 11 files total (package.json + 10 plugin.json files).
4. **Documentation must be accurate** - Counts, paths, and platform references validated by CI.
5. **Update this skill** - If you find misalignments or automation opportunities, update this file.

---

## Platform Differences (The Complete Matrix)

### Configuration

| Aspect | Claude Code | OpenCode | Codex CLI |
|--------|-------------|----------|-----------|
| **Config format** | JSON | JSON/JSONC | TOML |
| **Config location** | `~/.claude/settings.json` | `~/.config/opencode/opencode.json` | `~/.codex/config.toml` |
| **State directory** | `.claude/` | `.opencode/` | `.codex/` |
| **Command prefix** | `/` | `/` | `$` |
| **Project instructions** | `CLAUDE.md` | `AGENTS.md` (reads CLAUDE.md) | `AGENTS.md` |

### Component Locations

| Component | Claude Code | OpenCode | Codex CLI |
|-----------|-------------|----------|-----------|
| **Commands** | Plugin `commands/` | `~/.config/opencode/commands/` | N/A (use skills) |
| **Agents** | Plugin `agents/` | `~/.config/opencode/agents/` | N/A (use MCP) |
| **Skills** | Plugin `skills/` | `.opencode/skills/` (singular) | `~/.codex/skills/` |
| **Hooks** | Plugin `hooks/` | Plugin `hooks/` | Plugin `hooks/` |

### Install Locations (This Repo)

| Platform | Package Copy | Commands | Agents | Skills | Config |
|----------|--------------|----------|--------|--------|--------|
| Claude Code | Via marketplace | Plugin bundled | Plugin bundled | Plugin bundled | N/A |
| OpenCode | `~/.agentsys/` | `~/.config/opencode/commands/` | `~/.config/opencode/agents/` (29 files) | N/A | `~/.config/opencode/opencode.json` |
| Codex CLI | `~/.agentsys/` | N/A | N/A | `~/.codex/skills/` (9 directories) | `~/.codex/config.toml` |

### Frontmatter Differences

**Command Frontmatter:**

```yaml
# Claude Code
---
description: Task description
argument-hint: "[args]"
allowed-tools: Bash(git:*), Read, Task
---

# OpenCode (transformed by installer)
---
description: Task description
agent: general
# model field REMOVED (uses user's default model)
---

# Codex (skills use different format)
---
name: skill-name
description: "Use when user asks to \"trigger\". Does X."
---
```

**Agent Frontmatter:**

```yaml
# Claude Code
---
name: agent-name
description: Agent description
tools: Bash(git:*), Read, Edit, Task
model: sonnet
---

# OpenCode (transformed by installer)
---
name: agent-name
description: Agent description
mode: subagent
# model field REMOVED (OpenCode doesn't support per-agent models yet)
permission:
  read: allow
  edit: allow
  bash: ask
  task: allow
---
```

**Transformation Rules (bin/cli.js handles this):**

| Claude Code | OpenCode |
|-------------|----------|
| `tools: Bash(git:*)` | `permission: { bash: "allow" }` |
| `tools: Read` | `permission: { read: "allow" }` |
| `tools: Edit, Write` | `permission: { edit: "allow" }` |
| `tools: Task` | `permission: { task: "allow" }` |
| `model: sonnet/opus/haiku` | **REMOVED** (OpenCode uses user default) |

**CRITICAL:** The `--strip-models` flag in `bin/cli.js` removes model specifications for OpenCode users who don't have access to all three model tiers.

---

## File Locations (This Repository)

### Installation Infrastructure

| File | Purpose |
|------|---------|
| `bin/cli.js` | Main installer (811 lines) - handles all 3 platforms |
| `scripts/setup-hooks.js` | Git hooks installer (pre-commit, pre-push) |
| `adapters/opencode-plugin/` | Native OpenCode TypeScript plugin |
| `adapters/opencode/` | Generated OpenCode commands, agents, skills |
| `adapters/codex/` | Generated Codex skills |
| `mcp-server/index.js` | Cross-platform MCP server |

### Validation Scripts (All in CI + Pre-Push)

| Script | What It Validates | Exit 1 If |
|--------|-------------------|-----------|
| `scripts/validate-plugins.js` | Plugin structure, plugin.json validity | Invalid plugin.json |
| `scripts/validate-cross-platform.js` | 3-platform compatibility | Platform-specific code |
| `scripts/validate-repo-consistency.js` | Repo integrity | Inconsistencies |
| `scripts/check-hardcoded-paths.js` | No hardcoded `.claude/` paths | Hardcoded paths found |
| `scripts/validate-counts.js` | Doc accuracy (agents, plugins, skills, versions) | Count mismatches |
| `scripts/validate-cross-platform-docs.js` | Platform docs consistency | Doc conflicts |

### Transformation Mappings (bin/cli.js)

**Search markers in bin/cli.js:**
- `PLUGINS_ARRAY` - Line 138 - Plugins to install for Claude Code
- `OPENCODE_COMMAND_MAPPINGS` - Line 242 - Commands to copy for OpenCode
- `CODEX_SKILL_MAPPINGS` - Line ~280 - Skills to create for Codex

**OPENCODE_COMMAND_MAPPINGS format:**
```javascript
['dest-file.md', 'plugin-name', 'source-file.md']
```

**CODEX_SKILL_MAPPINGS format:**
```javascript
['skill-name', 'plugin-name', 'source-file.md', 'Trigger description with "phrases"']
```

### Version Fields (11 Files Total)

All must have SAME version for releases:

1. `package.json` - Line 3
2. `.claude-plugin/plugin.json` - Root plugin
3. `.claude-plugin/marketplace.json` - 9 plugin entries
4. `mcp-server/index.js` - Search: `MCP_SERVER_VERSION`
5-13. `plugins/*/. claude-plugin/plugin.json` - All 9 plugins

**Quick check:**
```bash
grep -r '"version"' package.json plugins/*/.claude-plugin/plugin.json .claude-plugin/plugin.json
```

---

## Release Process (RC and Production)

### RC Release (3.X.0-rc.N)

**Step 1: Update Versions**
```bash
# Bump to RC version in ALL 11 files
NEW_VERSION="3.6.0-rc.1"

# package.json
npm version $NEW_VERSION --no-git-tag-version

# All plugin.json files (9 plugins + root)
find . -name "plugin.json" -path "*/.claude-plugin/*" -exec sed -i '' "s/\"version\": \".*\"/\"version\": \"$NEW_VERSION\"/" {} \;

# mcp-server/index.js
sed -i '' "s/version: '.*'/version: '$NEW_VERSION'/" mcp-server/index.js
```

**Step 2: Update CHANGELOG.md**
```markdown
## [3.6.0-rc.1] - 2026-01-30

### Added
- Feature description

### Changed
- Change description

### Fixed
- Bug fix description
```

**Step 3: Validate**
```bash
npm run validate    # All 6 validators
npm test            # All tests
npm pack --dry-run  # Package builds
```

**Step 4: Commit and Tag**
```bash
git add -A
git commit -m "chore: release v3.6.0-rc.1"
git tag v3.6.0-rc.1
git push origin main --tags
```

**Step 5: Verify**
```bash
# Wait for GitHub Actions
npm view agentsys@rc version  # Should show 3.6.0-rc.1
```

### Production Release (3.X.0)

Same as RC but:
- Remove `-rc.N` suffix from version
- Tag with `v3.X.0` (no suffix)
- npm publishes to `latest` tag automatically

---

## What Changes Per Release

### Always Update

1. **Version fields (11 files)** - See "Version Fields" section above
2. **CHANGELOG.md** - Add new entry at top
3. **Run validation** - `npm run validate` (includes all 6 validators)
4. **Run tests** - `npm test` (1400+ tests)
5. **Package build** - `npm pack --dry-run`

### If New Command Added

1. **Convention-based discovery** - Plugins auto-discovered from `plugins/*/` with `.claude-plugin/plugin.json`
2. **Commands auto-discovered** - From `plugins/*/commands/*.md` files
3. **Codex trigger phrases** - Use `codex-description` frontmatter in command files
4. **docs/INSTALLATION.md** - Add `/plugin install <name>@agentsys` line
5. **.claude-plugin/marketplace.json** - Add plugin entry to `plugins` array
6. **README.md** - Add to commands table
7. **Validation will catch** - If counts don't match (plugins count)

### If New Agent Added

1. **No changes needed** - Installer auto-copies agents to OpenCode `~/.config/opencode/agents/`
2. **Codex uses MCP** - Agents not directly supported, use MCP tools instead
3. **Validation will catch** - If file-based agent count changes

### If New Skill Added

1. **Codex requires trigger phrases** - Description must include "Use when user asks to..."
2. **Validation will catch** - If skill count doesn't match

### If New MCP Tool Added

1. **mcp-server/index.js** - Add to TOOLS array and toolHandlers
2. **.claude-plugin/marketplace.json** - Add to `mcpServer.tools` array
3. **bin/cli.js** - Update MCP tools console output (OpenCode + Codex)
4. **README.md** - Add to MCP tools table if user-facing

### If Library Module Changed

1. **lib/{module}/** - Make changes
2. **lib/index.js** - Export if new module
3. **Run sync** - `./scripts/sync-lib.sh` (or `agentsys-dev sync-lib`) copies lib/ to all 9 plugins
4. **Commit both** - Source in lib/ AND copies in plugins/*/lib/

---

## Platform-Specific Transformations (What bin/cli.js Does)

### OpenCode Transformations

**1. Remove Model Specifications (if --strip-models)**
```javascript
// Original (Claude Code):
model: sonnet

// Transformed (OpenCode):
(field removed entirely)
```

**Why:** Not all OpenCode users have access to all three model tiers. Uses user's default model instead.

**2. Transform Tools to Permissions**
```javascript
// Original:
tools: Bash(git:*), Read, Edit, Task

// Transformed:
permission:
  bash: allow
  read: allow
  edit: allow
  task: allow
```

**3. Replace Environment Variables**
```javascript
// Original:
${CLAUDE_PLUGIN_ROOT}

// Transformed:
${PLUGIN_ROOT}
```

**4. Normalize Windows Paths in require()**
```javascript
// Original:
require('${CLAUDE_PLUGIN_ROOT}/lib/module.js')

// Transformed:
require('${PLUGIN_ROOT}'.replace(/\\/g, '/') + '/lib/module.js')
```

**Why:** Windows backslashes (`C:\Users\...`) break JavaScript string escaping.

### Codex Transformations

**1. Command → Skill Conversion**
```javascript
// Commands become skills with trigger phrases
// Original command: /next-task
// Becomes: $next-task with SKILL.md

// SKILL.md requires:
---
name: next-task
description: "Use when user asks to \"find next task\", \"automate workflow\". Master orchestrator."
---
```

**2. Agent Logic → Inline in Skills**
- Agents not supported directly in Codex
- Agent workflows embedded in skill instructions
- Or use MCP tools to invoke agent logic

---

## Validation Suite (Pre-Push + CI)

### validate:plugins
**File:** `scripts/validate-plugins.js`
**Checks:**
- plugin.json structure validity
- Required fields present
- Commands/agents/skills exist as declared

**Exit 1 if:** Invalid plugin.json

### validate:cross-platform
**File:** `scripts/validate-cross-platform.js`
**Checks:**
- Code works on all 3 platforms
- No platform-specific assumptions
- Proper use of AI_STATE_DIR

**Exit 1 if:** Platform-specific code detected

### validate:consistency
**File:** `scripts/validate-repo-consistency.js`
**Checks:**
- Repository integrity
- File structure consistency

**Exit 1 if:** Inconsistencies found

### validate:paths
**File:** `scripts/check-hardcoded-paths.js`
**Checks:**
- No hardcoded `.claude/` paths in agents/commands/skills
- Excludes: docs, SKILL.md in enhance/, RESEARCH.md, examples

**Patterns detected:**
```regex
/\.claude\/(?!.*\(example\)|.*Platform|.*State directory)/
/\.opencode\/(?!.*\(example\)|.*Platform)/
/\.codex\/(?!.*\(example\)|.*Platform)/
```

**Safe contexts (skipped):**
- Documentation tables (`| State Dir |`)
- Platform comparison examples
- Skill documentation (enhance/* SKILL.md)
- Checklist references

**Exit 1 if:** Hardcoded paths found outside safe contexts

### validate:counts
**File:** `scripts/validate-counts.js`
**Checks:**
- Plugin count (9) across README, CLAUDE.md, AGENTS.md, package.json, docs
- Agent count (39 total = 29 file-based + 10 role-based) across all docs
- Skill count (23) across all docs
- Version alignment (package.json matches all 10 plugin.json files)
- CLAUDE.md ↔ AGENTS.md critical rules alignment (>90% similarity)

**Actual counts (filesystem):**
- Plugins: 9 directories in `plugins/`
- File-based agents: 29 .md files in `plugins/*/agents/`
- Role-based agents: 10 (from audit-project, defined inline)
- Skills: 23 SKILL.md files in `plugins/*/skills/*/SKILL.md`

**Smart validation:**
- Accepts "39 agents" or "39 agents (29 file-based + 10 role-based)"
- Skips plugin-specific counts like "next-task (12 agents)"
- Only validates top-level totals

**Exit 1 if:** Count mismatches or version misalignment

### validate:platform-docs
**File:** `scripts/validate-cross-platform-docs.js`
**Checks:**
- Command prefix consistency (/ vs $)
- State directory references platform-appropriate
- Feature parity (all 9 commands documented for all platforms)
- Installation instructions consistent
- MCP server configurations correct

**Smart validation:**
- Skips comparison tables
- Skips checklist references
- Skips skill name mentions (like `enhance-claude-memory`)
- Skips documentation examples

**Exit 1 if:** Platform conflicts or missing features

---

## Pre-Push Hook (Automatic Enforcement)

**File:** `scripts/setup-hooks.js` → Creates `.git/hooks/pre-push`

**Phase 1: Validation Suite**
```bash
npm run validate  # Runs all 6 validators
```
Blocks if any validator fails.

**Phase 2: Enhanced Content Check**
Detects modified:
- `agents/*.md`
- `skills/*/SKILL.md`
- `hooks/*.md`
- `prompts/*.md`

Prompts: "Have you run /enhance on these files? (y/N)"
Blocks if "N" (per CLAUDE.md Critical Rule #7).

**Phase 3: Release Tag Validation**
If pushing version tag (v*):
- Runs `npm test`
- Runs `npm pack --dry-run`
- Blocks if either fails

**Skip hook:** `git push --no-verify` (use with caution)

---

## Installer Deep Dive (bin/cli.js)

### Interactive Flow

1. **Platform Selection** - Multi-select: Claude Code, OpenCode, Codex CLI
2. **Clean Old Installation** - Removes `~/.agentsys/` if exists
3. **Copy Package** - From npm global to `~/.agentsys/`
4. **Install Dependencies** - Runs `npm install --production` in package and mcp-server
5. **Per-Platform Installation:**
   - Claude Code: Adds marketplace, installs 9 plugins
   - OpenCode: Copies commands, agents; updates config; installs native plugin
   - Codex: Creates skills with trigger phrases; updates config

### Key Functions

**installForClaude()** - Line 116
- Adds marketplace: `claude plugin marketplace add agent-sh/agentsys`
- Installs 9 plugins: `claude plugin install {plugin}@agentsys`
- Commands: /next-task, /ship, /deslop, /audit-project, /drift-detect, /enhance, /perf, /sync-docs, /repo-intel

**installForOpenCode(installDir, options)** - Line 165
- Creates dirs: `~/.config/opencode/commands/`, `~/.config/opencode/plugins/agentsys.ts`
- Copies native plugin from `adapters/opencode-plugin/`
- Transforms commands using `OPENCODE_COMMAND_MAPPINGS`
- Transforms agents (tools → permissions, strips models if --strip-models)
- Updates `~/.config/opencode/opencode.json` with MCP config

**installForCodex(installDir)** - Line 330+
- Creates dir: `~/.codex/skills/`
- Creates SKILL.md files using `CODEX_SKILL_MAPPINGS`
- Each skill gets trigger-phrase description
- Updates `~/.codex/config.toml` with MCP config

### Command Mappings (OpenCode)

**OPENCODE_COMMAND_MAPPINGS** - Line ~242:
```javascript
const commandMappings = [
  ['deslop.md', 'deslop', 'deslop.md'],
  ['enhance.md', 'enhance', 'enhance.md'],
  ['next-task.md', 'next-task', 'next-task.md'],
  ['delivery-approval.md', 'next-task', 'delivery-approval.md'],
  ['sync-docs.md', 'sync-docs', 'sync-docs.md'],
  ['audit-project.md', 'audit-project', 'audit-project.md'],
  ['drift-detect.md', 'drift-detect', 'drift-detect.md'],
  ['repo-intel.md', 'repo-intel', 'repo-intel.md'],
  ['perf.md', 'perf', 'perf.md'],
  ['ship.md', 'ship', 'ship.md']
];
```

### Skill Mappings (Codex)

**CODEX_SKILL_MAPPINGS** - Line ~280+:
```javascript
const skillMappings = [
  ['next-task', 'next-task', 'next-task.md',
    'Use when user asks to "find next task", "automate workflow". Master workflow orchestrator.'],
  ['ship', 'ship', 'ship.md',
    'Use when user asks to "create PR", "ship changes", "merge PR". Complete PR workflow.'],
  // ... 7 more
];
```

---

## Adding New Features (Step-by-Step)

### New Command (e.g., /my-command)

**1. Create command file:**
```bash
plugins/my-plugin/commands/my-command.md
```

**2. Update bin/cli.js - 3 locations:**

**a) PLUGINS_ARRAY (if new plugin):**
```javascript
// Line ~138
const plugins = ['next-task', 'ship', ..., 'my-plugin'];
```

**b) OPENCODE_COMMAND_MAPPINGS:**
```javascript
// Line ~242
['my-command.md', 'my-plugin', 'my-command.md'],
```

**c) CODEX_SKILL_MAPPINGS:**
```javascript
// Line ~280
['my-command', 'my-plugin', 'my-command.md',
  'Use when user asks to "trigger phrase". Description of capability.'],
```

**3. Update marketplace.json:**
```json
// .claude-plugin/marketplace.json - Add to plugins array
{
  "name": "my-plugin",
  "version": "3.5.0",
  "description": "...",
  "path": "plugins/my-plugin"
}
```

**4. Create plugin.json:**
```bash
plugins/my-plugin/.claude-plugin/plugin.json
```

**5. Update docs:**
- `docs/INSTALLATION.md` - Add install command
- `README.md` - Add to commands table
- CHANGELOG.md - Add under "Added"

**6. Validate:**
```bash
npm run validate  # Will catch missing mappings
```

### New Agent (e.g., my-agent)

**1. Create agent file:**
```bash
plugins/my-plugin/agents/my-agent.md
```

With proper frontmatter:
```yaml
---
name: my-agent
description: Brief description
tools: Bash(git:*), Read, Edit
model: sonnet
---
```

**2. Installer handles automatically:**
- ✅ Copies to `~/.config/opencode/agents/my-agent.md`
- ✅ Transforms frontmatter (tools → permissions)
- ✅ Strips model if --strip-models flag
- ✅ Normalizes Windows paths in require()

**3. No Codex changes needed** - Codex uses MCP, not agents

**4. Validate:**
```bash
npm run validate:counts  # Will update agent count if added
```

### New Skill (e.g., my-skill)

**1. Create skill directory and file:**
```bash
plugins/my-plugin/skills/my-skill/SKILL.md
```

With frontmatter:
```yaml
---
name: my-skill
description: "Use when user asks to \"trigger\". Description."
metadata:
  short-description: "Brief"
---
```

**2. If user-invocable (Codex):**
Add to CODEX_SKILL_MAPPINGS in bin/cli.js

**3. Validate:**
```bash
npm run validate:counts  # Will check skill count matches
```

### New MCP Tool

**1. Add to mcp-server/index.js:**

**a) TOOLS array:**
```javascript
const TOOLS = [
  // ...
  {
    name: 'my_tool',
    description: 'Tool description',
    inputSchema: {
      type: 'object',
      properties: { param: { type: 'string' } },
      required: ['param']
    }
  }
];
```

**b) toolHandlers object:**
```javascript
const toolHandlers = {
  // ...
  my_tool: async (params) => {
    // Implementation
    return xplat.successResponse({ result: 'data' });
  }
};
```

**2. Update marketplace.json:**
```json
// .claude-plugin/marketplace.json
"mcpServer": {
  "tools": ["workflow_status", ..., "my_tool"]
}
```

**3. Update docs:**
- `README.md` - Add to features if user-facing

---

## Common Release Pitfalls (And How Validators Catch Them)

### Pitfall 1: Forgot to Update Plugin Version
```bash
# Symptoms:
- package.json says 3.6.0
- plugins/next-task/.claude-plugin/plugin.json says 3.5.0

# Caught by:
npm run validate:counts
# → [ERROR] Version misalignment
```

### Pitfall 2: Hardcoded .claude/ Path
```bash
# Symptoms:
- Agent contains: `.claude/flow.json`
- OpenCode and Codex break

# Caught by:
npm run validate:paths
# → [ERROR] Hardcoded path found in agents/my-agent.md:42
```

### Pitfall 3: Agent Count Mismatch
```bash
# Symptoms:
- Added new agent
- README still says "39 agents"
- Actually 40 now

# Caught by:
npm run validate:counts
# → [ERROR] README.md agents: Expected 40, Actual 39
```

### Pitfall 4: Missing Trigger Phrase (Codex)
```bash
# Symptoms:
- Codex skill has: description: "Master orchestrator"
- No trigger phrases
- Codex doesn't know when to invoke

# Caught by:
/enhance --focus=skills
# → [MEDIUM] Description missing trigger phrases
```

### Pitfall 5: OpenCode Label Too Long
```bash
# Symptoms:
- AskUserQuestion label: "#123: Fix authentication timeout in ProfileScreen component"
- 65 characters
- OpenCode throws error

# Prevention:
Use truncateLabel() function in task-discoverer agent
Max 30 chars for OpenCode compatibility
```

### Pitfall 6: Forgot to Run /enhance
```bash
# Symptoms:
- Modified agents/skills
- Didn't run /enhance
- Pushed anyway

# Caught by:
Pre-push hook prompts: "Have you run /enhance? (y/N)"
Blocks push if "N"
```

---

## Automation Opportunities (Always Consider)

### Current Automations

1. ✅ **lib/ sync** - Pre-commit hook auto-syncs lib/ to plugins/
2. ✅ **Validation** - Pre-push hook runs 6 validators
3. ✅ **Agent transformation** - Installer auto-transforms frontmatter
4. ✅ **Model stripping** - `--strip-models` flag for OpenCode
5. ✅ **Version checking** - validate:counts catches misalignment
6. ✅ **Path checking** - validate:paths catches hardcoded paths
7. ✅ **/enhance enforcement** - Pre-push hook prompts

### Potential Improvements

**1. Version Bump Automation**
```bash
# Current: Manual find/replace in 11 files
# Opportunity: Script that updates all version fields atomically
# Script: scripts/bump-version.js <new-version>
```

**2. CHANGELOG Entry Generation**
```bash
# Current: Manual entry creation
# Opportunity: Parse git log since last tag, categorize commits
# Script: scripts/generate-changelog-entry.js
```

**3. Cross-Platform Install Test**
```bash
# Current: Manual testing on each platform
# Opportunity: Docker containers for each platform, automated smoke tests
# Script: scripts/test-install-all-platforms.sh
```

**4. Agent Count Auto-Update**
```bash
# Current: Manual count updates in docs
# Opportunity: Extract counts from filesystem, update docs automatically
# Script: scripts/update-doc-counts.js
```

**5. Marketplace.json Sync**
```bash
# Current: Manual updates to .claude-plugin/marketplace.json
# Opportunity: Generate from plugins/ directory structure
# Script: scripts/sync-marketplace-manifest.js
```

**If you identify more automation opportunities, ADD THEM HERE.**

---

## Your Responsibilities (Agent Using This Skill)

### Before Push

1. **Run validations:**
   ```bash
   npm run validate
   ```
   Fix any issues found.

2. **If modified enhanced content (agents/skills/hooks/prompts):**
   ```bash
   /enhance
   ```
   Address HIGH certainty findings.

3. **Check for misalignments in this skill:**
   - New script added but not documented here?
   - New platform difference discovered?
   - New validation pattern needed?
   - UPDATE THIS FILE if yes

4. **Think about automation:**
   - Can this manual step be automated?
   - Is there a pattern we're repeating?
   - ADD to "Potential Improvements" section

### Before Release

1. **Read release checklist:**
   ```bash
   cat checklists/release.md
   ```

2. **Update all 11 version fields:**
   - Use version bump script (if exists) or manual find/replace
   - Validate: `npm run validate:counts`

3. **Update CHANGELOG.md:**
   - Add entry at top with date
   - Categorize: Added/Changed/Fixed/Removed

4. **Run full validation:**
   ```bash
   npm test                  # 1400+ tests
   npm run validate          # All 6 validators
   npm pack --dry-run        # Package builds
   ```

5. **Test cross-platform install:**
   ```bash
   npm pack
   npm install -g ./agentsys-*.tgz
   echo "1 2 3" | agentsys  # Test installer
   ```

6. **Commit and tag:**
   ```bash
   git add -A
   git commit -m "chore: release v3.X.0-rc.N"
   git tag v3.X.0-rc.N
   git push origin main --tags
   ```

7. **Verify npm publish:**
   ```bash
   # Wait for GitHub Actions release workflow
   npm view agentsys@rc version  # For RC
   npm view agentsys version     # For production
   ```

### Update Misalignments

If you find any of these while working:

**New script not documented here:**
1. Read the script to understand what it does
2. Add to relevant section (Validation Suite, Installation, etc.)
3. Commit: "docs(maintain-cross-platform): document {script-name}"

**New platform difference discovered:**
1. Test on all 3 platforms to confirm
2. Add to "Platform Differences" matrix
3. Add to "Common Pitfalls" if it causes issues
4. Update relevant validation script if needed

**New validation pattern needed:**
1. Consider: Can existing validator be extended?
2. If new validator needed, create in `scripts/validate-{name}.js`
3. Add to `package.json` validate script
4. Document in "Validation Suite" section
5. Update "Pre-Push Hook" section if relevant

**Automation opportunity identified:**
1. Add to "Potential Improvements" with description
2. Estimate effort (simple/medium/complex)
3. Note dependencies (tools needed, testing required)

---

## Quick Reference: File Counts

**Plugins:** 9
1. next-task
2. enhance
3. ship
4. perf
5. audit-project
6. deslop
7. drift-detect
8. repo-intel
9. sync-docs

**Agents:** 39 total = 29 file-based + 10 role-based

**File-based (29):** Count files in `plugins/*/agents/*.md`
- next-task: 12
- enhance: 9
- perf: 6
- drift-detect: 1
- repo-intel: 1

**Role-based (10):** Defined inline in audit-project command
- code-quality-reviewer, security-expert, performance-engineer, test-quality-guardian
- architecture-reviewer, database-specialist, api-designer
- frontend-specialist, backend-specialist, devops-reviewer

**Skills:** 23 - Count SKILL.md in `plugins/*/skills/*/SKILL.md`
- next-task: 1 (discover-tasks)
- prepare-delivery: 4 (prepare-delivery, check-test-coverage, orchestrate-review, validate-delivery)
- enhance: 10 (orchestrator, reporter, agent-prompts, claude-memory, docs, plugins, prompts, hooks, skills)
- perf: 8 (analyzer, baseline, benchmark, code-paths, investigation-logger, profile, theory, theory-tester)
- drift-detect: 1 (drift-analysis)
- repo-intel: 1 (repo-intel)

**Version Fields:** 11 files
- 1x package.json
- 1x .claude-plugin/plugin.json
- 9x plugins/*/.claude-plugin/plugin.json
- 1x mcp-server/index.js (MCP_SERVER_VERSION constant)

---

## Constraints

- **NEVER break existing functionality** - Production project with real users
- **ALWAYS test on all 3 platforms** - At least smoke test
- **ALWAYS update this skill** - If you find gaps or improvements
- **ALWAYS run validation** - Pre-push hook enforces this
- **Documentation must stay accurate** - Validators enforce this

---

## Output Format

When using this skill, output:

```markdown
## Cross-Platform Compatibility Check

### Validations Run
- [OK/ERROR] validate:plugins
- [OK/ERROR] validate:cross-platform
- [OK/ERROR] validate:consistency
- [OK/ERROR] validate:paths
- [OK/ERROR] validate:counts
- [OK/ERROR] validate:platform-docs

### Issues Found
[List any issues with file:line references]

### Misalignments in This Skill
[List any outdated information found in this skill]

### Automation Opportunities
[List any manual steps that could be automated]

### Actions Taken
[List files updated/created]

### Next Steps
[List remaining work]
```

---

## Version

**Skill Version:** 1.0.0
**Last Updated:** 2026-01-30
**Covers:** AgentSys v5.0.0 architecture

**Update this skill when:**
- New platform added
- New validation script created
- Installation process changes
- New automation implemented
- Platform differences discovered
