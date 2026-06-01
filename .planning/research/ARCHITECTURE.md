# Architecture: Overlapping Trace Flag Handling

**Project:** Salesforce Debug Log CLI Plugin  
**Milestone:** v1.1 Overlapping Trace Flag Handling  
**Researched:** 2026-06-01  
**Confidence:** HIGH (based on existing trace command architecture and Salesforce Tooling API patterns)

---

## Executive Summary

Overlapping trace flag handling integrates into the existing `trace` command workflow at the **pre-creation step** (Step 2 in the current flow). The feature detects when a user already has an active trace flag and either:

1. **Block creation** (default) — Inform user and guide them to use `--overwrite`
2. **Automatically expire existing** (with `--overwrite` flag) — Stop the old trace, create the new one

This is a **localized change** affecting:
- `trace-helper.ts` — Enhanced detection and expiration logic
- `trace.ts` command — Already imports `checkExistingTraceFlag()` and respects `--overwrite` flag
- Message templates — Already defined for these cases

**New components needed:** None. Existing `checkExistingTraceFlag()` function provides the hook point; enhancement required.

**Data flow change:** Minimal. Current implementation already handles detection and expiration in the right place (before new trace creation).

---

## Current Architecture: Trace Command Execution Flow

### Step-by-Step Breakdown (from existing `trace.ts`)

```
User runs: sf log trace --user-id 005XX --overwrite --target-org my-org

┌─ Step 1: Parse Input
│  └─ Flags: user-id, overwrite, target-org, level, keyword, no-watch
│  └─ Output: userId, overwrite flag, org connection

├─ Step 2: EXISTING — Check for Overlapping Traces [INTEGRATION POINT]
│  ├─ Call: checkExistingTraceFlag(org, userId, overwrite)
│  ├─ Query: SELECT Id FROM TraceFlag 
│  │          WHERE TracedEntityId = '{userId}' 
│  │          AND ExpirationDate > NOW
│  └─ Logic:
│     ├─ If found AND overwrite = false
│     │  └─ Throw error: "User already has active trace. Use --overwrite"
│     ├─ If found AND overwrite = true
│     │  └─ UPDATE TraceFlag SET ExpirationDate = NOW
│     │  └─ Stop existing trace
│     └─ If not found
│        └─ Continue

├─ Step 3: Determine Debug Level
│  ├─ Source: --level flag OR org default
│  └─ Returns: DebugLevel ID

├─ Step 4: Create New TraceFlag
│  └─ Tooling API: POST /tooling/sobjects/TraceFlag/
│     {
│       TracedEntityId: userId,
│       DebugLevelId: debugLevelId,
│       LogType: 'DEVELOPER_LOG',
│       ExpirationDate: now + 24h
│     }

├─ Step 5: Retrieve User Details
│  └─ SOQL: SELECT FirstName, LastName, Email FROM User WHERE Id = '{userId}'

├─ Step 6: Retrieve DebugLevel Name
│  └─ Tooling API: SELECT DeveloperName FROM DebugLevel WHERE Id = '{debugLevelId}'

├─ Step 7: Build Result & Display Table
│  └─ Output: Trace Flag ID, User Name, Email, Debug Level, Expiration Date

├─ Step 8: Initiate Download (D-01, D-02)
│  └─ Query ApexLog for traced user within 24h window
│  └─ Download available logs to session directory

├─ Step 9: Optional Filtering
│  └─ If --keyword flag: Filter logs, organize matched/rejected

└─ Step 10: Optional Watch Mode (D-03)
   └─ If NOT --no-watch: Monitor trace flag expiry with progress bar
   └─ Polls every 1s until expiry or Ctrl+C
```

### Current Implementation: `checkExistingTraceFlag()` in trace-helper.ts

```typescript
export async function checkExistingTraceFlag(
  org: Org,
  userId: string,
  overwrite: boolean
): Promise<{ exists: boolean; id?: string }> {
  try {
    const connection = org.getConnection();
    const now = new Date().toISOString();

    // Query for active trace flags (ExpirationDate in future)
    const result = await connection.tooling.query(
      `SELECT Id FROM TraceFlag WHERE TracedEntityId = '...' AND ExpirationDate > ${now} LIMIT 1`
    );

    if (result.records.length > 0) {
      const existingTraceId = result.records[0].Id;

      if (!overwrite) {
        throw new Error('User already has an active trace flag. Use --overwrite...');
      }

      // Overwrite: stop the existing trace by setting expiration to NOW
      await connection.tooling.update('TraceFlag', {
        Id: existingTraceId,
        ExpirationDate: now,
      });

      return { exists: true, id: existingTraceId };
    }

    return { exists: false };
  } catch (error) {
    // Re-throw user-guidance errors; suppress query errors
    if (error instanceof Error && error.message.includes('User already has an active trace flag')) {
      throw error;
    }
    return { exists: false };
  }
}
```

