<p align="center">
  <img src="site/assets/logo.png" alt="AgentSys" width="120">
</p>

<h1 align="center">AgentSys</h1>

<p align="center">
  <strong>A modular runtime and orchestration system for AI agents.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/agentsys"><img src="https://img.shields.io/npm/v/agentsys.svg" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/agentsys"><img src="https://img.shields.io/npm/dm/agentsys.svg" alt="npm downloads"></a>
  <a href="https://github.com/agent-sh/agentsys/actions/workflows/ci.yml"><img src="https://github.com/agent-sh/agentsys/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/agent-sh/agentsys/stargazers"><img src="https://img.shields.io/github/stars/agent-sh/agentsys.svg" alt="GitHub stars"></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://agent-sh.github.io/agentsys/"><img src="https://img.shields.io/badge/Website-AgentSys-blue?style=flat&logo=github" alt="Website"></a>
  <a href="https://github.com/hesreallyhim/awesome-claude-code"><img src="https://awesome.re/mentioned-badge.svg" alt="Mentioned in Awesome Claude Code"></a>
</p>

<p align="center">
  <b>24 plugins · 49 agents · 44 skills (across all repos) · 30k lines of lib code · 3,518 tests · 5 platforms</b><br>
  <em>Plugins distributed as standalone repos under <a href="https://github.com/agent-sh">agent-sh</a> org - agentsys is the marketplace &amp; installer</em>
</p>

