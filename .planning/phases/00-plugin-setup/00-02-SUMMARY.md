---
phase: 00-plugin-setup
plan: "02"
subsystem: cli
tags: [oclif, sf-plugins-core, salesforce-core, typescript, commands]

# Dependency graph
requires:
  - phase: 00-01
    provides: Plugin scaffold with package.json, tsconfig, node_modules installed
provides:
  - 5 placeholder TypeScript command files in src/commands/log/ (search, trace, download, purge, filter)
  - 5 messages Markdown files in messages/ (one per command) with summary, description, examples
  - Complete sf log command namespace registered with oclif
affects: [00-05, 01-user-search, 02-trace, 03-download, 03-purge, 04-filter]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SfCommand<T> base class with typed return type for all commands"
    - "Messages.importMessagesDirectory(__dirname) + Messages.loadMessages('sf-local-logs', 'log.<name>') pattern for help text"
    - "Flags.requiredOrg() for org-dependent commands; no org flag for local-only commands (filter)"
    - "Flags.orgApiVersion() for api version override on org commands"
    - "Placeholder run() returning empty typed result with this.log() for implementation notes"

key-files:
  created:
    - src/commands/log/search.ts
    - src/commands/log/trace.ts
    - src/commands/log/download.ts
    - src/commands/log/purge.ts
    - src/commands/log/filter.ts
    - messages/log.search.md
    - messages/log.trace.md
    - messages/log.download.md
    - messages/log.purge.md
    - messages/log.filter.md
  modified: []

key-decisions:
  - "Used Flags.requiredOrg() (not Flags.requiredOrgFlag()) — the Flags object exposes requiredOrg as its callable key per sf-plugins-core v12 API"
  - "filter command has no --target-org flag because it operates on locally downloaded files, not org data"
  - "Messages loaded with package name 'sf-local-logs' matching package.json name field"

patterns-established:
  - "Pattern: SfCommand class per command in src/commands/log/<name>.ts with corresponding messages/log.<name>.md"
  - "Pattern: export type <Name>Result as named type before command class"
  - "Pattern: Org-dependent commands use Flags.requiredOrg() + Flags.orgApiVersion(); local commands use only custom flags"

requirements-completed: [INSTALL-01, INSTALL-02, UX-04, UX-05]

# Metrics
duration: 3min
completed: 2026-05-29
---

# Phase 0 Plan 02: Command Stubs Summary

**5 SfCommand placeholder stubs under sf log namespace with oclif messages, all compiling clean with Flags.requiredOrg() and typed return types**

## Performance

- **Duration:** 3 min
- **Started:** 2026-05-29T12:21:41Z
- **Completed:** 2026-05-29T12:24:41Z
- **Tasks:** 2
- **Files modified:** 10 (5 command files, 5 messages files)

## Accomplishments
- Created messages/ directory with all 5 oclif help text files containing summary, description, and examples sections
- Created src/commands/log/ directory with 5 placeholder TypeScript command files, all extending SfCommand with typed result types
- All 5 commands compile with TypeScript (npm run compile exits 0), establishing the complete sf log namespace for Phase 1-4 implementation

## Task Commits

Each task was committed atomically:

1. **Task 1: Create messages/ directory with help text for all 5 commands** - `c76bace` (feat)
2. **Task 2: Create 5 placeholder command files in src/commands/log/** - `86d088b` (feat)

## Files Created/Modified
- `messages/log.search.md` - Summary, description, examples for search command
- `messages/log.trace.md` - Summary, description, examples for trace command
- `messages/log.download.md` - Summary, description, examples for download command
- `messages/log.purge.md` - Summary, description, examples for purge command
- `messages/log.filter.md` - Summary, description, examples for filter command
- `src/commands/log/search.ts` - Placeholder search command with --target-org, --name flags; returns SearchResult
- `src/commands/log/trace.ts` - Placeholder trace command with --target-org, --user-id flags; returns TraceResult
- `src/commands/log/download.ts` - Placeholder download command with --target-org flag; returns DownloadResult
- `src/commands/log/purge.ts` - Placeholder purge command with --target-org flag; returns PurgeResult
- `src/commands/log/filter.ts` - Placeholder filter command (no org) with --keyword, --export flags; returns FilterResult

## Decisions Made
- Used `Flags.requiredOrg()` (not `Flags.requiredOrgFlag()`) — sf-plugins-core v12 Flags object exposes the callable as `requiredOrg`
- filter command intentionally has no --target-org: it operates on already-downloaded local log files, not org data
- Package name for Messages.loadMessages is `sf-local-logs` matching package.json `name` field

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Flags.requiredOrgFlag() → Flags.requiredOrg()**
- **Found during:** Task 2 (Create command files)
- **Issue:** Plan used `Flags.requiredOrgFlag()` but sf-plugins-core v12 Flags object exposes the method as `Flags.requiredOrg()`. TypeScript compilation failed with TS2551 error on 4 files.
- **Fix:** The linter auto-corrected all 4 org-dependent command files (search, trace, download, purge) to use `Flags.requiredOrg()`. Also `Flags.orgApiVersion()` confirmed correct.
- **Files modified:** src/commands/log/search.ts, trace.ts, download.ts, purge.ts
- **Verification:** npm run compile exits 0 after fix
- **Committed in:** 86d088b (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Auto-fix necessary for compilation. The research's Pattern 1 example used the internal `requiredOrgFlag` name rather than the `Flags.requiredOrgFlag()` surface. Actual Flags API confirmed from node_modules type definitions.

## Issues Encountered
None beyond the Flags API name mismatch documented as a deviation above.

## Known Stubs
All 5 command files are intentional stubs per plan design:
- `src/commands/log/search.ts` line 28: `this.log('User search coming in Phase 1')` → returns `{ results: [] }`
- `src/commands/log/trace.ts` line 27: `this.log('Debug tracing coming in Phase 2')` → returns `{ traceFlag: null }`
- `src/commands/log/download.ts` line 24: `this.log('Log download coming in Phase 3')` → returns `{ logs: [] }`
- `src/commands/log/purge.ts` line 25: `this.log('Log purge coming in Phase 3')` → returns `{ deleted: 0, freedBytes: 0 }`
- `src/commands/log/filter.ts` line 28: `this.log('Log filtering coming in Phase 4')` → returns `{ matches: [] }`

These stubs are the explicit goal of this plan (D-02: scaffold all 5 commands as placeholders). Plans 00-03 through 00-05 and Phases 1-4 will implement the actual logic.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 5 command stubs compile and are discoverable via oclif directory-based routing
- Phase 1 (user search) can implement search.ts without changing plugin structure
- Phase 2 (debug tracing) can implement trace.ts without changing plugin structure
- Phases 3-4 can implement download.ts, purge.ts, filter.ts without changing plugin structure
- Plan 00-05 integration verification can run `sf plugin link . && sf log --help` to confirm all 5 subcommands appear

---
*Phase: 00-plugin-setup*
*Completed: 2026-05-29*
