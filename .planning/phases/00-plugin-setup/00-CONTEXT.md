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

### Command Structure

**Decision:** Base command namespace is `sf log`

**Why:** Aligns with Salesforce CLI naming conventions (e.g., `sf deploy`, `sf retrieve`). Clear and concise for end users.

**Scope:** Applies to all subcommands:
- `sf log search` (Phase 1: User Search)
- `sf log trace` (Phase 2: Debug Sessions)
- `sf log download` (Phase 3: Log Management)
- `sf log purge` (Phase 3: Log Management)
- `sf log filter` (Phase 4: Log Filtering)

### Initial Scaffolding

**Decision:** Scaffold all 5 command stubs (search, trace, download, purge, filter) as empty placeholders in Phase 0

**Why:** Provides the complete command structure upfront. Clarifies the full scope for planning and testing. Makes dependency flows explicit for each phase. Each phase then implements its command without restructuring.

**Implementation:** Each command file will have:
- Proper oclif command class inheriting `SfCommand`
- Flags from REQUIREMENTS.md and ROADMAP.md (flags spec'd out per phase)
- Docstring explaining what will be implemented
- Placeholder implementation that logs "Coming in Phase X"

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
   - `src/commands/log/search.ts`, `trace.ts`, `download.ts`, `purge.ts`, `filter.ts` — Placeholder command files
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

## Deferred Ideas

None identified during discussion. All scope clarifications stayed within Phase 0 boundaries.

---

## Notes for Downstream Agents

1. **Planner:** Phase 0 plan should include scaffolding the plugin, configuring build/test infrastructure, and verifying the framework loads. All decisions above are locked — do not re-ask.

2. **Researcher:** Verify that plugin-template-sf supports Node 18+ verification at install time. If not, plan must handle version checking manually.

3. **Execution:** After Phase 0 completes, the plugin should be runnable and installable locally. Test with `sf plugin link .` to verify command registration.

---

*Context captured by discuss-phase on 2026-05-29*