**Current status:** This function ALREADY implements overlap detection and expiration. The question is: what enhancements are needed for the v1.1 milestone?

---

## Required Enhancements for v1.1 Overlapping Trace Flag Handling

Based on the milestone requirements, the following features must be added:

### Feature 1: Detect Existing Trace Flags (DONE)
- **Status:** Already implemented in `checkExistingTraceFlag()`
- **Logic:** Query Tooling API for active traces (`ExpirationDate > NOW`)
- **Confidence:** HIGH

### Feature 2: Display Existing Trace Flag Details
- **Status:** Partially done — we detect the trace but don't display details
- **Enhancement:** Query full TraceFlag record (ID, CreatedDate, ExpirationDate, DebugLevel) and display to user
- **Where:** In `trace-helper.ts`, extend `checkExistingTraceFlag()` to return full details
- **Why:** Users need to see what trace exists before deciding to overwrite
- **Complexity:** Low — single additional query field

### Feature 3: Automatically Expire Overlapping Traces (DONE)
- **Status:** Already implemented (`UPDATE TraceFlag SET ExpirationDate = NOW`)
- **Logic:** Set `EndTime`/`ExpirationDate` to current time
- **Confidence:** HIGH

### Feature 4: Show User-Friendly Messages
- **Status:** Message templates already defined in `log.trace.md`
  - `statusStoppingExistingTrace` ✓
  - `errorActiveTraceExists` ✓
- **Enhancement:** Ensure messages display existing trace details (from Feature 2)
- **Complexity:** Low — templates already exist

### Feature 5: Support `--overwrite` Flag Behavior
- **Status:** Already implemented in `trace.ts` and `checkExistingTraceFlag()`
- **Logic:** If `--overwrite`, stop old trace; else throw error
- **Confidence:** HIGH

---

## Integration Points: Where Overlapping Handling Fits

### 1. Trace Command (`src/commands/log/trace.ts`)

**Current integration:**
```typescript
// Line 124-128 in trace.ts
await checkExistingTraceFlag(org, userId, overwrite);
if (overwrite) {
  this.log(messages.getMessage('statusStoppingExistingTrace', [userId]));
}
```

**Enhancement needed:**
- Capture return value from `checkExistingTraceFlag()` to display existing trace details
- Before overwriting, show user what's being stopped

**Change type:** Minimal refactor — existing code already calls the function; just use return value

### 2. Trace Helper (`src/utils/trace-helper.ts`)

**Current state:**
- `checkExistingTraceFlag()` detects and expires traces
- Returns minimal object: `{ exists: boolean; id?: string }`

**Enhancement needed:**
- Expand return type to include full trace details:
  ```typescript
  {
    exists: boolean;
    id?: string;
    debugLevel?: string;        // DebugLevel name for display
    expirationDate?: string;    // ISO 8601 timestamp
    createdDate?: string;       // When trace was created
  }
  ```
- Query additional fields when trace found:
  ```sql
  SELECT Id, DebugLevelId, CreatedDate, ExpirationDate FROM TraceFlag
  WHERE TracedEntityId = ? AND ExpirationDate > NOW
  ```
- Fetch DebugLevel name via separate query (like `getDebugLevelName()`)

**Change type:** Function signature expansion + additional queries

### 3. Message Templates (`messages/log.trace.md`)

**Current state:**
- `statusStoppingExistingTrace` — Generic message
- `errorActiveTraceExists` — Guides user to `--overwrite`

**Enhancement needed:**
- Add new messages for displaying existing trace details:
  ```markdown
  # warningExistingTraceFound
  Found existing trace for %s:
  - Trace ID: %s
  - Debug Level: %s
  - Started: %s
  - Expires: %s
  
  Using --overwrite will stop this trace and create a new one.
  ```
- Or embed details in `statusStoppingExistingTrace`

**Change type:** Message file additions (low risk)

### 4. Types (`src/types/trace.ts`)

