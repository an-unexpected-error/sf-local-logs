# Phase 5: Core Detection & Batch Expiration - Context

**Gathered:** 2026-06-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Detect when one or more trace flags already exist (are non-expired) for the target user, automatically expire all overlapping traces in a batch operation, and then create a new trace flag. This enables seamless trace flag creation without manual cleanup or user prompts blocking the workflow.

Phase 5 is the foundation for the v1.1 overlapping trace flag handling feature — it handles the core detection and batch expiration logic that subsequent phases (6-9) build on for display, JSON output, user confirmations, and storage validation.

</domain>

<decisions>
## Implementation Decisions

### Detection Strategy

- **D-01:** Query for **non-expired traces only** — scope to TraceFlags where `ExpirationDate > now`. Ignore any traces that have already expired (Salesforce will clean them up).
- **D-02:** **One active trace per user is the design constraint.** While the algorithm supports multiple traces, Salesforce's DUPLICATE_VALUE error suggests only one should exist at a time. If somehow multiple exist, expire all of them.
- **D-03:** Use **binary active/inactive check** for overlap detection — don't calculate datetime ranges. Simply query `ExpirationDate > now` for the target user. If any exist, they overlap (because max one per user).

### Timing & Atomicity

- **D-04:** **Check before create** — detect and expire overlapping traces BEFORE attempting to create the new trace. This prevents hitting Salesforce's DUPLICATE_VALUE error.
- **D-05:** Sequence: Query active traces → Expire all found → Create new trace. If any step fails, fail cleanly and log what succeeded.
- **D-06:** Overlap detection is NOT a transactional operation with trace creation. If expiration succeeds but new trace creation fails, the user has a manual recovery path (retry the trace command).

### Batch Expiration

- **D-07:** Use **Salesforce batch update API** if available via jsforce; otherwise, issue individual update calls sequentially. Per user guidance ("in theory one per user"), expect typically just one trace to expire.
- **D-08:** When expiring a trace, set `ExpirationDate = now` (end it immediately). This matches the existing `checkExistingTraceFlag()` pattern from Phase 2.

### User Feedback & Result

- **D-09:** When overlapping traces are detected and expired, **display details + auto-expire** (no confirmation prompt in Phase 5; Phase 8 adds confirmation logic). Show each trace being stopped (ID, original expiration date).
- **D-10:** **Extend TraceResult to include stoppedTraces array:** `{ traceFlag: {...}, stoppedTraces: [{ id, expirationDate }] }`. This allows Phase 7 (JSON output) and Phase 6 (display) to access the full lifecycle.
- **D-11:** Log a summary message: `"Stopped {N} overlapping trace(s). Creating new trace..."` before proceeding.

### Error Handling

- **D-12:** If batch expiration fails partway through, **fail cleanly and log what succeeded.** Example: `"Stopped 1 of 3 overlapping traces. Trace creation cancelled. Retry or manually clean up remaining traces."` Do NOT attempt partial new-trace creation.
- **D-13:** If the initial query for overlapping traces fails, log a warning and continue with trace creation attempt (let Salesforce handle any conflicts).

### Claude's Discretion

- **Query Performance:** The overlapping trace query (non-expired per user) is lightweight — no need for pagination or complex indexing.
- **Datetime Format:** Use ISO 8601 for all timestamps (consistent with Phase 2).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Phase Goals
- `.planning/ROADMAP.md` — Phase 5 goal, success criteria (detect, identify, expire in batch, handle multiple)
- `.planning/REQUIREMENTS.md` — TRACE-01 (detect existing), TRACE-03 (expire), TRACE-08 (handle multiple overlapping)

### Phase Context & Integration
- `.planning/phases/02-debug-sessions/02-CONTEXT.md` — Trace flag creation patterns, checkExistingTraceFlag() function, overwrite behavior (D-04 builds on Phase 2 logic)
- `.planning/phases/03-log-management/03-CONTEXT.md` — Download integration patterns (Phase 5 needs to maintain download flow after trace creation)
- `.planning/phases/04-log-filtering/04-CONTEXT.md` — Filtering patterns (not directly relevant to Phase 5, but documents Phase 4 decisions)

