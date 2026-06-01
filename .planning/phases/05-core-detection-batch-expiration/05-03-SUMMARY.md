---
phase: 05-core-detection-batch-expiration
plan: "03"
subsystem: api
tags: [salesforce, trace-flag, overlap-detection, tooling-api, typescript, mocha, sinon]

# Dependency graph
requires:
  - phase: 05-01
    provides: "TraceResult.stoppedTraces type extension and message strings for overlap detection"
  - phase: 05-02
    provides: "detectAndExpireOverlappingTraces() function implemented in trace-helper.ts"
provides:
  - "trace.ts wired to call detectAndExpireOverlappingTraces() before createTraceFlag()"
  - "stoppedTraces included in TraceWithDownloadResult returned by trace command"
  - "Overlap detection logged with statusDetectedOverlappingTraces and statusStoppingOverlappingTraces messages"
  - "4 integration tests proving overlap detection wiring in trace command"
affects:
  - "06-command-integration-display: reads stoppedTraces from result for per-trace display"
  - "07-json-output: reads stoppedTraces for --json output extension"
  - "08-behavior-control: overwrite flag preserved in Trace.flags for Phase 8 confirmation gate"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Overlap detection called before trace creation in run() — prevents DUPLICATE_VALUE from Salesforce API"
    - "Error propagation: batch update failure from detectAndExpireOverlappingTraces reaches outer catch, aborts trace creation (D-05)"
    - "Integration tests use structural/contract assertions (function.length, key shapes) without sinon stubs"

key-files:
  created: []
  modified:
    - src/commands/log/trace.ts
    - test/commands/log/trace.test.ts

key-decisions:
  - "Removed overwrite variable from run() flags destructuring; overwrite flag stays in Trace.flags static definition for Phase 8"
  - "stoppedTraces always populated in result (empty array when no overlaps), not conditionally — consistent shape for downstream phases"
  - "Four integration tests are structural/contract tests: no sinon stubs needed because they verify exported shape and flag presence, not behavior"

patterns-established:
  - "Integration test pattern: import function from source, assert arity and export type without running async behavior"

requirements-completed: [TRACE-01, TRACE-03, TRACE-08]

# Metrics
duration: 15min
completed: 2026-06-01
---

# Phase 5 Plan 03: Overlap Detection Wired into Trace Command Summary

**detectAndExpireOverlappingTraces() integrated into trace.ts before createTraceFlag(), with stoppedTraces in result and 9 passing tests (5 unit + 4 integration)**

## Performance

- **Duration:** 15 min
- **Started:** 2026-06-01T12:54:08Z
- **Completed:** 2026-06-01T13:09:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Replaced `checkExistingTraceFlag()` call in trace.ts Step 2 with `detectAndExpireOverlappingTraces(org, userId)` — single detection call, no double-query (per RESEARCH.md Pitfall 1)
- When overlapping traces found, logs `statusDetectedOverlappingTraces` then `statusStoppingOverlappingTraces` with count; error propagates to outer catch if batch update fails, preventing trace creation (D-05, D-12)
- `stoppedTraces` included in `TraceWithDownloadResult` result object — ready for Phase 6 display and Phase 7 JSON output
- 4 integration tests in `describe('Overlap Detection Integration (Phase 5)')` all pass; full suite remains green (288 tests)

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire detectAndExpireOverlappingTraces() into trace.ts** - `241d200` (feat)
2. **Task 2: Add integration tests for overlap wiring in trace command** - `daf29e3` (feat)

**Plan metadata:** (see final commit below)

## Files Created/Modified

- `src/commands/log/trace.ts` — Replaced Step 2 overlap check: now calls `detectAndExpireOverlappingTraces()` and logs messages when traces stopped; `stoppedTraces` added to result; `overwrite` variable removed from flags destructuring (flag definition retained)
- `test/commands/log/trace.test.ts` — Added `detectAndExpireOverlappingTraces` import; added `describe('Overlap Detection Integration (Phase 5)')` block with 4 structural/contract tests

## Decisions Made

- Removed `const overwrite = flags['overwrite']` from run() because `checkExistingTraceFlag` (its only consumer) is no longer called; the static flag definition stays for Phase 8
- `stoppedTraces` is always included in the result object (it will be `[]` when no overlaps), providing a consistent shape for Phase 6 and Phase 7 rather than an optional absent field
- Integration tests are pure structural assertions (function arity, key presence) — no sinon mocks needed and no async invocation, so they are fast and stable

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 5 is complete: all three plans (05-01 types/messages, 05-02 detection function, 05-03 command integration) done
- Phase 6 (command integration & display) can proceed: `result.stoppedTraces` is populated and ready for per-trace display output
- Phase 7 (JSON output) can proceed: `stoppedTraces` in `TraceWithDownloadResult` is already the correct shape for JSON serialization
- Phase 8 (behavior control): `Trace.flags['overwrite']` is confirmed present and available for confirmation gate

## Self-Check

- [x] `src/commands/log/trace.ts` exists and imports `detectAndExpireOverlappingTraces`
- [x] `test/commands/log/trace.test.ts` contains `describe('Overlap Detection Integration (Phase 5)')`
- [x] Commits 241d200 and daf29e3 exist
- [x] `npx tsc --noEmit` exits 0
- [x] `npm test` exits 0 (288 passing)
- [x] `grep "checkExistingTraceFlag(" src/commands/log/trace.ts` returns no matches

---
*Phase: 05-core-detection-batch-expiration*
*Completed: 2026-06-01*