**Current state:**
```typescript
export type TraceResult = {
  traceFlag: {
    id: string;
    userId: string;
    userName: string;
    userEmail: string;
    debugLevel: string;
    expirationDate: string;
  };
};
```

**Enhancement needed:**
- Add optional field for stopped trace details (for --json output):
  ```typescript
  export type TraceResult = {
    traceFlag: { ... };
    stoppedTrace?: {  // NEW
      id: string;
      debugLevel: string;
      expirationDate: string;
      createdDate: string;
    };
  };
  ```

**Change type:** Type extension (backward compatible)

---

## Data Flow: Enhanced with Overlapping Trace Handling

### Complete Trace Command Flow (with v1.1 enhancements)

```
User runs: sf log trace --user-id 005XX --overwrite --target-org my-org

┌─ STEP 1: Parse Input & Org Resolution
│  └─ flags['target-org'] → authenticated Org instance

├─ STEP 2: SELECT USER [unchanged]
│  ├─ If --user-id provided: use it
│  └─ Else: interactive search

├─ STEP 3: ENHANCED — Detect & Handle Overlapping Trace Flag ⭐
│  │
│  ├─ Call: checkExistingTraceFlag(org, userId, overwrite) → ExistingTraceDetails
│  │
│  ├─ Query: SELECT Id, DebugLevelId, CreatedDate, ExpirationDate FROM TraceFlag
│  │          WHERE TracedEntityId = ? AND ExpirationDate > NOW LIMIT 1
│  │
│  ├─ If found:
│  │  │
│  │  ├─ Query: SELECT DeveloperName FROM DebugLevel WHERE Id = ?
│  │  │  (same as getDebugLevelName() pattern)
│  │  │
│  │  ├─ If overwrite = false:
│  │  │  ├─ Display existing trace details
│  │  │  │  └─ "Found existing trace:
│  │  │  │     Trace ID: 7a1FX...
│  │  │  │     Debug Level: Debug
│  │  │  │     Expires: 2026-06-02T14:30:00Z
│  │  │  │     Use --overwrite to stop and create new trace"
│  │  │  └─ Throw error → exit
│  │  │
│  │  └─ If overwrite = true:
│  │     ├─ Log: "Stopping existing trace for {user}..."
│  │     ├─ UPDATE TraceFlag SET ExpirationDate = NOW
│  │     ├─ Capture stopped trace details for result.stoppedTrace
│  │     └─ Continue to Step 4
│  │
│  └─ If not found:
│     └─ Continue to Step 4

├─ STEP 4: Determine Debug Level [unchanged]
│  └─ --level flag or org default

├─ STEP 5: CREATE NEW TraceFlag [unchanged]
│  └─ POST /tooling/sobjects/TraceFlag

├─ STEP 6: Query User Details [unchanged]
│  └─ SELECT FirstName, LastName, Email FROM User

├─ STEP 7: Query DebugLevel Name [unchanged]
│  └─ SELECT DeveloperName FROM DebugLevel

├─ STEP 8: Build Result with Optional Stopped Trace Info ⭐
│  └─ TraceResult {
│       traceFlag: { new trace details },
│       stoppedTrace?: { old trace details }, // NEW
│     }

├─ STEP 9: Display Result Table [minor change]
│  └─ Show new trace details
│  └─ If stoppedTrace: show summary of stopped trace

├─ STEP 10: Initiate Download [unchanged]

├─ STEP 11: Optional Filter [unchanged]

└─ STEP 12: Optional Watch Mode [unchanged]
   └─ Monitor NEW trace, not old one
```

---

## Component Dependencies & Changes

### Modified Components (Minimal Impact)

| Component | Change | Reason | Complexity |
|-----------|--------|--------|------------|
| `trace-helper.ts::checkExistingTraceFlag()` | Return full trace details (ID, debugLevel, expirationDate, createdDate) | User needs to see what's being stopped | LOW |
| `trace-helper.ts::getDebugLevelName()` | Already exists; call from `checkExistingTraceFlag()` | Display DebugLevel name in details | LOW |
| `trace.ts::run()` | Capture and display stopped trace details; pass to result object | Implement v1.1 requirement to show details | LOW |
| `types/trace.ts::TraceResult` | Add optional `stoppedTrace` field | Include in --json output | LOW |
| `messages/log.trace.md` | Add/expand messages for displaying existing trace | User-friendly messaging | LOW |

### Unmodified Components

