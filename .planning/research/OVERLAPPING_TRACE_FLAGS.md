# Domain Pitfalls: Overlapping Trace Flag Handling

**Domain:** Salesforce Debug Log CLI Plugin — Overlapping Trace Flag Detection and Expiration
**Researched:** 2026-06-01
**Milestone:** v1.1 Overlapping Trace Flag Handling
**Confidence:** MEDIUM (multiple sources, some areas lack official spec clarity)

This document supplements the general PITFALLS.md with specific pitfalls encountered when adding overlapping trace flag detection and automatic expiration to an existing Salesforce debug logging tool.

---

## Critical Pitfalls

Mistakes that cause rewrites, data loss, or broken user workflows.

### Pitfall 1: User Context Mismatch During Trace Flag Deletion

**What goes wrong:**
When a trace flag is created by one user (User A) and an attempt is made to delete or update it via a different user context (User B) — such as a service account, admin, or CLI process running under different authentication — the trace flag remains cached in Salesforce's system. Subsequent queries via Tooling API return no results, but the old trace flag continues to live in cache and may continue logging, blocking new trace flag creation with "entity already being traced" errors.

**Why it happens:**
Salesforce caches trace flags at the user context level. Deletion only works if the original context user (the user who created the flag) performs the deletion. This is a known Salesforce platform behavior documented in their official issue tracker.

**Consequences:**
- New trace flags fail to create because the old (cached but "invisible") flag still blocks the entity
- CLI commands appear to work (no error on deletion) but the old flag persists
- Users encounter "entity already being traced" errors with no visible trace flag in the Developer Console or API queries
- Requires manual cleanup via Developer Console by the original trace flag creator, or full cache flush (varies by org state)
- User experience degradation: apparent plugin bug when system is actually working as designed

**Prevention:**
1. **Always query for existing trace flags BEFORE expiring them** — verify the creator user ID
2. **Store the original creator user ID** when a trace flag is created, and prefer updating (setting EndTime) rather than deleting if creators differ
3. **Add a pre-flight check** that queries for active trace flags for the target entity and surfaces the creator user ID in logs
4. **Use soft expiration by default:**
   - Set EndTime on old flag to NOW (update, not delete) — this works across user contexts
   - Wait 2-3 seconds for cache propagation
   - Then create the new flag
   - Only delete if update fails or subsequent queries show the flag persists
5. **Document in CLI output** which user created the existing flag (e.g., "Trace flag created by admin@example.com")

**Detection:**
- Trace flag query returns empty but "entity already being traced" error occurs on new flag creation
- Admin reports flags visible in Developer Console but not deletable via API
- Same user ID appears in multiple trace flag creation attempts for same entity within seconds
- Pattern: "expired flag" message followed immediately by "entity already being traced" error

**Integration with existing code:**
The plugin currently likely does not track which user created each trace flag. When adding overlapping trace flag handling:
1. Store trace flag metadata (Id, creator UserId, creation timestamp, debug level) for each session
2. Refactor delete operations to check creator context; prefer update (EndTime) over delete
3. Add a state tracking layer that persists across invocations if the CLI session spans multiple commands

**Code Pattern to Avoid:**
```typescript
// BAD: assumes delete works regardless of creator
const traceFlagId = getExistingTraceFlagId(userId);
await org.getConnection().tooling.delete('TraceFlag', traceFlagId);
// If Creator !== org user, flag remains cached and blocks next create
```

**Code Pattern to Use:**
```typescript
// GOOD: soft expiration with fallback to delete
const flag = await queryTraceFlagForUser(userId);
if (flag) {
  try {
    // Try soft expiration first (works across user contexts)
    await org.getConnection().tooling.update('TraceFlag', {
      Id: flag.Id,
      EndTime: new Date().toISOString()
    });
    
    // Verify the update took effect
    const updated = await queryTraceFlagForUser(userId);
    if (updated && updated.EndTime < NOW) {
      log(`Flag soft-expired. Creator: ${flag.CreatedBy.Name}`);
    } else {
      // If update didn't work, try delete as fallback
      await org.getConnection().tooling.delete('TraceFlag', flag.Id);
    }
  } catch (error) {
    log.warn(`Could not expire flag. Creator: ${flag.CreatedBy.Name}. Manual cleanup may be needed.`);
    throw error;
  }
}
```

---

### Pitfall 2: Race Condition Between Query and Create

