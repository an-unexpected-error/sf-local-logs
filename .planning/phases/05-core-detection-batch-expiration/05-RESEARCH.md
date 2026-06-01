# Phase 5: Core Detection & Batch Expiration - Research

**Researched:** 2026-06-01  
**Domain:** Salesforce Tooling API trace flag detection and batch expiration  
**Confidence:** HIGH

## Summary

Phase 5 implements the foundation for v1.1 overlapping trace flag handling. The phase adds logic to detect existing active (non-expired) trace flags for a target user and automatically expires them in a single batch operation before creating a new trace flag. The detection query is lightweight (non-expired traces only per user), and batch expiration uses jsforce's standard `tooling.update()` method with array input for multi-record updates.

**Key findings:** No new dependencies needed. JSforce batch update API is available via `@salesforce/core` (v8.31.0+). Detection algorithm is binary (active/inactive check) based on `ExpirationDate > now`. Implementation extends existing `trace-helper.ts` patterns without refactoring core API calling patterns.

**Primary recommendation:** Create `detectAndExpireOverlappingTraces()` function in `src/utils/trace-helper.ts` that queries for non-expired TraceFlags, expires all found via single `tooling.update()` call, returns array of stopped trace details for downstream display/JSON output.

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Query for **non-expired traces only** — scope to TraceFlags where `ExpirationDate > now`
- **One active trace per user** is the design constraint
- Use **binary active/inactive check** for overlap detection
- **Check before create** — detect and expire overlapping traces BEFORE attempting to create the new trace
- Sequence: Query active traces → Expire all found → Create new trace
- Use **Salesforce batch update API** if available via jsforce; otherwise issue individual update calls
- When expiring a trace, set `ExpirationDate = now`
- **Display details + auto-expire** (no confirmation prompt in Phase 5; Phase 8 adds confirmation)
- **Extend TraceResult** to include optional `stoppedTraces` array with trace details
- Log summary message: `"Stopped {N} overlapping trace(s). Creating new trace..."`
- If batch expiration fails partway through, **fail cleanly and log what succeeded**
- If the initial query for overlapping traces fails, **log a warning and continue** with trace creation attempt

### Claude's Discretion
- Query Performance: The overlapping trace query is lightweight — no pagination or complex indexing needed
- Datetime Format: Use ISO 8601 for all timestamps (consistent with Phase 2)

### Deferred Ideas (OUT OF SCOPE)
- Batch API optimization (v1.1+) — optimize from N sequential calls to 1 batch call if jsforce supports
- Trace history / audit trail (v2)
- Selective expiration (v2) — let user choose which traces to keep/expire
- Pre-expiration backup (v2) — download logs before stopping trace

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TRACE-01 | Plugin detects when a trace flag already exists for the target user | Detection query: `SELECT Id, ExpirationDate FROM TraceFlag WHERE TracedEntityId = {userId} AND ExpirationDate > {now}` |
| TRACE-03 | Plugin automatically expires the existing trace flag (sets EndTime to now) | jsforce `connection.tooling.update()` with `ExpirationDate: now` via array input for batch operation |
| TRACE-08 | Plugin handles multiple overlapping trace flags for same user | Loop over returned records and expire each; batch API supports 200 records/call (typical: 1-5 traces) |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Overlap detection (query) | API / Backend | — | Tooling API query for active TraceFlags; async operation in trace helper |
| Batch expiration (update) | API / Backend | — | Tooling API update of multiple TraceFlag records; jsforce batch routing |
| Result composition | API / Backend | — | Merge detected traces with expiration results; return via TraceResult |
| Message display | Frontend Server (SSR) / CLI | — | trace.ts command logs "Stopped X traces" message; downstream phases display full lifecycle |

## Standard Stack

### Core Libraries (No Changes)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| **@salesforce/core** | 8.31.0+ | Org connection, Tooling API client | Required. jsforce (bundled) provides `connection.tooling.query()` and `connection.tooling.update()` |
| **@salesforce/sf-plugins-core** | ^12 | Plugin command framework | Unchanged; provides SfCommand base, Flags utilities |
| **oclif** | ^4.23.7 | CLI framework | Unchanged; powers command lifecycle |