| Component | Reason |
|-----------|--------|
| `trace-monitor.ts` | Watches new trace, not old one; no change needed |
| `download-helper.ts` | Downloads logs from new trace; no change needed |
| `quota-calculator.ts` | Quota enforcement unchanged |
| `storage-manager.ts` | Storage unchanged |
| `soql-builder.ts` | SOQL patterns unchanged |
| Other commands | Trace command isolation; no cross-command impact |

---

## New vs Modified: Explicit Breakdown

### NEW Functions
None. `checkExistingTraceFlag()` already exists.

### MODIFIED Functions

#### 1. `checkExistingTraceFlag()` in `trace-helper.ts`

**Current signature:**
```typescript
export async function checkExistingTraceFlag(
  org: Org,
  userId: string,
  overwrite: boolean
): Promise<{ exists: boolean; id?: string }>
```

**New signature:**
```typescript
export async function checkExistingTraceFlag(
  org: Org,
  userId: string,
  overwrite: boolean
): Promise<{
  exists: boolean;
  id?: string;
  debugLevel?: string;        // DebugLevel DeveloperName
  expirationDate?: string;    // ISO 8601
  createdDate?: string;       // ISO 8601
}>
```

**Changes:**
- Add 2-3 additional fields to SELECT query
- Call `getDebugLevelName()` if trace found (reuse existing logic)
- Return extended object (backward compatible; old fields still exist)

---

## Suggested Implementation Order

### Phase 1: Core Detection & Expiration Enhancement (1-2 hours)
1. Expand `checkExistingTraceFlag()` return type with new fields
2. Add queries to fetch DebugLevel name, CreatedDate, ExpirationDate
3. Test: Verify function returns correct details

### Phase 2: Command Integration (1 hour)
1. Update `trace.ts::run()` to:
   - Capture `checkExistingTraceFlag()` return value
   - Extract stopped trace details
   - Pass to result object (`stoppedTrace` field)
2. Update message calls to include existing trace details in output
3. Test: Run with `--overwrite`, verify output shows stopped trace info

### Phase 3: Result Type Update (30 minutes)
1. Add `stoppedTrace` field to `TraceResult` type
2. Ensure --json output includes stoppedTrace when present
3. Test: Run with `--json`, verify stoppedTrace in output

### Phase 4: Message Template Enhancement (30 minutes)
1. Update `log.trace.md` to include new/expanded messages
   - Detail message showing which trace is being stopped
   - Summary in table output
2. Test: Verify all messages display correctly

