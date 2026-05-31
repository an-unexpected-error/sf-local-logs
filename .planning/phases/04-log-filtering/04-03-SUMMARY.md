---
phase: 04-log-filtering
plan: "03"
subsystem: commands
tags: [trace-command, keyword-flag, filter-integration, FilterResult, tdd]

# Dependency graph
requires:
  - phase: 04-log-filtering/04-02
    provides: filterDownloadedLogs utility and FilterResult type; 4 message keys in log.trace.md
  - phase: 04-log-filtering/04-01
    provides: keyword flag test stubs in trace.test.ts awaiting activation
provides:
  - keyword flag (--keyword / -k) wired into sf log trace command
  - filterDownloadedLogs call after download step in trace.ts run()
  - FilterResult attached to TraceWithDownloadResult for --json output (UX-04)
  - Guards for empty downloads and undefined sessionDir preventing nil crashes
affects:
  - trace.test.ts: all keyword flag tests (previously skipped) now active and passing
  - filter.ts: not modified; hollow-out completed in 04-04

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Spread-merge pattern: FilterResult = { keyword, ...filterResultRaw } to add keyword field not returned by filterDownloadedLogs()"
    - "Compound guard: if (!sessionDir || downloadResults.length === 0) for dual empty-state check (Pitfall 4 + Pitfall 5)"
    - "try/catch around filter call: warns on error but does not fail the command"

key-files:
  created: []
  modified:
    - src/commands/log/trace.ts

key-decisions:
  - "FilterResult spread-merge: filterDownloadedLogs returns { matched, rejected, sessionDir }; keyword is added inline as { keyword, ...filterResultRaw } to satisfy FilterResult interface without modifying filter-helper.ts"
  - "Step 9 inserted after download try/catch and before table display: preserves existing watch mode flow unchanged"
  - "keyword extracted from flags immediately after this.parse(Trace) — consistent with other flag extractions"

# Metrics
duration: 5min
completed: 2026-05-31
---

# Phase 4 Plan 03: Trace.ts Keyword Flag Integration Summary

**--keyword flag wired into sf log trace with filterDownloadedLogs call, FilterResult type extension, dual empty-state guards, and error-tolerant filter step; 279 tests passing**

## Performance

- **Duration:** ~5 min
- **Completed:** 2026-05-31
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Added `'keyword': Flags.string({ char: 'k', summary: messages.getMessage('flagKeyword'), required: false })` to `Trace.flags`
- Added `filterResult?: FilterResult` to `TraceWithDownloadResult` type
- Added named imports: `FilterResult` from `../../types/download.js` and `filterDownloadedLogs` from `../../utils/filter-helper.js`
- Inserted Step 9 after download try/catch: calls `filterDownloadedLogs(sessionDir, keyword)` when keyword + sessionDir + non-empty downloadResults are all present
- Dual guard: logs `filterSkippedNoDownloads` message if `!sessionDir || downloadResults.length === 0`
- Error in `filterDownloadedLogs` warns with `filterError` message but does not fail the command
- Attaches `filterResult` (with keyword field merged in) to `result` for `--json` output
- Test suite: 279 passing (up from 273 in Plan 02), 0 failing, 0 pending on keyword flag tests — all 5 previously-skipped keyword tests now active and passing

## Task Commits

1. **Task 1: Wire keyword flag and filterDownloadedLogs into trace.ts** - `ab06a8b` (feat)

## Files Created/Modified

- `src/commands/log/trace.ts` - Added keyword flag, FilterResult type field, imports, and Step 9 filter integration

## Decisions Made

- **FilterResult spread-merge:** `filterDownloadedLogs` returns `{ matched, rejected, sessionDir }` while `FilterResult` interface also requires `keyword`. Rather than modifying `filter-helper.ts` (which would break its clean utility interface), the keyword is added inline: `const filterResult: FilterResult = { keyword, ...filterResultRaw }`. This keeps filter-helper.ts focused on filesystem operations without command-layer concerns.
- **Step 9 placement:** Inserted after the download try/catch block and before the table display. This ensures filtering always runs after all downloads complete, and the summary message appears before the table (consistent with D-09 ordering).

## Deviations from Plan

None - plan executed exactly as written. The keyword extraction (`const keyword = flags['keyword']`) was placed immediately after `this.parse(Trace)` for consistency with the other flag extractions, which is the natural pattern in the existing code.

## Known Stubs

None - all functionality is fully wired. The keyword flag, filterDownloadedLogs call, and FilterResult attachment are all production-ready.

## Threat Flags

No new security surface introduced beyond what was in the plan's threat model. The keyword string is only used in `filterDownloadedLogs` which applies `String.prototype.includes()` only. No path construction uses the keyword value. All file operations work on the internally-managed `sessionDir`.

## Self-Check

- [x] `src/commands/log/trace.ts` contains `'keyword': Flags.string({` with `char: 'k'` and `required: false`: FOUND (line 86)
- [x] `src/commands/log/trace.ts` contains `filterResult?: FilterResult` in TraceWithDownloadResult: FOUND (line 42)
- [x] `src/commands/log/trace.ts` contains `import.*filterDownloadedLogs.*filter-helper`: FOUND (line 14)
- [x] `src/commands/log/trace.ts` contains `import.*FilterResult.*download`: FOUND (line 13)
- [x] `src/commands/log/trace.ts` contains `filterDownloadedLogs(sessionDir, keyword)` call: FOUND (line 238)
- [x] Guard for empty/undefined state present: FOUND (`if (!sessionDir || downloadResults.length === 0)`, line 235)
- [x] Commit ab06a8b exists: FOUND
- [x] 279 tests passing, 0 failing, npm test exits 0: VERIFIED

## Self-Check: PASSED

---
*Phase: 04-log-filtering*
*Completed: 2026-05-31*
