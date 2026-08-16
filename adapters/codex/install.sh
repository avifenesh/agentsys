#!/usr/bin/env bash
set -e

# [DEPRECATED] This script is outdated and uses old plugin names.
# Use instead: agentsys --tool codex
# Or: node scripts/dev-install.js codex

# Codex CLI Installer for agentsys commands
# This script installs all 5 slash commands for use with OpenAI Codex CLI

echo "[INSTALL] Installing agentsys commands for Codex CLI..."
echo

# Configuration
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CODEX_CONFIG_DIR="${HOME}/.codex"
CODEX_SKILLS_DIR="${CODEX_CONFIG_DIR}/skills"
CODEX_LIB_DIR="${CODEX_CONFIG_DIR}/agentsys/lib"

# Detect OS and normalize paths
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
  IS_WINDOWS=true
  # Convert Windows path to Unix-style for bash compatibility
  CODEX_CONFIG_DIR="${USERPROFILE}/.codex"
  # Replace backslashes with forward slashes
  CODEX_CONFIG_DIR="${CODEX_CONFIG_DIR//\\//}"
  CODEX_SKILLS_DIR="${CODEX_CONFIG_DIR}/skills"
  CODEX_LIB_DIR="${CODEX_CONFIG_DIR}/agentsys/lib"
else
  IS_WINDOWS=false
fi

echo "[CONFIG] Configuration:"
echo "  Repository: $REPO_ROOT"
echo "  Skills to: $CODEX_SKILLS_DIR"
echo "  Libraries to: $CODEX_LIB_DIR"
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

# Check Codex CLI (optional - user may not have it installed yet)
if command -v codex &> /dev/null; then
  CODEX_VERSION=$(codex --version 2>&1 | head -n1 || echo "unknown")
  echo "  [OK] Codex CLI $CODEX_VERSION"
else
  echo "  [WARN]  Codex CLI not found (install from: https://developers.openai.com/codex/cli)"
  echo "     You can still install commands and use Codex CLI later"
fi

echo

# Create directories
echo "[DIR] Creating directories..."
mkdir -p "$CODEX_SKILLS_DIR"
mkdir -p "$CODEX_LIB_DIR"/{platform,patterns,utils}
echo "  [OK] Created $CODEX_SKILLS_DIR"
echo "  [OK] Created $CODEX_LIB_DIR"
echo