### Phase 5: Testing & Validation (2-3 hours)
1. Unit tests for `checkExistingTraceFlag()` with/without overlaps
2. Integration tests for trace command with `--overwrite`
3. Test edge cases:
   - Multiple active traces (shouldn't happen, but query LIMIT 1)
   - Trace expires between query and update (race condition)
   - Permission denied on UPDATE

---

## Potential Pitfalls & Mitigations

### Pitfall 1: Race Condition on Overlap Detection

**What goes wrong:** User has no trace at query time, but between detection and creation, another process creates one. Trace creation fails.

**Why it happens:** Tooling API operations are not atomic. Salesforce doesn't support "create only if not exists" semantics.

**Consequences:** User sees cryptic DUPLICATE_VALUE error instead of clear guidance.

**Prevention:**
- Query `TraceFlag` table again after overwrite/deletion, before creating new one (slight redundancy)
- Handle DUPLICATE_VALUE error in catch block with clear message: "Another trace was created while this one was pending. Try again or use --overwrite."

**Detection:** Monitor for DUPLICATE_VALUE errors in logs.

---

### Pitfall 2: Stale Trace Expiration Date

**What goes wrong:** `ExpirationDate > NOW` comparison in SOQL uses server time; client time may drift. Query shows no active traces, but Salesforce still has one active.

**Why it happens:** Time sync issues between client and Salesforce.

**Consequences:** User thinks no trace is active, but attempt to create new one fails with DUPLICATE_VALUE.

**Prevention:**
- Always use Salesforce server time (via SOQL CALENDAR_YEAR() or similar) OR
- Use conservative buffer: `ExpirationDate > NOW - 5 minutes` to catch traces about to expire

**Detection:** Intermittent failures on trace creation when query shows no trace.

---

### Pitfall 3: Permission Error on UPDATE TraceFlag

**What goes wrong:** User has permission to CREATE TraceFlag but not UPDATE it.

**Why it happens:** Some org permission sets are narrowly scoped.

**Consequences:** `--overwrite` fails with permission denied, user can't proceed.

**Prevention:**
- Check CREATE vs UPDATE permissions at trace command start (or trust Salesforce and handle gracefully)
- Graceful error message: "Permission denied on UPDATE. You may not have permission to stop existing traces. Contact your admin."
- Document in help text that CREATE + UPDATE permissions required

**Detection:** Monitor for permission errors; add to validation test suite.

---

### Pitfall 4: Display of Existing Trace Details Leaks Sensitive Info

**What goes wrong:** DebugLevel details or CreatedDate reveals when/why trace was enabled.

**Why it happens:** Showing too much information without filtering.

**Consequences:** Security concern if user is being traced without knowledge.

**Prevention:**
- Keep display minimal: ID, Level name, Expiration only
- Don't show CreatedDate if not needed for v1.1 requirement
- Document what information is shown in help text

**Detection:** Review message templates for sensitive fields.

---

### Pitfall 5: Overlap Query Performance with Large Trace Flag Count

**What goes wrong:** Org has 1000s of TraceFlag records; query becomes slow.

**Why it happens:** No index on (TracedEntityId, ExpirationDate) in Salesforce.

**Consequences:** Trace command hangs on check step.

**Prevention:**
- Use LIMIT 1 in query (already done) to stop after first match
- Add query timeout: `connection.request()` default is 30s; should be fast for LIMIT 1
- Monitor query performance in test metrics

**Detection:** Benchmark with large trace counts; add timeout tests.

---

## Message Flow Examples

### Scenario 1: User Creates Trace, One Already Exists, User Doesn't Use --overwrite

```
$ sf log trace --user-id 005XX --target-org my-org

Searching for active trace flags for 005XX...

Found existing trace for 005XX:
  Trace ID: 7a1FX000...
  Debug Level: Debug
  Expires: 2026-06-02 14:30:00 UTC

ERROR: User 005XX already has an active trace flag. 
       Use --overwrite to stop the existing trace and create a new one.
```

### Scenario 2: User Creates Trace with --overwrite

```
$ sf log trace --user-id 005XX --overwrite --target-org my-org

Checking for existing trace flags for 005XX...

Stopping existing trace for 005XX...
  Stopped ID: 7a1FX000...
  Debug Level: Debug
  Was expiring: 2026-06-02 14:30:00 UTC

Creating trace flag for 005XX...

Trace flag created successfully.

┌─────────────────────────────────────────────────────────────┐
│ Trace Flag ID    │ 7a2GY000...                               │
│ User             │ John Smith                                │
│ Email            │ john.smith@example.com                    │
│ Debug Level      │ Debug                                     │
│ Expires At       │ 2026-06-02 16:30:00 UTC                   │
└─────────────────────────────────────────────────────────────┘

Starting download of logs for John Smith...
...
```

### Scenario 3: JSON Output with Stopped Trace

```json
{
  "traceFlag": {
    "id": "7a2GY000...",
    "userId": "005XX",
    "userName": "John Smith",
    "userEmail": "john.smith@example.com",
    "debugLevel": "Debug",
    "expirationDate": "2026-06-02T16:30:00.000Z"
  },
  "stoppedTrace": {
    "id": "7a1FX000...",
    "debugLevel": "Debug",
    "expirationDate": "2026-06-02T14:30:00.000Z",
    "createdDate": "2026-06-01T14:30:00.000Z"
  },
  "downloadResults": [
    { "logId": "07a...", "success": true, "bytesDownloaded": 1024000 }
  ]
}
```

---

## Testing Strategy

### Unit Tests for `checkExistingTraceFlag()`

```typescript
describe('checkExistingTraceFlag', () => {
  it('returns exists=false when no active trace found', async () => {
    // Mock connection.tooling.query() to return empty records
    // Assert: { exists: false }
  });

  it('throws error when trace found and overwrite=false', async () => {
    // Mock connection.tooling.query() to return one record
    // Assert: Error with "Use --overwrite" message
  });

  it('returns full details when trace found and overwrite=true', async () => {
    // Mock connection.tooling.query() to return trace record
    // Mock connection.tooling.update() to succeed
    // Assert: { exists: true, id: '7a1FX...', debugLevel: 'Debug', expirationDate: '...', createdDate: '...' }
  });

  it('handles permission denied on UPDATE gracefully', async () => {
    // Mock connection.tooling.update() to throw permission error
    // Assert: Error re-thrown with clear message
  });

  it('handles race condition (trace created between query and create)', async () => {
    // Simulate timing where new trace created mid-operation
    // Assert: Graceful error with retry guidance
  });
});
```

### Integration Tests for Trace Command

```typescript
describe('trace command with overlapping traces', () => {
  it('blocks trace creation if trace exists and --overwrite not used', async () => {
    // Setup: Create a trace flag for user
    // Run: sf log trace --user-id 005XX
    // Assert: Error about existing trace
  });

  it('stops existing trace and creates new when --overwrite used', async () => {
    // Setup: Create a trace flag for user
    // Run: sf log trace --user-id 005XX --overwrite
    // Assert: Old trace expires, new trace created, result includes stoppedTrace
  });

  it('includes stoppedTrace in JSON output', async () => {
    // Setup: Create a trace flag for user
    // Run: sf log trace --user-id 005XX --overwrite --json
    // Assert: JSON output has stoppedTrace field with correct details
  });
});
```

---

## Backward Compatibility

### No Breaking Changes

- Existing `checkExistingTraceFlag()` calls still work (return object is expanded, not changed)
- Command behavior unchanged when no overlap exists
- Message templates backward compatible (new fields added, existing ones unchanged)
- TraceResult type change is additive (optional `stoppedTrace` field)

### Version Considerations

- This is within v1.1 (patch/minor bump)
- No migration needed for users
- Help text and docs should mention `--overwrite` prominently

---

## Architecture Diagram: Updated Trace Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                 sf log trace Command                            │
│                  (oclif SfCommand)                              │
└──────────────────────────┬──────────────────────────────────────┘
                           │
        ┌──────────────────┴──────────────────┐
        │                                     │
    ┌───▼───────────────────┐        ┌───────▼─────────────────┐
    │  Trace Helper Utils   │        │  Download Helper Utils  │
    │                       │        │                         │
    │ ┌─────────────────┐   │        │ ┌───────────────────┐   │
    │ │checkExisting    │◄──┤─ V1.1  │ │queryApexLogsFor   │   │
    │ │TraceFlag()      │   │ detect │ │User()             │   │
    │ │ - Query active  │   │ expand │ └───────────────────┘   │
    │ │   traces        │   │        │ ┌───────────────────┐   │
    │ │ - Fetch details │   │        │ │streamDownloadTo   │   │
    │ │ - Expire old    │   │        │ │File()             │   │
    │ │ - Return full   │   │        │ └───────────────────┘   │
    │ │   data          │   │        │ ┌───────────────────┐   │
    │ └─────────────────┘   │        │ │formatDownload     │   │
    │ ┌─────────────────┐   │        │ │Progress()         │   │
    │ │createTraceFlag()│   │        │ └───────────────────┘   │
    │ │ - Create new    │   │        └───────────────────────────┘
    │ │   trace         │   │
    │ └─────────────────┘   │
    │ ┌─────────────────┐   │
    │ │getDebugLevel    │   │
    │ │Name()           │   │
    │ └─────────────────┘   │
    └───────────────────────┘
            │
            │ SOQL & Tooling API calls
            │
    ┌───────▼──────────────────────────┐
    │  Salesforce Tooling API           │
    │  - TraceFlag CRUD                 │
    │  - DebugLevel queries             │
    │  - ApexLog queries                │
    │  - Org Connection (jsforce)       │
    └──────────────────────────────────┘
```

---

## Summary: Key Decisions

| Decision | Rationale | Implementation |
|----------|-----------|-----------------|
| Enhance `checkExistingTraceFlag()` vs new function | Existing function is the single point of control for overlap detection | Modify return type, reuse function |
| Display existing trace details in CLI output | Users must see what's being stopped before proceeding | Extended query fields + message template |
| Include `stoppedTrace` in result object | --json output completeness for scripting | Optional field in TraceResult type |
| Query DebugLevel name via existing `getDebugLevelName()` | DRY principle; function already tested | Call from `checkExistingTraceFlag()` |
| Handle race conditions gracefully | Salesforce operations not atomic | Catch DUPLICATE_VALUE errors with clear messaging |
| No new components | Localized to trace workflow; no cross-cutting concerns | Minimal refactor approach |

---

## Sources

- Salesforce CLI Plugin Architecture (existing ARCHITECTURE.md research)
- Salesforce Tooling API — TraceFlag, DebugLevel objects
- Existing `trace.ts` and `trace-helper.ts` implementation
- Existing message templates in `log.trace.md`
- Project requirements in `.planning/PROJECT.md`
