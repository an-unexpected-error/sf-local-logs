---
phase: 04-log-filtering
plan: "04"
subsystem: commands
tags: [filter-command, stub, d-01, d-08, nut-compat, hollowing-out]

# Dependency graph
requires:
  - phase: 04-01
    provides: filter.test.ts updated with 4 assertions (including 'does not have export flag' pending stub)
provides:
  - filter.ts hollowed out with no keyword/export flags; run() redirects to trace --keyword
  - messages/log.filter.md updated without export example, description points to trace workflow
affects:
  - filter.nut.ts: NUT test still passes (summary key preserved verbatim)
  - filter.test.ts: all 4 assertions now pass (including 'does not have export flag' activated)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hollow-out pattern: preserve class/file for NUT compat while removing functionality"
    - "Redirect guidance pattern: run() emits actionable message pointing to correct command"

key-files:
  created: []
  modified:
    - src/commands/log/filter.ts
    - messages/log.filter.md

key-decisions:
  - "Filter.flags set to empty object {} — no keyword (moved to trace.ts per D-01), no export (removed per D-08)"
  - "Return type changed to Record<string, never> — FilterResult type with matches array no longer needed"
  - "Flags import removed from imports — only SfCommand needed from sf-plugins-core"
  - "# summary key in log.filter.md preserved verbatim for NUT test compatibility"

# Metrics
duration: 4min
completed: 2026-05-31
---

# Phase 4 Plan 04: Filter Command Hollow-Out Summary

**Hollow-out of sf log filter command stub: removed keyword/export flags (D-01, D-08), updated run() to redirect users to `sf log trace --keyword`, preserved class/summary for NUT test compatibility**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-05-31T09:43:05Z
- **Completed:** 2026-05-31T09:47:30Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Rewrote `src/commands/log/filter.ts` to remove all flags (keyword + export), update run() body to emit guidance message pointing to `sf log trace --keyword`, and change return type to `Record<string, never>`
- Updated `messages/log.filter.md` to preserve the `# summary` key verbatim (NUT dependency), update `# description` to reflect Phase 4 decision, and replace `# examples` with a single correct `sf log trace --keyword` example
- All 4 filter.test.ts assertions now pass including the previously-pending 'does not have export flag' test
- 263 passing tests (262 pre-existing + 1 newly activated), 0 failing, 16 pending (remaining Wave 0 stubs for other plans)

## Task Commits

Each task was committed atomically:

1. **Task 1: Hollow out filter.ts** - `304f06a` (refactor)
2. **Task 2: Update messages/log.filter.md** - `bff22c8` (docs)

## Files Created/Modified

- `src/commands/log/filter.ts` - Hollowed out: no flags, run() redirects to `sf log trace --keyword`, return type `Record<string, never>`, class and summary still exported for NUT compat
- `messages/log.filter.md` - Summary preserved verbatim; description and examples updated to reflect trace --keyword workflow

## Decisions Made

- **Empty flags object:** `Filter.flags = {}` satisfies both D-01 (no keyword flag) and D-08 (no export flag). The NUT test only checks help output text from the summary, not flag listings.
- **Record<string, never> return type:** FilterResult (with matches array) belongs to the keyword filtering use case now in trace.ts/filter-helper.ts. Filter's hollow stub needs no structured return.
- **Flags import removed:** With no flags defined, the `Flags` import from `@salesforce/sf-plugins-core` was unused - removed to keep imports clean.
- **Summary key preserved verbatim:** "Filter downloaded debug logs by keyword." - the NUT test `expect(result.shellOutput.stdout).to.include('Filter downloaded debug logs')` requires this exact text.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - this plan's goal (hollowing out filter.ts and updating messages) is fully achieved. The previously-pending 'does not have export flag' test is now active and passing.

## Self-Check: PASSED

- [x] `src/commands/log/filter.ts` exists and exports default class Filter
- [x] `Filter.flags` has no 'export' property
- [x] `Filter.flags` has no 'keyword' property
- [x] `Filter.run()` body contains 'sf log trace --keyword'
- [x] `Filter.summary` is a non-empty string
- [x] `messages/log.filter.md` # summary key preserved verbatim
- [x] `messages/log.filter.md` # description does NOT mention --export or "Implementation coming in Phase 4"
- [x] `messages/log.filter.md` # description contains 'sf log trace --keyword'
- [x] `messages/log.filter.md` # examples does NOT show --export flag
- [x] Commits exist: 304f06a, bff22c8
- [x] 263 tests passing, npm test exits 0

---
*Phase: 04-log-filtering*
*Completed: 2026-05-31*
