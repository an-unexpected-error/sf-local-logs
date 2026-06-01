# Phase 5: Core Detection & Batch Expiration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-01
**Phase:** 5-Core Detection & Batch Expiration
**Areas discussed:** Overlap Detection Algorithm, Batch Expiration Strategy, User Feedback Display, Detection Scope, Timing, Result Format, Range Overlap Algorithm, Error Recovery

---

## Overlap Detection Algorithm

| Option | Description | Selected |
|--------|-------------|----------|
| All non-expired traces | Simplest approach: expire any TraceFlag where ExpirationDate > now. Assumes all active traces conflict with new trace creation. | |
| Datetime range overlap | More precise: only expire traces whose time windows overlap with the new trace's 24-hour window. Requires checking if (newStart < existingEnd) AND (newEnd > existingStart). | ✓ |
| Explicit user choice | Display all candidates and let user pick which to expire via --select-traces flag. | |

**User's choice:** Datetime range overlap

**Notes:** User emphasized that "in theory, there should only ever be one active trace flag for a single entity" due to Salesforce's DUPLICATE_VALUE error constraint. This changes the practical implication of the algorithm — while datetime range overlap is the precise approach, we'd expect to find at most one trace in practice.

---

## Batch Expiration Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Single batch API call | Use jsforce tooling.update() or similar to update multiple TraceFlag records in one Salesforce API call. Most efficient, atomic behavior. | |
| Parallel individual updates | Issue multiple update calls in parallel (Promise.all). Faster wall-clock time but less atomic; partial failures possible. | |
| Sequential updates with progress | Update one trace at a time with progress display. Clearest feedback, slowest performance, easiest to understand which failed. | |

**User's choice:** "In theory, there should only ever be one active trace flag for a single entity"

**Notes:** User redirected the question to the fundamental constraint: Salesforce's design expects one active trace per user. This changes the batch strategy — in typical scenarios, there's nothing to batch (just one trace). If multiple exist, sequential updates are acceptable because the count is expected to be 1-2 at most.

---

## User Feedback Display

| Option | Description | Selected |
|--------|-------------|----------|
| Silent auto-expire | Expire overlaps automatically, show summary: "Stopped 3 overlapping traces. Creating new trace..." No details about each trace. | |
| Display + auto-expire | Show details of overlapping traces found (ID, user, expiration), then auto-expire them. More visibility, slightly more output. | ✓ |
| Display + confirmation | Show overlapping trace details and ask for confirmation before expiring. Safest, but adds a prompt that --overwrite flag should skip. | |

**User's choice:** Display + auto-expire

**Notes:** User wants visibility into what's being stopped but prefers the flow to be automatic in Phase 5. Confirmation logic is deferred to Phase 8 (Behavior Control & Confirmations), which will add the user confirmation and --overwrite flag to skip it.

---

## Detection Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Only non-expired (ExpirationDate > now) | Matches "one active trace" rule. Ignore any traces with ExpirationDate ≤ now (they're dead, Salesforce will clean them up). | ✓ |
| All traces for user (including expired) | Scope to all TraceFlags ever created for the user. More paranoid, catches stale records. Likely unnecessary if Salesforce enforces single-active constraint. | |
| Non-expired + created recently | Non-expired traces OR traces created within last 24 hours (in case a trace is in the grace period before expiry). | |

**User's choice:** Only non-expired (ExpirationDate > now)

**Notes:** Simplest and most correct approach given Salesforce's design. Expired traces are already inactive and will be cleaned up by Salesforce.

---

## Timing of Detection

| Option | Description | Selected |
|--------|-------------|----------|
| Before creation (check → expire → create new) | Safest: verify no conflicts exist, expire any found, then create new trace. Avoids DUPLICATE_VALUE error. | ✓ |
| After error (attempt → catch DUPLICATE_VALUE → handle) | Reactive: try to create new trace, if it fails with DUPLICATE_VALUE, then query and expire conflicts. Simpler code, requires error recovery. | |
| During transaction (atomic operation) | Ideally, Salesforce would let us express "expire this AND create this" atomically. Probably not available in Tooling API. | |

**User's choice:** Before creation (check → expire → create new)

**Notes:** Preferred for safety and clarity. Avoids hitting Salesforce errors and allows clean error reporting if any step fails.

---

## Result Format: Stopped Traces

| Option | Description | Selected |
|--------|-------------|----------|
| New trace only | Return standard TraceResult (new trace ID, expiration, etc.). Mention expired count in log message only. | |
| New trace + stopped list | Extend TraceResult to include stoppedTraces: [{id, expirationDate}]. Useful for --json consumers to see full lifecycle. | ✓ |
| Full lifecycle report | Include timestamp of when each was stopped, duration it was active, etc. Verbose, but provides complete audit trail. | |

**User's choice:** New trace + stopped list

**Notes:** Provides visibility for downstream phases (6, 7) and programmatic consumers of --json output. Allows Phase 7 (JSON Output Extension) to include the full lifecycle, and Phase 6 (Command Integration & Display) to show what was stopped.

---

## Range Overlap Algorithm: New Trace Window

| Option | Description | Selected |
|--------|-------------|----------|
| StartTime = now, EndTime = now + 24h | Standard: assume new trace starts at creation time, lasts 24 hours. Compare against existing ExpirationDate > now. | |
| Calculate from expirationDate backwards | Since Salesforce auto-sets StartTime, we infer it from ExpirationDate (if ExpirationDate is known, StartTime ≈ ExpirationDate - 24h). | |
| Only check ExpirationDate (binary active/inactive) | Simplest: don't calculate ranges. Just query ExpirationDate > now. If any exist, they overlap (because max one per user). | ✓ |

**User's choice:** Only check ExpirationDate (binary active/inactive)

**Notes:** Aligned with the "one active trace per user" constraint. No need for complex datetime range calculations — just check if any non-expired traces exist.

---

## Error Recovery

| Option | Description | Selected |
|--------|-------------|----------|
| Fail cleanly, log what succeeded | Report: "Stopped X out of Y traces. New trace creation failed. You can retry." Manual recovery if needed. | ✓ |
| Try to re-create after partial failure | If expire partially succeeds, try the new trace creation anyway. Accept that some old traces might remain. | |
| Guard with pre-checks | Before any updates, query all traces and validate permissions. Fail fast before touching anything if conditions aren't met. | |

**User's choice:** Fail cleanly, log what succeeded

**Notes:** Transparent error reporting. If expiration succeeds but trace creation fails, the user has a clear picture of what happened and can retry.

---

## Claude's Discretion

- **Query Performance:** No need for pagination or complex indexing on the overlapping trace query.
- **Datetime Format:** Use ISO 8601 consistently (matches Phase 2 pattern).
- **Message Strings:** Craft clear status messages showing what's being stopped and when the new trace is created.

---

## Deferred Ideas

- **Batch API optimization** (v1.1+) — If jsforce supports true batch operations, optimize from N sequential calls to 1 batch call.
- **Trace history and audit trail** (v2) — Store details of expired traces for compliance/debugging.
- **Selective expiration** (v2) — Let user choose which overlapping traces to keep. Phase 8 adds user confirmation.
- **Pre-expiration backup** (v2) — Download logs from the trace about to expire before stopping it.

---

*Discussion concluded: 2026-06-01*
*All gray areas resolved and decisions documented in CONTEXT.md*
