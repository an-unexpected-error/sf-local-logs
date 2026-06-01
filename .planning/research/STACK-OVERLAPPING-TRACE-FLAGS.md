# Technology Stack: Overlapping Trace Flag Handling

**Project:** Salesforce Debug Log CLI Plugin - v1.1 Overlapping Trace Flag Handling  
**Researched:** 2026-06-01  
**Confidence:** HIGH (existing stack + well-scoped additions)

## Executive Summary

Overlapping trace flag handling requires **minimal stack additions** because the existing jsforce-based architecture already provides all necessary Tooling API capabilities. The key additions are:

1. **Date comparison utility** — Standard library only (native Date or lightweight alternative)
2. **Batch update optimization** — jsforce's native multi-record CRUD already supports this
3. **Query expansion** — Extend existing TraceFlag queries to detect overlaps by time range

No new external dependencies required beyond what's already in use. The implementation stays within the existing TypeScript/jsforce/oclif stack.

## Recommended Stack Additions

### Core Enhancement: Date Comparison Utilities

| Category | Decision | Reason |
|----------|----------|--------|
| **Date comparison** | Use native JavaScript `Date` object + simple overlap algorithm | Overlapping trace flag detection is a simple time-range comparison (no timezone complexity). Native Date object is sufficient and adds zero dependencies. Algorithm: `(range1.start < range2.end && range2.start < range1.end)`. |
| **Alternative if needed** | Consider `date-fns` (tree-shakeable, 3.6KB) only if requirements escalate to multi-timezone handling | Current scope: single org, UTC timestamps from Salesforce. date-fns would add complexity without value. |

### NO New Runtime Dependencies Required

The existing stack already provides:
- **jsforce Connection** — Supports Tooling API queries and updates (via `connection.tooling.query()`, `connection.tooling.update()`)
- **jsforce multi-record CRUD** — SObject Collection API (batch update up to 200 records per call)
- **@salesforce/core** — Org connection and API versioning
- **TypeScript** — Type safety for overlap detection logic

## Architecture Changes: What Adapts

### Query Pattern Expansion

**Current (existing code):**
```typescript
// Check single user's most recent trace
const result = await connection.tooling.query(
  `SELECT Id FROM TraceFlag WHERE TracedEntityId = '${escapeSoql(userId)}' 
   AND ExpirationDate > ${now} LIMIT 1`
);
```

**New (for overlap detection):**
```typescript
// Query ALL overlapping traces for a user in a time window
// Overlapping means: (new_start < existing_end) AND (existing_start < new_end)
const result = await connection.tooling.query(
  `SELECT Id, TracedEntityId, StartTime, ExpirationDate FROM TraceFlag 
   WHERE TracedEntityId = '${escapeSoql(userId)}' 
   AND StartTime < ${newTraceEnd} 
   AND ExpirationDate > ${newTraceStart} 
   LIMIT 100`
);
```

**Rationale:**
- Salesforce Tooling API already supports datetime comparisons in WHERE clauses (ISO 8601 format)
- No special query library needed; standard jsforce `.tooling.query()` handles it
- The query returns all conflicting traces; client-side filtering refines if needed

### Update Pattern: Batch Expiry

**Current (existing code, single update):**
```typescript
await connection.tooling.update('TraceFlag', {
  Id: existingTraceId,
  ExpirationDate: now,
});
```

**New (for multiple overlapping traces):**
```typescript
// Use jsforce multi-record CRUD with SObject Collection API
const tracesToExpire = [
  { Id: traceId1, ExpirationDate: now },
  { Id: traceId2, ExpirationDate: now },
  { Id: traceId3, ExpirationDate: now },
];

await connection.tooling.update('TraceFlag', tracesToExpire, { allOrNone: false });
```

**Rationale:**
- jsforce automatically uses SObject Collection API for batch updates (API 42.0+, which is far before current Salesforce versions)
- Reduces API calls from N updates to 1 composite call for multiple traces
- `allOrNone: false` = partial success allowed (if one update fails, others still process)
- Built-in automatic recursion if > 200 records (unlikely in practice for single user)

### Overlap Detection Algorithm

**Location:** New function in `trace-helper.ts`