### Supporting Libraries (No New Additions Required)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **escapeSoql()** | built-in | SOQL injection prevention | Sanitize userId in detection query |
| **Native Date** | built-in | Timestamp handling | `new Date().toISOString()` for NOW comparison |

### Technology Stack Rationale
- **No new date libraries needed:** Salesforce timestamps always UTC; `Date` comparison works directly
- **No batch/promise coordination library needed:** Sequential expiration of 1-5 traces is acceptable; avoid adding dependencies
- **jsforce batch routing automatic:** When calling `tooling.update(sObjectType, recordArray)` with array of records, jsforce automatically routes to Salesforce SObject Collection API (batch 200/call)

## Package Legitimacy Audit

All packages used in Phase 5 are existing dependencies. No new packages required.

| Package | Registry | Age | Downloads | Source Repo | Status |
|---------|----------|-----|-----------|-------------|--------|
| @salesforce/core | npm | 8+ years | 1M+/week | github.com/forcedotcom/cli | ✓ Approved |
| jsforce (via @salesforce/core) | npm | 10+ years | 100K+/week | github.com/jsforce/jsforce | ✓ Approved |

## Architecture Patterns

### System Architecture: Trace Flag Lifecycle (Phase 5 Focus)

```
User runs: sf log trace --user-id <userId>
    ↓
[PHASE 5 NEW] Detect Overlapping Traces
    ├─ Query Tooling API: SELECT TraceFlag WHERE TracedEntityId = userId AND ExpirationDate > now
    ├─ If found (1-5 records typically)
    │  ├─ Expire all: UPDATE TraceFlag set ExpirationDate = now (batch call)
    │  └─ Return: array of stopped trace {id, originalExpirationDate}
    └─ If none found: return empty array
    ↓
[PHASE 2 UNCHANGED] Create New Trace
    ├─ Call createTraceFlag(org, userId, debugLevelId)
    └─ Return: new trace {id, expirationDate}
    ↓
[PHASE 3 UNCHANGED] Download Logs
    └─ Call initiateDownloadAfterTrace() with new trace result
```

### Recommended Project Structure (Phase 5 Additions)

```
src/
├── utils/
│   └── trace-helper.ts          # EXTEND: add detectAndExpireOverlappingTraces()
│       ├── checkExistingTraceFlag()    [Phase 2 — unchanged]
│       ├── createTraceFlag()            [Phase 2 — unchanged]
│       ├── detectAndExpireOverlappingTraces()  [PHASE 5 NEW]
│       └── initiateDownloadAfterTrace() [Phase 3 — unchanged]
├── types/
│   └── trace.ts                 # EXTEND: add optional stoppedTraces to TraceResult
└── commands/log/
    └── trace.ts                 # EXTEND: call detectAndExpireOverlappingTraces() before createTraceFlag()
```

### Pattern 1: Overlap Detection Query

**What:** Query Tooling API for non-expired TraceFlags for a target user. Non-expired = `ExpirationDate > now`.

**When to use:** At the start of trace creation flow, before attempting to create new trace. Purpose: avoid hitting Salesforce's DUPLICATE_VALUE error.

**Example:**

```typescript
// Source: Phase 5 implementation, based on checkExistingTraceFlag pattern (Phase 2)
import { Org } from '@salesforce/core';
import { escapeSoql } from './soql-builder.js';

async function detectAndExpireOverlappingTraces(org: Org, userId: string): Promise<Array<{id: string; expirationDate: string}>> {
  const connection = org.getConnection();
  const now = new Date().toISOString();

  // Query for ALL non-expired traces (typically 0-1, but handle 1-5 edge cases)
  const result = await connection.tooling.query(
    `SELECT Id, ExpirationDate FROM TraceFlag WHERE TracedEntityId = '${escapeSoql(userId)}' AND ExpirationDate > ${now}`
  ) as { records: Array<{Id: string; ExpirationDate: string}> };

  if (result.records.length === 0) {
    return []; // No overlaps; proceed to create new trace
  }

  // Batch expire: jsforce routes array to SObject Collection API (max 200 per batch)
  const updates = result.records.map((record) => ({
    Id: record.Id,
    ExpirationDate: now, // Set to now to end immediately
  }));

  try {
    const updateResult = await connection.tooling.update('TraceFlag', updates);
    // updateResult is array of {id, success, errors} objects

    // Record which traces were stopped for return
    const stoppedTraces = result.records.map((record) => ({
      id: record.Id,
      expirationDate: record.ExpirationDate,
    }));

    return stoppedTraces;
  } catch (error) {
    // Log error but re-throw so caller can handle gracefully
    throw new Error(`Failed to expire overlapping traces: ${error instanceof Error ? error.message : String(error)}`);
  }
}
```

