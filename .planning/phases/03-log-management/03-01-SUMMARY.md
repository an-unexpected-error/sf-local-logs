---
phase: 03-log-management
plan: 01
subsystem: api
tags: [salesforce, tooling-api, streaming, nodejs, typescript, quota]

# Dependency graph
requires:
  - phase: 03-log-management
    provides: phase context (D-01 through D-08 decisions), research patterns for ApexLog querying and streaming

provides:
  - ApexLogRecord and DownloadResult TypeScript interfaces matching Tooling API schema
  - DownloadProgress interface for ETA-based progress tracking
  - DownloadSessionMetadata interface for local session organization
  - queryApexLogsForUser utility with pagination support (handles totalSize > 2000)
  - executeWithRetry utility with exponential backoff (2^n delays) for HTTP 429 (UX-03)
  - calculateETA utility for download progress estimation
  - streamDownloadToFile utility using fs.pipeline() for memory-efficient streaming
  - getStorageBaseDirectory using oclif XDG standard (~/.local/share/sf/plugin-logs)
  - createSessionDirectory with userId/userName sanitization and atomic mkdir
  - constructLogFilePath using path.join() for cross-platform path safety
  - writeLogMetadata for session identification context files
  - getRemainingQuota via REST Limits API (/services/data/v67.0/limits) with validation
  - getRemainingQuotaFallback via ApexLog.LogLength SUM aggregation
  - validateQuotaAvailable with actionable purge guidance (D-05 error message format)
  - formatQuotaMessage for human-readable quota display
  - messages/log.download.md with 8 status and error message keys

affects:
  - 03-log-management (plan 02: trace command download integration)
  - 03-log-management (plan 03: purge command reuses executeWithRetry and quota utilities)
  - 03-log-management (plan 04: NUT verification tests against real org)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "executeWithRetry<T>: generic exponential backoff retry wrapper for all Tooling API calls"
    - "fs.pipeline() for streaming: memory-constant I/O regardless of file size"
    - "path.join() + os.homedir(): cross-platform path construction pattern"
    - "REST Limits API primary + aggregation fallback: resilient quota checking"
    - "sanitizePathComponent: strip ../  traversal characters before use in paths"

key-files:
  created:
    - src/types/download.ts
    - src/utils/download-helper.ts
    - src/utils/storage-manager.ts
    - src/utils/quota-calculator.ts
    - messages/log.download.md
  modified: []

key-decisions:
  - "Used PromiseLike<T> instead of Promise<T> in executeWithRetry to accommodate jsforce Query<> return type"
  - "Capped executeWithRetry maxAttempts at 3 even when caller passes higher value (T-03-05 security)"
  - "LogLength validated in queryApexLogsForUser filter (positive integer <= 1GB) per T-03-01"
  - "sanitizePathComponent() keeps alphanumeric, dots, hyphens, underscores, @ for email usernames"
  - "REST Limits API validation requires Max > Remaining and both positive integers (T-03-04)"

patterns-established:
  - "Pattern: executeWithRetry wraps every Tooling API call — use in purge and download helpers"
  - "Pattern: path.join() + os.homedir() for all local file paths — never string concatenation"
  - "Pattern: primary API with fallback — getRemainingQuota tries REST Limits, falls back to SOQL aggregation"
  - "Pattern: sanitize user-provided values before use as filesystem path components"

requirements-completed:
  - DOWNLOAD-01
  - DOWNLOAD-02
  - DOWNLOAD-03
  - DOWNLOAD-04
  - DOWNLOAD-05
  - UX-03
  - UX-04
  - UX-05

# Metrics
duration: 5min
completed: 2026-05-30
---

# Phase 03, Plan 01: Log Management Foundation Summary

**Download foundation types and utilities: ApexLog query with pagination, fs.pipeline() streaming, XDG-standard local storage, REST Limits API quota checking with fallback, and exponential backoff retry**

## Performance

- **Duration:** 5 min
- **Started:** 2026-05-30T13:23:09Z
- **Completed:** 2026-05-30T13:27:17Z
- **Tasks:** 5
- **Files modified:** 5

## Accomplishments