# Copy library files from shared root lib directory
echo "[LIB] Installing shared libraries..."
# Use explicit iteration to handle paths with spaces safely
for item in "${REPO_ROOT}/lib"/*; do
  cp -r "$item" "${CODEX_LIB_DIR}/"
done
echo "  [OK] Copied platform detection"
echo "  [OK] Copied pattern libraries"
echo "  [OK] Copied utility functions"
echo

# Install skills with proper SKILL.md format
echo "[SETUP]  Installing skills..."

# Skill mappings: skill_name:plugin:source_file:description
# Codex skills require SKILL.md with name and description in YAML frontmatter
SKILL_MAPPINGS=(
  "next-task:next-task:next-task:Master workflow orchestrator with autonomous task-to-production automation"
  "ship:ship:ship:Complete PR workflow from commit to production with validation"
  "deslop-around:deslop-around:deslop-around:AI slop cleanup with minimal diffs and behavior preservation"
  "project-review:project-review:project-review:Multi-agent iterative code review until zero issues remain"
  "reality-check-scan:reality-check:scan:Deep repository analysis to detect plan drift and code reality gaps"
  "delivery-approval:next-task:delivery-approval:Validate task completion and approve for shipping"
  "sync-docs:sync-docs:sync-docs:Sync documentation with actual code state"
)

for mapping in "${SKILL_MAPPINGS[@]}"; do
  IFS=':' read -r SKILL_NAME PLUGIN SOURCE_NAME DESCRIPTION <<< "$mapping"
  SOURCE_FILE="$REPO_ROOT/plugins/$PLUGIN/commands/$SOURCE_NAME.md"
  SKILL_DIR="$CODEX_SKILLS_DIR/$SKILL_NAME"
  TARGET_FILE="$SKILL_DIR/SKILL.md"

  if [ -f "$SOURCE_FILE" ]; then
    # Create skill directory
    mkdir -p "$SKILL_DIR"

    # Create SKILL.md with proper frontmatter
    # Remove existing frontmatter and add Codex-compatible format
    {
      echo "---"
      echo "name: $SKILL_NAME"
      echo "description: $DESCRIPTION"
      echo "---"
      echo ""
      # Skip original frontmatter if present and include rest of content
      sed '1{/^---$/!b};1,/^---$/d' "$SOURCE_FILE"
    } > "$TARGET_FILE"

    echo "  [OK] Installed skill: \$${SKILL_NAME}"
  else
    echo "  [WARN]  Skipped \$${SKILL_NAME} (source not found: $SOURCE_FILE)"
  fi
done

# Install native skills (already have SKILL.md format)
echo
echo "[LIB] Installing native skills..."

# Native skill mappings: skill_name:plugin:skill_name_in_source
NATIVE_SKILL_MAPPINGS=(
  "orchestrate-review:next-task:orchestrate-review"
)

for mapping in "${NATIVE_SKILL_MAPPINGS[@]}"; do
  IFS=':' read -r SKILL_NAME PLUGIN SOURCE_SKILL <<< "$mapping"
  SOURCE_SKILL_DIR="$REPO_ROOT/plugins/$PLUGIN/skills/$SOURCE_SKILL"
  TARGET_SKILL_DIR="$CODEX_SKILLS_DIR/$SKILL_NAME"

  if [ -d "$SOURCE_SKILL_DIR" ]; then
    # Create skill directory
    mkdir -p "$TARGET_SKILL_DIR"

    # Copy SKILL.md
    if [ -f "$SOURCE_SKILL_DIR/SKILL.md" ]; then
      cp "$SOURCE_SKILL_DIR/SKILL.md" "$TARGET_SKILL_DIR/SKILL.md"
      echo "  [OK] Installed native skill: \$${SKILL_NAME}"
    else
      echo "  [WARN]  Skipped \$${SKILL_NAME} (SKILL.md not found)"
      continue
    fi

    # Copy optional subdirectories (references/, scripts/, assets/)
    for subdir in references scripts assets; do
      if [ -d "$SOURCE_SKILL_DIR/$subdir" ]; then
        cp -r "$SOURCE_SKILL_DIR/$subdir" "$TARGET_SKILL_DIR/"
        echo "    [OK] Copied $subdir/ directory"
      fi
    done
  else
    echo "  [WARN]  Skipped \$${SKILL_NAME} (source not found: $SOURCE_SKILL_DIR)"
  fi
done

# Remove old/deprecated skills and prompts
OLD_SKILLS=("deslop" "review" "reality-check-set" "pr-merge" "review-orchestrator")
for old_skill in "${OLD_SKILLS[@]}"; do
  if [ -d "$CODEX_SKILLS_DIR/$old_skill" ]; then
    rm -rf "$CODEX_SKILLS_DIR/$old_skill"
    echo "  [DEL]  Removed deprecated skill: $old_skill"
  fi
done

# Clean up old prompts directory if it exists
OLD_PROMPTS_DIR="$CODEX_CONFIG_DIR/prompts"
if [ -d "$OLD_PROMPTS_DIR" ]; then
  rm -rf "$OLD_PROMPTS_DIR"
  echo "  [DEL]  Removed old prompts directory"
fi

echo

# Create README
cat > "$CODEX_CONFIG_DIR/AGENTSYS_README.md" << 'EOF'
# agentsys for Codex CLI

Skills installed for OpenAI Codex CLI.

## Available Skills

Access via $ prefix:
- `$next-task` - Master workflow orchestrator
- `$ship` - PR workflow from commit to production
- `$deslop-around` - AI slop cleanup
- `$project-review` - Multi-agent code review
- `$reality-check-scan` - Plan drift detection
- `$delivery-approval` - Validate task completion
- `$sync-docs` - Sync documentation

## Usage

In Codex CLI:
```bash
codex
> $next-task
> $ship
> $deslop-around
```

Or type `$` to see available skills.

## Libraries

Shared libraries at: ~/.codex/agentsys/lib/

## Updates

```bash
cd /path/to/agentsys
./adapters/codex/install.sh
```

## Support

- Repository: https://github.com/agent-sh/agentsys
- Issues: https://github.com/agent-sh/agentsys/issues
EOF

echo "  [OK] Created README"
echo

# Success message
echo "[OK] Installation complete!"
echo
echo "[LIST] Installed Skills (access via \$ prefix):"
echo "  • \$next-task"
echo "  • \$ship"
echo "  • \$deslop-around"
echo "  • \$project-review"
echo "  • \$reality-check-scan"
echo "  • \$delivery-approval"
echo "  • \$sync-docs"
echo
echo "[NEXT] Next Steps:"
echo "  1. Start Codex CLI: codex"
echo "  2. Type: \$ (shows available skills)"
echo "  3. Select a skill or type: \$next-task"
echo "  4. See help: cat $CODEX_CONFIG_DIR/AGENTSYS_README.md"
echo
echo "[TIP] Pro Tip: Type \$ to see all available skills"
echo
echo "[UPDATE] To update skills, re-run this installer:"
echo "  ./adapters/codex/install.sh"
echo
echo "Happy coding!"