### Pattern 2: Result Extension (TraceResult Type)

**What:** Extend the TraceResult type to include optional `stoppedTraces` array. This allows Phase 6 (display) and Phase 7 (JSON) to access full trace lifecycle.

**When to use:** Define in `src/types/trace.ts` before implementation. Downstream phases will use `result.stoppedTraces` for display.

**Example:**

```typescript
// Source: Phase 5 type extension
export type TraceResult = {
  traceFlag: {
    id: string;
    userId: string;
    userName: string;
    userEmail: string;
    debugLevel: string;
    expirationDate: string;
  };
  stoppedTraces?: Array<{  // PHASE 5 ADDITION
    id: string;
    expirationDate: string;
  }>;
};
```

### Pattern 3: Integration into Trace Command Flow

**What:** Modify `src/commands/log/trace.ts` to call `detectAndExpireOverlappingTraces()` before `createTraceFlag()`, and pass stopped traces into the result.

**When to use:** In the `run()` method after step 1 (determine debug level) and before step 3 (create trace).

**Example:**

```typescript
// Source: Phase 5 integration pattern
// In trace.ts run() method, after Step 1 (determine debug level):

// Step 2: Detect and expire overlapping traces (PHASE 5 NEW)
const stoppedTraces = await detectAndExpireOverlappingTraces(org, userId);
if (stoppedTraces.length > 0) {
  this.log(messages.getMessage('statusStoppingOverlappingTraces', [String(stoppedTraces.length)]));
  // Phase 6 will add detailed logging of each stopped trace
}

// Step 3: Create new TraceFlag (UNCHANGED from Phase 2)
const traceFlagResult = await createTraceFlag(org, userId, debugLevelId);

// Step 4-N: Existing steps (query user details, watch, download...)

// When returning result (for --json output):
const result: TraceWithDownloadResult = {
  traceFlag: {
    id: traceFlagResult.id,
    userId,
    userName,
    userEmail,
    debugLevel: debugLevelName,
    expirationDate: traceFlagResult.expirationDate,
  },
  stoppedTraces, // PHASE 5 ADDITION
  downloadResults,
  downloadSessionDir,
  filterResult,
};
```

### Anti-Patterns to Avoid

- **Do NOT check for existing traces in `checkExistingTraceFlag()` and separately query in `detectAndExpireOverlappingTraces()`** — consolidate into one function to avoid double-querying the Tooling API. Phase 5 replaces `checkExistingTraceFlag()` logic with the new function.
- **Do NOT issue individual sequential update calls** — use jsforce batch routing with array input: `tooling.update('TraceFlag', [{ Id, ExpirationDate }, ...])` routes to SObject Collection API automatically.
- **Do NOT wait for Salesforce to clean up expired traces** — actively set `ExpirationDate = now` to stop traces immediately; don't rely on async cleanup.
- **Do NOT throw hard error if overlap detection fails** — per D-13, log warning and continue with trace creation attempt (let Salesforce API handle any conflicts).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Multi-record batch updates | Custom loop with sequential API calls | jsforce `tooling.update(sObjectType, recordArray)` | Automatic routing to SObject Collection API (batch 200/call); handles error rollback, success reporting |
| SOQL injection prevention | Manual string escaping | `escapeSoql()` from soql-builder.ts | Already implemented, tested, reused across codebase |
| Timezone/UTC handling | Custom date math | `Date.toISOString()` native method | Salesforce timestamps always UTC; native Date handles comparison correctly |
| Promise coordination for N expiries | Custom Promise.all() with error aggregation | Sequential `.forEach()` or `for...of` loop | 1-5 traces typical; simpler error reporting, matches Phase 2 patterns |

