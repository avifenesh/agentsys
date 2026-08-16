# OpenCode Plugin Update Checklist

Updating the native OpenCode plugin (auto-thinking, workflow hooks, compaction).

## Overview

The native OpenCode plugin provides deep integration:
- **Auto-thinking selection**: Adjusts thinking budget per agent complexity
- **Workflow enforcement**: Blocks git push/PR during review phases
- **Session compaction**: Preserves workflow state during context overflow
- **Activity tracking**: Updates flow.json on tool executions

## Files to Update

| File | Purpose |
|------|---------|
| `adapters/opencode-plugin/index.ts` | Plugin implementation |
| `adapters/opencode-plugin/package.json` | Dependencies |
| `bin/cli.js` | npm installer (copies plugin) |
| `scripts/dev-install.js` | Dev installer (`agentsys-dev dev-install opencode`) - its own copy of the same logic |
| `agent-docs/OPENCODE-REFERENCE.md` | Knowledge base |

## 1. Update Plugin Implementation

File: `adapters/opencode-plugin/index.ts`

### Agent Thinking Tiers

When adding new agents, add to `AGENT_THINKING_CONFIG`:

```typescript
const AGENT_THINKING_CONFIG: Record<string, { budget: number; description: string }> = {
  // Execution tier (0) - no thinking
  "simple-fixer": { budget: 0, description: "Mechanical code fixes" },

  // Discovery tier (8k)
  "task-discoverer": { budget: 8000, description: "Task analysis" },

  // Analysis tier (12k)
  "exploration-agent": { budget: 12000, description: "Codebase exploration" },

  // Reasoning tier (16k)
  "planning-agent": { budget: 16000, description: "Implementation planning" },

  // Synthesis tier (20k+)
  "plan-synthesizer": { budget: 20000, description: "Deep semantic analysis" },
}
```

### Workflow Blocked Actions

Update `WORKFLOW_BLOCKED_ACTIONS` when changing workflow phases:

```typescript
const WORKFLOW_BLOCKED_ACTIONS: Record<string, string[]> = {
  "exploration": [],
  "planning": [],
  "implementation": ["git push", "gh pr create"],
  "review": ["git push", "gh pr create", "gh pr merge"],
  "delivery-validation": ["git push", "gh pr create", "gh pr merge"],
  "shipping": [],
}
```

## 2. Update Knowledge Base

File: `agent-docs/OPENCODE-REFERENCE.md`

Update relevant sections:
- Agent thinking tiers table
- Hook documentation
- Provider-specific thinking configs

## 3. Test Plugin

```bash
# Verify plugin syntax
npx tsc --noEmit adapters/opencode-plugin/index.ts

# Install locally and test
agentsys  # Select OpenCode

# Verify plugin copied
ls ~/.config/opencode/plugins/agentsys.ts
```

## 4. Version Coordination

When releasing:
1. Update `adapters/opencode-plugin/package.json` version
2. Mention in CHANGELOG.md under OpenCode section
3. Consider backwards compatibility with older OpenCode versions

## Provider Thinking Configs

Reference for provider-specific thinking:

```typescript
// Anthropic (Claude)
output.options.thinking = {
  type: "enabled",
  budgetTokens: config.budget
}

// OpenAI
output.options.reasoningEffort = "high" | "medium" | "low"
output.options.reasoningSummary = "auto"

// Google (Gemini)
output.options.thinkingConfig = {
  includeThoughts: true,
  thinkingBudget: config.budget
}
```

## Common Pitfalls

- **Two paths copy the plugin** - `bin/cli.js` (npm installs) and `scripts/dev-install.js` (dev installs); plugin changes land nowhere until both copy them, and they drift if only one is updated
- **Match agent names exactly** - Case-sensitive matching against `input.agent`
- **Test all providers** - Each has different thinking APIs
- **Keep flow.json format stable** - Other parts of the system read it
