#!/usr/bin/env bash
set -e

# [DEPRECATED] This script is outdated and uses old plugin names.
# Use instead: agentsys --tool opencode
# Or: node scripts/dev-install.js opencode

# OpenCode Installer for agentsys commands
# This script installs all 5 slash commands for use with OpenCode

echo "[INSTALL] Installing agentsys commands for OpenCode..."
echo

# Configuration
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Use $HOME which works correctly on all platforms including Git Bash on Windows
# (Git Bash sets HOME to Unix-style path like /c/Users/username)
# OpenCode global config follows XDG Base Directory Specification:
# - Default: ~/.config/opencode/
# - Override: $XDG_CONFIG_HOME/opencode/ (if XDG_CONFIG_HOME is set and not empty/whitespace)
# Note: Must match logic in scripts/dev-install.js getOpenCodeConfigDir()
if [[ -n "${XDG_CONFIG_HOME}" && "${XDG_CONFIG_HOME}" =~ [^[:space:]] ]]; then
  OPENCODE_CONFIG_DIR="${XDG_CONFIG_HOME}/opencode"
else
  OPENCODE_CONFIG_DIR="${HOME}/.config/opencode"
fi
# OpenCode expects commands directly in commands/, not a subdirectory
OPENCODE_COMMANDS_DIR="${OPENCODE_CONFIG_DIR}/commands"
LIB_DIR="${OPENCODE_COMMANDS_DIR}/lib"

# Legacy path for cleanup (incorrect, pre-XDG location)
LEGACY_OPENCODE_DIR="${HOME}/.opencode"

# Detect OS for platform-specific notes
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" || "$OSTYPE" == "cygwin" ]]; then
  IS_WINDOWS=true
else
  IS_WINDOWS=false
fi

echo "[CONFIG] Configuration:"
echo "  Repository: $REPO_ROOT"
echo "  Install to: $OPENCODE_COMMANDS_DIR"
echo

# Check prerequisites
echo "[CHECK] Checking prerequisites..."

# Check Node.js
if ! command -v node &> /dev/null; then
  echo "[ERROR] Node.js not found. Install from: https://nodejs.org"
  exit 1
fi
NODE_VERSION=$(node --version)
echo "  [OK] Node.js $NODE_VERSION"

# Check Git
if ! command -v git &> /dev/null; then
  echo "[ERROR] Git not found. Install from: https://git-scm.com"
  exit 1
fi
GIT_VERSION=$(git --version | cut -d' ' -f3)
echo "  [OK] Git $GIT_VERSION"

# Check OpenCode (optional - user may not have it installed yet)
if command -v opencode &> /dev/null; then
  OPENCODE_VERSION=$(opencode --version 2>&1 | head -n1 || echo "unknown")
  echo "  [OK] OpenCode $OPENCODE_VERSION"
else
  echo "  [WARN]  OpenCode not found (install from: https://opencode.ai)"
  echo "     You can still install commands and use OpenCode later"
fi

echo

# Create directories
echo "[DIR] Creating directories..."
mkdir -p "$OPENCODE_COMMANDS_DIR"
mkdir -p "$LIB_DIR"/{platform,patterns,utils}
echo "  [OK] Created $OPENCODE_COMMANDS_DIR"
echo "  [OK] Created $LIB_DIR"
echo

