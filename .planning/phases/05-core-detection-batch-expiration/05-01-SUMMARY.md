---
phase: "05-core-detection-batch-expiration"
plan: "01"
subsystem: "types,messages"
tags: ["typescript", "type-contracts", "messages", "overlap-detection"]
dependency_graph:
  requires: []
  provides:
    - "TraceResult.stoppedTraces optional field (src/types/trace.ts)"
    - "statusDetectedOverlappingTraces message key"
    - "statusStoppingOverlappingTraces message key"
    - "statusStoppedTrace message key"
  affects:
    - "src/utils/trace-helper.ts (Plan 02 will populate stoppedTraces)"
    - "src/commands/log/trace.ts (Plan 02 will emit new messages)"
tech_stack:
  added: []
  patterns:
    - "Optional TypeScript property with trailing ? for backward compatibility"
    - "JSDoc on type fields to document cross-phase consumption"
key_files:
  created: []
  modified:
    - "src/types/trace.ts"
    - "messages/log.trace.md"
decisions:
  - "stoppedTraces is optional (?) so existing non-overlap callsites compile without change"
  - "stoppedTraces element shape: {id: string; expirationDate: string} per D-10"
  - "Three message keys added at end of file with no modifications to existing content"
metrics:
  duration: "~5 minutes"
  completed: "2026-06-01"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 2
requirements:
  - TRACE-01
  - TRACE-03
  - TRACE-08
---

# Phase 05 Plan 01: Type Contract & Message Strings Summary

**One-liner:** Optional stoppedTraces array added to TraceResult and three overlap-status message keys appended to log.trace.md, establishing the type and string contracts for all Phase 5 implementation.

---

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend TraceResult type with optional stoppedTraces field | 74d5934 | src/types/trace.ts |
| 2 | Add overlap detection message strings to messages/log.trace.md | e0f5765 | messages/log.trace.md |

---

## What Was Built

### Task 1: TraceResult type extension (src/types/trace.ts)

Added optional `stoppedTraces` property to `TraceResult`:

```typescript
stoppedTraces?: Array<{
  id: string;              // Salesforce TraceFlag record ID that was expired
  expirationDate: string;  // ORIGINAL expiration date (ISO 8601) before it was set to now
}>;
```

The field is optional (trailing `?`) so all existing callsites that build a `TraceResult` without `stoppedTraces` continue to compile without modification. A JSDoc comment documents that Phase 5 populates this field and Phase 6 (display) and Phase 7 (--json output) consume it.

### Task 2: Message strings (messages/log.trace.md)

Three new message keys appended at end of file:

| Key | Body | Format specifiers |
|-----|------|------------------|
| `statusDetectedOverlappingTraces` | `Detected %d overlapping trace(s) for user. Stopping them before creating new trace...` | one `%d` (count) |
| `statusStoppingOverlappingTraces` | `Stopped %d overlapping trace(s). Creating new trace...` | one `%d` (count) |
| `statusStoppedTrace` | `Stopped trace %s (was expiring %s)` | `%s` id + `%s` date |

---

## Verification Results

- `npx tsc --noEmit` exits 0 — no TypeScript errors introduced
- `grep -c "statusDetectedOverlappingTraces\|statusStoppingOverlappingTraces\|statusStoppedTrace" messages/log.trace.md` returns 3
- `grep "stoppedTraces" src/types/trace.ts | grep "?"` confirms optional marker present
- All existing TraceResult fields unchanged (traceFlag and all sub-fields intact)
- All existing message keys unchanged (no lines removed or modified)

---

## Deviations from Plan

None - plan executed exactly as written. Both tasks were purely additive changes; no existing code was modified.

---

## Known Stubs

None. This plan adds type contracts and message strings only — no data sources or rendering logic involved.

---

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries. Changes are TypeScript type definitions and static message strings only. Threat T-05-01 mitigated: `stoppedTraces` is optional so existing non-overlap callsites compile without modification, verified by `npx tsc --noEmit`.

---

## Self-Check: PASSED

- [x] src/types/trace.ts modified and committed (74d5934)
- [x] messages/log.trace.md modified and committed (e0f5765)
- [x] Both commits exist in git log
- [x] TypeScript compiles cleanly
- [x] Three message keys confirmed present (grep returns 3)
- [x] stoppedTraces optional marker confirmed
