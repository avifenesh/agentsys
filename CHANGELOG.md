# Changelog

> **Migration Note:** This project was renamed from `awesome-slash` to `agentsys` in v5.0.0. All npm packages, CLI commands, and GitHub references now use the new name. Previous versions are archived under the old name.

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [6.0.2] - 2026-08-17

### Added

- CI runs the jest suite on `windows-latest` as well as Linux, with `fail-fast` disabled so a Windows-only failure does not hide the Linux result (#392). The Windows-specific paths in this repo - `where.exe` executable resolution, PATHEXT-aware lookups, and the `cmd.exe` routing `.cmd` shims have needed since the CVE-2024-27980 fix - had never been exercised by CI: every regression in them so far was found by a user on Windows or by reading the code, which is why one defect class took three PRs to close.
- Dependabot configuration: weekly npm checks with minor and patch updates grouped into one PR (#385).

### Changed

- `jest` 29.7.0 -> 30.4.2 (#387). Jest 30 treats `--testPathPattern` as a fatal deprecation, so the targeted-test commands in the checklists now pass `--testPathPatterns`.

### Removed

- Deleted `adapters/codex/install.sh` and `adapters/opencode/install.sh` (#395). Both sourced every command and skill from `plugins/`, a tree removed when plugins moved to standalone repos, so each mapping took the "skipped" branch and the scripts installed nothing while still printing `[OK] Installation complete!` and listing skills they had not written. They were not inert: before copying, they `rm -rf`'d five skill directories and `~/.codex/prompts`, so running one deleted a working install and reported success. `agentsys --tool codex` / `agentsys --tool opencode` (`bin/cli.js`) is the supported install path, with `scripts/dev-install.js` covering dev installs, and the adapter READMEs, the OpenCode plugin checklist, and the `maintain-cross-platform` skill no longer point at the scripts.

### Security

- Claude plugin marketplace/install/update/uninstall in `bin/cli.js` now spawn via `execFileSync` with an argv array, so no plugin ID reaches a shell (#388).
- Lockfile bump closing GHSA-5p4m-2wfm-xmqj in `js-yaml`, together with the remaining audit-fixable high-severity advisories (#386). Transitive dev dependencies; no manifest range changed.
- Lockfile bump taking `brace-expansion` to 1.1.16, closing its high-severity ReDoS advisory (#383). Transitive dev dependency; no manifest range changed.

### Fixed

- Windows: the Claude Code executable is now resolved from `where.exe` instead of assuming the npm shim. `execFileSync` does not apply PATHEXT, and the previous hardcoded `claude.cmd` did not exist for native-installer users who have `claude.exe` - those calls raised `ENOENT`, the error was swallowed, and the CLI reported success while installing nothing. A directly launchable `claude.exe` is preferred over a batch shim regardless of PATH order.
- Windows: an npm-global `claude.cmd` shim is launched through `cmd.exe` rather than handed to `execFileSync`, which fails with `EINVAL` - Node's `src` has disallowed direct `.bat`/`.cmd` spawning since the CVE-2024-27980 fix in 18.20.2 / 20.12.2 / 21.7.3. Arguments are rejected unless they are free of whitespace and shell metacharacters, so the extra hop cannot reintroduce the injection surface #388 closed.
- `agentsys install` no longer reports `[OK] Installed ... successfully` when Claude Code rejected a plugin. It names the plugins that failed, with the errno when the shim could not be spawned at all, and how to retry. The same now applies when the `claude` CLI is not on PATH at all (`~/.claude` alone was enough to mark the platform as installed) and when a dependency id would be rejected. Such a plugin is also no longer recorded against `claude` in `installed.json` - `agentsys list` and `agentsys remove` read those platforms back - though a registration recorded by an earlier successful install is preserved, since a failed re-install is not evidence the first one never landed. The process now exits non-zero, matching the `--tool` path so `agentsys install x && ...` stops.
- Windows: `agentsys-dev test`, `agentsys-dev bump`, `runBenchmark`, and `runProfiling` all handed a `.cmd` shim straight to `spawnSync`/`execFileSync`, which fails with `EINVAL` for the same reason the Claude shim did - `resolveExecutableForPlatform` turns `npm` into `npm.cmd` and `node_modules/.bin/vitest` into `vitest.cmd`, so every benchmark, profile, and dev test run died on Windows. These now route through `cmd.exe` via a shared `planShimSpawn` in `lib/utils/command-parser.js`, which `bin/cli.js` uses as well so the two mechanisms cannot drift apart. Unlike the Claude call sites, these carry user-written commands, so arguments are quoted for `cmd.exe` rather than rejected for containing whitespace or metacharacters; a literal `"`, `%`, CR or LF is still refused, in the executable as well as the arguments, since none survives `cmd.exe` intact - `bench\ncalc` would otherwise reach the command line, which `bin/cli.js` is shielded from only by its allowlist. The rewrite is win32-only: a repo-local `build.cmd` on Linux is spawnable as it stands, and routing it through a `cmd.exe` that is not there would only turn a working command into `ENOENT`. `agentsys-dev test` also prints the error it used to swallow, since a refused argument now reaches the user from there.
- Windows: a custom source naming an npm-shipped CLI (`npx`, `pnpm`, `yarn`) was always probed as unavailable - `execFileSync` applies no PATHEXT, so the bare name raised `ENOENT`, and the `.cmd` it needs cannot be spawned directly either. `probeCLI` resolves the shim and routes it the same way.
- Windows: `scripts/dev-install.js` ran all four of its external commands through `execSync`, i.e. through a shell (#393). `claude` and `npm` are `.cmd` shims there, so only the implicit `cmd.exe` hop made them work at all - anything but a shell string needs the explicit hop `planShimSpawn` builds, since Node has refused direct `.cmd` spawns since the CVE-2024-27980 fix and `execFileSync` applies no PATHEXT to a bare name. The plugin-uninstall line also interpolated a discovered plugin name into that shell string; the name is matched against `/^[a-z0-9][a-z0-9-]*$/` first, so nothing could reach it, but the guard and the interpolation sat in different functions and were the only thing making the line safe. All four calls are now argv lists through one `runCommand` helper, so shim resolution and the `cmd.exe` hop happen in one place and a name holding shell metacharacters stays a single argument.
- Windows: `scripts/dev-install.js` resolved `claude` with `resolveExecutableForPlatform`, which maps the bare name to `claude.cmd` - the assumption #390 removed from `bin/cli.js` (#394). The npm global install does ship `claude.cmd`, but the native installer ships `claude.exe`, so `commandExists('claude')` passed while the spawn failed, and with both call sites discarding the error the marketplace removal and every plugin uninstall silently did nothing. The `where.exe`-based pick moved out of `bin/cli.js` into `lib/utils/claude-executable.js` so both callers get the same answer, and the discarded errors became a warning: a numeric exit status means `claude` ran and refused, which is normal for a best-effort removal, while a spawn failure (status `null` with an errno, or `cmd.exe` reporting 9009 for a command it could not launch) means it never ran and is worth a line.
- Windows checkouts: `.gitattributes` pins text files to LF (#392). `generate-docs` compares generated sections byte-for-byte against the file on disk, so with Git's CRLF conversion every section read as stale and `--check` exited 1. The marketplace contract test read `scripts/plugins.txt` the same way, keeping a trailing `\r` on each name; it now tolerates CRLF so a checkout setting cannot masquerade as a mismatched plugin.
- `lib/utils/command-parser.js` used a raw null byte where `'\0'` was intended. Git and grep classified the file as binary, so changes to it could not be reviewed as a diff. Also normalized to LF, the only CRLF-encoded source file in the repo.

### Tests

- The `planShimSpawn` tests faked the platform but not `COMSPEC`, so their assertions on a bare `cmd.exe` only held on a host where that variable is unset - the Windows runner reports `C:\Windows\system32\cmd.exe` and six of them failed on the first Windows CI run. `COMSPEC` is now faked alongside the platform, with cases for both the variable's value and the bare `cmd.exe` left when it is unset (#392).

## [6.0.1] - 2026-07-22

### Security

- Removed the unused production `js-yaml` dependency, eliminating exposure to GHSA-52cp-r559-cp3m (quadratic CPU consumption through YAML merge-key chains) (#381).

### Fixed

- Restored Cursor and Kiro installation after a core sync removed adapter discovery and transformation functions still called by `agentsys --tool cursor` and `agentsys --tool kiro` (#380, #381).
- Scoped Jest worktree ignore patterns to the repository root so tests run when AgentSys itself is checked out under a `worktrees` directory (#381).

### Tests

- Added isolated-home installer regression coverage for Cursor commands/skills and Kiro prompts/skills/agents (#381).

## [6.0.0] - 2026-05-29

### Removed
- **BREAKING: Dropped the `axiom` and `web-ctl` plugins from the marketplace** (#365). Both repositories were retired; their marketplace entries, `plugins.txt` rows, `.kiro` mirrors (`web-auth`, `web-browse`, `web-session`), and all site/docs references were scrubbed. Installable plugin count is now 24 (was 26). Users who previously installed `axiom` or `web-ctl` from the marketplace must remove them; they will no longer resolve.

### Added
- **Unified `repo-intel` core library** synced from agent-core (#373). The vendored `lib/repo-intel/` now exposes a single surface that folds the former `repo-map` lifecycle and the embedder into one module: `init`/`update`/`status`/`load`/`loadRaw`/`exists`, typed `queries.*`, LLM-augmentation write-path (`applyDescriptors`/`applySummary`), and an opt-in `embed` submodule (orchestrator, preference, binary resolver) for semantic search and duplicate detection. `lib/repo-map` remains as a deprecated compatibility shim. `lib/index.js` now exports `repoIntel` alongside `repoMap`.

### Fixed
- `skill-patterns` `side_effect_without_disable` now accepts both the YAML boolean `true` and the quoted string `"true"` for `disable-model-invocation`, so a frontmatter value of `"true"` is no longer wrongly re-flagged.
- Bounded 19 polynomial-ReDoS regexes and closed 2 prototype-pollution sinks across the synced `collectors`/`enhance` lib (match semantics preserved; verified by equivalence testing).
- Removed the stale `aiRatio` query test - the analyzer dropped AI-authorship attribution and the query no longer exists (#372).

## [5.14.0] - 2026-05-21

### Added
- Registered the `ada-spark` skill plugin (`agent-sh/ada-spark` v0.1.0, pinned `v0.1.0` / `d84e4ef`) in the marketplace. Teaches agents to write idiomatic, correct, current Ada and SPARK (Ada 2022) - contracts (aspects, `Pre'Class`), the Alire ecosystem, SPARK proof (AoRTE, assurance levels, ownership/borrow), embedded (Ravenscar/Jorvik), and GNAT/GNAT SAS tooling; blocks stale pre-2022 advice (GNAT Community, pragma contracts, CodePeer). Mapped to the `Languages` skill category.
- Registered the `mojo` skill plugin (`agent-sh/mojo` v0.2.0, pinned `v0.2.0` / `4d6f5fe`) in the marketplace. Teaches agents to write idiomatic, current Mojo (v1.0.0b1) - syntax, ownership and CPU/memory optimization, GPU kernels, and Mojo/Python interop; prevents stale pre-2025 syntax. Mapped to the `Languages` skill category.

### Changed
- Synced plugin/skill count surfaces across `README.md`, `AGENTS.md`, `docs/reference/AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/CROSS_PLATFORM.md`, `site/content.json`, `site/index.html`, and `site/ux-spec.md` for the two new language plugins: plugins `24 -> 26`, skills `45 -> 47` (agents unchanged at 50). Added `ada-spark` and `mojo` to `STATIC_PLUGIN_AGENT_COUNTS`, `CATEGORY_MAP`, and `STATIC_SKILLS` in `scripts/generate-docs.js`, and to `scripts/plugins.txt`.

## [5.13.5] - 2026-05-18

### Changed
- Updated `axiom` marketplace pin to `v0.6.2`, which ships the `SessionStart` plugin hook (`hooks/hooks.json` + `hooks/session-start.mjs`), the read-only `axiom before-any --detect-only` mode, an OpenCode `session.created` plugin scaffold, and the `BeforeAnyError` library refactor.

### Fixed
- Synced agent / skill / test / rule counts across `README.md`, `AGENTS.md`, `docs/reference/AGENTS.md`, `.codex-plugin/plugin.json`, `site/content.json`, `site/ux-spec.md`, and `site/index.html`. File-based agent count corrected `39 → 40` (total `49 → 50`), test count refreshed `3,513 → 3,518`, agnix references refreshed `399 → 423` rules and `126 → 129` auto-fixable. Updated `STATIC_PLUGIN_AGENT_COUNTS` in `scripts/generate-docs.js`: `repo-intel 1 → 3`, `agnix 1 → 0`.
- Updated the `/axiom` section in `README.md` to document the new SessionStart hook, `--detect-only` flag, Codex plugin-hooks opt-in (`[features].plugin_hooks = true`), and the OpenCode scaffold limitation pending [sst/opencode#5409](https://github.com/sst/opencode/issues/5409).

### Tests
- Updated `__tests__/marketplace-standalone-contract.test.js` to pin the `axiom` expected version, ref, and commit at `v0.6.2 / e3f3fab`.

## [5.13.4] - 2026-05-18

### Changed
- Updated the `axiom` marketplace pin to `v0.6.1`, including the clean-machine init bootstrap fix and richer generated starter index keywords.

### Tests
- Added `axiom` to the standalone marketplace contract so its release tag, commit pin, command, docs, and Codex metadata stay covered.

## [5.13.3] - 2026-05-17

### Fixed
- Updated the enhance skill analyzer to accept string-parsed `disable-model-invocation: true` metadata.

### Changed
- Updated `skill-curator` to `v1.0.1` and `system-prompt-curator` to `v2.0.1` so AgentSys consumes the hardened releases.

## [5.13.2] - 2026-05-17

### Changed
- Updated the `banthis` marketplace pin to `v0.3.1`, which hardens CLI writes and fixes the init fallback install path.

### Tests
- Added marketplace contract coverage for the standalone curator and negative-memory plugins.

## [5.13.1] - 2026-05-17

### Changed
- Updated the `banthis` marketplace pin to the GitHub-installable `v0.3.0` commit so documented fallback installation works without npm publication.

## [5.13.0] - 2026-05-17

### Added
- Added the `axiom` plugin to the agentsys marketplace and static docs metadata. Axiom provides durable agent-native memory, project context loading, scoped querying, project scaffolding, and human-approved record proposals.
- Added `banthis` as a published standalone plugin pinned to `v0.3.0`. It provides durable negative behavior memory through a tiny CLI, skill, and slash command.
- Added `skill-curator` as a published standalone plugin pinned to `v1.0.0` for production-grade `SKILL.md` authoring and review.
- Added `system-prompt-curator` as a published standalone plugin pinned to `v2.0.0` for autonomous coding-agent system prompt curation.

### Changed
- Updated marketplace, Codex metadata, docs, and website counts to 24 plugins, 49 agents, and 45 skills.

## [5.12.0] - 2026-04-26

### Propagated upstream releases
- agent-core v0.4.4 (fixer.js symlink + TOCTOU) -> v0.4.5 (client-side SLSA verification + sync allowlist) synced into all 13 consumers.
- agent-analyzer v0.8.0 -> v0.8.1 (cargo-deny CI).
- prepare-delivery v0.1.2, audit-project v1.0.2 (reviewer-contract markers + orchestrator blocked handling).

## [5.11.0] - 2026-04-26

### Changed
- **Upgraded marketplace sub-plugin pins from SHA-only to tag+SHA** after each downstream plugin cut security releases. Post-run totals: 12 pinned to tags, 8 fell back to default-branch SHA (up from 7/13 in v5.10.0). New tag pins in this wave: `prepare-delivery` v0.1.1, `audit-project` v1.0.1, `next-task` v1.1.2, `ship` v1.1.2, `skillers` v0.2.1, `onboard` v0.1.1, `can-i-help` v0.1.1, `perf` v1.0.1, `debate` v1.0.1. Consumers now install from verifiable release tags for these plugins.

### Propagated upstream security fixes
- agent-core v0.4.4 synced into all 13 consumers via `lib/`: fixer.js symlink + TOCTOU guards (#14 agent-core), earlier v0.4.3 code-point-safe truncate + sync-workflow test-file exclusion, v0.4.2 additive sync + upstreamed workflow-state/queries, v0.4.1 binary SHA-256 + zip-slip defenses.
- prepare-delivery + audit-project: falsePositive review-bypass cap (50% ratio + required reason).
- next-task: worktree-manager TASK_ID/BASE_BRANCH validation.
- ship: platform-API health checks instead of log-grep rollback DoS.
- skillers: transcript redaction pipeline (ported from consult).
- onboard + can-i-help: explicit argv arrays in collector git invocations.
- perf: command-parser error message accuracy.
- debate: SKILL.md routes AI CLI invocations through consult's hardened ACP transport.

## [5.10.0] - 2026-04-26

### Security
- **Marketplace supply-chain hardening** (#347) - pin every `source: "url"` sub-plugin entry in `.claude-plugin/marketplace.json` to an immutable commit SHA (plus release tag when one exists) instead of tracking default branches. Unpinned `source: "url"` entries previously let `claude plugin install` follow the remote's default branch, meaning any sub-plugin compromise would ship code to every user on their next install. New `scripts/pin-marketplace.js` resolves `v<version>` tags to commit SHAs via `gh api repos/.../git/ref/tags/<tag>` (annotated tags are dereferenced to the underlying commit), rejects ambiguous array responses, and falls back to default-branch HEAD SHA when the desired tag does not yet exist. Covered by `__tests__/pin-marketplace.test.js`.
- **Reusable CI workflow SHA-pinned** (#347) - `agent-sh/.github/.github/workflows/agnix.yml@main` pinned to an explicit commit SHA so a compromise of the shared workflows repo cannot silently change agentsys's CI behavior.
- **Release workflow shell injection hardening** (#347) - replaced 5 shell blocks that interpolated `${{ inputs.version }}` / `${{ github.event.inputs.* }}` directly into bash with `env:` block wiring; values are now read as shell variables so a malicious tag/input cannot break out of the command string.
- **Removed self-referential npm dependency** (#347) - the `"agentsys": "^5.0.0"` entry in `package.json` / `package-lock.json` had no functional purpose and could confuse resolvers.
- **`agent-analyzer` binary downloader security** (#350, synced from agent-core) - `lib/binary/index.js` now requires a matching `.sha256` sidecar, computes and verifies SHA-256 before extraction (with an explicit `skipChecksum` escape hatch for local dev), and extracts into an isolated scratch directory with archive-path-traversal defenses: reject absolute paths, UNC paths, drive letters, `..` segments, and symlinks; copy only the expected binary into the final install location; scrub the scratch tree afterward. Windows extraction moved from `Expand-Archive` command strings to a `-File` PowerShell script with env-var argument passing so paths containing spaces are handled safely. Covered by `lib/binary/index.test.js`.

### Changed
- **Marketplace pins upgraded to release tags** - post-#347, re-ran `scripts/pin-marketplace.js` after the downstream plugins cut tagged releases:
  - `agnix`: default-branch SHA -> `v0.22.1` (tag + commit)
  - `web-ctl`: default-branch SHA -> `v1.1.0` (tag + commit)
  - `ship`: default-branch SHA -> `v1.1.1` (tag + commit)
  - Running totals: 7 plugins pinned to tag + SHA, 13 still on default-branch SHA pending their first release tag.
- Bumped `version` fields in `marketplace.json` for `agnix`, `web-ctl`, and `ship` to match the latest published tags so future `pin-marketplace.js` runs resolve to the correct refs.

## [5.9.1] - 2026-04-26

### Changed
- **agnix marketplace entry** - bumped from 1.0.0 to 1.1.0 and updated description from "385 rules" to "414 rules" to reflect agnix v0.22.0 (414 validation rules, additive `schema --fix` and `tools check/detect` subcommands). Updated `site/content.json` version highlight to match.

## [5.9.0] - 2026-04-25

### Added
- **`zig-lsp` plugin** - Zig language server (ZLS) integration for Claude Code's `LSP` tool. Maps `.zig` and `.zon` to language `zig`; enables `enable_build_on_save` so post-edit diagnostics surface real type errors (not just parser errors); 30 s startup timeout, restart-on-crash with cap. Plugin is config-only - no slash commands, no agents, no skills - the harness's built-in `LSP` tool dispatches automatically once `zls` is on `PATH`. Marketplace entry under category `development`. Source: https://github.com/agent-sh/zig-lsp
- Marketplace plugin count 19 -> 20 in `.claude-plugin/marketplace.json` description, `scripts/plugins.txt`, and `site/content.json` stats.

## [5.8.6] - 2026-04-23

### Added
- **`@agentsys/lib`'s `repoIntel.queries` module** - typed wrappers over every `agent-analyzer repo-intel query <type>` subcommand (28 functions). Consumer plugins can now call `require('@agentsys/lib').repoIntel.queries.hotspots(cwd, { limit: 20 })` instead of constructing raw CLI argv themselves. Functions returned in JSON match the binary's output shape per query.
- **4 new graph-derived query wrappers** for the analyzer-graph crate landed in agent-analyzer v0.4.0:
  - `communities(cwd)` - lists Louvain-discovered file clusters (the natural feature areas, independent of directory layout)
  - `boundaries(cwd, { limit })` - files bridging multiple communities by betweenness centrality (architectural seams - highest-leverage files for refactoring)
  - `areaOf(cwd, file)` - which community a file belongs to
  - `communityHealth(cwd, id)` - composite per-community roll-up (size, total/recent changes, bug-fix rate, AI ratio, stale-owner count)

### Changed
- **`ANALYZER_MIN_VERSION` bumped 0.3.0 -> 0.4.0** to match agent-analyzer v0.4.0 which adds the graph subcommands. Older binaries get auto-upgraded on first call by `lib/binary.ensureBinary()`.

## [5.8.5] - 2026-04-23

### Fixed
- **Hardcoded developer paths in web-ctl skills** (#333) - replaced 76 occurrences of `/Users/avifen/.agentsys/plugins/web-ctl/scripts/web-ctl.js` with `~/.agentsys/...` across `.kiro/skills/web-auth/SKILL.md` (16 sites) and `.kiro/skills/web-browse/SKILL.md` (60 sites). The original absolute path only existed on the maintainer's machine, so every CLI example silently failed for any other user. The portable form matches the install path documented in `meta/skills/maintain-cross-platform/SKILL.md` and works for both shell copy-paste and agent execution (Bash tool's `bash -c` performs tilde expansion).
- **`prepare` lifecycle hook auto-installed git hooks on every `npm install`** (#334) - moved hook installation from npm's `prepare` script to an explicit `setup-hooks` script so consumers no longer get hooks injected as a side effect of `npm install`. Documented opt-in flow in `CONTRIBUTING.md`. Also removed the no-op pre-commit placeholder (it just wrote a comment file - lib/ sync is handled by agent-core CI now), so only the actually-active pre-push hook (preflight + `/enhance` reminder + release-tag validation) is installed.
- **`npm version` lifecycle dropped downstream version stamps** (#339, #342) - replaced `git add -A` (which would sweep unrelated working-tree changes into the version commit) with an explicit allowlist covering every file `stamp-version.js` writes plus npm's own lockfile and `CHANGELOG.md`: `package.json`, `package-lock.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `site/content.json`, `CHANGELOG.md`. Preserves the original intent (no working-tree sweep) while keeping all version manifests consistent after `npm version`. (CHANGELOG.md added per gemini-code-assist review on #342 - the developer manually edits CHANGELOG before each release, so it must be in the allowlist or `npm version`'s auto-commit drops the changelog entry.)

### Changed
- **`js-yaml` dependency range tightened from `^4.1.1` to `~4.1.1`** (#335) - blocks unintended `4.x` minor bumps while still allowing `4.1.x` patch updates so runtime security fixes flow in automatically. Lockfile root entry synced to match.

## [5.8.4] - 2026-04-20

### Fixed
- **tasks.json atomic optimistic locking** (#331) - Concurrent `/next-task` and `/ship` runs could silently lose claims or leave stale registry entries due to unguarded read-modify-write on `tasks.json`. Fix uses `_version` + per-write `_writerId` optimistic locking (mirrors existing `flow.json` pattern): write atomically via rename, re-read and verify both fields match before declaring success, retry up to 5× with jitter on mismatch.
- **tasks.json schema unification** - `worktree-manager` wrote `{ version, tasks[] }` while `workflow-state.js` read `{ active }`, causing claim exclusion in `discover-tasks` to always return an empty set. Unified schema is `{ active, tasks[], _version, _writerId }` with on-read normalization of both legacy formats — no migration needed.
- **Silent corruption risk** - `readTasks()` now throws on corrupted JSON instead of returning a safe default, preventing `updateTasks` from silently overwriting potentially recoverable data.
- **Agent prompt raw file writes** - `worktree-manager` Phase 6 and Cleanup Reference replaced inline `fs.writeFileSync` with `workflowState.claimTask()` / `workflowState.releaseTask()` library calls that are atomic and retry-safe.

### Added
- `updateTasks(mutatorFn)` - optimistic-lock loop for `tasks.json` mutations (mirrors `updateFlow`)
- `claimTask(entry, projectPath)` - atomic upsert into `tasks[]` registry for worktree-manager
- `releaseTask(taskId, projectPath)` - atomic removal from `tasks[]` registry for ship/abort; idempotent

## [5.8.3] - 2026-04-11

### Fixed
- **next-task v1.1.1** - SubagentStop hook now only fires during active /next-task workflows, not on every subagent stop (agent-sh/agentsys#325). Cross-platform guard script replaces unconditional prompt injection that wasted 136K+ tokens per unrelated agent.

### Changed
- Bump next-task marketplace version to 1.1.1

## [5.8.2] - 2026-04-11

### Added
- Codex CLI plugin manifest (`.codex-plugin/plugin.json`) for native Codex discovery

### Fixed
- Flaky stale items test - use >= 99 threshold for date boundary tolerance

## [5.8.1] - 2026-03-28

### Added
- `exports` field in `lib/package.json` for `@agentsys/lib` module resolution
- Inline pipeline steps in each command panel on website
- Dynamic How It Works tab system for all 20 commands on website

### Fixed
- Code-point safe `truncate()` to prevent surrogate pair corruption across all truncation sites
- agnix stats updated to current counts (385 rules, 102 auto-fix, 36 categories)
- Site: command tab wrapping, skills grouping, How It Works rendering

### Changed
- Bumped repo-intel marketplace version to 0.2.0
- Synced agnix rule count 342 -> 385

## [5.8.0] - 2026-03-25

### Added
- prepare-delivery plugin - pre-ship quality gates (deslop, simplify, agnix, enhance, review loop, validation, docs sync)
- gate-and-ship plugin - orchestrator that chains /prepare-delivery then /ship
- /prepare-delivery and /gate-and-ship commands in marketplace, README, and AGENTS.md
- 9 missing agent sections in docs/reference/AGENTS.md (prepare-delivery, consult, debate, web-ctl, ship, skillers, onboard, can-i-help)
- Cursor and Kiro platform entries in site/content.json

### Changed
- Moved orchestrate-review, validate-delivery skills from next-task to prepare-delivery in STATIC_SKILLS
- Updated plugin count from 17 to 19 across marketplace.json, tests, and docs
- Comprehensive documentation sync: all command tables, agent counts, skill counts, platform lists updated across 22 files
- next-task marketplace entry: agent count 14 -> 8 (delivery agents moved to prepare-delivery), version 1.0.0 -> 1.1.0

## [5.7.0] - 2026-03-23

### Changed

- **repo-intel consolidation** - Merged `git-map` and `repo-map` plugins into a single `repo-intel` plugin backed by agent-analyzer. One artifact, one command (`/repo-intel`), 24 query types. `repo-map` repo deleted, `git-map` renamed to `repo-intel`.
- **ast-grep removed** - `lib/repo-map/` migrated from ast-grep to agent-analyzer binary. Removed runner.js (1,364 lines), queries/ (355 lines), usage-analyzer.js (407 lines), concurrency.js. Net -2,717 lines.
- Plugin count: 19 -> 18 (two merged into one)

### Added

- **Benchmarks section** in README and website - real data showing Sonnet + agentsys outperforms raw Opus at 40% lower cost, with 73-83% savings when switching models within agentsys
- **map-validator agent** ported from repo-map to repo-intel
- `onboard`, `can-i-help`, `stale-docs` query types added to `/repo-intel` command

### Fixed

- **agnix CI** - Fixed release workflow (draft-then-publish) and pinned to v0.16.5 with working binaries
- **7 broken test suites** from ast-grep migration - deleted 5 obsolete test files, rewrote 2
- All PR review comments addressed across 6 repos

## [5.6.4] - 2026-03-20

### Added

- **glide-mq plugin** - New skill-only plugin with 3 skills for message queue development and migration:
  - `glide-mq` - Greenfield queue development with glide-mq (ordering, rate limiting, flows, broadcast)
  - `glide-mq-migrate-bullmq` - Migrate from BullMQ to glide-mq
  - `glide-mq-migrate-bee` - Migrate from Bee-Queue to glide-mq
- Skills updated for glide-mq v0.12.0: runtime per-group rate limiting (`job.rateLimitGroup()`), ordering path unification, `GroupRateLimitError`
- Plugin count: 18 -> 19, skill count: 36 -> 39

## [5.4.1] - 2026-03-10

### Added

- **Project base branch** (`--base=BRANCH`) - `/next-task` now supports configuring a project-level base branch for batch workflows. All downstream operations (worktrees, diffs, PRs) use the configured branch instead of main.
- **Free-text preference caching** - When users select "Other" for any policy decision and type a custom response, it gets cached and offered as an option next time. Auto-removed after 3 skips.
- **Gate 0 hook** - SubagentStop hook blocks Phase 2 unless policy decisions are persisted to preference cache.
- **Multi-tool transcript support** - `/skillers compact` now reads from Claude Code, Codex CLI, and OpenCode (was Claude Code only).

### Fixed

- **ship target branch validation** - `/ship` now reads `baseBranch` from flow state and validates non-default targets with user confirmation.
- **Quality sweep** - Removed 95 lines of prose slop and duplication across ship and skillers.
- **Pre-push hooks** - Fixed for repos without `npm test` script (falls back to JS syntax check).
- **Cached source null check** - `getPolicyQuestions` no longer crashes when preference file has freeText but no source.

## [5.4.0] - 2026-03-10

### Added

- **`/release` command** - Discovery-first release workflow that detects how a repo releases before executing. Supports 12+ ecosystems (npm, cargo, python, go, maven, gradle, ruby, nuget, dart, hex, packagist, swift) and 7 release tool configurations (semantic-release, release-it, goreleaser, changesets, cargo-release, lerna, standard-version).
- **`/skillers` command** - Transcript-based workflow pattern learning. Analyzes Claude Code conversation history, clusters recurring patterns into weighted themes, and suggests skills/hooks/agents to automate repetitive work.
- **release-agent** (sonnet) - Discovers release method via tool configs, CI workflows, scripts, and manifests before performing the release.
- **skillers-compactor** (sonnet) - Extracts observations from conversation transcripts and clusters them into knowledge themes.
- **skillers-recommender** (opus) - Analyzes accumulated knowledge and classifies patterns as hook/skill/agent recommendations.
- **Agnix CI validation** - All plugins now run agnix lint in CI pipelines.
- **agent-knowledge submodule** - Research guides available as a git submodule.
- **Website additions** - How It Works content for consult, debate, web-ctl tabs.

### Fixed

- **Accurate ecosystem counts** - Stats now show 15 plugins, 35 agents, 32 skills, 3,751 tests, 14 commands. Previously showed inflated/stale counts.
- **Pinned action SHAs** - Updated to latest stable versions for security.
- **CodeQL regex** - Fixed inefficient regular expression flagged by code scanning.
- **Go test fixture** - Added go.mod so CodeQL can analyze Go fixtures.
- **Website CSS** - Reduced commands section bottom padding, removed inline how-it-works paragraphs.

## [5.3.7] - 2026-03-02

### Fixed

- **Website numbers updated** - Stats now show 14 plugins, 43 agents, 30 skills, 3,750 tests, 13 commands. Previously showed stale counts from earlier versions.
- **Kiro install TDZ bug** - Fixed `steeringMappingsForCleanup` used before initialization in v5.3.6 published code. Variable ordering corrected.

## [5.3.6] - 2026-03-02

### Fixed

- **Kiro commands install to ~/.kiro/prompts/** - Commands now install as prompts (invoked with `@name` in kiro-cli) instead of steering files. Legacy `~/.kiro/steering/` auto-cleaned on install.
- **Cursor installs globally to ~/.cursor/** - Previously project-scoped. Now global like all other platforms.
- **Kiro installs globally to ~/.kiro/** - Consistent with all other platforms.
- **Agent resources updated** - Reference `file://.kiro/prompts/**/*.md`.

## [5.3.5] - 2026-03-02 (broken - variable ordering bug)

## [5.3.4] - 2026-03-02

### Fixed

- **Kiro installs globally to ~/.kiro/** - Previously installed to `cwd/.kiro/` (project-scoped) which only worked in the agentsys directory. Now installs to `~/.kiro/` like other platforms (OpenCode → `~/.config/opencode/`, Codex → `~/.codex/`). Detection checks both global and project paths.

## [5.3.3] - 2026-03-02

### Fixed

- **Restored file:// prefix in Kiro agent resources** - kiro-cli requires `file://` or `skill://` scheme prefix on resources. The 5.3.2 removal caused all 34 agents to fail validation.

## [5.3.2] - 2026-03-02

### Fixed

- **Invalid file:// URI in Kiro agent resources** - Attempted to remove `file://` prefix (reverted in 5.3.3).
- **Kiro detection too strict** - Now detects `.kiro/` existence alone, catching fresh workspaces.
- **Silent tool stripping** - `task`, `web`, `fetch`, `notebook`, `lsp` tools added to Kiro agent mapping.
- **Kiro session continuity** - `supportsContinue` set to `true` (Kiro ACP reports `loadSession: true`).

## [5.3.1] - 2026-03-02

### Fixed

- **Code block Task() transform for Kiro** - Phase 9 reviewer Task() calls inside fenced JavaScript code blocks were not being transformed. Fixed with multiline-anchored fence regex that correctly handles backtick template literals inside code blocks.

## [5.3.0] - 2026-03-02

### Added

- **Kiro platform support (#276, #278)** - agentsys now installs to Kiro as a 5th platform alongside Claude Code, OpenCode, Codex CLI, and Cursor. Use `agentsys --tool kiro` or `agentsys install <plugin> --tool kiro` to install. Commands become steering files in `.kiro/steering/` (with `inclusion: manual` frontmatter), skills are copied to `.kiro/skills/` (standard SKILL.md format), and agents are converted to JSON in `.kiro/agents/`. All content is project-scoped under `.kiro/`. Platform detection uses `.kiro/` directory presence.

- **Kiro subagent transforms (#279, #280)** - Task() calls transform to `Delegate to the \`agent\` subagent` with prompt context. AskUserQuestion transforms to markdown numbered-list prompts. Plugin namespace prefixes are stripped.

- **Kiro parallel agent adaptation** - Workflows spawning 4+ parallel reviewer agents (next-task Phase 9, audit-project Phase 2) are automatically adapted for Kiro's experimental 4-agent limit. `installForKiro()` generates two combined reviewer agents (`reviewer-quality-security`, `reviewer-perf-test`). `transformCommandForKiro()` detects consecutive reviewer delegations and rewrites as try-4-then-fallback-to-2 pattern.

- **Subagent comparison documentation** - CROSS_PLATFORM.md now has a platform comparison table for subagent capabilities (spawning, parallelism, teams, ACP) across all 5 platforms.

### Changed

- **`transformAgentForKiro()` refactored** - Now reuses `discovery.parseFrontmatter()` instead of custom parsing. Supports YAML array syntax for tools field.

### Fixed

- **Copy-paste bug in `installForCursor()`** - Skill transform was calling `transformSkillForKiro` instead of `transformSkillForCursor`.

## [5.2.1] - 2026-03-01

### Fixed

- **Installer marketplace source parsing** — Added compatibility for both legacy string `source` values and structured source objects (`{ source: "url", url: "..." }`) so installs no longer crash with `plugin.source.startsWith is not a function`.
- **Plugin fetch resilience and failure behavior** — Normalized `.git` repository URLs, added GitHub ref fallback order (`vX.Y.Z`, `X.Y.Z`, `main`, `master`), and fail-fast behavior when any plugin fetch fails.
- **Cross-platform install ordering** — Fixed install sequence so local install directory reset no longer wipes the fetched plugin cache before OpenCode/Codex installation.

## [5.2.0] - 2026-02-27

### Added

- **Cursor platform support (#261)** — agentsys now installs to Cursor as a 4th platform alongside Claude Code, OpenCode, and Codex CLI. Use `agentsys --tool cursor` or `agentsys install <plugin> --tool cursor` to install. Skills are copied to `.cursor/skills/` (same SKILL.md format - no transform needed), commands to `.cursor/commands/` (light transform), and rules to `.cursor/rules/*.mdc` (MDC frontmatter). All content is project-scoped. Cursor v2.4+ natively supports the Agent Skills standard.

- **`/web-ctl` plugin** — New plugin for browser automation and web testing. Headless browser control via Playwright with persistent encrypted sessions, human-in-the-loop auth handoff (including CAPTCHA detection and checkpoint mode), anti-bot measures (webdriver spoofing, random delays), WSL detection with Windows Chrome fallback, and prompt injection defense via `[PAGE_CONTENT: ...]` delimiters. Includes `web-session` agent, `web-auth` and `web-browse` skills, and the `/web-ctl` command. Available at [agent-sh/web-ctl](https://github.com/agent-sh/web-ctl).

- **Plugin extraction to standalone repos (#250)** — All 13 plugins extracted from `plugins/` into standalone repos under the `agent-sh` org (`agent-sh/next-task`, `agent-sh/ship`, `agent-sh/deslop`, `agent-sh/audit-project`, `agent-sh/enhance`, `agent-sh/perf`, `agent-sh/drift-detect`, `agent-sh/sync-docs`, `agent-sh/repo-map`, `agent-sh/learn`, `agent-sh/consult`, `agent-sh/debate`, `agent-sh/agnix`). The `plugins/` directory has been removed from this repo. agentsys is now a marketplace + installer.

- **External plugin fetching in installer** — `bin/cli.js` now fetches plugins from their standalone GitHub repos at install time rather than bundling them. The installer resolves the correct version for each platform using the marketplace manifest.

- **Graduation script** (`scripts/graduate-plugin.js`) — Automates extraction of a plugin from the monorepo to a new standalone repo: creates repo, copies files, sets up agent-core sync, updates marketplace manifest.

- **Marketplace `requires` field** — `.claude-plugin/marketplace.json` now supports a `requires` field per plugin entry to declare the minimum agentsys installer version required. The installer validates this at install time and warns on incompatibility.

- **`/next-task` GitHub Projects source** — Added `gh-projects` as a supported task source. When selected, the workflow prompts for a project number and owner, then fetches issues from a GitHub Projects v2 board via `gh project item-list`. Includes PR-linked issue exclusion (same as GitHub Issues), input validation for project number and owner, and caching of project preferences. Fixes #247.

### Fixed

- **Installer crash with new marketplace schema** - Fixed `plugin.source.startsWith is not a function` error when installing plugins. The marketplace.json `source` field changed from a string to an object in #266 but the installer was not updated to handle the new format. Added `resolveSourceUrl()` helper that handles both legacy string and new `{ source: "url", url: "..." }` formats. Also fixed `.git` suffix in source URLs causing 404 errors when fetching tarballs from the GitHub API. Added fallback to `main` branch when version tags don't exist yet. Fixed Windows tar extraction failure by converting backslash paths to forward slashes for MSYS2 compatibility.

- **CLAUDE.md merge conflict markers** - Resolved broken merge conflict markers (HEAD/ancestor markers without closer) that were committed to main.

- **Windows jscpd output bug (#270)** - Fixed `runDuplicateDetection` creating a mangled filename on Windows when `--output NUL` was passed to jscpd via `execFileSync` (no shell). Replaced platform-specific null device with a temp directory via `os.tmpdir()` that is cleaned up in a `finally` block. Added 5 regression tests for temp directory lifecycle.

- **task-discoverer**: Exclude issues that already have an open PR from discovery results (GitHub source only). Detection uses branch name suffix, PR body closing keywords (`closes/fixes/resolves #N`), and PR title `(#N)` convention. Fixes #236.

- **`/debate` 240s timeout enforcement** — All tool invocations in the debate workflow now enforce a hard 240-second timeout. Round 1 proposer timeouts abort the debate; round 1 challenger timeouts proceed with an uncontested position; round 2+ timeouts synthesize from completed rounds. Added "all rounds timeout" error path (`[ERROR] Debate failed: all tool invocations timed out.`). Timeout handling is consistent across the Claude Code command, OpenCode adapter, Codex adapter, and the `debate-orchestrator` agent. Restored missing "Round 2+: Challenger Follow-up" template in the OpenCode adapter SKILL.md. Fixes issue #233.

- **`/next-task` review loop exit conditions** — The Phase 9 review loop now continues iterating until all issues are resolved or a stall is detected (MAX_STALLS reduced from 2 to 1: two consecutive identical-hash iterations = stall). The `orchestrate-review` skill now uses `completePhase()` instead of `updateFlow()` to properly advance workflow state. Added `pre-review-gates` and `docs-update` to the `PHASES` array and `RESULT_FIELD_MAP` in `workflow-state.js`, ensuring these phases can be tracked and resumed correctly. Fixes issue #235.

- **`/debate` command inline orchestration** — The `/debate` command now manages the full debate workflow directly (parse → resolve → execute → verdict), following the `/consult` pattern. The `debate-orchestrator` agent is now the programmatic entry point for other agents/workflows that need to spawn a debate via `Task()`. Fixes issue #231.

- **`/debate` External Tool Quick Reference** — Added a "External Tool Quick Reference" section to all copies of the debate skill (`plugins/debate/skills/debate/SKILL.md`, OpenCode and Codex adapters) with safe command patterns, effort-to-model mapping tables, and output parsing expressions. The section includes a canonical-source pointer to `plugins/consult/skills/consult/SKILL.md` so the debate orchestrator doesn't duplicate provider logic. Added pointer notes in `debate-orchestrator` agents. Fixes issue #232.

- **`/consult` and `/debate` model defaults update** — Gemini high/max effort now uses `gemini-3.1-pro-preview`; Gemini low/medium uses `gemini-3-flash-preview`. Codex uses `gpt-5.3-codex` for all effort tiers. Updated across all platforms: Claude Code plugin, OpenCode adapter, and Codex adapter for both consult and debate skills and commands. Fixes issue #234.

- **`/consult` model name updates** — Updated stale model names in the consult skill: Codex models are now `o4-mini` (low/medium) and `o3` (high/max); Gemini models include `gemini-3-flash-preview`, `gemini-3-pro-preview`, and `gemini-3.1-pro-preview`. Synced to OpenCode adapter consult skill. Fixes issue #232.

- **`/next-task` Phase 12 ship invocation** — Phase 12 now invokes `ship:ship` via `await Skill({ name: "ship:ship", args: ... })` instead of `Task({ subagent_type: "ship:ship", ... })`. `ship:ship` is a skill, not an agent; the previous `Task()` call silently failed, leaving the workflow stuck after delivery validation with no PR created. The Codex adapter is updated in parity and regression tests are added. Fixes issue #230.

## [5.1.0] - 2026-02-18

### Added

- **`/debate` plugin** — New plugin for structured multi-round AI dialectic. Pick two tools (e.g. `codex vs gemini`), set 1–5 rounds, and get a proposer/challenger debate with a synthesized verdict. Supports natural language input, effort levels (`--effort=low|high|max`), and context injection (`--context=diff` or `--context=file=PATH`). Available on Claude Code, OpenCode, and Codex CLI.
- **`/consult` multi-instance support** — Run N parallel consultations with the same tool using `--count=N` (or natural language: "ask 3 gemini about this"). Responses are numbered and a brief synthesis highlights agreements and differences.
- **`/consult` natural language parsing** — Free-form queries are now parsed automatically without requiring explicit flags. "with codex about my auth approach", "ask gemini thoroughly about this design", or "3 claude opinions on error handling" all work out of the box.

### Changed

- **Agent model optimization** — `exploration-agent` and `learn-agent` switched from opus to sonnet, reducing cost and latency for exploration and research passes with no quality regression.

### Fixed

- **Debate `--context=file` path validation** — Added path containment checks to prevent directory traversal when passing file paths as context.
- **Debate prompt hardening** — Context passthrough, canonical output redaction, and relaxed disagreement rules applied consistently across all debate rounds.
- **Consult model/flag issues** — Hardened model flag handling and non-interactive invocation across all four supported tools (Claude, Gemini, Codex, OpenCode).

## [5.0.3] - 2026-02-17

### Fixed
- **Consult: Codex command corrected to `codex exec`** - Codex CLI uses `codex exec` for non-interactive mode (not `-q` flag). Non-interactive resume uses `codex exec resume SESSION_ID "prompt" --json`. All four tools (Claude, Gemini, Codex, OpenCode) now have correct native session resume support.

## [5.0.2] - 2026-02-17

### Fixed
- **Consult: Codex and OpenCode marked as continuable** - Both tools support session resume but were incorrectly marked as non-continuable. OpenCode supports `--session SESSION_ID` and `--continue` flags in non-interactive mode.

## [5.0.1] - 2026-02-14

### Fixed
- **OpenCode legacy cleanup** - Installer now removes legacy agent files (`review.md`, `ship.md`, `workflow.md`) left over from pre-rename installs
- **OpenCode install validator** - Now checks only the agents/commands/skills produced by discovery, preventing false positives from legacy files
- **Windows compatibility** - `bump-version.js` uses `npm.cmd` on win32 (fixes `execFileSync` PATHEXT resolution)
- **Windows test fixes** - Scaffold test tolerates `EBUSY` on temp directory cleanup; script-failure-hooks test skips bash-dependent tests on Windows
- **Jest module resolution** - Added `moduleNameMapper` for `@agentsys/lib` to resolve to local `lib/` directory

### Changed
- **Workflow ship references** - Updated all `/ship` references to `ship:ship` (plugin-namespaced command) across next-task command, agents, hooks, and Codex/OpenCode adapters

## [4.1.1] - 2025-02-09

### Fixed
- **Skills $ARGUMENTS parsing** - Added `$ARGUMENTS` parsing to 13 skills that declared `argument-hint` but never consumed the arguments (CC-SK-012)
- **agnix config** - Migrated `.agnix.toml` `disabled_rules` from deprecated slug format to proper rule IDs (XP-003, AS-014)
- **Memory file language** - Strengthened imperative language in AGENTS.md/CLAUDE.md (PE-003, CC-MEM-006)

## [4.2.2] - 2026-02-12

### Fixed
- Added missing frontmatter descriptions to 3 command reference files (`audit-project-agents`, `ship-ci-review-loop`, `ship-deployment`) that caused Codex adapter skills to install with empty descriptions
- Added build-time validation in `gen-adapters.js` to error on empty Codex skill descriptions
- Added install-time guard in `bin/cli.js` to skip skills with missing descriptions

## [4.2.1] - 2026-02-11

### Fixed
- Removed unused `@agentsys/lib` publish job from release workflow
- Cleaned up all references to lib as a standalone npm package (docs, scripts, tests, configs)

## [4.2.0] - 2026-02-11

### Added
- **Static adapter generation system** (`scripts/gen-adapters.js`) - generates OpenCode and Codex adapters from plugin source at build time
- **Shared `lib/adapter-transforms.js` module** - extracted transform logic from `bin/cli.js` and `scripts/dev-install.js`
- **`gen-adapters` and `gen-adapters --check` dev-cli commands** with npm script aliases
- **CI validation step for adapter freshness**
- **Preflight integration for adapter freshness checks**
- **`/consult` command** - Cross-tool AI consultation: query Gemini CLI, Codex CLI, Claude Code, OpenCode, or Copilot CLI from your current session (#198)
  - Choose tool, model, and thinking effort (`--effort=low|medium|high|max`)
  - Context packaging (`--context=diff|file|none`) and session continuity (`--continue`)
  - Three invocation paths: `/consult` command, `Skill('consult')`, `Task({ subagent_type: 'consult:consult-agent' })`
  - Provider detection, structured JSON output, and per-provider effort mapping
- **Plugin scaffolding system** (`scripts/scaffold.js`) - Scaffold new plugins, agents, skills, and commands from templates (#184)
  - `npx agentsys-dev new plugin <name>` - full plugin directory with plugin.json, default command, and shared lib
  - `npx agentsys-dev new agent <name> --plugin=<plugin>` - agent .md with YAML frontmatter template
  - `npx agentsys-dev new skill <name> --plugin=<plugin>` - skill directory with SKILL.md
  - `npx agentsys-dev new command <name> --plugin=<plugin>` - command .md with frontmatter
  - Name validation, collision detection, path traversal protection, YAML injection prevention
  - npm script aliases: `new:plugin`, `new:agent`, `new:skill`, `new:command`
  - 56 scaffold tests + 11 dev-cli integration tests
- **Shared agent template system** - Build-time template expansion (`expand-templates` command) with 3 shared snippets, replacing duplicated sections across 6 enhance agents with TEMPLATE markers and CI freshness validation (#187)
- **Auto-generate documentation** - `gen-docs` command reads plugin metadata, agent frontmatter, and skill frontmatter to auto-generate documentation sections between GEN:START/GEN:END markers
  - `npx agentsys-dev gen-docs` writes generated sections to README.md, CLAUDE.md, AGENTS.md, docs/reference/AGENTS.md, site/content.json
  - `npx agentsys-dev gen-docs --check` validates docs are fresh (for CI, exits 1 if stale)
  - Enhanced `lib/discovery` with YAML array parsing and frontmatter in `discoverAgents()`/`discoverSkills()`
  - Integrated into preflight as `gap:docs-freshness` check for new-agent, new-skill, new-command, and release checklists
  - 34 tests for the generation system, 7 new discovery tests
- **Preflight command** - Unified change-aware checklist enforcement (`npm run preflight`, `preflight --all`, `preflight --release`, `preflight --json`)
  - Detects changed files and runs only relevant checklist validators
  - Includes 7 existing validators + 7 new gap checks (CHANGELOG, labels, codex triggers, lib exports, lib sync, test existence, staged files)
  - Pre-push hook now delegates to preflight for validation
- **Unified Dev CLI** (`agentsys-dev`) - Single discoverable entry point for all dev scripts
  - `agentsys-dev validate` runs all 7 validators sequentially
  - `agentsys-dev validate <sub>` runs individual validators (plugins, cross-platform, consistency, etc.)
  - `agentsys-dev status` shows project health (version, plugin/agent/skill counts, git branch)
  - `agentsys-dev bump <version>`, `sync-lib`, `setup-hooks`, `detect`, `verify`, `test`
  - `agentsys-dev --help` lists all commands with descriptions
  - All existing `npm run` commands still work (now delegate through dev-cli)
  - All direct `node scripts/foo.js` invocations still work (require.main guards)
  - No external CLI framework dependencies - hand-rolled parsing matching bin/cli.js style
- **Script failure enforcement hooks** - Three-layer system preventing agents from silently falling back to manual work when project scripts fail (#189)
  - Claude Code PostToolUse hook for context injection on project script execution
  - OpenCode plugin failure detection enhancement in tool.execute.after
  - New critical rule #13 in CLAUDE.md/AGENTS.md requiring failure reporting before manual fallback

### Changed
- **Adapter transform refactoring** - Refactored `bin/cli.js` and `scripts/dev-install.js` to use shared adapter transforms (eliminates duplication)
- **CHANGELOG Archival** - Moved v1.x-v3.x entries to `changelogs/` directory, reducing CHANGELOG.md from ~92KB to ~10KB (#186)
- **Version Management** - Single version source of truth via `package.json` with automated stamping (#183)
  - Created `scripts/stamp-version.js` to stamp all downstream files from package.json
  - Refactored `scripts/bump-version.js` to delegate to `npm version`
  - Added npm `version` lifecycle hook for automatic stamping
  - Fixed `validate-counts.js` plugin.json path resolution bug
  - Added `package-lock.json` and `site/content.json` to version validation
  - Fixed stale versions in `site/content.json` and `package-lock.json`
  - Single command updates all 15+ version locations: `npx agentsys-dev bump X.Y.Z`
- **Plugin Discovery** - Convention-based filesystem scanning replaces 14+ hardcoded registration lists (#182)
  - New `lib/discovery/` module auto-discovers plugins, commands, agents, and skills
  - `bin/cli.js`, `scripts/dev-install.js`, `scripts/bump-version.js` use discovery calls
  - Adding a new plugin no longer requires updating registration points
  - Fixed stale lists in `dev-install.js` and `bump-version.js` (missing learn, agnix)
  - Added `codex-description` frontmatter for Codex trigger phrases
  - `scripts/sync-lib.sh` reads from generated `plugins.txt` manifest
  - Deprecated `adapters/opencode/install.sh` and `adapters/codex/install.sh`
- **README /agnix Documentation** - Expanded agnix section to be on par with other major commands
  - Added "The problem it solves" section explaining why agent config linting matters
  - Added "What it validates" table with 5 categories (Structure, Security, Consistency, Best Practices, Cross-Platform)
  - Added details about 100 validation rules and their sources
  - Added CI/CD integration example with GitHub Code Scanning SARIF workflow
  - Added installation instructions (Cargo, Homebrew)
  - Added "Why use agnix" value proposition section
  - Prominent link to [agnix CLI project](https://github.com/agent-sh/agnix)
  - Updated Commands table with more descriptive entry
  - Updated skill count to 26 across all references

### Security
- **consult plugin security hardening** (#208) - Shell injection prevention, path traversal protection, and API key redaction
  - Question text passed via temp files instead of shell interpolation (prevents `$()` and backtick expansion)
  - File context validation blocks UNC paths, resolves canonical paths, prevents symlink escapes
  - Output sanitization redacts 12 credential patterns (API keys, tokens, env vars, auth headers)
  - Fixed 3 pre-existing test regressions in consult-command.test.js

## [4.1.0] - 2026-02-05

### Added
- **New /agnix Plugin** - Lint agent configurations before they break your workflow
  - Validates Skills, Hooks, MCP, Memory, Plugins across Claude Code, Cursor, GitHub Copilot, and Codex CLI
  - 100 validation rules from official specs, research papers, real-world testing
  - Auto-fix support with `--fix` flag
  - SARIF output for GitHub Code Scanning integration
  - Target-specific validation (`--target claude-code|cursor|codex`)
  - Requires [agnix CLI](https://github.com/agent-sh/agnix) (`cargo install agnix-cli`)

### Changed
- **Plugin Count** - Now 11 plugins, 40 agents, 26 skills
- **CLAUDE.md Rule #11** - Added rule about using `[]` not `<>` for argument hints

### Fixed
- **Prompt Injection** - Sanitize user arguments in agnix command (validate target, strip newlines from path)
- **Argument Parsing** - Support both `--target=value` and `--target value` forms
- **enhance-hooks/SKILL.md** - Fixed path example escaping

## [4.0.0] - 2026-02-05

### Added
- **New /learn Plugin** - Research any topic online and create comprehensive learning guides
  - Gathers 10-40 online sources based on depth level (brief/medium/deep)
  - Uses progressive query architecture (funnel approach: broad → specific → deep)
  - Implements source quality scoring (authority, recency, depth, examples, uniqueness)
  - Just-in-time retrieval to avoid context rot
  - Creates topic-specific guides in `agent-knowledge/` directory
  - Maintains CLAUDE.md/AGENTS.md as master RAG indexes
  - Self-evaluation step for output quality assessment
  - Integrates with enhance:enhance-docs and enhance:enhance-prompts
  - Opus model for high-quality research synthesis

### Changed
- **Agent Frontmatter Format** - Converted all 29 agents to YAML array format for tools field (Claude Code spec compliance)
- **Argument Hints** - Aligned all argument-hint fields to official `[placeholder]` format
- **Plugin Count** - Now 10 plugins total (added learn)

### Fixed
- **Semver Sorting** - Fixed version comparison so "1.10.0" correctly > "1.9.9"
- **CodeQL Security** - Escape backslashes in glob pattern matching
- **Path Traversal** - Use `path.relative()` instead of `startsWith()` for Windows compatibility

## [4.0.0-rc.1] - 2026-02-05

### Added
- **New /learn Plugin** - Research any topic online and create comprehensive learning guides
  - Gathers 10-40 online sources based on depth level (brief/medium/deep)
  - Uses progressive query architecture (funnel approach: broad → specific → deep)
  - Implements source quality scoring (authority, recency, depth, examples, uniqueness)
  - Just-in-time retrieval to avoid context rot
  - Creates topic-specific guides in `agent-knowledge/` directory
  - Maintains CLAUDE.md/AGENTS.md as master RAG indexes
  - Self-evaluation step for output quality assessment
  - Integrates with enhance:enhance-docs and enhance:enhance-prompts
  - Opus model for high-quality research synthesis

### Changed
- **Agent Frontmatter Format** - Converted all 29 agents to YAML array format for tools field (Claude Code spec compliance)
- **Argument Hints** - Aligned all argument-hint fields to official `[placeholder]` format
- **Plugin Count** - Now 10 plugins total (added learn)

### Fixed
- **Semver Sorting** - Fixed version comparison so "1.10.0" correctly > "1.9.9"
- **CodeQL Security** - Escape backslashes in glob pattern matching
- **Path Traversal** - Use `path.relative()` instead of `startsWith()` for Windows compatibility


---

## Previous Releases

- [v3.x Changelog](https://github.com/agent-sh/agentsys/blob/main/changelogs/CHANGELOG-v3.md) (v3.0.0 - v3.9.0)
- [v2.x Changelog](https://github.com/agent-sh/agentsys/blob/main/changelogs/CHANGELOG-v2.md) (v2.0.0 - v2.10.1)
- [v1.x Changelog](https://github.com/agent-sh/agentsys/blob/main/changelogs/CHANGELOG-v1.md) (v1.0.0 - v1.1.0)
