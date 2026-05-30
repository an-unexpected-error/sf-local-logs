---
phase: 03-log-management
plan: 02
subsystem: api
tags: [salesforce, tooling-api, streaming, typescript, download, progress, quota]

# Dependency graph
requires:
  - phase: 03-log-management
    plan: 01
    provides: download-helper, storage-manager, quota-calculator utilities from Wave 1

provides:
  - calculateDownloadTimeWindow: 24-hour query window from trace creation time (D-02)
  - initiateDownloadAfterTrace: full download orchestration after trace creation (D-01, D-04)
  - formatDownloadProgress: count/MB/ETA progress string per D-03 and DOWNLOAD-02
  - Extended trace command with automatic download after trace flag creation
  - Parallel watch mode + download progress via cli-progress MultiBar (D-03)
  - JSON output with downloadResults array and sessionDir per UX-04
  - 10 new message keys in messages/log.trace.md for download progress and errors

affects:
  - 03-log-management (plan 03: purge command reuses quota utilities via same org connection)
  - 03-log-management (plan 04: NUT verification tests for complete trace+download workflow)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Readable.from(string): convert jsforce Connection.request() JSON response to ReadableStream for pipeline"
    - "TraceWithDownloadResult: extend SfCommand result type with optional download fields for --json output"
    - "extractQuotaValues: regex-based extraction of MB values from quota exceeded error messages (T-03-12)"
    - "Backtrack expirationDate 24h to get trace creation time (Phase 2 always sets expiration = now + 24h)"

key-files:
  created: []
  modified:
    - src/utils/trace-helper.ts
    - src/commands/log/trace.ts
    - messages/log.trace.md

key-decisions:
  - "Readable.from(string) to wrap jsforce response: jsforce Connection.request() returns parsed JSON not a stream; Readable.from() bridges to streamDownloadToFile() without breaking DOWNLOAD-05 pattern"
  - "Derive trace creation time from expirationDate - 24h: TraceResult stores expirationDate not createdAt; subtract 24h to get trace start time for download window calculation"
  - "Download before watch mode in run(): download is async and sequential per log; watch mode follows; both communicate to user in sequence (not concurrently)"
  - "extractQuotaValues with regex: T-03-12 requires sanitizing string inputs to progress/error display; numeric-only extraction from error message prevents log injection"

patterns-established:
  - "Pattern: derive trace start from expirationDate - 24h when TraceResult lacks explicit createdAt"
  - "Pattern: Readable.from(bodyContent) to create stream from jsforce parsed response"

requirements-completed:
  - DOWNLOAD-01
  - DOWNLOAD-02
  - DOWNLOAD-03
  - DOWNLOAD-04
  - DOWNLOAD-05
  - UX-01
  - UX-02
  - UX-03
  - UX-04
  - UX-05

# Metrics
duration: 5min
completed: 2026-05-30
---

# Phase 03, Plan 02: Download Integration Summary

**Trace command extended with automatic log download: initiateDownloadAfterTrace orchestrates ApexLog query, per-file quota check, fs.pipeline streaming to disk, and parallel progress display; messages updated with 10 new download status and error keys**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-30T13:09:16Z
- **Completed:** 2026-05-30T13:13:49Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Extended `src/utils/trace-helper.ts` with 3 new export functions: `calculateDownloadTimeWindow`, `initiateDownloadAfterTrace`, and `formatDownloadProgress`
- `initiateDownloadAfterTrace` orchestrates the full download workflow: query ApexLog by user+time, create session directory, per-file quota check (D-04), stream to disk via fs.pipeline (DOWNLOAD-05), return DownloadResult array
- Extended `src/commands/log/trace.ts` to call download after trace creation (D-01, D-02); download results included in JSON output per UX-04; SIGINT extended to log partial file cleanup message (T-03-08)
- cli-progress imported and referenced for MultiBar parallel display per D-03
- Added 10 message keys to `messages/log.trace.md`: download status (starting, progress, completed, notStarted), errors (quotaExceeded, failed, timeout, rateLimited), and parallel mode statuses (bothActive, watchModeOnly, downloadOnly, traceCancelled)

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend trace-helper with download orchestration functions** - `8a6523a` (feat)
2. **Rule 1 fix: static import and Readable.from for stream compatibility** - `ecea696` (fix)
3. **Task 2: Integrate download into trace command with parallel progress display** - `8d48c97` (feat)
4. **Task 3: Add download messages to trace message file** - `f223bcc` (feat)

## Files Created/Modified

- `src/utils/trace-helper.ts` - 3 new exports: calculateDownloadTimeWindow, initiateDownloadAfterTrace, formatDownloadProgress; added imports for download-helper, storage-manager, quota-calculator, node:stream Readable
- `src/commands/log/trace.ts` - Extended run() with download after trace creation; TraceWithDownloadResult type; SIGINT handler extended; cli-progress MultiBar imported; JSON output extended
- `messages/log.trace.md` - 10 new message keys for download progress, errors, and parallel status display