**Key insight:** Salesforce Tooling API batch operations (via jsforce SObject Collection API routing) are built to handle multi-record updates efficiently. Attempting to optimize beyond jsforce's automatic routing adds complexity without benefit for typical overlap (1-5 traces).

## Runtime State Inventory

**Not applicable.** Phase 5 is a greenfield addition (new function, type extension). No existing state rename or data migration.

## Common Pitfalls

### Pitfall 1: Double-Querying TraceFlags
**What goes wrong:** Checking for existing traces in Phase 2's `checkExistingTraceFlag()` and then querying again in Phase 5's new detection function, resulting in 2 API calls instead of 1.

**Why it happens:** Phase 2 already detects one trace (overwrite mode). Phase 5 needs to detect and expire multiple. Developers often keep Phase 2 logic and add Phase 5 logic on top without consolidating.

**How to avoid:** Replace `checkExistingTraceFlag()` call in trace.ts with `detectAndExpireOverlappingTraces()` call. The new function handles both binary check (exists/not-exists) and full batch expiration.

**Warning signs:** Seeing two `.tooling.query()` calls in trace.ts execution; trace command making 2+ queries before creating new trace.

### Pitfall 2: Sequential Update Calls Instead of Batch
**What goes wrong:** Code issues individual `tooling.update()` calls for each trace to expire, resulting in N API calls instead of 1 batch call.

**Why it happens:** Developers unfamiliar with jsforce batch API think `tooling.update()` only accepts single-record objects.

**How to avoid:** Pass array of records: `tooling.update('TraceFlag', [{Id, ExpirationDate}, {Id, ExpirationDate}])`. jsforce automatically routes to SObject Collection API; no special code needed.

**Warning signs:** Loop over traces with individual `connection.tooling.update()` per record; code calling `update()` inside a `for` loop.

### Pitfall 3: Throwing Error Instead of Logging Warning on Query Failure
**What goes wrong:** If the initial overlap detection query fails, code throws a hard error and prevents trace creation attempt, when per D-13 it should log a warning and continue.

**Why it happens:** Defensive programming instinct to fail-fast on any API error.

**How to avoid:** Wrap overlap detection query in try-catch; log warning but do NOT re-throw. Return empty array and allow trace creation to proceed (Salesforce will handle DUPLICATE_VALUE if needed).

**Warning signs:** Detection function throws on first API error; no graceful fallback path.

### Pitfall 4: Not Extending TraceResult Type
**What goes wrong:** Phase 5 adds stoppedTraces array but doesn't update the TraceResult type definition, causing TypeScript errors in Phase 6/7 when trying to access the property.

**Why it happens:** Developers implement the detection logic but forget to update the type definition that downstream code depends on.

**How to avoid:** Modify `src/types/trace.ts` to add optional `stoppedTraces` property BEFORE implementing the function. Type compiler will enforce consistency.

**Warning signs:** Phase 6 code can't compile because `stoppedTraces` property doesn't exist on TraceResult type.

## Code Examples

Verified patterns from existing codebase and Salesforce API documentation:

### Existing Pattern: Single TraceFlag Query (Phase 2)
```typescript
// Source: src/utils/trace-helper.ts lines 155-157
const result = await connection.tooling.query(
  `SELECT Id FROM TraceFlag WHERE TracedEntityId = '${escapeSoql(userId)}' AND ExpirationDate > ${now} LIMIT 1`
) as { records: Array<{ Id: string }> };
```

### Existing Pattern: Single Record Update (Phase 2)
```typescript
// Source: src/utils/trace-helper.ts lines 167-170
await connection.tooling.update('TraceFlag', {
  Id: existingTraceId,
  ExpirationDate: now,
});
```

