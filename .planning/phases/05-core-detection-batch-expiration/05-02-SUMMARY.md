---
phase: "05-core-detection-batch-expiration"
plan: "02"
subsystem: "utils,tests"
tags: ["typescript", "tooling-api", "trace-detection", "batch-expiration", "tdd", "sinon"]
dependency_graph:
  requires:
    - "TraceResult.stoppedTraces optional field (src/types/trace.ts) — from Plan 01"
    - "escapeSoql() utility (src/utils/soql-builder.ts)"
  provides:
    - "detectAndExpireOverlappingTraces() exported from src/utils/trace-helper.ts"
    - "Unit test suite in test/utils/trace-helper.test.ts (5 behavior contract tests)"
  affects:
    - "src/commands/log/trace.ts (Plan 03 will import detectAndExpireOverlappingTraces)"
tech_stack:
  added: []
  patterns:
    - "TDD RED/GREEN cycle: failing tests before implementation"
    - "sinon sandbox with fakeConnection stubs (tooling.query + tooling.update)"
    - "jsforce batch update: tooling.update('TraceFlag', arrayOfRecords) — single API call"
    - "Graceful query failure: catch error, return [] without re-throwing (D-13)"
    - "Descriptive re-throw on batch update failure: 'Failed to expire overlapping traces: ...' (D-12)"
key_files:
  created:
    - "test/utils/trace-helper.test.ts"
  modified:
    - "src/utils/trace-helper.ts"
decisions:
  - "Return original ExpirationDate (not 'now') so callers display what was stopped, not the expiry time we set"
  - "Query uses ExpirationDate > {now} without quotes around ISO timestamp (consistent with checkExistingTraceFlag pattern line 156)"
  - "catch block on query failure returns [] with no re-throw; updates failure re-throws with context message"
metrics:
  duration: "~8 minutes"
  completed: "2026-06-01"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 2
requirements:
  - TRACE-01
  - TRACE-03
  - TRACE-08
---

# Phase 05 Plan 02: Core Detection & Batch Expiration Summary

**One-liner:** detectAndExpireOverlappingTraces() implemented via TDD, querying active TraceFlags with escapeSoql injection safety and batch-expiring all found records in a single jsforce tooling.update() array call.

---

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add detectAndExpireOverlappingTraces() unit tests (RED phase) | 699e12b | test/utils/trace-helper.test.ts |
| 2 | Implement detectAndExpireOverlappingTraces() in trace-helper.ts (GREEN phase) | 43e1919 | src/utils/trace-helper.ts |

---

## What Was Built

### Task 1: Unit Tests — RED Phase (test/utils/trace-helper.test.ts)

Created a new test file with a `detectAndExpireOverlappingTraces` describe block containing 5 behavior contract tests using sinon sandbox stubs:

| Test | Behavior | Contract |
|------|----------|----------|
| no overlap | tooling.query returns [] → function returns [] | TRACE-01 |
| single overlap | query returns 1 record, update resolves → returns [{id, expirationDate}] | TRACE-03 |
| multiple overlaps (3) | query returns 3 records → update called ONCE with array[3] → returns 3 results | TRACE-08 |
| query fails | tooling.query rejects → function returns [] without throwing | D-13 |
| batch update fails | query resolves, update rejects → throws "Failed to expire overlapping traces" | D-12 |

Tests were confirmed RED (TypeScript compile error: "no exported member 'detectAndExpireOverlappingTraces'") before implementation.

### Task 2: Implementation — GREEN Phase (src/utils/trace-helper.ts)

Added `detectAndExpireOverlappingTraces(org: Org, userId: string)` immediately after `checkExistingTraceFlag()` (line ~187), following existing patterns:

```typescript
export async function detectAndExpireOverlappingTraces(
  org: Org,
  userId: string
): Promise<Array<{ id: string; expirationDate: string }>>
```

Implementation steps:
1. `org.getConnection()` + `const now = new Date().toISOString()`
2. Query: `SELECT Id, ExpirationDate FROM TraceFlag WHERE TracedEntityId = '${escapeSoql(userId)}' AND ExpirationDate > ${now}` (no quotes around now, per existing pattern)
3. Return `[]` if no records found
4. Build updates array: `records.map(r => ({ Id: r.Id, ExpirationDate: now }))`
5. `await connection.tooling.update('TraceFlag', updates)` — single batch call
6. Return `records.map(r => ({ id: r.Id, expirationDate: r.ExpirationDate }))` — original dates
7. Query catch block: return `[]` (no re-throw, per D-13)
8. Update catch block: `throw new Error('Failed to expire overlapping traces: ' + msg)` (per D-12)

---

## Verification Results

- `npx mocha test/utils/trace-helper.test.ts --grep "detectAndExpireOverlappingTraces"` → 5 passing (8ms)
- `npx tsc --noEmit` → exits 0 (no TypeScript errors)
- `grep "export.*detectAndExpireOverlappingTraces" src/utils/trace-helper.ts` → match confirmed
- `npm test` → 284 passing (8s), 0 failing

---

## Deviations from Plan

None — plan executed exactly as written. TDD RED/GREEN cycle followed in order. No architectural changes required.

---

## TDD Gate Compliance

- RED gate: commit `699e12b` — `test(05-02): add failing unit tests for detectAndExpireOverlappingTraces (RED)`
- GREEN gate: commit `43e1919` — `feat(05-02): implement detectAndExpireOverlappingTraces() in trace-helper.ts (GREEN)`
- REFACTOR gate: not needed — implementation was clean on first pass

---

## Known Stubs

None. The function queries real Tooling API via sinon-stubbed connection in tests; no hardcoded values flow to UI rendering.

---

## Threat Surface Scan

No new network endpoints, auth paths, or schema changes introduced. The function calls the existing Tooling API query and update endpoints that were already used by `checkExistingTraceFlag()`. SOQL injection threat T-05-02 is mitigated via `escapeSoql(userId)` in the query construction. No new threats beyond the plan's threat model.

---

## Self-Check: PASSED

- [x] test/utils/trace-helper.test.ts created and committed (699e12b)
- [x] src/utils/trace-helper.ts modified and committed (43e1919)
- [x] Both commits exist in git log
- [x] TypeScript compiles cleanly (npx tsc --noEmit exits 0)
- [x] All 5 tests pass GREEN (5 passing in --grep run)
- [x] Full test suite passes (284 passing, 0 failing)
- [x] Export confirmed (grep returns match)
- [x] tooling.update called with array argument (multiple overlaps test confirms calledOnce with array[3])
- [x] No unexpected file deletions in either commit
