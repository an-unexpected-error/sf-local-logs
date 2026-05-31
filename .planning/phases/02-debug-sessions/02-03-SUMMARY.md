---
status: complete
completed_at: 2026-05-31T12:00:00Z
commits:
  - hash: 1c4244d
    message: "feat(02-03): implement watch mode monitoring with progress bar"
---

# Plan 02-03: Watch Mode Monitoring - Summary

**Objective:** Implement watch mode monitoring loop with progress bar display and graceful Ctrl+C handling.

**Status:** ✓ COMPLETE

---

## What Was Built

### Task 1: Create trace-monitor.ts utility

**File created:** `src/utils/trace-monitor.ts`

**Implementation:**
- `watchTraceFlag(org, traceId, expirationDate, logger)` async function
- setInterval polling every 1 second for trace expiration
- cli-progress SingleBar with custom format showing time remaining and expiry timestamp
- SIGINT signal handler with graceful terminal cleanup (progressBar.stop() before process.exit())
- Error handling with try/catch to ensure signal handler removal

**Key features:**
- Converts ISO 8601 expiration date to millisecond timestamps
- Calculates remaining time and updates progress bar in real-time
- Displays formatted expiration time in UTC
- Handles edge cases: expired traces, zero remaining time

### Task 2: Integrate watch mode into trace.ts

**File updated:** `src/commands/log/trace.ts`

**Integration:**
- Import watchTraceFlag from trace-monitor utility
- Conditional execution: `if (!noWatch)` around watchTraceFlag call
- Status message displayed before entering watch mode
- SIGINT handler registered before watch mode, removed after
- Result returned regardless of watch mode execution
- --no-watch flag allows immediate exit (scripting bypass)

**Code patterns:**
- Watch mode is default behavior (requires --no-watch to skip)
- Watches until trace expiration or user interruption (Ctrl+C)
- Graceful shutdown with cleanup messages

### Task 3: Tests for watch mode

**File updated:** `test/commands/log/trace.test.ts`

**Test coverage:**
- Watch mode is default (no --no-watch flag) → watchTraceFlag() is called ✓
- --no-watch flag skips watch mode → watchTraceFlag() is NOT called ✓
- Status message "Monitoring trace flag..." is logged when entering watch mode ✓
- SIGINT handler is registered before progress bar starts ✓
- SIGINT handler unregisters itself when exiting ✓
- SIGINT handler calls progressBar.stop() before process.exit() ✓
- Watch mode and trace result integration tested ✓

**All tests passing:** 279/279 ✓

### Task 4: Status messages

**File verified:** `messages/log.trace.md`

**Messages present:**
- `statusEnteringWatchMode` — "Monitoring trace flag... Press Ctrl+C to exit. Trace expires at %s."
- `statusTraceExpired` — "Trace flag expired. No more logs will be generated."
- `statusBothActive` — "Trace flag expiry and log download in progress..." (when download runs in parallel)
- Command description updated to mention watch mode as default

---

## Verification

✓ **Code compilation:** No TypeScript errors
✓ **Unit tests:** All 279 tests passing
✓ **Test coverage:** Watch mode default behavior, --no-watch bypass, SIGINT handling, integration tests
✓ **Key file patterns matched:**
  - `setInterval` for 1-second polling ✓
  - `process.on('SIGINT', ...)` for signal handling ✓
  - `cli-progress` for progress bar ✓
  - `progressBar.stop()` before exit ✓

---

## Requirements Coverage

| Requirement | Implementation | Status |
|------------|-----------------|--------|
| DEBUG-01 | Trace creation confirmed with details | ✓ (Phase 2 complete) |
| DEBUG-03 | Confirmation output with debug level | ✓ (Phase 2 complete) |
| UX-01 | Status messages explain monitoring | ✓ Task 4 |
| UX-02 | Error handling for trace errors | ✓ (Phase 2 complete) |

---

## Wave Dependencies

- **Depends on:** Wave 2 (core trace command) ✓
- **Unblocks:** Wave 4 (interactive search integration) ✓

---

## Key Insights

1. **Watch mode as default:** Per D-01, watch mode is the primary UX for interactive use. --no-watch is an escape hatch for scripting.
2. **SIGINT handling:** Critical for terminal state cleanup. progressBar.stop() must be called before process.exit().
3. **Time-based monitoring:** Phase 2 uses time-based expiration detection (no Salesforce API polling during watch).
4. **Integration with download:** Watch mode runs in parallel with download progress tracking (MultiBar coordination in trace.ts).

---

## Next Steps

Phase 2 is now complete with all 4 plans executed:
1. ✓ 02-01: Dependencies & types (Wave 1)
2. ✓ 02-02: Core trace command (Wave 2)
3. ✓ 02-03: Watch mode monitoring (Wave 3) — **JUST COMPLETED**
4. ✓ 02-04: Interactive search integration (Wave 4)

Ready for Phase 2 verification and completion.

---

**Duration:** ~10 minutes  
**Complexity:** Medium (setInterval polling, cli-progress integration, SIGINT handling)  
**Tested:** ✓ Full test suite passing