```typescript
/**
 * Detect overlapping trace flags for a user.
 *
 * Overlap occurs when: (newTraceStart < existingEnd) AND (existingStart < newTraceEnd)
 * Returns all overlapping traces for expiry.
 *
 * @param connection - jsforce Connection
 * @param userId - User ID to check
 * @param newTraceStart - Proposed new trace start time (ISO string)
 * @param newTraceEnd - Proposed new trace end time (ISO string)
 * @returns Array of { id, start, end } for overlapping traces
 */
export async function detectOverlappingTraceFlags(
  connection: Connection,
  userId: string,
  newTraceStart: string, // ISO 8601
  newTraceEnd: string    // ISO 8601
): Promise<Array<{ Id: string; StartTime: string; ExpirationDate: string }>> {
  const result = await connection.tooling.query(
    `SELECT Id, TracedEntityId, StartTime, ExpirationDate FROM TraceFlag
     WHERE TracedEntityId = '${escapeSoql(userId)}'
     AND StartTime < ${newTraceEnd}
     AND ExpirationDate > ${newTraceStart}
     ORDER BY StartTime ASC`
  ) as { records: Array<{ Id: string; StartTime: string; ExpirationDate: string }> };

  return result.records;
}

/**
 * Check if two datetime ranges overlap.
 * Pure function, no Salesforce dependencies.
 *
 * @param range1Start - ISO 8601 datetime string
 * @param range1End - ISO 8601 datetime string
 * @param range2Start - ISO 8601 datetime string
 * @param range2End - ISO 8601 datetime string
 * @returns true if ranges overlap
 */
export function rangesOverlap(
  range1Start: string,
  range1End: string,
  range2Start: string,
  range2End: string
): boolean {
  const r1Start = new Date(range1Start).getTime();
  const r1End = new Date(range1End).getTime();
  const r2Start = new Date(range2Start).getTime();
  const r2End = new Date(range2End).getTime();

  return r1Start < r2End && r2Start < r1End;
}
```

**No dependencies:** Uses native `Date` object, which is always available.

## Integration Points with Existing Code

### 1. Enhanced `checkExistingTraceFlag()` Function

**Current location:** `src/utils/trace-helper.ts` (lines 145-186)

**Changes:**
- Rename to `checkAndExpireOverlappingTraceFlags()` for clarity
- Query for multiple overlapping traces (not just one)
- Batch-update all overlapping traces via jsforce multi-record CRUD
- Return array of expired trace IDs for display

```typescript
export async function checkAndExpireOverlappingTraceFlags(
  org: Org,
  userId: string,
  overwrite: boolean,
  newTraceStart: string,
  newTraceEnd: string
): Promise<{ overlapping: Array<{ id: string; end: string }>; expired: string[] }> {
  const connection = org.getConnection();

  const overlapping = await detectOverlappingTraceFlags(
    connection,
    userId,
    newTraceStart,
    newTraceEnd
  );

  if (overlapping.length === 0) {
    return { overlapping: [], expired: [] };
  }

  if (!overwrite) {
    throw new Error(
      `Found ${overlapping.length} active trace flag(s) that overlap with new trace. Use --overwrite to stop them.`
    );
  }

  // Batch-expire all overlapping traces
  const now = new Date().toISOString();
  const tracesToExpire = overlapping.map(t => ({
    Id: t.Id,
    ExpirationDate: now,
  }));

  await connection.tooling.update('TraceFlag', tracesToExpire, { allOrNone: false });

  return {
    overlapping: overlapping.map(t => ({ id: t.Id, end: t.ExpirationDate })),
    expired: overlapping.map(t => t.Id),
  };
}
```

### 2. Trace Command Integration

**File:** `src/commands/log/trace.ts`

**Changes:**
- Replace call to `checkExistingTraceFlag()` with new function
- Add trace start/end time to the check call
- Display list of expired traces in output

```typescript
// Step 2: Check for existing active trace flag
const traceStart = new Date().toISOString();
const traceEnd = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

const { overlapping, expired } = await checkAndExpireOverlappingTraceFlags(
  org,
  userId,
  overwrite,
  traceStart,
  traceEnd
);

if (expired.length > 0) {
  this.log(messages.getMessage('statusExpiredTraces', [expired.length]));
  for (const id of expired) {
    this.log(`  - ${id}`);
  }
}
```

### 3. Message Additions

**File:** `src/commands/log/messages/log.trace.json`

**New messages:**
```json
{
  "statusExpiredTraces": "Stopped {0} overlapping trace flag(s):",
  "statusOverlapDetected": "Found {0} overlapping trace flag(s) for user {1}",
  "errorMultipleTraces": "User has {0} active trace flag(s). Use --overwrite to expire them all."
}
```

## What NOT to Add