> ⚡ Running this agent 24/7? [**tiyuvta inference**](https://inference.tiyuvta.ai) — hosted LLM inference built for always-on agents, OpenAI/Anthropic-compatible APIs.

<p align="center">
  <a href="#commands">Commands</a> · <a href="#installation">Installation</a> · <a href="https://agent-sh.github.io/agentsys/">Website</a> · <a href="https://github.com/agent-sh/agentsys/discussions">Discussions</a>
</p>

<p align="center">
  <b>Built for Claude Code · Codex CLI · OpenCode · Cursor · Kiro</b>
</p>

<p align="center"><em>New skills, agents, and integrations ship constantly. Follow for real-time updates:</em></p>
<p align="center">
  <a href="https://x.com/avi_fenesh"><img src="https://img.shields.io/badge/Follow-@avi__fenesh-1DA1F2?style=for-the-badge&logo=x&logoColor=white" alt="Follow on X"></a>
</p>

---

AI models can write code. That's not the hard part anymore. The hard part is everything around it - task selection, branch management, code review, artifact cleanup, CI, PR comments, deployment. **AgentSys is the runtime that orchestrates agents to handle all of it** - structured pipelines, gated phases, specialized agents, and persistent state that survives session boundaries.

---
> Building custom skills, agents, hooks, or MCP tools? [agnix](https://github.com/agent-sh/agnix) is the CLI + LSP linter that catches config errors before they fail silently - real-time IDE validation, auto suggestions, auto-fix, and 423 rules for Claude Code, Codex, OpenCode, Cursor, Kiro, Copilot, Gemini CLI, Cline, Windsurf, Roo Code, Amp, and more.

## What's New in 6.0.2

- Fixes Windows installs: the Claude Code executable is resolved with `where.exe` instead of an assumed `claude.cmd`, and `.cmd` shims are launched through `cmd.exe` at every spawn site.
- `agentsys install` reports failures instead of printing success when Claude Code rejected a plugin, and exits non-zero.
- Deletes the two adapter `install.sh` scripts, which deleted a working install and reported success; `agentsys --tool codex` / `--tool opencode` is the install path.
- CI now runs the suite on Windows as well as Linux.

## What This Is

An agent orchestration system - 24 plugins, 49 agents (39 file-based + 10 role-based specialists in audit-project), and 44 skills that compose into structured pipelines for software development. Each plugin lives in its own standalone repo under the [agent-sh](https://github.com/agent-sh) org. agentsys is the marketplace and installer that ties them together.

Each agent has a single responsibility, a specific model assignment, and defined inputs/outputs. Pipelines enforce phase gates so agents can't skip steps. State persists across sessions so work survives interruptions.

The system runs on Claude Code, OpenCode, Codex CLI, Cursor, and Kiro. Install via the marketplace or the npm installer, and the plugins are fetched automatically from their repos.

---

## The Approach

**Code does code work. AI does AI work.**

- **Detection**: regex, AST analysis, static analysis - fast, deterministic, no tokens wasted
- **Judgment**: LLM calls for synthesis, planning, review - where reasoning matters
- **Result**: 77% fewer tokens for [/drift-detect](#drift-detect) vs multi-agent approaches, certainty-graded findings throughout

**Certainty levels exist because not all findings are equal:**

| Level | Meaning | Action |
|-------|---------|--------|
| HIGH | Definitely a problem | Safe to auto-fix |
| MEDIUM | Probably a problem | Needs context |
| LOW | Might be a problem | Needs human judgment |

This came from testing on 1,000+ repositories.

---

## Benchmarks

Structured prompts and enriched context do more for output quality than model tier. Benchmarked March 2026 on real tasks (`/can-i-help` and `/onboard` against [glide-mq](https://github.com/avifenesh/glide-mq)), measured with `claude -p --output-format json`. Models: Claude Opus 4 and Claude Sonnet 4.

### Sonnet + AgentSys vs raw Opus

Same task, same repo, same prompt ("I want to improve docs"):

| Configuration | Cost | Output tokens | Result quality |
|---------------|------|---------------|----------------|
| Opus, no agentsys | $1.10 | 2,841 | Generic recommendations, no project-specific context |
| Opus + agentsys | $1.95 | 5,879 | Specific recommendations with effort estimates, convention awareness, breaking change detection |
| **Sonnet + agentsys** | **$0.66** | **6,084** | **Comparable to Opus + agentsys: specific, actionable, project-aware** |

Sonnet + agentsys produced more output with higher specificity than raw Opus - at 40% lower cost.

### With agentsys, model tier matters less

Once the pipeline provides structured prompts, enriched repo-intel data, and phase-gated workflows, the model does less heavy lifting. The gap between Sonnet and Opus narrows:

| Plugin | Opus | Sonnet | Savings |
|--------|------|--------|---------|
| /onboard | $1.10 | $0.30 | 73% |
| /can-i-help | $1.34 | $0.23 | 83% |

Both models reached the same outcome quality - Sonnet just costs less to get there. The structured pipeline captures most of the gains that would otherwise require a more expensive model.

### What this means

| Scenario | Model cost | Quality |
|----------|-----------|---------|
| Without agentsys | Need Opus for good results | Depends on model capability |
| **With agentsys** | **Sonnet is sufficient** | **Pipeline handles the structure, model handles judgment** |

The investment shifts from model spend to pipeline design. Better prompts, richer context, enforced phases - these compound in ways that model upgrades alone don't.

---

## Commands

| Command | What it does |
|---------|--------------|
| [`/next-task`](#next-task) | Task workflow: discovery, implementation, PR, merge |
| [`/prepare-delivery`](#prepare-delivery) | Pre-ship quality gates: deslop, review, validation, docs sync |
| [`/gate-and-ship`](#gate-and-ship) | Quality gates then ship (/prepare-delivery + /ship) |
| [`/banthis`](#banthis) | Durable negative memory: persist banned agent behaviors |
| [`/agnix`](#agnix) | Lint agent configurations (423 rules) |
| [`/ship`](#ship) | PR creation, CI monitoring, merge |
| [`/deslop`](#deslop) | Clean AI slop patterns |
| [`/perf`](#perf) | Performance investigation with baselines and profiling |
| [`/drift-detect`](#drift-detect) | Compare plan vs implementation |
| [`/audit-project`](#audit-project) | Multi-agent iterative code review |
| [`/enhance`](#enhance) | Plugin, agent, and prompt analyzers |
| [`/repo-intel`](#repo-intel) | Unified static analysis - git history, AST symbols, project metadata |
| [`/sync-docs`](#sync-docs) | Sync documentation with code changes |
| [`/learn`](#learn) | Research topics, create learning guides |
| [`/consult`](#consult) | Cross-tool AI consultation |
| [`/debate`](#debate) | Structured debate between AI tools |
| [`/release`](#release) | Versioned release with ecosystem detection |
| [`/skillers`](#skillers) | Workflow pattern learning and automation |
| [`/skill-curator`](#skill-curator) | Create and improve reliable SKILL.md files |
| [`/system-prompt-curator`](#system-prompt-curator) | Create and improve autonomous agent system prompts |
| [`/onboard`](#onboard) | Codebase orientation for newcomers |
| [`/can-i-help`](#can-i-help) | Match contributor skills to project needs |

Each command works standalone. Together, they compose into end-to-end pipelines.

---

## Skills

44 skills included across the plugins:

| Category | Skills |
|----------|--------|
| **Workflow** | `discover-tasks`, `prepare-delivery`, `check-test-coverage`, `orchestrate-review`, `validate-delivery` |
| **Message Queues** | `glide-mq-migrate-bee`, `glide-mq-migrate-bullmq`, `glide-mq` |
| **Enhancement** | `enhance-agent-prompts`, `enhance-claude-memory`, `enhance-cross-file`, `enhance-docs`, `enhance-hooks`, `enhance-orchestrator`, `enhance-plugins`, `enhance-prompts`, `enhance-skills`, `skill-curator`, `system-prompt-curator` |
| **Performance** | `baseline`, `benchmark`, `code-paths`, `investigation-logger`, `perf-analyzer`, `profile`, `theory-gatherer`, `theory-tester` |
| **Cleanup** | `deslop`, `sync-docs` |
| **Code Review** | `audit-project` |
| **AI Collaboration** | `consult`, `debate`, `learn`, `recommend`, `skillers-compact` |
| **Onboarding** | `can-i-help`, `onboard` |
| **Release** | `release` |
| **Analysis** | `drift-analysis`, `repo-intel` |
| **Memory** | `banthis` |
| **Linting** | `agnix` |

**External skill plugins** (standalone repos, installed separately):

| Category | Skills | Plugin |
|----------|--------|--------|
| **Message Queues** | `glide-mq`, `glide-mq-migrate-bullmq`, `glide-mq-migrate-bee` | [agent-sh/glidemq](https://github.com/agent-sh/glidemq) |
| **Languages** | `mojo` | [agent-sh/mojo](https://github.com/agent-sh/mojo) |
| **Languages** | `ada-spark` | [agent-sh/ada-spark](https://github.com/agent-sh/ada-spark) |

Skills are the reusable implementation units. Agents invoke skills; commands orchestrate agents. When you install a plugin, its skills become available to all agents in that session.

---

## Quick Navigation

| Section | What's there |
|---------|--------------|
| [The Approach](#the-approach) | Why it's built this way |
| [Benchmarks](#benchmarks) | Sonnet + agentsys vs raw Opus |
| [Commands](#commands) | All 24 commands overview |
| [Skills](#skills) | 44 skills across plugins |
| [Skill-Only Plugins](#skill-only-plugins) | glide-mq and other non-command plugins |
| [Command Details](#command-details) | Deep dive into each command |
| [How Commands Work Together](#how-commands-work-together) | Standalone vs integrated |
| [Design Philosophy](#design-philosophy) | The thinking behind the architecture |
| [Installation](#installation) | Get started |
| [Research & Testing](#research--testing) | What went into building this |
| [Documentation](#documentation) | Links to detailed docs |

---

## Skill-Only Plugins

Plugins that provide skills without a `/` command. Installed alongside agentsys; skills become available to all agents.

### glide-mq

Build message queues, background jobs, and workflow orchestration with [glide-mq](https://github.com/avifenesh/glide-mq) - high-performance Node.js queue on Valkey/Redis.

| Skill | What it does |
|-------|--------------|
| `glide-mq` | Greenfield queue development - queues, workers, ordering, rate limiting, flows, broadcast, step jobs |
| `glide-mq-migrate-bullmq` | Migrate from BullMQ to glide-mq - API mapping, breaking changes, feature comparison |
| `glide-mq-migrate-bee` | Migrate from Bee-Queue to glide-mq - API mapping, pattern conversion |

Key features: per-key ordering, group concurrency, runtime group rate limiting (`job.rateLimitGroup()`), token bucket, DAG workflows, broadcast pub/sub, step jobs, deduplication, serverless producers.

[Skill plugin →](https://github.com/agent-sh/glidemq) | [glide-mq docs →](https://avifenesh.github.io/glide-mq.dev/) | [npm →](https://www.npmjs.com/package/glide-mq)

---

## Command Details

### /next-task

**Purpose:** Complete task-to-production automation.

**What happens when you run it:**

1. **Policy Selection** - Choose task source (GitHub Issues, GitHub Projects, GitLab, local file), priority filter, stopping point
2. **Task Discovery** - Shows top 5 prioritized tasks, you pick one
3. **Worktree Setup** - Creates isolated branch and working directory
4. **Exploration** - Deep codebase analysis to understand context
5. **Planning** - Designs implementation approach
6. **User Approval** - You review and approve the plan (last human interaction)
7. **Implementation** - Executes the plan
8. **Pre-Review** - Runs [deslop](#deslop)-agent and prepare-delivery:test-coverage-checker
9. **Review Loop** - Multi-agent review iterates until clean
10. **Delivery Validation** - Verifies tests pass, build passes, requirements met
11. **Docs Update** - Updates CHANGELOG and related documentation
12. **[Ship](#ship)** - Creates PR, monitors CI, addresses comments, merges

Phase 9 uses the `orchestrate-review` skill to spawn parallel reviewers (code quality, security, performance, test coverage) plus conditional specialists.

**Agents involved:**

| Agent | Model | Role |
|-------|-------|------|
| task-discoverer | sonnet | Finds and ranks tasks from your source |
| worktree-manager | haiku | Creates git worktrees and branches |
| exploration-agent | sonnet | Deep codebase analysis before planning |
| planning-agent | opus | Designs step-by-step implementation plan |
| implementation-agent | opus | Writes the actual code |
| prepare-delivery:test-coverage-checker | sonnet | Validates tests exist and are meaningful |
| prepare-delivery:delivery-validator | sonnet | Final checks before shipping |
| ci-monitor | haiku | Watches CI status |
| ci-fixer | sonnet | Fixes CI failures and review comments |
| simple-fixer | haiku | Executes mechanical edits |

**Cross-plugin agent:**
| Agent | Plugin | Role |
|-------|--------|------|
| deslop-agent | deslop | Removes AI artifacts before review |
| sync-docs-agent | sync-docs | Updates documentation |

**Usage:**

```bash
/next-task              # Start new workflow
/next-task --resume     # Resume interrupted workflow
/next-task --status     # Check current state
/next-task --abort      # Cancel and cleanup
```

[Full workflow documentation →](./docs/workflows/NEXT-TASK.md)

---

### /prepare-delivery

**Purpose:** Run all pre-ship quality gates without shipping. Use after completing implementation manually or outside `/next-task`.

**What it runs (in order):**

1. **Pre-review gates** (parallel) - deslop + /simplify + prepare-delivery:test-coverage-checker
2. **Config lint** (conditional) - agnix + /enhance when changes touch agent/skill/plugin files
3. **Review loop** - 4 core reviewers + conditional specialists, max 5 iterations
4. **Delivery validation** - tests pass, build passes, requirements met
5. **Docs sync** - sync-docs agent updates documentation

```bash
/prepare-delivery                    # Run all quality gates
/prepare-delivery --skip-review      # Skip review loop
/prepare-delivery --skip-docs        # Skip docs sync
/prepare-delivery --base=develop     # Against a specific base branch
```

Does NOT create PRs or push - use `/ship` or `/gate-and-ship` after.

---

### /gate-and-ship

**Purpose:** Quality gates then ship in one command. Chains `/prepare-delivery` then `/ship`.

```bash
/gate-and-ship                       # Full: quality gates + ship
/gate-and-ship --skip-review         # Skip review, still ship
/gate-and-ship --base=develop        # Against a specific base branch
```

**Composability:**

```
/gate-and-ship = /prepare-delivery + /ship
```

Each piece runs independently - use `/prepare-delivery` alone to review before deciding to ship, or `/ship` alone if already validated.

---

### /banthis

**Purpose:** Durable negative memory for repeated agent mistakes. Turn a user's "stop doing this" correction into a persistent rule in `CLAUDE.md` or `AGENTS.md`.

**[banthis](https://github.com/agent-sh/banthis)** is a tiny standalone CLI plus skill. It maintains a managed banned-behaviors section, supports project or global targets, and includes an `init` meta-rule so agents learn when to invoke it automatically.

**What it does:**

| Command | Use |
|---------|-----|
| `banthis add "<title>" "<rule>"` | Add or update a banned behavior |
| `banthis list` | List current bans |
| `banthis show` | Print the managed section |
| `banthis remove "<title>"` | Remove a ban |
| `banthis init` | Install the meta-rule that teaches agents to call `banthis` |

**Usage:**

```bash
/banthis "stop ending with vague optional follow-up offers"
banthis add "No vague endings" "Do not end with vague optional follow-up offers."
banthis init --file AGENTS.md
```

---

### /agnix

**Purpose:** Lint agent configurations before they break your workflow. The first dedicated linter for AI agent configs.

**[agnix](https://github.com/agent-sh/agnix)** is a standalone open-source project that provides the validation engine. This plugin integrates it into your workflow.

**The problem it solves:**

Agent configurations are code. They affect behavior, security, and reliability. But unlike application code, they have no linting. You find out your SKILL.md is malformed when the agent fails. You discover your hooks have security issues when they're exploited. You realize your CLAUDE.md has conflicting rules when the AI behaves unexpectedly.

agnix catches these issues before they cause problems.

**What it validates:**

| Category | What It Checks |
|----------|----------------|
| **Structure** | Required fields, valid YAML/JSON, proper frontmatter |
| **Security** | Prompt injection vectors, overpermissive tools, exposed secrets |
| **Consistency** | Conflicting rules, duplicate definitions, broken references |
| **Best Practices** | Tool restrictions, model selection, trigger phrase quality |
| **Cross-Platform** | Compatibility across Claude Code, Codex, OpenCode, Cursor, Kiro, Copilot, Gemini CLI, Cline, Windsurf, Roo Code, Amp, and more |

**423 validation rules** (129 auto-fixable) derived from:
- Official tool specifications (Claude Code, Codex CLI, OpenCode, Cursor, Kiro, GitHub Copilot, Gemini CLI, Cline, Windsurf, Roo Code, Amp, and more)
- Research papers on agent reliability and prompt injection
- Real-world testing across 500+ repositories
- Community-reported issues and edge cases

**Supported files:**

| File Type | Examples |
|-----------|----------|
| Skills | `SKILL.md`, `*/SKILL.md` |
| Memory | `CLAUDE.md`, `AGENTS.md`, `.github/CLAUDE.md` |
| Hooks | `.claude/settings.json`, hooks configuration |
| MCP | `*.mcp.json`, MCP server configs |
| Cursor | `.cursor/rules/*.mdc`, `.cursorrules` |
| Copilot | `.github/copilot-instructions.md` |
| Kiro | `.kiro/steering/**/*.md`, `.kiro/agents/*.json`, `.kiro/hooks/*.kiro.hook`, `POWER.md` |
| Windsurf | `.windsurf/rules/**/*.md`, `.windsurf/workflows/**/*.md`, `.windsurfrules` |
| Roo Code | `.roo/rules/*.md`, `.roo/rules-{mode}/*.md`, `.roomodes`, `.rooignore`, `.roorules` |
| Gemini CLI | `GEMINI.md`, `.gemini/settings.json`, `gemini-extension.json` |
| OpenCode | `opencode.json` |
| Amp | `.agents/checks/**/*.md`, `.amp/settings.json` |

**CI/CD Integration:**

agnix outputs SARIF format for GitHub Code Scanning. Add it to your workflow:

```yaml
- name: Lint agent configs
  run: agnix --format sarif > results.sarif
- uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: results.sarif
```

**Usage:**

```bash
/agnix                       # Validate current project
/agnix --fix                 # Auto-fix fixable issues
/agnix --strict              # Treat warnings as errors
/agnix --target claude-code  # Only Claude Code rules
/agnix --format sarif        # Output for GitHub Code Scanning
```

**Agent:** agnix-agent (sonnet model)

**External tool:** Requires [agnix CLI](https://github.com/agent-sh/agnix)

```bash
npm install -g agnix         # Install via npm
# or
cargo install agnix-cli      # Install via Cargo
# or
brew install agnix           # Install via Homebrew (macOS)
```

**Why use agnix:**
- Catch config errors before they cause agent failures
- Enforce security best practices across your team
- Maintain consistency as your agent configs grow
- Integrate validation into CI/CD pipelines
- Support multiple AI tools from one linter

---

### /ship

**Purpose:** Takes your current branch from "ready to commit" to "merged PR."

**What happens when you run it:**

1. **Pre-flight** - Detects CI platform, deployment platform, branch strategy
2. **Commit** - Stages and commits with generated message (if uncommitted changes)
3. **Push & PR** - Pushes branch, creates pull request
4. **CI Monitor** - Waits for CI, retries on transient failures
5. **Review Wait** - Waits 3 minutes for auto-reviewers (Copilot, Claude, Gemini, Codex)
6. **Address Comments** - Handles every comment from every reviewer
7. **Merge** - Merges when all comments resolved and CI passes
8. **Deploy** - Deploys and validates (if multi-branch workflow)
9. **Cleanup** - Removes worktree, closes issue, deletes branch

**Platform Detection:**

| Type | Detected |
|------|----------|
| CI | GitHub Actions, GitLab CI, CircleCI, Jenkins, Travis |
| Deploy | Railway, Vercel, Netlify, Fly.io, Render |
| Project | Node.js, Python, Rust, Go, Java |

**Review Comment Handling:**

Every comment gets addressed. No exceptions. The workflow categorizes comments and handles each:
- Code fixes get implemented
- Style suggestions get applied
- Questions get answered
- False positives get explained

If something can't be fixed, the workflow replies explaining why and resolves the thread.

**Usage:**

```bash
/ship                       # Full workflow
/ship --dry-run             # Preview without executing
/ship --strategy rebase     # Use rebase instead of squash
```

[Full workflow documentation →](./docs/workflows/SHIP.md)

---

### /deslop

**Purpose:** Finds AI slop - debug statements, placeholder text, verbose comments, TODOs - and removes it.

**How detection works:**

Three phases run in sequence:

1. **Phase 1: Regex Patterns** (HIGH certainty)
   - `console.log`, `print()`, `dbg!()`, `println!()`
   - `// TODO`, `// FIXME`, `// HACK`
   - Empty catch blocks, disabled linters
   - Hardcoded secrets (API keys, tokens)

2. **Phase 2: Multi-Pass Analyzers** (MEDIUM certainty)
   - Doc-to-code ratio (excessive comments)
   - Verbosity ratio (AI preambles)
   - Over-engineering patterns
   - Buzzword inflation
   - Dead code detection
   - Stub functions

3. **Phase 3: CLI Tools** (LOW certainty, optional)
   - jscpd, madge, escomplex (JS/TS)
   - pylint, radon (Python)
   - golangci-lint (Go)
   - clippy (Rust)

**Languages supported:** JavaScript/TypeScript, Python, Rust, Go, Java

**Usage:**

```bash
/deslop              # Report only (safe)
/deslop apply        # Fix HIGH certainty issues
/deslop apply src/ 10  # Fix 10 issues in src/
```

**Thoroughness levels:**

- `quick` - Phase 1 only (fastest)
- `normal` - Phase 1 + Phase 2 (default)
- `deep` - All phases if tools available

[Pattern reference →](./docs/reference/SLOP-PATTERNS.md)

---

### /perf

**Purpose:** Structured performance investigation with baselines, profiling, and evidence-backed decisions.

**10-phase methodology** (based on recorded real performance investigation sessions):

1. **Setup** - Confirm scenario, success criteria, benchmark command
2. **Baseline** - 60s minimum runs, PERF_METRICS markers required
3. **Breaking Point** - Binary search to find failure threshold
4. **Constraints** - CPU/memory limits, measure delta vs baseline
5. **Hypotheses** - Generate up to 5 hypotheses with evidence and confidence
6. **Code Paths** - Use repo-intel to identify entrypoints and hot files
7. **Profiling** - Language-specific tools (--cpu-prof, JFR, cProfile, pprof)
8. **Optimization** - One change per experiment, 2+ validation passes
9. **Decision** - Continue or stop based on measurable improvement
10. **Consolidation** - Final baseline, evidence log, investigation complete

**Agents and skills:**

| Component | Role |
|-----------|------|
| perf-orchestrator | Coordinates all phases |
| perf-theory-gatherer | Generates hypotheses from git history and code |
| perf-theory-tester | Validates hypotheses with controlled experiments |
| perf-analyzer | Synthesizes findings into recommendations |
| perf-code-paths | Maps entrypoints and likely hot paths |
| perf-investigation-logger | Structured evidence logging |

**Usage:**

```bash
/perf                 # Start new investigation
/perf --resume        # Resume previous investigation
```

**Phase flags (advanced):**

```bash
/perf --phase baseline --command "npm run bench" --version v1.2.0
/perf --phase breaking-point --param-min 1 --param-max 500
/perf --phase constraints --cpu 1 --memory 1GB
/perf --phase hypotheses --hypotheses-file perf-hypotheses.json
/perf --phase optimization --change "reduce allocations"
/perf --phase decision --verdict stop --rationale "no measurable improvement"
```

---

### /drift-detect

**Purpose:** Compares your documentation and plans to what's actually in the code.

**The problem it solves:**

Your roadmap says "user authentication: done." But is it actually implemented? Your GitHub issue says "add dark mode." Is it already in the codebase? Plans drift from reality. This command finds the drift.

**How it works:**

1. **JavaScript collectors** gather data (fast, token-efficient)
   - GitHub issues and their labels
   - Documentation files
   - Actual code exports and implementations

2. **Single Opus call** performs semantic analysis
   - Matches concepts, not strings ("user auth" matches `auth/`, `login.js`, `session.ts`)
   - Identifies implemented but not documented
   - Identifies documented but not implemented
   - Finds stale issues that should be closed

**Why this approach:**

Multi-agent collection wastes tokens on coordination. JavaScript collectors are fast and deterministic. One well-prompted LLM call does the actual analysis. Result: 77% token reduction vs multi-agent approaches.

**Tested on 1,000+ repositories** before release.

**Usage:**

```bash
/drift-detect              # Full analysis
/drift-detect --depth quick  # Quick scan
```

---

### /audit-project

**Purpose:** Multi-agent code review that iterates until issues are resolved.

**What happens when you run it:**

Up to 10 specialized role-based agents run based on your project:

| Agent | When Active | Focus Area |
|-------|-------------|------------|
| code-quality-reviewer | Always | Code quality, error handling |
| security-expert | Always | Vulnerabilities, auth, secrets |
| performance-engineer | Always | N+1 queries, memory, blocking ops |
| test-quality-guardian | Always | Coverage, edge cases, mocking |
| architecture-reviewer | If 50+ files | Modularity, patterns, SOLID |
| database-specialist | If DB detected | Queries, indexes, transactions |
| api-designer | If API detected | REST, errors, pagination |
| frontend-specialist | If frontend detected | Components, state, UX |
| backend-specialist | If backend detected | Services, domain logic |
| devops-reviewer | If CI/CD detected | Pipelines, configs, secrets |

Findings are collected and categorized by severity (critical/high/medium/low). All non-false-positive issues get fixed automatically. The loop repeats until no open issues remain.

**Usage:**

```bash
/audit-project                   # Full review
/audit-project --quick           # Single pass
/audit-project --resume          # Resume from queue file
/audit-project --domain security # Security focus only
/audit-project --recent          # Only recent changes
```

[Agent reference →](./docs/reference/AGENTS.md#audit-project-plugin-agents)

---

### /enhance

**Purpose:** Analyzes your prompts, plugins, agents, docs, hooks, and skills for improvement opportunities.

**Eight analyzers run in parallel:**

| Analyzer | What it checks |
|----------|----------------|
| plugin-enhancer | Plugin structure, MCP tool definitions, security patterns |
| agent-enhancer | Agent frontmatter, prompt quality |
| claudemd-enhancer | CLAUDE.md/AGENTS.md structure, token efficiency |
| cross-file-enhancer | Cross-file consistency (tools vs frontmatter, duplicate rules, conflicts) |
| docs-enhancer | Documentation readability, RAG optimization |
| prompt-enhancer | Prompt engineering patterns, clarity, examples |
| hooks-enhancer | Hook frontmatter, structure, safety |
| skills-enhancer | SKILL.md structure, trigger phrases |

**Each finding includes:**
- Certainty level (HIGH/MEDIUM/LOW)
- Specific location (file:line)
- What's wrong
- How to fix it
- Whether it can be auto-fixed

**Auto-learning:** Detects obvious false positives (pattern docs, workflow gates) and saves them for future runs. Reduces noise over time without manual suppression files.

**Usage:**

```bash
/enhance                    # Run all analyzers
/enhance --focus=agent      # Just agent prompts
/enhance --apply            # Apply HIGH certainty fixes
/enhance --show-suppressed  # Show what's being filtered
/enhance --no-learn         # Analyze but don't save false positives
```

---

### /repo-intel

**Purpose:** Unified static analysis - git history, AST symbols, and project metadata in one plugin.

**What it provides:**

- Git history intelligence: hotspots, coupling, ownership, bus factor, bugspots, AI detection
- AST symbol mapping: exports, functions, classes, imports
- Project metadata and health metrics

Output is cached at `{state-dir}/repo-intel.json` (external repo-intel plugin) and `{state-dir}/repo-map.json` (agentsys internal repo-map library). `{state-dir}` is `.claude/`, `.opencode/`, or `.codex/` depending on your platform.

**Why it matters:**

Tools like `/drift-detect`, `/onboard`, `/can-i-help`, and planners consume this data instead of re-scanning the repo every time. 9 plugins use repo-intel data automatically.

**Usage:**

```bash
/repo-intel init                   # First-time scan
/repo-intel update                 # Incremental update
/repo-intel query hotspots         # Most active files
/repo-intel query ownership src/   # Who owns a path
/repo-intel query bus-factor       # Knowledge risk
```

Backed by [agent-analyzer](https://github.com/agent-sh/agent-analyzer) Rust binary.

---

### /sync-docs

**Purpose:** Sync documentation with actual code changes - find outdated refs, update CHANGELOG, flag stale examples.

**The problem it solves:**

You refactor `auth.js` into `auth/index.js`. Your README still says `import from './auth'`. You rename a function. Three docs still reference the old name. You ship a feature. CHANGELOG doesn't mention it. Documentation drifts from code. This command finds the drift.

**What it detects:**

| Category | Examples |
|----------|----------|
| Broken references | Imports to moved/renamed files, deleted exports |
| Version mismatches | Doc says v2.0, package.json says v2.1 |
| Stale code examples | Import paths that no longer exist |
| Missing CHANGELOG | `feat:` and `fix:` commits without entries |

**Auto-fixable vs flagged:**

| Auto-fixable (apply mode) | Flagged for review |
|---------------------------|-------------------|
| Version number updates | Removed exports referenced in docs |
| CHANGELOG entries for commits | Code examples needing context |
| | Function renames |

**Usage:**

```bash
/sync-docs              # Check what docs need updates (safe)
/sync-docs apply        # Apply safe fixes
/sync-docs report src/  # Check docs related to src/
/sync-docs --all        # Full codebase scan
```

---

### /learn

**Purpose:** Research any topic online and create a comprehensive learning guide with RAG-optimized indexes.

**What it does:**

1. **Progressive Discovery** - Uses funnel approach (broad → specific → deep) to find quality sources
2. **Quality Scoring** - Scores sources by authority, recency, depth, examples, uniqueness
3. **Just-In-Time Extraction** - Fetches only high-scoring sources to save tokens
4. **Synthesis** - Creates structured learning guide with examples and best practices
5. **RAG Index** - Updates CLAUDE.md/AGENTS.md master index for future lookups
6. **Enhancement** - Runs enhance:enhance-docs and enhance:enhance-prompts

**Depth levels:**

| Depth | Sources | Use Case |
|-------|---------|----------|
| brief | 10 | Quick overview |
| medium | 20 | Default, balanced |
| deep | 40 | Comprehensive |

**Output structure:**

```
agent-knowledge/
  CLAUDE.md                    # Master index (updated each run)
  AGENTS.md                    # Index for OpenCode/Codex
  recursion.md                 # Topic-specific guide
  resources/
    recursion-sources.json     # Source metadata with quality scores
```

**Usage:**

```bash
/learn recursion                    # Default (20 sources)
/learn react hooks --depth=deep     # Comprehensive (40 sources)
/learn kubernetes --depth=brief     # Quick overview (10 sources)
/learn python async --no-enhance    # Skip enhancement pass
```

**Agent:** learn-agent (sonnet model)

---

### /consult

**Purpose:** Get a second opinion from another AI CLI tool without leaving your current session.

**What it does:**

1. **Tool Detection** - Detects which AI CLI tools are installed (cross-platform)
2. **Interactive Picker** - If no tool specified, shows only installed tools to choose from
3. **Effort Mapping** - Maps effort levels to per-provider models and reasoning flags
4. **Execution** - Runs the consultation with safe-mode defaults and 120s timeout
5. **Session Continuity** - Saves session state for Claude and Gemini (supports `--continue`)

**Supported tools:**

| Tool | Default Model (high) | Reasoning Control |
|------|---------------------|-------------------|
| Claude | claude-opus-4-6 | max-turns |
| Gemini | gemini-3.1-pro-preview | built-in |
| Codex | gpt-5.3-codex | model_reasoning_effort |
| OpenCode | (user-selected or default) | --variant |
| Copilot | (default) | none |

**Usage:**

```bash
/consult "Is this the right approach?" --tool=gemini --effort=high
/consult "Review for performance issues" --tool=codex
/consult "Suggest alternatives" --tool=claude --effort=max
/consult "Continue from where we left off" --continue
/consult "Explain this error" --context=diff --tool=gemini
```

**Agent:** consult-agent (sonnet model for orchestration)

---

### /debate

**Purpose:** Stress-test ideas through structured multi-round debate between two AI CLI tools.

**What it does:**

1. **Tool Detection** - Detects which AI CLI tools are installed (cross-platform)
2. **Interactive Picker** - If no tools specified, prompts for proposer, challenger, effort, rounds, and context in a single batch question
3. **Proposer/Challenger Format** - First tool argues for the topic; second tool challenges with evidence
4. **Multi-Round Exchange** - Each round the proposer defends and the challenger responds (1–5 rounds)
5. **Verdict** - Orchestrator delivers a final synthesis picking a winner with reasoning

**Usage:**

```bash
# Natural language
/debate codex vs gemini about microservices vs monolith
/debate with claude and codex about our auth implementation
/debate thoroughly gemini vs codex about database schema design
/debate codex vs gemini 3 rounds about event sourcing

# Explicit flags
/debate "Should we use event sourcing?" --tools=claude,gemini --rounds=3 --effort=high
/debate "Valkey vs PostgreSQL for caching" --tools=codex,opencode

# With codebase context
/debate "Is our current approach correct?" --tools=gemini,codex --context=diff
```

**Options:**

| Flag | Description |
|------|-------------|
| `--tools=TOOL1,TOOL2` | Proposer and challenger (comma-separated) |
| `--rounds=N` | Number of debate rounds, 1–5 (default: 2) |
| `--effort=low\|medium\|high\|max` | Reasoning depth per tool call |
| `--context=diff\|file=PATH\|none` | Codebase context passed to both tools |

**Agent:** debate-orchestrator (opus model for orchestration)

### /release

> Versioned release with automatic ecosystem and tooling detection

```bash
/release                # Patch release (auto-discovers how this repo releases)
/release minor          # Minor version bump
/release major --dry-run # Preview what would happen
```

The release agent discovers how your repo releases before executing:

1. **Checks for release tools** - semantic-release, release-it, goreleaser, changesets, cargo-release
2. **Checks for scripts** - Makefile `release:` target, npm `release` script, `scripts/release.*`
3. **Falls back to generic** - Version bump, changelog, tag, push, GitHub release, publish

Supports 12+ ecosystems: npm, cargo, python, go, maven, gradle, ruby, nuget, dart, hex, packagist, swift.

**Agent:** release-agent (sonnet model)

**Skill:** release (generic fallback workflow)

### /skillers

> Learn from your workflow patterns and suggest automations

```bash
/skillers show              # Display current config and knowledge stats
/skillers compact           # Analyze recent transcripts, extract patterns
/skillers compact --days=14 # Analyze older transcripts
/skillers recommend         # Get automation suggestions from accumulated knowledge
```

Reads your Claude Code conversation transcripts, identifies recurring patterns (pain points, repeated workflows, wishes), clusters them into weighted themes, and suggests skills, hooks, or agents to automate them.

No per-turn overhead - it reads transcripts that Claude Code already saves.

**Agents:** skillers-compactor (sonnet), skillers-recommender (opus)

**Skills:** skillers-compact, recommend

---

### /skill-curator

> Create and improve reliable `SKILL.md` files

```bash
/skill-curator "create a skill for reviewing background jobs"
/skill-curator --improve path/to/SKILL.md --category review
```

The skill curator focuses on trigger quality, clear scope, router patterns, concrete `Skip unless:` gates, token budgets, and agnix-ready structure across Claude Code, Codex, OpenCode, Cursor, Kiro, and similar tools.

**Skill:** skill-curator

---

### /system-prompt-curator

> Create and improve autonomous coding-agent system prompts

```bash
/system-prompt-curator "GitHub issue resolver"
/system-prompt-curator --improve path/to/prompt.md --for-orchestrator
```

The system prompt curator rewrites prompts around task-matched identity, phased workflow, explicit tools, evidence-based completion criteria, and realistic error recovery examples. It separates prompt guidance from harness-level checks that belong in code.

**Skill:** system-prompt-curator

---

### /onboard

**Purpose:** Get oriented in any codebase in under 3 minutes.

**What happens when you run it:**

1. **Collect** (68ms median) - Pure JavaScript scans manifest, structure, README, CI, git info. Normal depth adds CLAUDE.md/AGENTS.md and repo-intel. No LLM tokens.
2. **Synthesize** - Sonnet agent produces a structured overview: tech stack, key files, active areas, conventions
3. **Guide** - Interactive Q&A: ask about specific files, areas, or patterns

**74% fewer tokens** than manual onboarding. Validated on 100 repos across JS/TS, Rust, Go, Python, C/C++, Java, and Deno.

**Depth levels:**

| Level | Time | Data |
|-------|------|------|
| quick | ~2s | Manifest + README + structure |
| normal | ~5s | + CLAUDE.md/AGENTS.md + CI + repo-intel |
| deep | ~15s | + repo-intel AST symbols |

**Supported manifests:** package.json, Cargo.toml, go.mod, pyproject.toml, deno.json, CMakeLists.txt, meson.build, setup.py, pom.xml, build.gradle. Detects monorepos (npm/pnpm/lerna/Cargo workspaces, Python libs/, Deno workspaces).

**Usage:**

```bash
/onboard                    # Current repo
/onboard /path/to/repo      # Specific repo
/onboard --depth=deep       # Include AST data
```

**Agent:** onboard-agent (sonnet model)

[Full documentation →](https://github.com/agent-sh/onboard)

---

### /can-i-help

**Purpose:** Match a contributor's skills to specific areas where they can help.

**What happens when you run it:**

1. **Collect** - Gathers project data + contributor signals (test gaps, doc drift, bugspots, good-first areas, open issues). Validated on 100 repos.
2. **Match** - Sonnet agent asks about developer background and matches skills to project needs
3. **Guide** - For each recommendation: reads code, explains what needs doing, gives a concrete first step

**Matching:**

| Developer profile | Gets recommended |
|-------------------|------------------|
| New to stack | Good-first areas with clear patterns |
| Experienced | Hard problems in pain-point areas |
| Test-focused | Test gaps in frequently-changed files |
| Bug-focused | Bugspot files + relevant open issues |
| Docs-focused | Stale documentation with code examples |

**Usage:**

```bash
/can-i-help                       # Current repo
/can-i-help /path/to/repo         # Specific repo
/can-i-help --depth=deep          # Include AST data
```

**Agent:** can-i-help-agent (sonnet model)

[Full documentation →](https://github.com/agent-sh/can-i-help)

---

## How Commands Work Together

**Standalone use:**

```bash
/deslop apply          # Just clean up your code
/sync-docs             # Just check if docs need updates
/prepare-delivery      # Run all quality gates (no ship)
/ship                  # Just ship this branch
/gate-and-ship         # Quality gates + ship in one command
/audit-project         # Just review the codebase
```

**Composable delivery chain:**

```
/prepare-delivery  = quality gates only (deslop, review, validation, docs)
/ship              = PR + CI + merge only
/gate-and-ship     = /prepare-delivery + /ship
/next-task         = full workflow (discovery → implementation → /prepare-delivery → /ship)
```

**Full integrated workflow:**

When you run [`/next-task`](#next-task), it orchestrates everything:

```
/next-task picks task → explores codebase → plans implementation
    ↓
implementation-agent writes code
    ↓
deslop-agent + prepare-delivery:test-coverage-checker + /simplify (parallel)
    ↓
review loop iterates until approved
    ↓
prepare-delivery:delivery-validator checks requirements
    ↓
sync-docs-agent syncs documentation
    ↓
/ship creates PR → monitors CI → merges
```

The workflow tracks state so you can resume from any point.

---

## Design Philosophy

<details>
<summary><strong>Architecture decisions and trade-offs</strong> (click to expand)</summary>

### The Actual Problem

Frontier models write good code. That's solved. What's not solved:

- **Context management** - Models forget what they're doing mid-session
- **Compaction amnesia** - Long sessions get summarized, losing critical state
- **Task drift** - Without structure, agents wander from the actual goal
- **Skipped steps** - Agents skip reviews, tests, or cleanup when not enforced
- **Token waste** - Using LLM calls for work that static analysis can do faster
- **Babysitting** - Manually orchestrating each phase of development
- **Repetitive requests** - Asking for the same workflow every single session

### How This Addresses It

**1. One agent, one job, done extremely well**

Same principle as good code: single responsibility. The exploration-agent explores. The implementation-agent implements. Phase 9 spawns multiple focused reviewers. No agent tries to do everything. Specialized agents, each with narrow scope and clear success criteria.

**2. Pipeline with gates, not a monolith**

Same principle as DevOps. Each step must pass before the next begins. Can't push before review. Can't merge before CI passes. Hooks enforce this - agents literally cannot skip phases.

**3. Tools do tool work, agents do agent work**

If static analysis, regex, or a shell command can do it, don't ask an LLM. Pattern detection uses pre-indexed regex. File discovery uses glob. Platform detection uses file existence checks. The LLM only handles what requires judgment.

**4. Agents don't need to know how tools work**

The slop detector returns findings with certainty levels. The agent doesn't need to understand the three-phase pipeline, the regex patterns, or the analyzer heuristics. Good tool design means the consumer doesn't need implementation details.

**5. Build tools where tools don't exist**

Many tasks lack existing tools. JavaScript collectors for drift-detect. Multi-pass analyzers for slop detection. The result: agents receive structured data, not raw problems to figure out.

**6. Research-backed prompt engineering**

Documented techniques that measurably improve results:
- **Progressive disclosure** - Agents see only what's needed for the current step
- **Structured output** - JSON between delimiters, XML tags for sections
- **Explicit constraints** - What agents MUST NOT do matters as much as what they do
- **Few-shot examples** - Where patterns aren't obvious
- **Tool calling over generation** - Let the model use tools rather than generate tool-like output

**7. Validate plan and results, not every step**

Approve the plan. See the results. The middle is automated. One plan approval unlocks autonomous execution through implementation, review, cleanup, and shipping.

**8. Right model for the task**

Match model capability to task complexity:
- **opus** - Planning, implementation, review orchestration
- **sonnet** - Pattern matching, validation, discovery
- **haiku** - Git operations, file moves, CI polling

Quality compounds. Poor exploration → poor plan → poor implementation → review cycles. Early phases deserve the best model.

**9. Persistent state survives sessions**

Two JSON files track everything: what task, what phase. Sessions can die and resume. Multiple sessions run in parallel on different tasks using separate worktrees.

**10. Delegate everything automatable**

Agents don't just write code. They:
- Clean their own output (deslop-agent)
- Update documentation (sync-docs-agent)
- Fix CI failures (ci-fixer)
- Respond to review comments
- Check for plan drift ([/drift-detect](#drift-detect))
- Analyze their own prompts ([/enhance](#enhance))

If it can be specified, it can be delegated.

**11. Orchestrator stays high-level**

The main workflow orchestrator doesn't read files, search code, or write implementations. It launches specialized agents and receives their outputs. Keeps the orchestrator's context window available for coordination rather than filled with file contents.

**12. Composable, not monolithic**

Every command works standalone. [`/deslop`](#deslop) cleans code without needing [`/next-task`](#next-task). [`/ship`](#ship) merges PRs without needing the full workflow. Pieces compose together, but each piece is useful on its own.

### What This Gets You

- **Run multiple sessions** - Different tasks in different worktrees, no interference
- **Fast iteration** - Approve plan, check results, repeat
- **Stay in the interesting parts** - Policy decisions, architecture choices, edge cases
- **Minimal review burden** - Most issues caught and fixed before you see the output
- **No repetitive requests** - The workflow you want, without asking each time
- **Scale horizontally** - More sessions, more tasks, same oversight level

</details>

---

## Installation

### Claude Code (Recommended way)

```bash
/plugin marketplace add agent-sh/agentsys
/plugin install next-task@agentsys
/plugin install ship@agentsys
```

### All Platforms (npm)

```bash
npm install -g agentsys && agentsys
```

Interactive installer for Claude Code, OpenCode, Codex CLI, Cursor, and Kiro.

```bash
# Non-interactive install
agentsys --tool claude              # Single tool
agentsys --tool cursor              # Cursor (project-scoped skills + commands)
agentsys --tool kiro                # Kiro (project-scoped steering + skills + agents)
agentsys --tools "claude,opencode"  # Multiple tools
agentsys --development              # Dev mode (bypasses marketplace)
```

[Full installation guide →](./docs/INSTALLATION.md)

---

## Requirements

**Required:**
- Git
- Node.js 18+

**For GitHub workflows:**
- GitHub CLI (`gh`) authenticated

**For GitLab workflows:**
- GitLab CLI (`glab`) authenticated

**For /repo-intel:**
- agent-analyzer (installed automatically via npm)

**For /agnix:**
- [agnix CLI](https://github.com/agent-sh/agnix) installed (`npm install -g agnix`, `cargo install agnix-cli`, or `brew install agnix`)

**Local diagnostics (optional):**
```bash
npm run detect   # Platform detection (CI, deploy, project type)
npm run verify   # Tool availability + versions
```

---

## Research & Testing

The system is built on research, not guesswork.

**Knowledge base** (`agent-docs/`): 8,000 lines of curated documentation from Anthropic, OpenAI, Google, and Microsoft covering:
- Agent architecture and design patterns
- Prompt engineering techniques
- Function calling and tool use
- Context efficiency and token optimization
- Multi-agent systems and orchestration
- Instruction following reliability

**Testing:**
- 3,518 tests passing
- Drift-detect validated on 1,000+ repositories
- E2E workflow testing across all commands
- Cross-platform validation (Claude Code, OpenCode, Codex CLI, Cursor, Kiro)

**Methodology:**
- `/perf` investigation phases based on recorded real performance investigation sessions
- Certainty levels derived from pattern analysis across repositories
- Token optimization measured and validated (77% reduction in drift-detect)

---

## Documentation

| Topic | Link |
|-------|------|
| Installation | [docs/INSTALLATION.md](./docs/INSTALLATION.md) |
| Cross-Platform Setup | [docs/CROSS_PLATFORM.md](./docs/CROSS_PLATFORM.md) |
| Usage Examples | [docs/USAGE.md](./docs/USAGE.md) |
| Architecture | [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) |

### Workflow Deep-Dives

| Workflow | Link |
|----------|------|
| /next-task Flow | [docs/workflows/NEXT-TASK.md](./docs/workflows/NEXT-TASK.md) |
| /ship Flow | [docs/workflows/SHIP.md](./docs/workflows/SHIP.md) |

### Reference

| Topic | Link |
|-------|------|
| Slop Patterns | [docs/reference/SLOP-PATTERNS.md](./docs/reference/SLOP-PATTERNS.md) |
| Agent Reference | [docs/reference/AGENTS.md](./docs/reference/AGENTS.md) |

---

## Support

- **Issues:** [github.com/agent-sh/agentsys/issues](https://github.com/agent-sh/agentsys/issues)
- **Discussions:** [github.com/agent-sh/agentsys/discussions](https://github.com/agent-sh/agentsys/discussions)

---

MIT License | Made by [Avi Fenesh](https://github.com/avifenesh)