- Created 4 TypeScript interfaces for the download workflow (ApexLogRecord, DownloadResult, DownloadProgress, DownloadSessionMetadata)
- Created download-helper utility with Tooling API query (pagination-aware), exponential backoff retry, ETA calculation, and fs.pipeline() streaming
- Created storage-manager utility with oclif XDG path convention, session directory creation, and path traversal protection
- Created quota-calculator utility with REST Limits API primary + SOQL aggregation fallback, plus actionable error messaging per D-05
- Replaced stub messages/log.download.md with 8 status and error message definitions covering all download scenarios

## Task Commits

Each task was committed atomically:

1. **Task 1: Create DownloadResult type and ApexLogRecord interface** - `9328507` (feat)
2. **Task 2: Create download-helper utility with ApexLog query and streaming support** - `f024770` (feat)
3. **Task 3: Create storage-manager utility for local file organization** - `b34015d` (feat)
4. **Task 4: Create quota-calculator utility for storage limit enforcement** - `816f8e0` (feat)
5. **Task 5: Create download message definitions file** - `5d5adc0` (feat)

## Files Created/Modified

- `src/types/download.ts` - 4 TypeScript interfaces: ApexLogRecord, DownloadResult, DownloadProgress, DownloadSessionMetadata
- `src/utils/download-helper.ts` - queryApexLogsForUser, executeWithRetry, calculateETA, streamDownloadToFile
- `src/utils/storage-manager.ts` - getStorageBaseDirectory, createSessionDirectory, constructLogFilePath, writeLogMetadata
- `src/utils/quota-calculator.ts` - getRemainingQuota, getRemainingQuotaFallback, validateQuotaAvailable, formatQuotaMessage
- `messages/log.download.md` - 8 message keys: 3 status messages, 5 error messages

## Decisions Made

- **PromiseLike<T> in executeWithRetry**: jsforce's `tooling.query()` returns a `Query<>` type (a thenable, not a native `Promise<T>`). Changed `operation: () => Promise<T>` to `operation: () => PromiseLike<T> | Promise<T>` to accommodate this without wrapping every call in `.promise()`.
- **Capped maxAttempts at 3**: Even when callers pass a higher value, the effective cap is enforced per T-03-05 to prevent DoS via unlimited retries.
- **LogLength validation filter**: After querying ApexLog records, any record with non-integer, negative, or excessively large LogLength (> 1GB) is filtered out per T-03-01 (tampered/corrupted API responses).
- **sanitizePathComponent**: Permits alphanumeric, `.`, `-`, `_`, `@` in path components to cover email-style Salesforce usernames while blocking path traversal characters.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript type error in executeWithRetry parameter**
- **Found during:** Task 2 (TypeScript compilation after creating download-helper.ts)
- **Issue:** `executeWithRetry<T>` declared `operation: () => Promise<T>`, but jsforce `tooling.query()` returns `Query<S, N, T, 'QueryResult'>` which is a `PromiseLike<T>` thenable, not a native `Promise<T>`. TypeScript error TS2739 (missing Promise properties).
- **Fix:** Changed parameter type to `() => PromiseLike<T> | Promise<T>` — accepts both native Promises and PromiseLike thenables including jsforce Query objects.
- **Files modified:** src/utils/download-helper.ts (1 line change)
- **Verification:** `npm run compile` exits 0 with no errors or warnings.
- **Committed in:** `f024770` (part of Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - type bug)
**Impact on plan:** Type fix necessary for correctness. No scope creep; no functional behavior changed.

## Issues Encountered

- TypeScript compilation failed on first attempt due to jsforce `Query<>` return type being `PromiseLike<T>` rather than `Promise<T>`. Resolved by broadening the `executeWithRetry` parameter type. See Deviations section.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

All Phase 03, Plan 01 foundation artifacts are ready for Plan 02 (trace command download integration):
- `queryApexLogsForUser()` callable from trace command after trace flag creation
- `createSessionDirectory()` ready to organize downloaded logs by user/timestamp
- `getRemainingQuota()` and `validateQuotaAvailable()` ready for quota monitoring during download
- `executeWithRetry()` ready for reuse in purge-helper.ts (Plan 03)

Potential concern: REST Limits API field name `DebugLogs` — RESEARCH.md notes this has MEDIUM-HIGH confidence. The quota-calculator validates the response structure before use and falls back to SOQL aggregation if the field is missing or renamed. This is the safest approach given the assumption.

---
*Phase: 03-log-management*
*Completed: 2026-05-30*