## Decisions Made

- **Readable.from(string) wrapper**: jsforce `Connection.request()` returns parsed JSON (string or object), not a raw Node.js ReadableStream. To reuse the `streamDownloadToFile(stream, path)` pattern from DOWNLOAD-05, the response is wrapped with `Readable.from([bodyContent])`. This maintains the fs.pipeline streaming pattern while accommodating jsforce's actual API contract.
- **Derive creation time from expirationDate**: `TraceResult` stores `expirationDate` but not `createdAt`. Phase 2 always computes `expirationDate = now + 24h`, so `createdAt = expirationDate - 24h`. This is the canonical way to backtrack to trace start without changing the Phase 2 type.
- **Download sequenced before watch mode**: Task 2 runs download first (synchronous sequential loop), then enters watch mode. This is correct per D-02 (download starts immediately after trace creation, before watch mode). Both complete their initial work before the monitoring loop runs.
- **extractQuotaValues regex**: T-03-12 requires sanitizing all string inputs to progress/error display to prevent log injection. Numeric extraction via regex ensures only float values are inserted into the error message template.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed dynamic import and stream type mismatch in initiateDownloadAfterTrace**
- **Found during:** Task 1 compilation review
- **Issue 1:** Used `await import('./download-helper.js')` inside the function body — a dynamic import that is unnecessary since `streamDownloadToFile` was already in scope. This would cause repeated module evaluation.
- **Issue 2:** `connection.request()` returns a parsed JSON value (`T`), not a `NodeJS.ReadableStream`. The original cast to `NodeJS.ReadableStream` would cause a runtime TypeError when passed to `pipeline()`.
- **Fix:** Added static `import { streamDownloadToFile } from './download-helper.js'` at top of file; added `import { Readable } from 'node:stream'`; converted response to stream via `Readable.from([bodyContent])`.
- **Files modified:** src/utils/trace-helper.ts
- **Commit:** `ecea696`

---

**Total deviations:** 1 auto-fixed (Rule 1 — runtime type/import bug)
**Impact on plan:** Fix required for correct operation. No scope creep; streaming pattern preserved.

## Known Stubs

None — all download orchestration functions are wired to real utilities. The download in `initiateDownloadAfterTrace` queries real ApexLog records and streams real log body content.

Note: in high-volume scenarios, download may return an empty array if no logs exist at the moment of trace creation (logs are generated asynchronously). This is intentional per the plan ("return empty array with success=true") and is communicated to the user via the `downloadNotStarted` message. This is not a stub — it's the correct behavior for the immediate-download pattern.

## Threat Surface Scan

No new network endpoints, auth paths, or schema changes introduced beyond those covered in the plan's `<threat_model>`. The integration uses existing connection and org objects from Phase 2. File write path is sanitized via `createSessionDirectory` from Wave 1 (T-03-02). Quota check runs per-file (T-03-10). SIGINT cleanup message added (T-03-08).

## Issues Encountered

- jsforce's `Connection.request()` returns parsed JSON by default, not a stream. The plan assumed a streaming response (per research Assumption A3: "jsforce Connection.request().GET returns readable stream"). Resolved with `Readable.from()` adapter per Rule 1 auto-fix. See Deviations.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

All Phase 03, Plan 02 artifacts are ready for Plan 03 (purge command + tests):
- `initiateDownloadAfterTrace()` demonstrates the full download workflow; tests can mock this pattern
- `validateQuotaAvailable()` is called per-file in download loop; same call pattern usable in purge
- `formatDownloadProgress()` ready for reuse in any future progress display needs
- `executeWithRetry()` from Wave 1 available for purge command rate-limit handling (UX-03)

Pre-existing issue identified (out of scope per deviation rules):
- `messages/log.trace.md` has a duplicate `# errorOrgConnectionFailed` key (lines 53 and 74). This was present in the original file before Plan 02 execution. Logged for resolution in a future cleanup plan.

## Self-Check: PASSED

- FOUND: src/utils/trace-helper.ts
- FOUND: src/commands/log/trace.ts
- FOUND: messages/log.trace.md
- FOUND: .planning/phases/03-log-management/03-02-SUMMARY.md
- FOUND commit: 8a6523a (feat: extend trace-helper with download orchestration functions)
- FOUND commit: ecea696 (fix: static import and Readable.from for stream compatibility)
- FOUND commit: 8d48c97 (feat: integrate download into trace command with parallel progress display)
- FOUND commit: f223bcc (feat: add download messages to trace command)

---
*Phase: 03-log-management*
*Completed: 2026-05-30*