# Copy library files from shared root lib directory
echo "[LIB] Installing shared libraries..."
# Use explicit iteration to handle paths with spaces safely
for item in "${REPO_ROOT}/lib"/*; do
  cp -r "$item" "${LIB_DIR}/"
done
echo "  [OK] Copied platform detection"
echo "  [OK] Copied pattern libraries"
echo "  [OK] Copied utility functions"
echo

# Install commands with path adjustments
echo "[SETUP] Installing commands..."

# Command mappings: target_name:plugin:source_file
# Format allows commands from different plugins
COMMAND_MAPPINGS=(
  "deslop-around:deslop-around:deslop-around"
  "next-task:next-task:next-task"
  "delivery-approval:next-task:delivery-approval"
  "sync-docs:sync-docs:sync-docs"
  "project-review:project-review:project-review"
  "ship:ship:ship"
  "reality-check-scan:reality-check:scan"
)

for mapping in "${COMMAND_MAPPINGS[@]}"; do
  IFS=':' read -r TARGET_NAME PLUGIN SOURCE_NAME <<< "$mapping"
  SOURCE_FILE="$REPO_ROOT/plugins/$PLUGIN/commands/$SOURCE_NAME.md"
  TARGET_FILE="$OPENCODE_COMMANDS_DIR/$TARGET_NAME.md"

  if [ -f "$SOURCE_FILE" ]; then
    # Copy and transform CLAUDE_PLUGIN_ROOT -> PLUGIN_ROOT for OpenCode
    sed 's/\${CLAUDE_PLUGIN_ROOT}/${PLUGIN_ROOT}/g; s/\$CLAUDE_PLUGIN_ROOT/$PLUGIN_ROOT/g' \
      "$SOURCE_FILE" > "$TARGET_FILE"
    echo "  [OK] Installed /$TARGET_NAME"
  else
    echo "  [WARN]  Skipped /$TARGET_NAME (source not found: $SOURCE_FILE)"
  fi
done

# Remove old/legacy commands that no longer exist
OLD_COMMANDS=("pr-merge")
for old_cmd in "${OLD_COMMANDS[@]}"; do
  if [ -f "$OPENCODE_COMMANDS_DIR/$old_cmd.md" ]; then
    rm "$OPENCODE_COMMANDS_DIR/$old_cmd.md"
    echo "  [DEL]  Removed legacy /$old_cmd"
  fi
done

echo

# Create environment setup script
echo "[ENV] Creating environment setup..."
cat > "$OPENCODE_COMMANDS_DIR/env.sh" << 'EOF'
#!/usr/bin/env bash
# Environment variables for agentsys commands in OpenCode

# Set the root directory for commands to find libraries
export OPENCODE_COMMANDS_ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Add lib directory to NODE_PATH if needed
export NODE_PATH="${OPENCODE_COMMANDS_ROOT}/lib:${NODE_PATH}"

# Platform detection helpers
export AGENTSYS_PLATFORM_SCRIPT="${OPENCODE_COMMANDS_ROOT}/lib/platform/detect-platform.js"
export AGENTSYS_TOOLS_SCRIPT="${OPENCODE_COMMANDS_ROOT}/lib/platform/verify-tools.js"
EOF

chmod +x "$OPENCODE_COMMANDS_DIR/env.sh"
echo "  [OK] Created environment setup script"
echo

# Install native OpenCode plugin (auto-thinking, workflow enforcement, compaction)
echo "[PLUGIN] Installing native plugin..."
PLUGIN_DIR="${OPENCODE_CONFIG_DIR}/plugins"
PLUGIN_DEST="${PLUGIN_DIR}/agentsys.ts"
PLUGIN_SRC="${REPO_ROOT}/adapters/opencode-plugin"

if [ -d "$PLUGIN_SRC" ]; then
  mkdir -p "$PLUGIN_DIR"
  cp "$PLUGIN_SRC/index.ts" "$PLUGIN_DEST" 2>/dev/null || true
  echo "  [OK] Installed native plugin to $PLUGIN_DEST"
  echo "    Features: Auto-thinking selection, workflow enforcement, session compaction"
else
  echo "  [WARN]  Native plugin source not found at $PLUGIN_SRC"
fi
echo

# Create README
cat > "$OPENCODE_COMMANDS_DIR/README.md" << 'EOF'
# agentsys for OpenCode

This directory contains the agentsys commands adapted for OpenCode.

## Available Commands

- `/deslop-around` - AI slop cleanup with minimal diffs
- `/next-task` - Intelligent task prioritization
- `/project-review` - Multi-agent code review
- `/ship` - Complete PR workflow
- `/pr-merge` - Intelligent PR merge

## Usage

In OpenCode TUI, invoke commands directly:

```bash
/deslop-around
/next-task
/project-review
/ship
/pr-merge
```

You can also pass arguments:
```bash
/deslop-around apply
/next-task bug
/ship --strategy rebase
```

## OpenCode-Specific Features

OpenCode supports additional features you can use with these commands:

- **@filename** - Include file contents in prompt
- **!command** - Include bash command output in prompt

Example:
```bash
/project-review @src/main.py
/deslop-around apply !git diff --name-only
```

## Environment

Commands use the shared library at:
```
~/.config/opencode/commands/lib/
```

## Updates

To update commands, re-run the installer:
```bash
cd /path/to/agentsys
./adapters/opencode/install.sh
```

## Support

- Repository: https://github.com/agent-sh/agentsys
- Issues: https://github.com/agent-sh/agentsys/issues
EOF

echo "  [OK] Created README"
echo

# Run migration tool to set up native OpenCode agents
echo "[MIGRATE] Setting up native OpenCode agents..."
if [ -f "$REPO_ROOT/scripts/migrate-opencode.js" ]; then
  node "$REPO_ROOT/scripts/migrate-opencode.js" --target "$(pwd)" 2>/dev/null || true
  echo "  [OK] Native agents configured"
else
  echo "  [SKIP] Migration script not found"
fi
echo

# Clean up legacy paths (~/.opencode/ - incorrect, pre-XDG location)
echo "[CLEANUP] Checking for legacy installations..."
LEGACY_COMMANDS_DIR="${LEGACY_OPENCODE_DIR}/commands/agentsys"
LEGACY_PLUGINS_DIR="${LEGACY_OPENCODE_DIR}/plugins/agentsys"
LEGACY_AGENTS_DIR="${LEGACY_OPENCODE_DIR}/agents"

cleaned_legacy=false
if [ -d "$LEGACY_COMMANDS_DIR" ]; then
  rm -rf "$LEGACY_COMMANDS_DIR"
  echo "  [DEL] Removed legacy ~/.opencode/commands/agentsys"
  cleaned_legacy=true
fi
if [ -d "$LEGACY_PLUGINS_DIR" ]; then
  rm -rf "$LEGACY_PLUGINS_DIR"
  echo "  [DEL] Removed legacy ~/.opencode/plugins/agentsys"
  cleaned_legacy=true
fi
if [ -d "$LEGACY_AGENTS_DIR" ]; then
  # Only remove known agent files, not the whole directory
  # Must match list in scripts/dev-install.js knownAgents array
  # Generated from: ls plugins/*/agents/*.md | xargs basename | sort -u
  known_agents=(
    'agent-enhancer.md' 'ci-fixer.md' 'ci-monitor.md' 'claudemd-enhancer.md'
    'delivery-validator.md' 'deslop-agent.md' 'docs-enhancer.md' 'enhancement-orchestrator.md'
    'exploration-agent.md' 'hooks-enhancer.md' 'implementation-agent.md' 'learn-agent.md'
    'map-validator.md' 'perf-analyzer.md' 'perf-code-paths.md' 'perf-investigation-logger.md'
    'perf-orchestrator.md' 'perf-theory-gatherer.md' 'perf-theory-tester.md' 'plan-synthesizer.md'
    'planning-agent.md' 'plugin-enhancer.md' 'prompt-enhancer.md' 'simple-fixer.md'
    'skills-enhancer.md' 'sync-docs-agent.md' 'task-discoverer.md' 'test-coverage-checker.md'
    'worktree-manager.md'
  )
  for agent in "${known_agents[@]}"; do
    if [ -f "$LEGACY_AGENTS_DIR/$agent" ]; then
      rm "$LEGACY_AGENTS_DIR/$agent"
      cleaned_legacy=true
    fi
  done
  if [ "$cleaned_legacy" = true ]; then
    echo "  [DEL] Removed legacy agent files from ~/.opencode/agents"
  fi
fi
if [ "$cleaned_legacy" = false ]; then
  echo "  [OK] No legacy installations found"
fi
echo

# Success message
echo "[OK] Installation complete!"
echo
echo "[LIST] Installed Commands:"
for mapping in "${COMMAND_MAPPINGS[@]}"; do
  IFS=':' read -r cmd _ _ <<< "$mapping"
  echo "  • /$cmd"
done
echo
echo "[NEXT] Next Steps:"
echo "  1. Start OpenCode TUI: opencode"
echo "  2. Use commands: /next-task, /ship, etc."
echo "  3. See help: cat $OPENCODE_COMMANDS_DIR/README.md"
echo
echo "[TIP] OpenCode Pro Tips:"
echo "  • Use @filename to include file contents"
echo "  • Use !command to include bash output"
echo "  • Example: /project-review @src/main.py"
echo
echo "[UPDATE] To update commands, re-run this installer:"
echo "  ./adapters/opencode/install.sh"
echo
echo "Happy coding!"