| Technology | Why NOT | What Use Instead |
|-----------|---------|-----------------|
| **moment.js** | Deprecated, large bundle (67KB). Too heavyweight for simple date comparison. | Native Date object + custom overlap function |
| **Temporal API polyfill** | TC39 Temporal is stage 3, not stable. Adds complexity for future-proofing that won't be needed soon. | Native Date (stable, available) |
| **GraphQL (via `@apollo/client`)** | Salesforce Tooling API is REST-only. GraphQL doesn't apply. | Continue using jsforce REST client |
| **Bull queue / RxJS** | Overlapping trace detection is synchronous query + single batch update. No async queue/concurrency needed. | Sequential jsforce calls (already proven in v1.0) |
| **SQL-like ORM** | Salesforce org IS the database. jsforce queries are already optimized and Salesforce-native. | Stay with jsforce SOQL queries |
| **Custom timezone library** | Single org context. Salesforce always returns UTC timestamps. No timezone conversion needed. | Native Date (UTC by default in JS) |

## Versions: Confidence & Recency

| Library/Feature | Version/Status | Source | Confidence |
|-----------------|--------|--------|-----------|
| **jsforce multi-record CRUD** | v1.9+ (automatic SObject Collection API) | JSforce blog (2018), confirmed in npm package.json | HIGH |
| **Salesforce Tooling API** | Current (composite requests, batch update) | Salesforce Developer Docs (Spring '26) | HIGH |
| **Native Date** | Always available in Node.js 18+ | Node.js LTS | HIGH |
| **SOQL datetime comparison** | ISO 8601 format, standard across all API versions | Salesforce SOQL reference | HIGH |

## Migration from v1.0

No breaking changes to existing stack. This is **purely additive**:

1. **Old function name** (`checkExistingTraceFlag`) → **New function name** (`checkAndExpireOverlappingTraceFlags`)
   - Update call site in `trace.ts`
   - Add new utility functions (`detectOverlappingTraceFlags`, `rangesOverlap`) to `trace-helper.ts`

2. **No package.json changes needed**
   - jsforce already supports multi-record CRUD
   - No new npm dependencies

3. **Type safety maintained**
   - New functions are fully typed
   - SOQL result types align with existing patterns

## Key API Patterns Employed

### Pattern: Overlap Detection via SOQL WHERE Clause

**Why not return to client and filter?**
- Salesforce query is more efficient (server-side filtering)
- Returns only overlapping records (smaller payload)
- Reduces client-side processing

**Why ISO 8601 in WHERE clause?**
- Salesforce Tooling API standard format
- jsforce passes it through unchanged
- No timezone conversion needed (UTC implicit)

### Pattern: Batch Update via jsforce Multi-Record CRUD

**Why not loop and update individually?**
- Single API call vs. N calls
- SObject Collection API (REST) vs. individual PATCH requests
- Already supported by jsforce (no additional code)

**Error handling:**
- `allOrNone: false` = partial success OK (some traces expire, others fail → acceptable for overlapping cleanup)
- Alternative: `allOrNone: true` = all-or-nothing (rollback if any fails → stricter, but less forgiving)

## Summary

**Stack additions for overlapping trace flag handling:**

| Component | Type | Effort | Risk |
|-----------|------|--------|------|
| Overlap detection query | SOQL WHERE clause + jsforce | **Minimal** (5 lines SOQL) | **Low** (proven API pattern) |
| Batch expiry update | jsforce multi-record CRUD | **Minimal** (built-in, no config) | **Low** (jsforce v1.9+ standard) |
| Overlap algorithm | Utility function (TypeScript) | **Trivial** (simple comparison) | **None** (no dependencies) |
| Message display | JSON keys + trace.ts integration | **Low** (template pattern) | **None** (existing pattern) |

**New dependencies: ZERO**

**Type changes: Minimal** (function signature + return type)

**Backward compatibility: Maintained** (old code path removed, new path handles all cases)

## Sources

- [jsforce 1.9 Multi-Record CRUD with SObject Collection API](https://jsforce.github.io/blog/posts/20180726-jsforce19-features.html)
- [Salesforce Tooling API — Update Multiple Records (SObject Collections)](https://developer.salesforce.com/docs/atlas.en-us.api_tooling.meta/api_tooling/tooling_resources_composite_sobjects_collections_update.htm)
- [Salesforce Tooling API — Composite Request Performance](https://developer.salesforce.com/docs/atlas.en-us.api_tooling.meta/api_tooling/tooling_resources_composite_composite.htm)
- [Salesforce SOQL DateTime Format Reference](https://developer.salesforce.com/docs/atlas.en-us.soql_sosl.meta/soql_sosl/sforce_api_calls_soql_select_dateformats.htm)
- [Overlapping Date Ranges Algorithm (Dev Community)](https://dev.to/dmtrkovalenko/you-might-not-need-date-fns-23f7)
- [jsforce Guide: CRUD Operations in Node.js](https://hicglobalsolutions.com/blog/crud-operations-in-nodejs-with-jsforce/)