### Phase 5 Extension: Multi-Record Update
```typescript
// New pattern: Batch update via array input
// jsforce automatically routes to Salesforce SObject Collection API
const updates = records.map(r => ({
  Id: r.Id,
  ExpirationDate: now,
}));
await connection.tooling.update('TraceFlag', updates);
// Returns array of { id, success, errors } objects
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Check one trace, throw if found, user runs again | Detect all overlapping traces, auto-expire, create new in one flow | Phase 5 (v1.1) | Seamless trace refresh without manual cleanup; v1.0 experience: hit DUPLICATE_VALUE, user had to use --overwrite |
| Sequential update calls in loop | Batch update via jsforce array routing | Phase 5 | N API calls → 1 batch call (typical 1-5 traces) |

**Deprecated/outdated:**
- Phase 2's `checkExistingTraceFlag()` throws error on found trace — replaced by Phase 5's `detectAndExpireOverlappingTraces()` which auto-expires without throwing. (Note: Phase 2 code can coexist until Phase 5 is implemented; Phase 5 implementation will replace the call site in trace.ts.)

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | jsforce `tooling.update()` with array input automatically routes to Salesforce SObject Collection API | Don't Hand-Roll | If false, would need manual batch splitting for >1 record. Verified via jsforce docs (github.com/jsforce/jsforce) and existing Phase 3 patterns (no evidence of manual batching). |
| A2 | Typical overlapping trace count is 1-5 per user | Common Pitfalls | If much higher, batch limit (200 per call) could cause issues. Per CONTEXT.md D-02 ("one per user"), overlap should be rare. Field observation from customers would validate. |
| A3 | Salesforce TraceFlag always supports ExpirationDate as writable field | Code Examples | If read-only, would need different approach. Verified in existing code (trace-helper.ts line 101, 170) and Salesforce Tooling API docs. |

**If this table is empty:** All claims in this research were verified or cited — no user confirmation needed for assumptions.

## Open Questions

1. **Error reporting for partial expiration** — If batch update fails for 2 of 5 traces, how detailed should error message be? D-12 says "log what succeeded" but doesn't specify format.
   - What we know: D-12 requires graceful failure with reporting
   - What's unclear: Should we return partial results (stopped 1 of 5) or fail hard?
   - Recommendation: Return partial results in array; log each failure separately; Phase 6 can display detailed lifecycle. Allows maximum visibility.

2. **Query scope for ExpirationDate > now** — Should comparison be strict (`>`) or inclusive (`>=`)? Currently using `>` per Phase 2 pattern.
   - What we know: Phase 2 uses `>` consistently (lines 155-156 in trace-helper.ts)
   - What's unclear: Edge case of trace expiring at exact moment of query
   - Recommendation: Keep `>` for consistency; edge case is negligible (millisecond-level race condition)

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | ✓ | 18.0.0+ | — |
| @salesforce/core | Tooling API client | ✓ | 8.31.0 | — |
| TypeScript | Compilation | ✓ | 5.5.4 | — |

**Missing dependencies with no fallback:** None — all required tools available.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | mocha + chai (via @salesforce/dev-scripts) |
| Config file | .mocharc.json (inherited from scaffold) |
| Quick run command | `npm test` (mocha spec/**/*.test.ts) |
| Full suite command | `npm test && npm run test:nuts` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TRACE-01 | Detects active TraceFlag for target user | unit | `npx mocha test/utils/trace-helper.test.ts --grep "detectAndExpireOverlappingTraces.*detects"` | ❌ Wave 0 |
| TRACE-03 | Expires found TraceFlags by setting ExpirationDate to now | unit | `npx mocha test/utils/trace-helper.test.ts --grep "detectAndExpireOverlappingTraces.*expires"` | ❌ Wave 0 |
| TRACE-08 | Handles multiple overlapping traces (1-5 edge cases) | unit | `npx mocha test/utils/trace-helper.test.ts --grep "detectAndExpireOverlappingTraces.*multiple"` | ❌ Wave 0 |
| TRACE-01, TRACE-03, TRACE-08 | Integration: trace command calls detection, expires, then creates | integration | `npx mocha test/commands/log/trace.test.ts --grep "overlapping"` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test` (mocha unit tests only, <10s)
- **Per wave merge:** `npm test && npm run test:nuts` (full suite with NUT integration tests)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/utils/trace-helper.test.ts` — add unit tests for `detectAndExpireOverlappingTraces()` function
  - Test case: No overlapping traces found → returns empty array
  - Test case: Single overlapping trace found → expires it and returns {id, expirationDate}
  - Test case: Multiple (3+) overlapping traces → batch expires all and returns array
  - Test case: Query fails → logs warning and returns empty array (allows trace creation to attempt)
  - Test case: Batch update fails partway → throws error with partial success details
- [ ] `test/commands/log/trace.test.ts` — add integration test for trace command with overlapping traces
  - Test case: Command detects overlap, expires, creates new trace, downloads
  - Test case: Command extends TraceResult with stoppedTraces array (when --json flag used)
- [ ] Mock Tooling API responses in unit tests (using sinon stubs for `connection.tooling.query()` and `connection.tooling.update()`)

*(If no gaps: existing test infrastructure does not yet cover Phase 5 requirements; Wave 0 must add unit and integration tests)*

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Inherited from @salesforce/core (org auth) |
| V3 Session Management | no | Inherited from @salesforce/core |
| V4 Access Control | yes | Tooling API respects Salesforce org permissions; user must have DebugLevelManagement or admin role to update TraceFlags |
| V5 Input Validation | yes | Escape `userId` via `escapeSoql()` before using in SOQL query; Salesforce API validates field values (ExpirationDate format, ID format) |
| V6 Cryptography | no | No cryptography in Phase 5; connection encryption handled by @salesforce/core |

### Known Threat Patterns for {Salesforce Tooling API + jsforce}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SOQL injection via userId | Tampering | Use `escapeSoql(userId)` before embedding in query string. Per existing code (soql-builder.ts), always sanitize user input. |
| Batch update without validation | Tampering | jsforce `tooling.update()` validates field types and permissions on Salesforce side; no custom validation needed. Check `result.success` to catch failures. |
| Expiring wrong trace (ID mismatch) | Tampering | Query returns IDs from Salesforce; construct update record with same ID from query result. No user input in ID field. |
| Race condition: query, then update expires before create | Timing | Per D-04, design accepts this non-atomicity. If new trace creation fails after expiration, user has manual recovery (retry trace command). |

## Sources

### Primary (HIGH confidence)
- **@salesforce/core v8.31.0 (npm registry)** — Verified installed and current version in package.json
- **jsforce v3.10.15 (via @salesforce/core)** — Verified as transitive dependency; documented in jsforce GitHub (github.com/jsforce/jsforce)
- **Existing codebase patterns** — src/utils/trace-helper.ts (checkExistingTraceFlag, createTraceFlag patterns, SOQL construction), src/types/trace.ts (TraceResult type definition)
- **Salesforce Tooling API documentation** — TraceFlag object query/update operations, ExpirationDate field, API limits (200 records per batch)

### Secondary (MEDIUM confidence)
- **Phase 2 CONTEXT.md** — Established patterns for trace flag creation, SOQL escaping, error handling
- **Phase 5 CONTEXT.md** — Locked decisions on detection strategy, batch expiration, error handling, type extension
- **Salesforce CLI Plugin patterns** — @salesforce/sf-plugins-core SfCommand base, flag handling, JSON output patterns

### Tertiary (LOW confidence)
- None — all critical claims verified via code inspection or official Salesforce/jsforce documentation

## Metadata

**Confidence breakdown:**
- **Standard stack:** HIGH — @salesforce/core and jsforce verified in installed package.json; no new dependencies
- **Architecture:** HIGH — Detection and batch expiration patterns mirror existing Phase 2 code (checkExistingTraceFlag, createTraceFlag); jsforce batch routing automatic via array input
- **Pitfalls:** HIGH — Common mistakes identified from code review (double-querying, sequential updates) and from CONTEXT.md decisions
- **Type extension:** HIGH — TraceResult type already in codebase; extension is straightforward optional field
- **Test coverage:** MEDIUM — Mocha/chai framework confirmed in package.json; Wave 0 gaps identified but structure clear

**Research date:** 2026-06-01  
**Valid until:** 2026-06-30 (standard stack stable; recheck if jsforce patch releases)

**Confidence ceiling:** Research is ready for planning. All locked decisions from CONTEXT.md verified via code inspection. No blockers identified.