### Codebase — Files to Read and Extend
- `src/commands/log/trace.ts` — Main trace command; extend to call new `detectAndExpireOverlappingTraces()` function before trace creation
- `src/utils/trace-helper.ts` — **Primary utility file to extend.** Current `checkExistingTraceFlag()` (lines 145-186) detects one trace; Phase 5 replaces this with a function that detects and expires multiple traces in batch
- `src/types/trace.ts` — Extend `TraceResult` type to include optional `stoppedTraces: { id, expirationDate }[]` array
- `src/utils/quota-calculator.ts` — Storage quota checking (Phase 5 uses this as-is; Phase 9 adds pre-trace quota validation)
- `src/utils/download-helper.ts` — Download orchestration (unchanged in Phase 5, but Phase 5 output feeds into this in trace.ts)

### Technology & Patterns
- `CLAUDE.md` — Tech stack (oclif, @salesforce/core, jsforce), Tooling API patterns, TraceFlag CRUD operations
- **Salesforce Tooling API — TraceFlag object** — Query, update (set ExpirationDate to now), success/error responses
- **JSforce Documentation** — `tooling.query()` for batch detection, `tooling.update()` for batch expiration (or `.upsert()` if batch operations needed)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`checkExistingTraceFlag()` in `trace-helper.ts` (lines 145-186)** — Detects one trace and optionally updates it. Phase 5 will **refactor this or create a new function** `detectAndExpireOverlappingTraces()` that:
  1. Queries for all non-expired traces for the user
  2. Expires all found (batch update or sequential)
  3. Returns list of stopped trace IDs and details for display
- **`createTraceFlag()` in `trace-helper.ts` (lines 84-130)** — Creates a single trace. Phase 5 uses this unchanged.
- **`buildSearchQuery()` and `escapeSoql()` in `soql-builder.ts`** — SOQL utilities for safe query construction
- **Type definitions in `src/types/trace.ts`** — `TraceResult` type; Phase 5 extends this to include `stoppedTraces` array

### Established Patterns
- **Tooling API query pattern:** `connection.tooling.query("SELECT ... WHERE ...")` returns `{ records: [] }`
- **Tooling API update pattern:** `connection.tooling.update('TraceFlag', { Id: '...', ExpirationDate: now })`
- **Error handling pattern:** Check `result.success` and `result.errors[0]?.message` after API calls
- **Timestamp handling:** ISO 8601 format via `date.toISOString()`

### Integration Points
- **In `trace.ts`:** Currently calls `checkExistingTraceFlag()` at line 125. Phase 5 replaces this call with `detectAndExpireOverlappingTraces()` and processes the returned `stoppedTraces` array for display.
- **Download flow:** Phase 5's new output (stoppedTraces) flows into `initiateDownloadAfterTrace()` unchanged — download logic remains in Phase 3/4.
- **JSON output:** Phase 5 extends the result type; Phase 7 will use `stoppedTraces` in `--json` output.

</code_context>

<specifics>
## Specific Ideas

- **Message strings:** Phase 5 needs new messages for:
  - `"Detected {N} overlapping trace(s). Stopping them..."`
  - `"Stopped trace {id} (was expiring {date})"`
  - Status flow: "Stopped X traces → Creating new trace → Download starting..."
- **Query safety:** Use `escapeSoql(userId)` when querying (already pattern in codebase)
- **Performance assumption:** Overlapping trace query is small (typically 1 per user) — no pagination needed

</specifics>

<deferred>
## Deferred Ideas

- **Batch API optimization** (v1.1+) — If jsforce supports batch create/update, Phase 5 could optimize from N sequential calls to 1 batch call. Currently planning for sequential; optimize later if performance testing shows need.
- **Trace history / audit trail** (v2) — Store deleted/expired trace details for audit. Out of scope for v1.1.
- **Selective expiration** (v2) — Let user choose which overlapping traces to keep/expire. Phase 5 expires all; user confirmation in Phase 8.
- **Pre-expiration backup** (v2) — Download logs from the trace about to be expired before stopping it. Out of scope for v1.1.

</deferred>

---

*Phase: 5-Core Detection & Batch Expiration*
*Context gathered: 2026-06-01*
