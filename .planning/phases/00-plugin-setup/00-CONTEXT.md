# Phase 0 Context: Plugin Setup

**Date:** 2026-05-29  
**Phase:** 0 (Plugin Setup)  
**Status:** Context captured, ready for research & planning  

---

## Domain

Establish a Salesforce CLI plugin framework with proper scaffolding, build infrastructure, linting, testing, and local development setup. This phase creates the foundation for all subsequent phases and ensures the plugin is installable, verifiable, and ready for feature implementation.

---

## Requirements (Locked)

**INSTALL-01:** Plugin is installable via `sf plugin install <repo>`  
**INSTALL-02:** Plugin works with Salesforce CLI (sf) v2.x+  
**INSTALL-03:** Plugin requires Node.js 18.0.0 or later  

See `/planning/REQUIREMENTS.md` for full requirement text.

---

## Implementation Decisions

### Command Structure (Single Unified Entry Point)

**Decision:** Single command `sf log trace` that guides users through all 5 debug log actions in one flow

**Why:** Simpler user experience — one command to learn instead of 5. Interactive guidance makes the workflow obvious for new users. Flag-based shortcuts support scripting and automation. All actions are part of one logical flow (find user → enable tracing → download → analyze → cleanup).

**Scope:** All 5 actions integrated into one command:
1. **Search** — Find user by name (interactive prompt or `--user` flag)
2. **Trace** — Enable debug session for that user (automatic or `--trace` flag)
3. **Download** — Fetch created logs (automatic or `--download` flag)
4. **Filter** — Search log content by keyword (optional, `--filter` flag)
5. **Purge** — Delete old logs if approaching storage limit (optional, `--purge` flag)

**Interaction Model:**
- **Interactive mode (default):** `sf log trace` → prompts through steps with guidance
- **Flag-based mode:** `sf log trace --user "John" --download --filter "error"` → skips prompts, runs directly

### Single Command Implementation in Phase 0

**Decision:** Phase 0 scaffolds only one command file: `src/commands/log/trace.ts`

**Why:** Simplified scaffolding. Eliminates the need to refactor 5 commands later. The trace command is the logical entry point for the entire workflow.

**Implementation:** Create a single command file with:
- Proper oclif command class inheriting `SfCommand`
- All flags for all 5 actions: `--user`, `--user-id`, `--download`, `--filter`, `--purge`, `--target-org`
- Docstring explaining the interactive workflow
- Placeholder implementation that shows the full workflow structure
- Help text describing the workflow: "Search for a user by name, enable debug tracing, download logs, filter content, and manage storage."

### Local Development Environment

**Decision:** Include test/scratch org setup and linking in Phase 0

**Why:** Enables hands-on testing immediately after scaffolding. Allows verification that the plugin loads and registers commands before Phase 1. Catches framework integration issues early.

**Implementation:** Add to devDependencies and package.json scripts:
- `npm run setup-devorg` — Creates and links a scratch org
- `npm run link-local` — Links plugin for local testing  
- `npm run test-commands` — Runs placeholder commands to verify they load

### CI/CD Pipeline

**Decision:** Configure GitHub Actions in Phase 0 with linting, build, and test workflows

**Why:** Early CI setup catches format/build issues on every PR. Establishes code quality baseline. Builds confidence in the plugin scaffold before implementation begins.

**Workflows:**
- `lint.yml` — Run eslint on TypeScript files
- `build.yml` — Compile TypeScript and verify artifact
- `test.yml` — Run unit tests (jest/mocha) on demand

---

## Technology Stack (Locked)

| Technology | Version | Purpose |
|-----------|---------|---------|
| Node.js | 18.0.0+ | Runtime; verified at install time |
| TypeScript | 5.5.4+ | Language; type safety |
| oclif | ^4.23.7 | CLI framework |
| @salesforce/sf-plugins-core | ^12 | Plugin base classes and utilities |
| @salesforce/core | ^8.31.0 | Org connection and auth |
| @salesforce/cli-plugins-testkit | ^5.3.58+ | Integration testing |
| @salesforce/dev-scripts | ^11.0.4+ | Linting/formatting |
| eslint-plugin-sf-plugin | ^1.20.33+ | Plugin-specific linting |

See `CLAUDE.md` for full stack details and migration notes.

---

## Canonical References

Downstream agents (researcher, planner) must consult these docs:

- **CLAUDE.md** — Complete technology stack rationale, key API patterns, and migration notes
- **ROADMAP.md** — Phase boundaries and success criteria for Phase 0
- **REQUIREMENTS.md** — INSTALL-01, INSTALL-02, INSTALL-03 requirement text
- **[plugin-template-sf](https://github.com/salesforcecli/plugin-template-sf)** — Salesforce-provided scaffold (external reference)
- **[Salesforce CLI Plugin Guide](https://developer.salesforce.com/docs/platform/salesforce-cli-plugin/guide/)** — Official plugin development docs

---

## Code Context

**Current state:** No plugin code exists yet. Phase 0 will create:

1. **Project structure** (from plugin-template-sf template):
   - `src/commands/log/` — Command directory
   - `src/commands/log/trace.ts` — Single unified trace command with all flags for search/trace/download/filter/purge
   - `messages/log.trace.md` — Help text for the trace command
   - `test/` — Test suite structure
   - `package.json` — Plugin metadata and dependencies
   - `tsconfig.json` — TypeScript configuration
   - `.eslintrc.json` — Linting config (SF standards)

2. **Dev setup scripts** (new):
   - `scripts/setup-devorg.sh` — Scratch org creation and linking
   - Entry in `package.json` scripts for setup and linking

3. **GitHub Actions workflows** (new):
   - `.github/workflows/lint.yml`
   - `.github/workflows/build.yml`
   - `.github/workflows/test.yml`

No reusable code patterns yet (first phase).

---

## Future Phase Implications

With a single unified `sf log trace` command:

- **Phase 1 (User Search):** Implements the search step of the trace command (interactive prompts + `--user` flag)
- **Phase 2 (Debug Sessions):** Implements the trace step (automatic tracing of selected user)
- **Phase 3 (Log Management):** Implements download and purge steps (log retrieval and storage cleanup)
- **Phase 4 (Log Filtering):** Implements the filter step (keyword search within downloaded logs)

Each phase deepens the trace command's implementation without changing the command structure. The workflow remains: `sf log trace` (interactive) or `sf log trace [flags]` (scripted).

## Deferred Ideas

None identified during discussion. All scope clarifications stayed within Phase 0 boundaries.

---

## Notes for Downstream Agents

1. **Planner:** Phase 0 now scaffolds a SINGLE command (`sf log trace`) with all flags for all 5 actions (search, trace, download, filter, purge). Create ONE command file, not 5. Build test scaffolds for this single command. Configure CI/CD as before. Do not re-ask about the single-command design — it is locked.

2. **Researcher:** Verify that:
   - oclif v4 supports interactive prompts with flag overrides (e.g., flag presence skips a prompt)
   - @salesforce/sf-plugins-core v12 supports conditional flags
   - plugin-template-sf supports Node 18+ verification at install time. If not, plan must handle version checking manually.

3. **Execution:** After Phase 0 completes:
   - `sf log trace --help` should show all flags (--user, --user-id, --download, --filter, --purge, --target-org)
   - `sf log trace` should run and show the interactive workflow structure
   - Test with `sf plugin link .` to verify command registration

---

*Context captured by discuss-phase on 2026-05-29*