**What goes wrong:**
The plugin queries for existing trace flags, decides to expire the old one, then attempts to create a new one. Between the query and create operations, another process (user opening Developer Console, another CLI invocation, scheduled job, webhook) creates a new trace flag. The plugin's create fails with "entity already being traced," but the error handling doesn't account for this newly created flag.

**Why it happens:**
Salesforce has eventual consistency in parts of its platform. The Tooling API doesn't provide transaction isolation at the level of "query trace flag + create trace flag as atomic." Two concurrent processes can both see "no conflicting flag exists" and both attempt creation.

**Consequences:**
- Plugin crashes or reports misleading error (says old flag exists, but it's actually a new one created during the operation)
- User is confused about which trace flag is active
- Retry logic may create duplicate flags or cause cascading failures
- Plugin state becomes inconsistent with actual org state
- In high-volume scenarios, multiple concurrent CLI invocations compound this issue

**Prevention:**
1. **Use composite Tooling API requests** — bundle the query and create (or update) into a single composite request to reduce the time window between operations
   - Salesforce Tooling API supports composite requests: query in subrequest 1, create in subrequest 2
   - If subrequest 1 returns existing flag, subrequest 2 can skip or adapt based on result
2. **Add exponential backoff retry logic** with jitter (50ms + 2^attempt * 100ms) when encountering "entity already being traced"
3. **On "entity already being traced" conflict:**
   - Re-query to determine which user/process created the new flag
   - If from the same user context, treat as success (flag is there, user can proceed)
   - If from different user, expire it and retry
   - Implement max 3 retries; then fail gracefully with clear message
4. **Implement idempotency** — if creating a trace flag fails due to conflict and the new flag is from the same user/context and has compatible settings, treat it as success
5. **Add a short delay (100-500ms) after expiring** the old flag before creating the new one, allowing cache propagation (in addition to composite requests)
6. **Log the exact timestamp and details** of the conflicting flag for debugging

**Detection:**
- "Entity already being traced" error occurs within 2 seconds of "expired old trace flag" log message
- Plugin retry loop runs 3+ times for a single operation
- Org shows multiple trace flags for the same user with overlapping dates and different debug levels
- Race condition happens intermittently, hard to reproduce consistently

**Integration with existing code:**
Current code likely does not implement composite requests. When adding overlap handling:
1. Refactor the trace flag query-and-create sequence into a single Tooling API composite request call
2. Check if `@salesforce/core` or underlying JSforce provides composite request support
3. If not, implement composite request manually via REST API calls
4. Add a flag-level retry wrapper that detects the "entity already being traced" message and retries with exponential backoff

**Code Pattern to Use:**
```typescript
// GOOD: use composite request to atomically query + create
const compositeRequest = {
  allOrNone: false,
  compositeRequest: [
    {
      method: 'GET',
      url: `/services/data/v60.0/tooling/query?q=SELECT+Id,+EndTime+FROM+TraceFlag+WHERE+TracedEntityId='${userId}'`,
      referenceId: 'queryExisting'
    },
    {
      method: 'POST',
      url: '/services/data/v60.0/tooling/sobjects/TraceFlag',
      body: {
        TracedEntityId: userId,
        DebugLevelId: debugLevelId,
        StartTime: new Date().toISOString(),
        EndTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      },
      referenceId: 'createNew'
    }
  ]
};

try {
  const results = await org.getConnection().request({
    method: 'POST',
    url: '/services/data/v60.0/composite',
    body: compositeRequest
  });
  
  // Process both responses atomically
  if (results.compositeResponse[0].body.records.length > 0) {
    // Old flag exists; expire it
  }
  // New flag created in subrequest 2
} catch (error) {
  if (error.message.includes('entity already being traced')) {
    // Retry with exponential backoff
    await retryWithBackoff(...)
  }
}
```

---

### Pitfall 3: Expiration Date/Time Zone Mismatch

**What goes wrong:**
The plugin sets the `EndTime` (or `ExpirationDate`) on a trace flag to "now" to expire it. However, the value sent differs from what Salesforce expects due to time zone mismatch. The plugin sends local time; Salesforce interprets it in org time zone; the trace flag doesn't actually expire, or expires too early/late.

Additionally, a documented Salesforce issue exists where expired TraceFlag values are not honored — the system continues using the expired flag's debug level settings instead of switching to defaults.

**Why it happens:**
- Salesforce stores DateTime values in GMT internally but displays them in the org's configured time zone in the UI
- When setting `EndTime` via Tooling API, the value must be a DateTime object in UTC/GMT or it will be misinterpreted by Salesforce's parsing
- The plugin may construct the time in local JavaScript Date format without converting to ISO 8601 UTC
- Salesforce's trace flag expiration logic is not always reliable — a documented issue shows expired flags continuing to be used (likely a Salesforce bug)

**Consequences:**
- Old trace flag never expires; continues logging indefinitely and blocks new flags
- New trace flag creation fails with "entity already being traced"
- Storage quota fills up with logs from the "zombie" expired flag
- Debug level settings from the old flag leak into new sessions (expired flag still applied)
- Users in different time zones have different behavior (inconsistent across regions)
- Difficult to debug because the flag appears "expired" in a query but is functionally active

**Prevention:**
1. **Always use UTC/GMT for all DateTime values** — construct with `new Date(Date.now()).toISOString()` (always produces UTC)
2. **Pass DateTime as string in ISO 8601 format** to the Tooling API (e.g., `2026-06-01T15:30:00.000Z`)
3. **Explicitly set both StartTime and EndTime** — do not rely on defaults or implicit times
4. **Verify the update** — immediately after setting EndTime, query the flag to confirm the value was set and stored correctly by Salesforce
5. **Implement a workaround for the Salesforce expiration bug:**
   - After setting EndTime, do not assume the flag is expired
   - Wait 2-3 seconds for the update to propagate through Salesforce's systems
   - Query for the flag again
   - If it still exists and EndTime < NOW (in UTC), delete it explicitly rather than relying on automatic expiration
   - Only mark flag as "expired" once a subsequent query confirms it's gone or EndTime has passed
6. **Log the exact DateTime values** (both local and UTC, and the Salesforce-confirmed value) sent to Salesforce and what was confirmed in the response
7. **Test with orgs in different time zones** to catch these issues early (run same test suite in US/Eastern, Asia/Tokyo, Europe/London)

**Detection:**
- Trace flag shows `EndTime` in the future or far in the past (e.g., shows 2026-06-01T15:30 but expected 2026-06-01T16:30)
- "Entity already being traced" persists even after user manually deletes the flag in Developer Console
- Logs from old debug level appear in new sessions 5+ seconds after "expiring" the flag
- Behavior differs between users in different time zones
- A flag with EndTime in the past still exists when queried

**Integration with existing code:**
The plugin likely uses JavaScript's `Date` object without explicit UTC conversion. When implementing expiration:
1. Add a utility module with DateTime conversion functions:
   ```typescript
   export function toSalesforceUTC(date: Date): string {
     return date.toISOString(); // Always produces UTC format (Z suffix)
   }
   
   export function nowUTC(): string {
     return new Date(Date.now()).toISOString();
   }
   ```
2. Use these consistently for all EndTime/ExpirationDate values
3. Audit all places where `Date.now()` is used to ensure they're converted to ISO 8601 before sending to Salesforce
4. Add a verification query after every EndTime update to confirm the value Salesforce stored

---

### Pitfall 4: Expired Flag Caching in Salesforce Platform

**What goes wrong:**
The plugin sets EndTime on a trace flag, but Salesforce continues to apply the trace flag's debug level settings for 10+ seconds after the EndTime passes. This is a known Salesforce platform bug where expired trace flags remain active in cache.

**Why it happens:**
Salesforce's trace flag evaluation cache does not immediately reflect expiration. The platform likely caches the trace flag state for performance reasons, and the cache is not invalidated immediately when EndTime is reached. This is a platform limitation, not a plugin bug.

**Consequences:**
- User initiates a trace 30 seconds after old flag's EndTime, but the old flag's debug level continues to be applied
- Wrong debug level used, capturing incorrect log details or missing details
- Difficult to diagnose because the flag appears expired in queries but is functionally active
- Storage quota fills by unintended high-volume logging from high debug levels
- User sees debug logs from the "old" trace level even though they explicitly created a new flag

**Prevention:**
1. **Do not rely on EndTime alone for immediate expiration** — treat it as a "soft" expiration with cache lag
2. **After setting EndTime, explicitly delete the trace flag** if possible (see Pitfall #1 for user context concerns)
3. **Build a safety window:** After expiring a flag, wait 5-10 seconds before creating the new one to allow Salesforce's platform cache to clear
   - This is acceptable because trace flag creation is not time-critical (user is already debugging, can wait 10 seconds)
   - Document: "Preparing new trace session... (may take 10 seconds)"
4. **Monitor the actual debug logs produced** — if they don't match the expected debug level for a new flag, suspect cache lag and inform user
5. **Document this behavior to users** — "Trace flags expire with a 10-second platform delay. If you see old-level logs after switching, wait a moment before analyzing."
6. **Consider using composite requests** that bundle delete + create to minimize the window where the old flag is cached but marked expired
7. **For high-security scenarios**, implement a "pause" in logging: set EndTime, wait 10s, then create new flag with a 10s StartTime delay to ensure no overlap

**Detection:**
- Logs appear from old debug level (e.g., FINEST) even though new flag uses (e.g., ERROR)
- "Entity already being traced" occurs 5+ seconds after setting EndTime
- Org behavior differs between test (immediate expiration) and production (delayed)
- User reports "I switched debug levels but the logs still show the old level"

**Integration with existing code:**
The plugin's error handling must account for cache lag. When a "new" trace flag operation encounters "entity already being traced," the conflict may be the old flag that was "already marked expired." Add retry logic with exponential backoff that accounts for cache propagation delays:

```typescript
async function createTraceFlagWithCacheLag(userId: string, debugLevelId: string, maxRetries = 3) {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Wait before retry (first attempt: 0ms, then 5s, 15s)
      if (attempt > 0) {
        const waitMs = attempt === 1 ? 5000 : 15000;
        log.info(`Waiting ${waitMs}ms for cache propagation before retry ${attempt}...`);
        await new Promise(resolve => setTimeout(resolve, waitMs));
      }
      
      const flag = await org.getConnection().tooling.create('TraceFlag', {
        TracedEntityId: userId,
        DebugLevelId: debugLevelId,
        StartTime: new Date().toISOString(),
        EndTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      });
      
      return flag;
    } catch (error) {
      lastError = error;
      if (!error.message.includes('entity already being traced')) {
        throw error; // Not a cache lag issue, fail immediately
      }
      // Otherwise, retry
    }
  }
  
  throw lastError || new Error('Failed to create trace flag after retries');
}
```

---

### Pitfall 5: Storage Quota Exhaustion During Overlapping Transitions

**What goes wrong:**
During the overlap between expiring an old trace flag and creating a new one, both flags are active and capturing logs. If the org is close to the 1GB debug log storage limit, both flags contribute to the quota, and the org hits the limit mid-operation. Salesforce then blocks ALL trace flag creation until storage is freed.

**Why it happens:**
The plugin intentionally creates an overlap to transition cleanly (expire old, create new). But Salesforce has a strict 1GB total limit across all debug logs. If the old flag is still active while the new one starts, both are generating logs simultaneously. In high-volume scenarios (1000s logs/minute), this can be a massive problem.

**Consequences:**
- Plugin creates new trace flag, but logs are not captured because storage quota is exhausted
- Subsequent trace flag operations fail with "Storage limit exceeded" errors
- Admin must manually delete logs before debugging can resume
- High-volume debugging scenarios (1000s logs/minute) hit this limit within seconds of overlap
- User experience: "trace flag created successfully" but no logs captured, confusing

**Prevention:**
1. **Check storage quota BEFORE attempting overlap transition:**
   ```typescript
   const limits = await org.getConnection().limits();
   const debugLogStorageUsed = limits.DebugLog?.used || 0;
   const debugLogStorageMax = limits.DebugLog?.max || 1000; // 1GB in MB
   const percentUsed = (debugLogStorageUsed / debugLogStorageMax) * 100;
   ```
2. **If storage is above 80% capacity:**
   - Do NOT attempt to overlap
   - Delete the old flag immediately without creating new one
   - Warn user and ask them to purge logs before trying again
3. **If storage is above 95% capacity:**
   - Block the operation entirely
   - Force user to manually purge logs before allowing new traces
   - Show clear message: "Debug log storage quota is exhausted. Run `sf logs delete` to free space before starting new traces."
4. **Implement pre-emptive cleanup:**
   - Before creating a new trace flag, scan for and delete expired trace flags (ones with EndTime < NOW)
   - Delete oldest debug log files to free quota
   - Implement configurable auto-cleanup: `--auto-cleanup-after-days 7`
5. **Add warnings to the CLI output:**
   - At 80%: "Debug storage at 85% — recommend purging old logs before starting new traces"
   - At 95%: "Cannot create trace flag — storage quota exhausted. Run `sf logs delete` to clear space."
6. **Respect org limits from `/limits` endpoint** — do not attempt operations if at capacity
7. **For high-volume orgs**, consider aggressive overlap prevention:
   - Instead of overlapping, delete old flag, wait for logs to propagate (2-3 seconds), then create new flag
   - Trade: slightly larger gap in logging but guaranteed no quota overrun

**Detection:**
- "Storage limit exceeded" error during trace flag creation
- Storage usage jumps 10MB+ during overlap period
- Plugin behavior differs in high-volume orgs (near limit) vs. fresh orgs
- Admin reports "logs not captured after trace started"

**Integration with existing code:**
The plugin should already have a limits-checking module for storage (or inherit from earlier phases). Before implementing overlap transitions:
1. Ensure the storage quota check is called and logged at the start of any trace flag operation
2. Block operations at 80%+ usage with a clear, actionable error message
3. Consider adding a `--force` flag to allow admin to bypass quota checks if they've manually freed space
4. This may require refactoring the trace flag creation flow to be quota-aware and to fail gracefully before attempting the overlap transition

---

## Moderate Pitfalls

Issues that cause wrong behavior but don't necessarily require a full rewrite to fix.

### Pitfall 6: Multiple Concurrent Trace Flags for the Same User

**What goes wrong:**
The plugin does not check for ALL existing trace flags — only the most recent one or the first result. If the org has 2+ trace flags for the same user with overlapping dates (from manual admin actions, automated systems, or previous plugin runs), the plugin expires one but the other persists, and the new flag creation still fails.

**Why it happens:**
The plugin's query for existing flags may be incorrectly scoped (e.g., using `LIMIT 1` or sorting incorrectly) rather than fetching all conflicting flags. Manual admin actions, scheduled jobs, or previous plugin runs may have left multiple orphaned flags.

**Prevention:**
1. **Query for ALL trace flags with overlapping date ranges** — do not use `LIMIT 1`
2. **Filter by:** 
   - TracedEntityId (the target user)
   - StartTime and EndTime overlap with the planned new flag time window
3. **SOQL query example:**
   ```soql
   SELECT Id, TracedEntityId, StartTime, EndTime, DebugLevelId, CreatedBy.Name
   FROM TraceFlag
   WHERE TracedEntityId = '[targetUserId]'
   AND EndTime >= :nowMinus24Hours
   AND StartTime <= :nowPlus24Hours
   ORDER BY CreatedDate DESC
   ```
   (No LIMIT clause; fetch all results with pagination if needed)
4. **Process all conflicting flags:**
   - Log how many flags were found
   - Expire or delete each one
   - Verify they're gone with a follow-up query before creating the new one
5. **Log how many flags were expired** for audit trail and debugging

**Detection:**
- "Entity already being traced" persists after CLI reports "expired old trace flag"
- Developer Console shows 2+ trace flags for the same user
- Multiple failed trace flag creation attempts in a row (should only need 1-2 retries)

---

### Pitfall 7: DebugLevel Not Found or Mismatched

**What goes wrong:**
The plugin creates a trace flag with a specific DebugLevel (e.g., "SFDC_DevConsole" or a custom level). If that DebugLevel does not exist in the org (deleted or org is in a different state), the create fails with a cryptic error, or the wrong debug level is applied.

**Why it happens:**
Custom DebugLevels can be deleted by admins. Some DebugLevels are only available in certain org types. The plugin assumes a DebugLevel exists without validating it first.

**Prevention:**
1. **Query for available DebugLevels** before creating a trace flag
2. **Fall back to a known-safe default** (e.g., "SFDC_DevConsole" which exists in all orgs) if the desired level is not found
3. **Log which DebugLevel was selected and why** for debugging
4. **Allow users to specify DebugLevel via flag** (v2+ feature) with validation

**Detection:**
- "DebugLevel not found" or "Invalid DebugLevel ID" error
- Trace flag creates but with unexpected debug level
- Org with custom DebugLevels behaves differently than standard orgs

---

### Pitfall 8: Permissions and "View All Data" Requirement

**What goes wrong:**
The plugin user account (the one running the CLI command) does not have the "View All Data" permission required by the Tooling API. Queries and updates to TraceFlag objects silently fail, return empty results, or fail with "Insufficient permissions" errors.

**Why it happens:**
The plugin assumes the authenticated user (from `Flags.requiredOrg()`) has adequate permissions. Some orgs restrict Tooling API access to specific profiles. Service accounts may not have "View All Data" assigned.

**Prevention:**
1. **Check permissions at the start of the trace flag operation:**
   ```typescript
   const userPerms = await org.getConnection().query(
     "SELECT PermissionsViewAllData FROM PermissionSet WHERE AssigneeId = :userId"
   );
   if (!userPerms.records[0]?.PermissionsViewAllData) {
     throw new Error("Your user account does not have 'View All Data' permission...");
   }
   ```
2. **Fail fast with a clear error message:**
   "Your user account does not have 'View All Data' permission. Contact your Salesforce admin to enable Tooling API access."
3. **Provide a troubleshooting link** in CLI output and documentation
4. **Log the authenticated user ID and org ID** for support escalation

**Detection:**
- Tooling API queries return no results (empty array) but no error
- Trace flag create fails with "Cannot update record [Id]" or "INVALID_FIELD"
- Same command works for some users but not others
- Admin can manually create flags, but plugin cannot

---

## Minor Pitfalls

Issues that degrade UX but are easier to fix.

### Pitfall 9: Unclear CLI Output During Overlap Transitions

**What goes wrong:**
The plugin expires an old trace flag and creates a new one, but the CLI output is not clear about what happened. User sees "Trace flag created" but doesn't understand that an old one was cleaned up, or the timing of when the transition occurred.

**Prevention:**
1. **Use clear, sequential log messages with progress indicators:**
   ```
   → Checking for existing trace flags...
   ✓ Found trace flag created by user@example.com (expires in 23:45:00)
   → Expiring old trace flag...
   ✓ Old trace flag expired (EndTime set to 2026-06-01T15:30:45Z)
   → Waiting for cache propagation (5 seconds)...
   ✓ Cache cleared
   → Creating new trace flag...
   ✓ New trace flag created (Id: 7xx..., expires in 24:00:00)
   ```
2. **Include metadata:** 
   - Who created the old flag (user name)
   - Exact expiration times (both relative and absolute)
   - Debug level used for new flag
   - Trace ID for reference
3. **Add a wait spinner** during the cache propagation window to show the system is waiting for Salesforce to catch up

---

### Pitfall 10: Insufficient Logging for Debugging Cache Issues

**What goes wrong:**
When a cache or race condition issue occurs, the plugin has not logged enough information for troubleshooting. Debug lines include neither timestamp nor details about the trace flag state at each step.

**Prevention:**
1. **Log at every step of the trace flag lifecycle:**
   - Query execution (query, filters, results count)
   - Expiration (old ID, EndTime value set, confirmation query result)
   - Creation (new ID, DebugLevel used, dates)
   - Cache wait (duration, polling interval)
2. **Include in logs:**
   - User ID, org ID, trace flag IDs (old and new)
   - Exact DateTime values (both local and UTC)
   - Response status codes from Tooling API
   - Duration of each operation
3. **Use structured logging format with timestamps:**
   ```
   [2026-06-01T15:30:45.123Z] Query for existing flags: userId=005xx000..., window=2026-06-01T15:30Z to 2026-06-02T15:30Z
   [2026-06-01T15:30:45.456Z] Query result: found=1, firstFlagId=7xx11000000NNqAAM, creator=005xx000..., endTime=2026-06-02T14:00Z
   [2026-06-01T15:30:45.789Z] Updating flag 7xx11000000NNqAAM: setting EndTime=2026-06-01T15:30:45Z (UTC)
   [2026-06-01T15:30:46.012Z] Update confirmed: flag now shows EndTime=2026-06-01T15:30:45Z
   [2026-06-01T15:30:46.500Z] Waiting 5000ms for cache propagation...
   [2026-06-01T15:30:51.012Z] Cache wait complete. Creating new flag.
   [2026-06-01T15:30:51.234Z] Creating TraceFlag: userId=005xx000..., debugLevel=SFDC_DevConsole
   [2026-06-01T15:30:51.567Z] Create successful: new flagId=7xx11000000OOsAAM
   ```

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation | Priority |
|-------------|---------------|-----------|----------|
| Overlap detection logic | User context mismatch (Pitfall #1) + race condition (Pitfall #2) | Implement composite Tooling API requests; store trace flag creator metadata; soft expiration via EndTime update | HIGH |
| Expiration implementation | EndTime/timezone mismatch (Pitfall #3) + cache lag (Pitfall #4) | Always use UTC; verify updates; implement explicit delete fallback; add 5-10s cache wait delays between expire and create | HIGH |
| Storage quota awareness | Storage exhaustion during overlap (Pitfall #5) | Query storage limits before transition; block if >80% full; warn user at 85%+ | MEDIUM |
| Query logic | Multiple overlapping flags (Pitfall #6) | Fetch all flags in date range without LIMIT; process all matches | MEDIUM |
| DebugLevel selection | DebugLevel not found (Pitfall #7) | Query available DebugLevels first; fall back to SFDC_DevConsole | LOW |
| Permissions | "View All Data" required (Pitfall #8) | Check permissions upfront; fail fast with clear message | MEDIUM |
| CLI UX | Unclear output (Pitfall #9) + insufficient logging (Pitfall #10) | Structured logging with timestamps; sequential CLI output; metadata in every message | LOW |

---

## Integration Concerns with Existing Plugin Code

### 1. **Org Connection Layer**
The plugin's current `org.getConnection()` pattern works for simple queries and creates. When implementing overlap handling:
- **Change needed:** Refactor to use composite Tooling API requests (batch query + create in single call)
- **Impact:** May require changes to how `org.getConnection()` is wrapped if custom batching is not exposed
- **Reference:** Check if `@salesforce/core` provides JSforce Connection composite request support; if not, use REST API directly

### 2. **Error Handling**
Current error handling likely catches generic Tooling API errors. When overlaps are added:
- **Change needed:** Add specific handlers for "entity already being traced", storage limit, and permission errors
- **Impact:** Error messages must distinguish between "transient race condition (retry)" and "permanent permission issue (abort)"
- **Current gap:** Plugin may not have retry logic or exponential backoff for transient failures

### 3. **State Tracking**
The plugin tracks downloaded logs but may not track trace flag state:
- **Change needed:** Store trace flag IDs, creation timestamps, and creator user IDs for each session
- **Impact:** CLI output, debugging, potential future features (show user which flags were created by the plugin)
- **Future-proof:** Consider a lightweight state file or cache for trace flag metadata; consider persisting across CLI sessions

### 4. **Time Handling**
The plugin likely uses JavaScript `Date` objects without explicit UTC conversion:
- **Change needed:** Add utility functions for DateTime conversion to ensure all Salesforce API calls use ISO 8601 UTC
- **Impact:** May require audit of all places where `Date.now()` is used in the context of Salesforce API calls
- **Test case:** Run in different time zones to verify no drift; test with orgs in non-US time zones

### 5. **CLI Messaging**
Current messages may be terse (e.g., "Trace flag created"). When overlap handling is added:
- **Change needed:** Add sequential, detailed logging of each step (query → expire → wait → create)
- **Impact:** More verbose output, but necessary for diagnosing cache issues
- **Config:** Consider a `--verbose` flag to show extra trace flag metadata

### 6. **Performance Considerations**
High-volume scenarios (1000s logs/minute) may stress the overlap transition:
- **Risk:** Overlapping period generates too many logs, hitting 1GB quota
- **Change needed:** Implement pre-flight storage quota check and adaptive delays during overlap
- **Testing:** Load test with org at 90%+ storage capacity to ensure graceful degradation

---

## Summary

The most critical pitfalls to address in the overlap handling phase are:

1. **User context mismatch** — requires careful understanding of how Salesforce caches trace flags; soft expiration (EndTime) preferred over delete
2. **Race conditions** — requires composite request batching and retry logic with exponential backoff
3. **Time zone mishandling** — requires systematic UTC conversion via utility functions
4. **Storage quota exhaustion** — requires pre-flight checks and quota awareness before attempting overlap

Moderate pitfalls (multiple overlapping flags, DebugLevel validation, permissions) are more straightforward to handle with upfront validation and all-flags querying. Minor pitfalls (logging, CLI output) improve debuggability but don't block core functionality.

**Recommended approach:** 
- **v1.1 MVP:** Address HIGH-priority pitfalls (context mismatch, race conditions, timezone, storage) in the initial overlapping trace flag feature
- **v1.1+ (polish):** MEDIUM and LOW pitfalls can be addressed in follow-up improvements or when issues surface in beta testing
- **Testing:** Load test against real high-volume orgs (or simulated high-volume scenarios) to catch edge cases early

---

## Sources

- [Best practices for using debug logs with trace flags in Salesforce](https://help.salesforce.com/s/articleView?id=000395769&language=en_US&type=1)
- [Bulk delete trace flags through Developer Console](https://help.salesforce.com/s/articleView?id=000387868&language=en_US&type=1)
- [TraceFlag | Tooling API | Salesforce Developers](https://developer.salesforce.com/docs/atlas.en-us.api_tooling.meta/api_tooling/tooling_api_objects_traceflag.htm)
- [Trace Flags may remain cached if they are not deleted by the context user](https://trailblazer.salesforce.com/issues_view?id=a1p300000008XibAAE&title=trace-flags-may-remain-cached-if-they-are-not-deleted-by-the-context-user)
- [An Admin's Guide to Debug Logs in Salesforce | Salesforce Ben](https://www.salesforceben.com/an-admins-guide-to-debug-logs-in-salesforce/)
- [Debug Logs + Trace Flags: How to See the Whole Story | by Shirley Peng | Medium](https://medium.com/@shirley_peng/debug-logs-trace-flags-the-whole-story-55d7789aa0af)
- [Cannot Create a Debug Log: Error Occurs re Active Trace Flag](https://community.servicemax.com/s/article/Cannot-create-a-Debug-Log)
- [ERROR: Could not create Trace Flags — entity already being traced (GitHub issue)](https://github.com/joeferraro/MavensMate-SublimeText/issues/850)
- [What every Salesforce developer should know about Dates and Times in Apex | Medium](https://medium.com/salesforce-zolo/what-every-salesforce-developer-should-know-about-dates-and-times-in-apex-d49bc0a116d4)
- [Expired Apex debug log TraceFlag values are still being used and can cause performance issues](https://trailblazer.salesforce.com/issues_view?id=a1p30000000T5U9AAK)
- [Salesforce Supported Time Zones](https://help.salesforce.com/s/articleView?id=sf.admin_supported_timezone.htm&type=5&language=en_US)
- [Turn on apex debug log creating trace flag with name set to random user](https://github.com/forcedotcom/salesforcedx-vscode/issues/1285)
- [Debugging Tips For Salesforce CLI | Medium](https://medium.com/@mohitkumarsrivastav/debugging-tips-for-salesforce-cli-305ca89989b5)
- [Apex: SFDC Execute Anonymous fails unless tracing DebugLevel is used](https://github.com/forcedotcom/salesforcedx-vscode/issues/6969)
- [Store More and Larger Debug Logs | Salesforce Release Notes](https://help.salesforce.com/s/articleView?language=en_US&id=release-notes.rn_debugging_debug_logs.htm&release=220&type=5)
- [Transaction isolation level - Salesforce Developer Community](https://developer.salesforce.com/forums?id=906F000000090FHIAY)
- [Proactive Alert Monitoring: Concurrent API Errors](https://help.salesforce.com/s/articleView?id=000389067&language=en_US&type=1)
- [Salesforce Record Locking and Concurrency — Salesforce Things You should Know](https://www.dreaminforce.com/salesforce-record-locking-and-concurrency-salesforce-things-you-should-know/)
- [Salesforce — Avoid API Concurrent Limit | Medium](https://medium.com/@aayushi766/salesforce-avoid-api-concurrent-limit-d46e1af12c33)
- [Tooling API - Composite Request Body](https://developer.salesforce.com/docs/atlas.en-us.api_tooling.meta/api_tooling/tooling_requests_composite_composite.htm)
- [Turning on trace debugging with the Salesforce CLI](https://lekkimworld.com/2021/02/16/turning-on-trace-debugging-with-the-salesforce-cli/)
- [How to Use Debug Logs in Salesforce - Salesforce Geek](https://salesforcegeek.in/how-to-use-debug-logs-in-salesforce/)
- [Monitor the Apex Job Queue](https://help.salesforce.com/s/articleView?id=sf.code_apex_job.htm&type=5)
- [Troubleshoot Processes with Apex Debug Logs](https://help.salesforce.com/s/articleView?id=platform.process_troubleshoot_debuglogs.htm&type=5)
- [Apex Scheduler | Apex Developer Guide](https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_scheduler.htm)
- [Debug Log Order of Precedence](https://help.salesforce.com/s/articleView?id=platform.code_debug_log_precedence.htm&language=en_US&type=5)
- [Monitor Debug Logs](https://help.salesforce.com/s/articleView?id=sf.code_monitoring_debug_logs.htm&type=5)
- [Set Up Apex Class and Trigger Trace Flags](https://help.salesforce.com/s/articleView?id=platform.code_debug_log_classes_setup.htm&type=5)
- [Add a Trace Flag Entry for the Default Automated Process User | Platform Events Developer Guide](https://developer.salesforce.com/docs/atlas.en-us.platform_events.meta/platform_events/platform_events_subscribe_debug_autoproc.htm)
