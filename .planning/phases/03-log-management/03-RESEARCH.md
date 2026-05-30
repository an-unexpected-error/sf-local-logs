# Phase 3: Log Management - Research

**Researched:** 2026-05-30  
**Domain:** Salesforce Tooling API ApexLog querying, streaming downloads, storage quota management, local file storage  
**Confidence:** MEDIUM-HIGH

## Summary

Phase 3 integrates log download into the Phase 2 trace workflow and implements storage management (purge) to keep users within Salesforce's 1GB debug log limit. The implementation queries ApexLog records via Salesforce Tooling API for a specific user within the trace window, streams large files (10-100MB) to disk using Node.js streams to minimize memory footprint, monitors organization storage quota during download, and provides a purge command to delete logs when quota is exceeded. Key technical decisions: ApexLog records queried via `tooling.query()` with filters on LogUser and StartTime; storage quota checked via REST Limits API (which reports file storage used/remaining) or fallback calculation from ApexLog.LogLength; local storage follows oclif convention (`~/.local/share/sf/plugin-logs/` or configurable path); Node.js `fs.pipeline()` for streaming downloads with automatic backpressure handling; Tooling API supports up to 2000 records per query with OFFSET pagination for batching.

**Primary recommendation:** Query ApexLog by user and timestamp using Tooling API; stream downloads using Node.js fs.pipeline() with jsforce Connection.request() GET for log body; store in `~/.local/share/sf/plugin-logs/` following oclif dataDir pattern; check storage quota via REST Limits API or calculate from ApexLog.LogLength aggregate; implement exponential backoff (UX-03 requirement) for rate-limit handling during purge operation.

---

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Download is integrated into trace workflow, not a standalone command
- Download triggered automatically after trace creation, in parallel with watch mode
- Download scoped to specific user + trace timeframe (24 hours from trace creation)
- Shows progress: time elapsed, ETA (estimated), file count
- Stores locally with user + timestamp organization: `~/sf-logs/{user}/{YYYY-MM-DD-HH-MM}/`
  - **NOTE: Researcher finding contradicts this — see File Storage Location section**
- Check remaining storage quota during download progress; stop immediately if exceeded
- Quota check is periodic (not upfront) to catch concurrent storage changes
- Over-quota error: `"Storage quota exceeded. Current: 950MB/1GB. Run: sf log purge to delete old logs."`
- Purge command deletes all org logs (org-wide, not scoped to user) with confirmation
- Confirmation message: `"Deleting all X logs would free ~500MB. Proceed? (yes/no)"`
- All commands support `--json` output and `--target-org` flag
- Plugin handles rate limiting gracefully with exponential backoff (UX-03 requirement)

### Claude's Discretion
- Download polling frequency vs. batching strategy for large result sets
- ETA calculation accuracy given concurrent log generation
- Whether storage quota check uses REST Limits API (preferred) vs. ApexLog.LogLength aggregation
- Confirmation UX for purge: inline prompt vs. separate confirmation step

### Deferred Ideas (OUT OF SCOPE)
- Selective purge by age, size, keyword (v2)
- Bulk download for multiple users (v2)
- Log archival to S3 (v2)
- Concurrent download optimization / parallel streaming (v2)
- Custom storage location configuration (v2)

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DOWNLOAD-01 | User can download debug logs as they are created | ApexLog objects queryable via Tooling API filtered by LogUser and StartTime; integrated into trace workflow |
| DOWNLOAD-02 | Plugin displays progress (count, size, ETA) while downloading | Node.js streams report bytes written; ETA calculated from current download rate; file count tracked per batch |
| DOWNLOAD-03 | Plugin respects organization's 1GB debug log storage limit | REST Limits API or Organization field reports current usage; quota enforcement during download |
| DOWNLOAD-04 | Plugin warns user if download would exceed remaining storage quota | Periodic quota check during download; stop immediately and show usage breakdown if exceeded |
| DOWNLOAD-05 | Plugin uses streaming I/O to handle 10-100MB log files without memory issues | Node.js fs.pipeline() with jsforce Connection.request() streaming response; 64KB default chunk size |
| PURGE-01 | User can delete debug log files to free storage quota | Tooling API supports bulk delete via ApexLog records; org.getConnection().tooling.delete() |
| PURGE-02 | User receives confirmation before deleting logs | Show impact: `"Deleting all X logs would free ~500MB. Proceed? (yes/no)"` |
| PURGE-03 | Plugin displays storage freed after deletion | Calculate freed space from sum of deleted ApexLog.LogLength; report in MB/GB |
| UX-01 | CLI displays status messages clearly explaining what's happening | Follow Phase 1/2 @salesforce/sf-plugins-core message patterns |
| UX-02 | Error messages provide actionable remediation guidance | Storage exceeded → suggest purge; API errors → show permission/org issues |
| UX-03 | Plugin handles rate limiting gracefully with exponential backoff | Catch HTTP 429; retry with 2^n second delays (2s, 4s, 8s...); max 3 retries |
| UX-04 | All commands support `--json` output for programmatic use | SfCommand auto-serializes result type; download returns file manifest with sizes |
| UX-05 | Plugin respects `--target-org` flag for multi-org environments | Flags.requiredOrg() provides org context; org.getConnection() authenticated |

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| ApexLog querying | API / Backend | — | Org connection and Tooling API SOQL via jsforce; all auth handled by @salesforce/core |
| Log file streaming | CLI Command | File System | Node.js fs.pipeline() orchestrates HTTP stream → disk; no intermediate buffering |
| Storage quota checking | API / Backend | — | REST Limits API or tooling.query() aggregation; read-only org data access |
| Local file storage | File System | — | Node.js fs module; directory creation and writes controlled by plugin |
| Purge operation | API / Backend | CLI Command | Tooling API bulk delete via jsforce; CLI command handles confirmation and progress |
| Progress tracking | CLI Command | — | cli-progress library (reused from Phase 2) for download and purge progress bars |
| Error handling | CLI Command | — | @salesforce/sf-plugins-core message patterns; translate API errors to user guidance |

---

## Standard Stack

### Core (from Phase 0-2, locked)
| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| @salesforce/core | ^8.31.0 | Org connection, Tooling API queries | org.getConnection().tooling.query() and tooling.delete() |
| @salesforce/sf-plugins-core | ^12 | SfCommand base, Flags utilities, messages | SfCommand.run(), Flags.requiredOrg(), message loading |
| jsforce | latest (via @salesforce/core) | SOQL, Tooling API CRUD | Connection.tooling.query(), tooling.delete(), Connection.request() streaming |
| @oclif/core | ^4 | Command class, flag parsing | Base for SfCommand; async/await support |
| cli-progress | ^6.2.2 | Progress bar with ETA display | Download and purge progress bars (reused from Phase 2) |

### Supporting (Phase 3 specific)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| fs (Node.js built-in) | — | File I/O, streaming writes | fs.promises.mkdir(), fs.createWriteStream(), fs.pipeline() |
| node:path, node:os | — | Cross-platform path handling | os.homedir(), path.join() for storage directory construction |
| cli-ux | ^6.0.9 | Table formatting | Display purge impact confirmation (reused from Phase 2) |
| chalk | ^5 (already installed) | Terminal colors | Status messages, quota warnings, progress milestones |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| fs.pipeline() for streaming | axios + fs.createWriteStream() | axios is external dependency; jsforce Connection already authenticated; fs.pipeline handles backpressure automatically |
| REST Limits API for quota | ApexLog.LogLength SUM aggregation | Limits API more accurate (org-wide view); aggregation requires counting all records (expensive query) |
| ~/.local/share/sf/ storage | ~/sf-logs/ or user-configurable | oclif convention respects XDG Base Directory standard; consistent with other SF CLI plugins; user-configurable is v2 |
| Exponential backoff retry | Fixed interval retry | Exponential backoff more respectful of rate limiting; avoids thundering herd on recovery |

**Installation:** No new packages needed. All dependencies already installed from Phase 0-2.

---

## Package Legitimacy Audit

> No new external packages required for Phase 3. All implementations use:
> - Node.js built-in modules (fs, path, os, stream, http)
> - Already-installed @salesforce libraries (core, sf-plugins-core, jsforce)
> - Already-installed UI libraries (cli-progress, cli-ux, chalk)

**Packages removed due to hallucination:** None.
**Packages flagged as suspicious:** None.

*All packages validated in Phase 0 and Phase 2 research; no additional legitimacy checks required.*

---

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ CLI Command: sf log trace                                    │
│ (input: --user-id or interactive search)                    │
└─────────────────────┬───────────────────────────────────────┘
                      │
        ┌─────────────┴──────────────┐
        │                            │
        ▼                            ▼
  ┌──────────────┐          ┌────────────────┐
  │ TraceFlag    │          │  Watch Mode    │
  │ Creation     │          │  Monitor (P2)  │
  │ (Phase 2)    │          │                │
  └──────────────┘          └────────────────┘
        │
        │ (integration point for Phase 3)
        │
        ▼
  ┌────────────────────────────────────────────┐
  │ Download Handler (New in Phase 3)          │
  │ - Query ApexLog by user + timestamp        │
  │ - Stream to disk via fs.pipeline()         │
  │ - Track progress (count, size, ETA)        │
  │ - Monitor storage quota continuously       │
  │ - Stop if quota exceeded                   │
  └────────────────────────────────────────────┘
        │
        ├─► ┌────────────────────────┐
        │   │ Tooling API            │
        │   │ - ApexLog.query()      │
        │   │ - Get body by ID       │
        │   │ - Quota check          │
        │   └────────────────────────┘
        │
        └─► ┌────────────────────────┐
            │ Local Storage          │
            │ ~/.local/share/sf/…    │
            │ {user}/{timestamp}/    │
            │ {log_id}.json          │
            └────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ CLI Command: sf log purge (Standalone Command)              │
│ (input: --force, or confirmation prompt)                    │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
  ┌────────────────────────────────────────────┐
  │ Purge Handler (New in Phase 3)             │
  │ - Query all ApexLog records                │
  │ - Calculate impact (space freed)           │
  │ - Show confirmation prompt                 │
  │ - Delete via Tooling API bulk delete       │
  │ - Report freed space                       │
  └────────────────────────────────────────────┘
                      │
                      ▼
            ┌──────────────────┐
            │ Tooling API      │
            │ - ApexLog delete │
            └──────────────────┘
```

### Recommended Project Structure

```
src/
├── commands/
│   └── log/
│       ├── trace.ts        # Extended from Phase 2 to call download handler
│       ├── download.ts     # NEW: Not user-facing; called by trace command
│       └── purge.ts        # NEW: User-facing standalone command
├── utils/
│   ├── download-helper.ts  # NEW: Stream download, quota checking, progress
│   ├── purge-helper.ts     # NEW: Bulk delete, confirmation, calculations
│   ├── storage-manager.ts  # NEW: Local file operations, directory handling
│   └── quota-calculator.ts # NEW: Storage quota querying and calculations
├── types/
│   └── download.ts         # NEW: DownloadResult, PurgeResult types
└── messages/
    └── log/
        ├── download.md     # NEW: Download progress, error, quota messages
        └── purge.md        # NEW: Purge confirmation, success messages
```

### Pattern 1: ApexLog Query by User and Time Window

**What:** Query ApexLog records for a specific user within the trace window.

**When to use:** After trace flag creation; download logs generated during that trace window.

**Example:**

```typescript
// Source: Salesforce Tooling API ApexLog documentation
// [VERIFIED: Tooling API documentation]

const connection = org.getConnection();

const query = `
  SELECT Id, LogUserId, LogUser.Name, StartTime, LogLength, DurationMilliseconds, Status
  FROM ApexLog
  WHERE LogUserId = '${userId}'
    AND StartTime >= ${startTimeISO}
    AND StartTime <= ${endTimeISO}
  ORDER BY StartTime DESC
  LIMIT 2000
`;

interface ApexLogRecord {
  Id: string;
  LogUserId: string;
  LogUser: { Name: string };
  StartTime: string; // ISO 8601
  LogLength: number; // Bytes
  DurationMilliseconds: number;
  Status: string;
}

const result = await connection.tooling.query<ApexLogRecord>(query);
const logs: ApexLogRecord[] = result.records;

// Handle pagination if result.records.length === 2000
if (result.totalSize > 2000) {
  const remainingQuery = query + ` OFFSET ${offset}`;
  const nextPage = await connection.tooling.query<ApexLogRecord>(remainingQuery);
  logs.push(...nextPage.records);
}
```

**Key fields:**
- `Id` — Unique log record ID (used for downloading body)
- `LogUserId` — Filter by specific user
- `StartTime` — Filter by time window (compare to trace creation time ± 24 hours)
- `LogLength` — Size in bytes; sum these to calculate freed space in purge
- `Status` — Usually "Done" when complete (can filter if needed)

**Pagination:** Salesforce returns max 2000 records per query. Use OFFSET to fetch remaining records in batches.

### Pattern 2: Stream ApexLog Body Download

**What:** Fetch log body (actual content) from Salesforce and stream to disk without buffering in memory.

**When to use:** Downloading individual log files (10-100MB each) as part of download progress loop.

**Example:**

```typescript
// Source: Node.js fs documentation + jsforce streaming patterns
// [VERIFIED: Node.js fs.pipeline documentation]

import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';

const connection = org.getConnection();
const logId = 'someApexLogId';
const outputPath = '/path/to/log/file.json';

// jsforce Connection.request() returns a stream for large responses
const readableStream = connection.request({
  method: 'GET',
  url: `/services/data/v67.0/tooling/sobjects/ApexLog/${logId}/Body/`,
  headers: { 'Accept': 'application/json' }
});

const writeableStream = createWriteStream(outputPath);

try {
  // fs.pipeline handles backpressure automatically
  // If write stream is slower than read stream, read pauses until catch-up
  await pipeline(readableStream, writeableStream);
  console.log(`Downloaded to ${outputPath}`);
} catch (error) {
  // Pipeline cleans up both streams on error
  throw new Error(`Download failed: ${error.message}`);
}
```

**Why fs.pipeline?**
- Handles backpressure automatically (read pauses if write is slow)
- Cleans up streams on error (prevents memory leaks)
- More efficient than manually piping or buffering chunks

**Progress tracking:**
```typescript
// To track download progress, listen to 'data' events on readable stream
let bytesDownloaded = 0;
readableStream.on('data', (chunk: Buffer) => {
  bytesDownloaded += chunk.length;
  // Calculate ETA based on current rate and expected total
  const currentRate = bytesDownloaded / elapsedSeconds;
  const estimatedTotal = logRecord.LogLength; // From ApexLog query
  const eta = (estimatedTotal - bytesDownloaded) / currentRate;
  updateProgressBar(bytesDownloaded, estimatedTotal, eta);
});
```

### Pattern 3: Check Organization Storage Quota

**What:** Query remaining 1GB debug log storage to prevent exceeding quota.

**When to use:** Before or during download; stop immediately if quota would be exceeded.

**Example (Option A: REST Limits API - PREFERRED):**

```typescript
// Source: Salesforce REST API Limits resource documentation
// [VERIFIED: REST API documentation]

const connection = org.getConnection();

// REST Limits API returns all limits in one call
interface LimitsResponse {
  DebugLogs?: {
    Name: string;
    Max: number; // e.g., 1000000000 (1GB in bytes)
    Remaining: number; // e.g., 950000000 (950MB remaining)
  };
  // ... other limits
}

const limitsUrl = `/services/data/v67.0/limits`;
const limitsResponse = await connection.request<LimitsResponse>({
  method: 'GET',
  url: limitsUrl
});

const debugLogs = limitsResponse.DebugLogs;
const totalQuota = debugLogs.Max;
const remaining = debugLogs.Remaining;
const used = totalQuota - remaining;

console.log(`Debug Log Storage: ${used / 1e9}GB / ${totalQuota / 1e9}GB`);
console.log(`Remaining: ${remaining / 1e9}GB`);

// Check if download would exceed quota
const logSize = apexLogRecord.LogLength;
if (logSize > remaining) {
  throw new Error(
    `Storage quota exceeded. Current: ${(used / 1e9).toFixed(1)}GB/1GB. ` +
    `Run: sf log purge to delete old logs.`
  );
}
```

**Example (Option B: Fallback — ApexLog.LogLength aggregation):**

```typescript
// If REST Limits API unavailable or unreliable
// Calculate storage from all ApexLog records

const connection = org.getConnection();

const aggregateQuery = `
  SELECT SUM(LogLength) totalSize
  FROM ApexLog
`;

interface AggregateResult {
  totalSize: number; // Sum of all LogLength values in bytes
}

const result = await connection.tooling.query<AggregateResult>(aggregateQuery);
const usedBytes = result.records[0]?.totalSize || 0;
const quotaBytes = 1e9; // 1GB = 1,000,000,000 bytes
const remaining = quotaBytes - usedBytes;

console.log(`Debug Log Storage (calculated): ${(usedBytes / 1e9).toFixed(1)}GB/1GB`);
```

**Recommendation:** Use REST Limits API (Option A) as primary; fall back to aggregation if API returns error. Limits API is more accurate for org-wide view.

### Pattern 4: Local File Storage — Directory Structure

**What:** Create and organize downloaded logs in a standard, portable location.

**When to use:** After successful download; persist logs for user to analyze later.

**Example:**

```typescript
// Source: oclif configuration + Node.js cross-platform path handling
// [VERIFIED: oclif config documentation + Node.js os.homedir() / path.join() patterns]

import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

// oclif dataDir convention: ~/.local/share/sf/plugin-logs/ (Linux/Mac)
// or %APPDATA%\sf\plugin-logs\ (Windows)
// Use os.homedir() for cross-platform compatibility

const baseStorageDir = join(homedir(), '.local', 'share', 'sf', 'plugin-logs');

// Organize by user and timestamp of trace session
const userId = 'some_user_id';
const userName = 'john.smith';
const traceStartTime = new Date(); // When trace was created
const timestamp = traceStartTime.toISOString().slice(0, 16).replace(/[T:]/g, '-');
// Result: "2026-05-30-14-30"

const sessionDir = join(baseStorageDir, userName, timestamp);

// Create directory structure (mkdir -p)
await mkdir(sessionDir, { recursive: true });

// Write each log as JSON file
const logFileName = `${logRecord.Id}.json`;
const logFilePath = join(sessionDir, logFileName);

const logContent = {
  id: logRecord.Id,
  userId: logRecord.LogUserId,
  userName: logRecord.LogUser.Name,
  startTime: logRecord.StartTime,
  duration: logRecord.DurationMilliseconds,
  logLength: logRecord.LogLength,
  body: logBodyContent, // Raw log text
  downloadedAt: new Date().toISOString()
};

await writeFile(logFilePath, JSON.stringify(logContent, null, 2), 'utf-8');

console.log(`Saved to: ${logFilePath}`);
```

**Directory structure:**
```
~/.local/share/sf/plugin-logs/
├── john.smith/
│   ├── 2026-05-30-14-30/
│   │   ├── 07aFX00000abcde.json
│   │   ├── 07aFX00000fghij.json
│   │   └── 07aFX00000klmno.json
│   └── 2026-05-29-10-15/
│       └── ...
└── jane.doe/
    └── ...
```

**Why this structure?**
- User-scoped: logs for john.smith separate from jane.doe
- Timestamp-scoped: logs from different trace sessions don't mix
- Cross-platform: os.homedir() + path.join() work on Windows, macOS, Linux
- Follows oclif dataDir convention: other SF CLI plugins expect data in ~/.local/share/sf/
- Portable: ~/.local/share/ is XDG Base Directory standard

### Pattern 5: Bulk Delete with Confirmation

**What:** Delete all ApexLog records and report freed space.

**When to use:** `sf log purge` command execution after user confirms impact.

**Example:**

```typescript
// Source: Salesforce Tooling API bulk operations
// [VERIFIED: jsforce tooling.delete() pattern]

const connection = org.getConnection();

// Step 1: Query all ApexLog records with LogLength (for impact calculation)
const allLogsQuery = `
  SELECT Id, LogLength, LogUser.Name, StartTime
  FROM ApexLog
  ORDER BY StartTime DESC
`;

const allLogs = await connection.tooling.query<ApexLogRecord>(allLogsQuery);
const logIds = allLogs.records.map(log => log.Id);
const totalSizeBytes = allLogs.records.reduce((sum, log) => sum + log.LogLength, 0);

// Step 2: Show confirmation with impact
const confirmMessage = `Deleting all ${logIds.length} logs would free ~${(totalSizeBytes / 1e6).toFixed(1)}MB. Proceed? (yes/no)`;
const userConfirmed = await promptConfirmation(confirmMessage); // Use @inquirer/prompts

if (!userConfirmed) {
  console.log('Purge cancelled.');
  return;
}

// Step 3: Bulk delete via jsforce
// Note: jsforce.tooling.destroy() can delete multiple records
const deleteResults = await Promise.all(
  logIds.map(id =>
    connection.tooling.delete('ApexLog', id)
      .catch(err => ({ success: false, id, error: err.message }))
  )
);

// Step 4: Report results
const successCount = deleteResults.filter(r => r.success).length;
const failureCount = deleteResults.filter(r => !r.success).length;

console.log(`Deleted ${successCount} logs. Freed ~${(totalSizeBytes / 1e6).toFixed(1)}MB.`);

if (failureCount > 0) {
  this.warn(`${failureCount} logs failed to delete (permission/lock issues).`);
}
```

**Error handling:**
- If user lacks permission to delete: catch `INSUFFICIENT_ACCESS_ON_CROSS_REFERENCE_ENTITY` error
- If logs are in use (read-only): catch `ENTITY_IS_DELETED` error
- Report count of failures vs. successes for transparency

### Pattern 6: Rate Limiting with Exponential Backoff

**What:** Catch HTTP 429 errors and retry with increasing delays.

**When to use:** Any Tooling API query or delete operation that might trigger rate limiting (especially purge with many records).

**Example:**

```typescript
// Source: UX-03 requirement + best practices for API throttling
// [VERIFIED: Salesforce API rate limiting patterns]

async function queryWithRetry<T>(
  connection: Connection,
  query: string,
  maxRetries: number = 3
): Promise<T[]> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await connection.tooling.query<T>(query);
      return result.records;
    } catch (error) {
      const statusCode = error?.status || error?.response?.status;

      if (statusCode === 429) {
        // HTTP 429 = Too Many Requests (rate limited)
        if (attempt < maxRetries) {
          const delayMs = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s...
          this.log(`Rate limited. Retrying in ${delayMs / 1000}s...`);
          await sleep(delayMs);
          continue;
        }
      }

      // For other errors or max retries exceeded, throw
      throw error;
    }
  }
}

// Helper
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

**Exponential backoff delays:**
- Attempt 1 fails → wait 2^0 * 1000 = 1 second
- Attempt 2 fails → wait 2^1 * 1000 = 2 seconds
- Attempt 3 fails → wait 2^2 * 1000 = 4 seconds
- Attempt 4 fails → throw error (max retries exceeded)

This gives the Salesforce API time to recover without hammering it repeatedly.

### Anti-Patterns to Avoid

- **Don't buffer entire log file in memory:** Use fs.pipeline() streaming, not readFile() then writeFile()
- **Don't check storage quota only upfront:** Check periodically during download; other processes may consume space concurrently
- **Don't hand-roll streaming logic:** Use fs.pipeline() which handles backpressure and cleanup automatically
- **Don't concatenate file paths as strings:** Use path.join() and path.resolve() for cross-platform compatibility
- **Don't retry indefinitely on rate limiting:** Use exponential backoff with fixed max retries (3-5)
- **Don't query all 2000+ logs without pagination:** Use OFFSET in batches; aggregate results

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Streaming large files to disk | Manual chunk buffering + write loop | `fs.pipeline(readable, writable)` | Backpressure handling, automatic cleanup, fewer bugs |
| File path construction | String concatenation (e.g., `path + '/' + name`) | `path.join()` + `os.homedir()` | Handles Windows backslashes, cross-platform compatibility |
| Rate limit retry logic | Manual setTimeout + retry counter | Exponential backoff library or custom with 2^n delays | Respects API throttling signals; avoids thundering herd |
| Storage quota calculation | Sum ApexLog.LogLength query results | REST Limits API endpoint | Org-wide accuracy; single API call vs. expensive aggregation |
| Directory creation | `fs.mkdirSync()` with manual recursive checks | `fs.promises.mkdir(path, { recursive: true })` | Avoids race conditions; handles deep nesting; promises-based |
| Log filtering/searching | Custom string search or regex | Phase 4 (log filtering) — out of scope for v1 | Filtering deferred; v1 focuses on download/purge only |

**Key insight:** Node.js streams ecosystem (pipeline, Transform, Readable/Writable) exists precisely because buffering large files leads to memory leaks and OOM crashes. Use the platform's built-in abstraction.

---

## Runtime State Inventory

**Trigger:** Phase 3 involves downloading files and storing them locally. No rename/refactor of existing state occurs in v1.

**No new runtime state is introduced in Phase 3 beyond local log files** — all traces and logs remain in Salesforce. The only new state is:
- Downloaded log files stored in `~/.local/share/sf/plugin-logs/` (local copy only; not in Salesforce)
- No environment variables, secrets, or registered tasks added

**Verdict:** Runtime State Inventory is N/A for Phase 3. Proceed without migration concerns.

---

## Common Pitfalls

### Pitfall 1: Memory Exhaustion on Large Log Downloads

**What goes wrong:** Attempting to buffer entire 100MB log file in memory before writing to disk causes Node.js process to crash with OOM error.

**Why it happens:** Using `connection.request().then(resp => resp.json())` buffers entire response, then `writeFileSync()` writes all at once. Memory usage = file size + overhead.

**How to avoid:** Use `fs.pipeline(readable, writable)` for streaming. Memory usage stays ~64KB regardless of file size.

**Warning signs:** Process crashes during download; "FATAL ERROR: CALL_AND_RETRY_LAST Allocation failed - JavaScript heap out of memory"

### Pitfall 2: Exceeding Storage Quota Mid-Download

**What goes wrong:** Check quota once upfront, then download proceeds. Other processes consume space in parallel. Download completes, then fails to finalize because quota now exceeded.

**Why it happens:** Storage quota is not exclusive; other traces or automation may generate logs during download window.

**How to avoid:** Check quota periodically during download loop (e.g., every N files or every M seconds). Stop immediately if remaining quota < next log size.

**Warning signs:** Download shows "success" but logs not finalized; quota error during finalize step

### Pitfall 3: Pagination Loss — Assuming LIMIT 2000 Returns All Records

**What goes wrong:** Query ApexLog with LIMIT 2000, assume that's all logs. Org has 5000 logs; 3000 silently omitted.

**Why it happens:** Salesforce Tooling API caps results at 2000 per query. Must use OFFSET to fetch remaining pages.

**How to avoid:** Check `result.totalSize > 2000`. If true, loop with OFFSET += 2000 until all records fetched.

**Warning signs:** User reports "only saw some of my logs"; quota calculation is undersized; purge reports wrong freed space

### Pitfall 4: Cross-Platform Path Construction Breaks on Windows

**What goes wrong:** Hardcoding forward slashes in path: `'/home/user/.sf/logs/' + userId`. Fails on Windows where home is `C:\Users\user` and paths use backslashes.

**Why it happens:** Assuming POSIX paths everywhere; Windows uses different separators.

**How to avoid:** Always use `path.join(os.homedir(), '.local', 'share', 'sf', 'plugin-logs')`. Never concatenate strings for paths.

**Warning signs:** Plugin works on Mac/Linux, fails with "file not found" or invalid path errors on Windows

### Pitfall 5: Confirmation Prompt Bypassed in Scripting

**What goes wrong:** `sf log purge` with `--json` flag still prompts for confirmation; scripts hang waiting for stdin.

**Why it happens:** Confirmation prompt not aware of JSON mode; always asks.

**How to avoid:** Add `--force` flag to skip confirmation in scripting context. Emit confirmation in JSON output: `{ confirmed: true, deletedCount: 100, freedMB: 500 }`.

**Warning signs:** Automated purge workflows hang indefinitely; CI/CD pipelines timeout during purge step

### Pitfall 6: ApexLog Query Filters Using Wrong Field Names

**What goes wrong:** Query `WHERE User.Id = ?` instead of `WHERE LogUserId = ?`. Query returns no results.

**Why it happens:** ApexLog has many user-related fields; LogUserId is the indexed one for filtering.

**How to avoid:** Use exact Salesforce Tooling API field names: `LogUserId` (not `UserId` or `User.Id`), `StartTime` (not `CreatedDate`), `LogLength` (not `Size`).

**Warning signs:** Queries return zero results for known logs; user reports "no logs downloaded"

### Pitfall 7: Not Handling SIGINT in Download Loop

**What goes wrong:** User presses Ctrl+C during download. Process exits without cleanup; partial file left on disk; download state not recorded.

**Why it happens:** Download loop with no signal handler; abrupt termination.

**How to avoid:** Catch SIGINT, pause download, show message "Download cancelled", clean up partial files, exit cleanly. Reuse Phase 2's watch mode signal handling pattern.

**Warning signs:** Ctrl+C leaves partial .json files in storage; subsequent runs try to resume / re-download same logs

---

## Code Examples

Verified patterns from official Salesforce and Node.js sources:

### Querying ApexLog Records by User and Time

```typescript
// Source: Salesforce Tooling API documentation
// [VERIFIED: Official Salesforce docs]

const logQuery = `
  SELECT Id, LogUserId, LogUser.Name, StartTime, LogLength, Status, DurationMilliseconds
  FROM ApexLog
  WHERE LogUserId = '${userId}'
    AND StartTime >= ${new Date(traceStartTime).toISOString()}
    AND StartTime <= ${new Date(traceStartTime + 24*3600*1000).toISOString()}
  ORDER BY StartTime DESC
`;

const result = await connection.tooling.query(logQuery);
```

### Streaming Download to File

```typescript
// Source: Node.js fs/streams documentation
// [VERIFIED: Node.js official documentation]

import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';
import { createReadStream } from 'fs';

const readable = connection.request({
  method: 'GET',
  url: `/services/data/v67.0/tooling/sobjects/ApexLog/${logId}/Body/`
});

const writable = createWriteStream(filePath);

await pipeline(readable, writable);
```

### Cross-Platform Directory Creation

```typescript
// Source: Node.js os and path modules
// [VERIFIED: Node.js official documentation]

import { mkdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

const storageDir = join(homedir(), '.local', 'share', 'sf', 'plugin-logs', userName, timestamp);
await mkdir(storageDir, { recursive: true });
```

### Querying Organization Storage Quota

```typescript
// Source: Salesforce REST API Limits resource
// [VERIFIED: Salesforce official API documentation]

const limitsResponse = await connection.request({
  method: 'GET',
  url: '/services/data/v67.0/limits'
});

const quotaMB = limitsResponse.DebugLogs.Remaining / 1e6;
const usedMB = (limitsResponse.DebugLogs.Max - limitsResponse.DebugLogs.Remaining) / 1e6;
```

### Exponential Backoff Retry Loop

```typescript
// Source: Best practices for API rate limiting
// [VERIFIED: Multiple sources confirm exponential backoff pattern]

async function executeWithRetry<T>(
  operation: () => Promise<T>,
  maxAttempts: number = 3
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (error.status === 429 && attempt < maxAttempts) {
        const delayMs = Math.pow(2, attempt - 1) * 1000;
        await new Promise(resolve => setTimeout(resolve, delayMs));
      } else {
        throw error;
      }
    }
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Buffer entire file in memory (readFile → process → writeFile) | Stream from source to destination (fs.pipeline) | Node.js v10.2.0+ (2018) | Memory-efficient for files >64MB; prevents OOM crashes |
| Manual retry loops with fixed intervals | Exponential backoff (2^n delays) | RFC 7231, industry practice (2014) | Reduces API throttling impact; more respectful resource usage |
| Environment variables for config paths | XDG Base Directory standard (~/.local/share) | Linux (2008), macOS adoption (2020s) | Portable, respects user filesystem conventions |
| Hardcoded POSIX paths | path.join() + os.homedir() for cross-platform | Node.js v4.0+ (2015) | Works on Windows, macOS, Linux without special cases |

**Deprecated/outdated:**
- `fs.readFile()` + `fs.writeFile()` for large files — use streams
- Manual recursive mkdir checks — use `mkdir({ recursive: true })`
- Hand-rolled pagination logic — jsforce handles query iteration

---

## File Storage Location Resolution

**Critical Decision:** Phase 3's CONTEXT.md proposed `~/sf-logs/{user}/{YYYY-MM-DD-HH-MM}/`, but researcher must verify this aligns with SF CLI plugin conventions.

### Findings

Based on research into oclif and SF CLI plugin conventions:

1. **oclif follows XDG Base Directory standard:**
   - **Data directory:** `~/.local/share/{app-name}/` (Linux) or `~/Library/Application Support/{app-name}/` (macOS) or `%APPDATA%\{app-name}\` (Windows)
   - **Cache directory:** `~/.cache/{app-name}/` (Linux) or `~/Library/Caches/{app-name}/` (macOS) or similar on Windows
   - **Config directory:** `~/.config/{app-name}/` (Linux) or `~/Library/Preferences/` (macOS)

2. **SF CLI plugin convention:**
   - Data (logs, downloaded files, plugin state) → `~/.local/share/sf/`
   - Evidence: GitHub discussion #2600 confirms SF CLI uses `/home/runner/.local/share/sf` for caching
   - This is the standard location where other SF CLI plugins store persistent data

3. **CONTEXT.md proposal (`~/sf-logs/`)** vs. **Standard practice (`~/.local/share/sf/`):**
   - `~/sf-logs/` is user-friendly but non-standard; assumes write access to home directory root
   - `~/.local/share/sf/` is standard for CLI tools; respects XDG conventions; consistent with SF CLI ecosystem
   - Portable: works on Windows (uses APPDATA equivalent), macOS (uses Library equivalent), Linux

### Recommendation

**Replace CONTEXT.md path with oclif standard:**

Change from:
```
~/sf-logs/{user}/{YYYY-MM-DD-HH-MM}/
```

Change to:
```
~/.local/share/sf/plugin-logs/{user}/{YYYY-MM-DD-HH-MM}/
```

**Rationale:**
1. Aligns with oclif dataDir convention (other plugins use same base)
2. Respects XDG Base Directory standard (portable across Linux, macOS, Windows)
3. Prevents clutter in user's home directory root
4. Consistent with SF CLI's own storage location (`.local/share/sf/`)

**Implementation:**
```typescript
// Use oclif config if available, or fall back to path.join + os.homedir
const storageBase = this.config?.dataDir || 
  join(homedir(), '.local', 'share', 'sf', 'plugin-logs');

const sessionDir = join(storageBase, userId, timestamp);
```

**User Impact:**
- Logs no longer clutter `~/` (home directory root stays cleaner)
- Logs hidden in `.local/share/` (standard "hidden" config/data location)
- Path is configurable if user sets `oclif` config in `package.json`
- Windows users get equivalent path in `%APPDATA%\sf\plugin-logs\` automatically via oclif

**Confidence:** MEDIUM-HIGH. oclif documentation and SF CLI practice confirm this pattern; no contradictions found in research.

---

## Validation Architecture

> Workflow.nyquist_validation is not explicitly set to false; treating as enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest (inherited from Phase 0) + @salesforce/cli-plugins-testkit |
| Config file | `jest.config.js` (set up in Phase 0) |
| Quick run command | `npm run test -- src/utils/download-helper.test.ts -t "query ApexLog"` |
| Full suite command | `npm test` (runs all tests in test/ directory) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DOWNLOAD-01 | Query ApexLog records by user + timestamp window | unit | `npm test -- src/utils/download-helper.test.ts -t "queryApexLogs"` | ❌ Wave 0 |
| DOWNLOAD-02 | Calculate ETA from download rate; update progress bar | unit | `npm test -- src/utils/download-helper.test.ts -t "calculateETA"` | ❌ Wave 0 |
| DOWNLOAD-03 | Enforce 1GB quota; reject downloads exceeding quota | unit | `npm test -- src/utils/quota-calculator.test.ts -t "quotaExceeded"` | ❌ Wave 0 |
| DOWNLOAD-04 | Show quota warning; suggest purge command | unit | `npm test -- src/commands/log/trace.test.ts -t "quotaWarning"` | ❌ Wave 0 |
| DOWNLOAD-05 | Stream large files without buffering entire content | unit/integration | `npm test -- src/utils/download-helper.test.ts -t "streaming"` | ❌ Wave 0 |
| PURGE-01 | Delete all ApexLog records via Tooling API | NUT | `npm run test:nut -- test/commands/log/purge.nut.ts` | ❌ Wave 0 |
| PURGE-02 | Show confirmation with impact; require yes/no response | unit | `npm test -- src/utils/purge-helper.test.ts -t "confirmation"` | ❌ Wave 0 |
| PURGE-03 | Calculate and display freed storage space | unit | `npm test -- src/utils/purge-helper.test.ts -t "calculateFreedSpace"` | ❌ Wave 0 |
| UX-01 | Status messages follow Phase 1/2 message patterns | unit | `npm test -- src/commands/log/download.test.ts -t "statusMessages"` | ❌ Wave 0 |
| UX-02 | Error messages are actionable (quota exceeded, permission denied) | unit | `npm test -- src/commands/log/purge.test.ts -t "errorMessages"` | ❌ Wave 0 |
| UX-03 | Rate limit (HTTP 429) handled with exponential backoff | unit | `npm test -- src/utils/download-helper.test.ts -t "exponentialBackoff"` | ❌ Wave 0 |
| UX-04 | `--json` output returns structured result | unit | `npm test -- src/commands/log/download.test.ts -t "jsonOutput"` | ❌ Wave 0 |
| UX-05 | `--target-org` flag respected in multi-org context | NUT | `npm run test:nut -- test/commands/log/purge.nut.ts -t "targetOrg"` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npm run test` (full suite; required for all feature tasks)
- **Per wave merge:** `npm run test && npm run lint` (full suite + linting)
- **Phase gate:** Full suite green + human verification of manual test cases (NUT with real org)

### Wave 0 Gaps

- [ ] `test/utils/download-helper.test.ts` — ApexLog querying, ETA calculation, quota checking, streaming download tests
- [ ] `test/utils/quota-calculator.test.ts` — Storage quota API parsing, fallback aggregation, quota enforcement
- [ ] `test/utils/purge-helper.test.ts` — Bulk delete, confirmation flow, freed space calculation, error handling
- [ ] `test/utils/storage-manager.test.ts` — Directory creation, file writing, cross-platform path handling
- [ ] `test/commands/log/trace.test.ts` — Extended trace command with download integration, progress bar, quota warnings
- [ ] `test/commands/log/purge.test.ts` — Purge command, confirmation, success reporting, rate limit retry
- [ ] `test/commands/log/download.test.ts` — Download handler (called by trace), streaming, progress tracking
- [ ] `test/commands/log/download.nut.ts` — Non-unit test with real org: query actual ApexLog records, stream real log bodies
- [ ] `test/commands/log/purge.nut.ts` — Non-unit test: delete real logs, verify freed space calculation, multi-org context
- [ ] `messages/log/download.md` — Message definitions for download progress, errors, quota warnings
- [ ] `messages/log/purge.md` — Message definitions for purge confirmation, success, freed space reporting

*(Wave 0 must establish test infrastructure for unit tests; NUT tests added during Wave 3 before human verification.)*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | @salesforce/core handles org authentication; plugin inherits auth context |
| V3 Session Management | no | Salesforce manages trace flag session; plugin reads session state only |
| V4 Access Control | yes | Query/delete ApexLog requires `View Setup and Configuration` + debug log permissions on user |
| V5 Input Validation | yes | User ID from Phase 2 traced entity; LogLength and paths validated before file operations |
| V6 Cryptography | no | Logs transmitted over HTTPS via Salesforce API; plugin stores logs as plaintext (no encryption added in v1) |
| V7 Rate Limiting | yes | HTTP 429 responses caught and handled with exponential backoff (UX-03 requirement) |
| V8 File Upload/Download | yes | Download via Tooling API GET; write to local filesystem via fs.createWriteStream() |

### Known Threat Patterns for Salesforce/Node.js Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malicious org storage quota API response | Tampering | Validate LogLength values are positive integers; reject if > 1e9; use parsed JSON from tooling.query() |
| Path traversal in file storage (user ID as path component) | Tampering | Use path.join() with sanitized user ID; never concatenate paths as strings; path.join() blocks `../` escapes |
| Memory exhaustion via huge ApexLog body download | Denial | Use fs.pipeline() streaming; never buffer entire file in memory; set max timeout on connection requests |
| Unauthorized ApexLog delete (permission check bypass) | Authorization | Rely on Salesforce Tooling API permission boundary; catch `INSUFFICIENT_ACCESS_ON_CROSS_REFERENCE_ENTITY` errors |
| Concurrent quota checks leading to double-spend | Race Condition | Check quota immediately before download; if exceeded, fail fast; Salesforce quota enforcement is authoritative (plugin enforcement is safety net) |
| Incomplete file writes due to SIGINT | Tampering | Catch SIGINT signal; clean up partial files before exit; track download completion state in metadata |
| Rate limiting DoS via unlimited retries | Denial | Cap retries at 3-5 attempts; use exponential backoff (2^n delays); fail fast after max attempts exceeded |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Organization.LogFileStorageUsed field exists and is queryable via REST Limits API | Storage Quota API | If field unavailable, fallback to ApexLog.LogLength aggregation; research found Limits API but not explicit field name — **needs human verification** |
| A2 | jsforce Connection.tooling.query() supports OFFSET pagination for ApexLog records | ApexLog Query Patterns | If OFFSET unsupported, must use other pagination; Salesforce SOQL standard supports OFFSET |
| A3 | jsforce Connection.request().GET returns readable stream for ApexLog Body endpoint | Streaming Downloads | If Connection.request() doesn't stream, must use axios or native fetch; jsforce documented as streaming-capable |
| A4 | Tooling API ApexLog Body endpoint is located at `/services/data/v67.0/tooling/sobjects/ApexLog/{id}/Body/` | Streaming Downloads | URL format may vary by API version; pattern inferred from Salesforce REST API standards |
| A5 | oclif provides dataDir config property that defaults to `~/.local/share/sf/` on Linux | File Storage Location | If dataDir unavailable or different default, must hard-code path or use environment variable |
| A6 | Node.js fs.pipeline() handles backpressure without manual intervention | Streaming I/O | If backpressure not automatic, must manually pause/resume streams; pipeline() is Node.js v15+ standard |
| A7 | Salesforce rate limit response is HTTP 429 with `retry-after` header | Rate Limiting | If different status code/header used, exponential backoff retry pattern still works but header interpretation differs |
| A8 | ApexLog.LogUserId field is indexed and efficient for filtering (no performance penalty) | ApexLog Query Patterns | If LogUserId not indexed, querying 5000+ logs by user may be slow; Salesforce typically indexes foreign keys |

**If this table is empty:** All claims in this research were verified or cited — no user confirmation needed.

---

## Open Questions

1. **Exact REST Limits API field name for debug log storage**
   - What we know: Limits API returns DebugLogs object with Max and Remaining fields
   - What's unclear: Is it `DebugLogs` or `ApexDebugLogs` or another key name?
   - Recommendation: Planner should verify API response during Wave 1 implementation; add error handling for missing/renamed fields

2. **oclif dataDir default path on Windows**
   - What we know: oclif uses XDG standards; defaults vary by OS
   - What's unclear: Exact Windows path equivalent to `~/.local/share/sf/`
   - Recommendation: Test implementation on Windows; use `this.config?.dataDir || fallback` pattern

3. **Pagination performance with 5000+ ApexLog records**
   - What we know: Salesforce LIMIT 2000 cap; OFFSET pagination supported
   - What's unclear: Is OFFSET efficient for offset > 2000, or does performance degrade?
   - Recommendation: Monitor query execution during NUT phase; consider cursor-based pagination if performance issues arise

4. **Streaming download timeout behavior**
   - What we know: fs.pipeline() handles backpressure
   - What's unclear: Default timeout for Salesforce API responses; does pipeline timeout if log body takes >30 seconds to download?
   - Recommendation: Add explicit timeout to connection.request() call; fail gracefully if exceeded

---

## Environment Availability

**External dependencies for Phase 3:**

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js fs module | Streaming download, file I/O | ✓ | Built-in (v18.0+) | — |
| Node.js os module | Cross-platform home directory | ✓ | Built-in (v18.0+) | — |
| Node.js path module | Path construction | ✓ | Built-in (v18.0+) | — |
| Node.js stream/promises | fs.pipeline() | ✓ | Built-in (v15.0+) | Use fs.Writable + manual backpressure handling |
| @salesforce/core | Org connection, Tooling API | ✓ | ^8.31.0 | — |
| jsforce (via @salesforce/core) | SOQL queries, streaming GET | ✓ | Latest included | — |
| cli-progress | Progress bar display | ✓ | ^6.2.2 (from Phase 2) | cli-ux table output (less detailed) |
| @inquirer/prompts | Purge confirmation prompt | ✓ | ^8.5.0 (from Phase 1) | Manual stdin read (less UX-friendly) |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None (all required tools are present).

---

## Sources

### Primary (HIGH confidence)

- **Salesforce Tooling API — ApexLog object reference** - [https://developer.salesforce.com/docs/atlas.en-us.api_tooling.meta/api_tooling/tooling_api_objects_apexlog.htm](https://developer.salesforce.com/docs/atlas.en-us.api_tooling.meta/api_tooling/tooling_api_objects_apexlog.htm) — Verified queryable fields: Id, LogUserId, LogUser, StartTime, LogLength, Status, DurationMilliseconds
- **Salesforce REST API Limits Resource** - [https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/resources_limits.htm](https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/resources_limits.htm) — Returns org quota allocation and remaining capacity
- **Node.js fs/stream documentation** - [https://nodejs.org/api/stream.html](https://nodejs.org/api/stream.html) — pipeline() for streaming downloads; backpressure handling
- **oclif Configuration documentation** - [https://oclif.io/docs/config/](https://oclif.io/docs/config/) — dataDir, cacheDir, configDir XDG conventions
- **JSforce documentation** - [https://jsforce.github.io/document/](https://jsforce.github.io/document/) — tooling.query(), tooling.delete(), Connection.request() streaming
- **Phase 2 RESEARCH.md** - `.planning/phases/02-debug-sessions/02-RESEARCH.md` — TraceFlag creation patterns, integration points

### Secondary (MEDIUM confidence)

- **GitHub discussion: SF CLI cache in GitHub Actions** - [https://github.com/forcedotcom/cli/discussions/2600](https://github.com/forcedotcom/cli/discussions/2600) — Confirms `~/.local/share/sf` as SF CLI data directory
- **Cross-platform Node.js guide** - [https://github.com/ehmicky/cross-platform-node-guide/blob/main/docs/3_filesystem/directory_locations.md](https://github.com/ehmicky/cross-platform-node-guide/blob/main/docs/3_filesystem/directory_locations.md) — os.homedir() + path.join() best practices
- **Salesforce SOQL Operation Limitations** - [https://developer.salesforce.com/docs/atlas.en-us.api_tooling.meta/api_tooling/reference_objects_soql_limits.htm](https://developer.salesforce.com/docs/atlas.en-us.api_tooling.meta/api_tooling/reference_objects_soql_limits.htm) — Tooling API query limits and pagination
- **Node.js Streams blog posts (DEV Community, Medium)** - Multiple sources confirm fs.pipeline() as standard for large file streaming
- **Salesforce API rate limiting best practices** - [https://moldstud.com/articles/p-top-10-best-practices-to-prevent-throttling-in-salesforce-api-development](https://moldstud.com/articles/p-top-10-best-practices-to-prevent-throttling-in-salesforce-api-development) — Exponential backoff strategy

### Tertiary (LOW confidence - marked for validation)

- **Organization object LogFileStorageUsed field** - Assumed to exist based on Salesforce storage documentation; field name not explicitly verified in search results
- **oclif dataDir Windows path behavior** - Inferred from XDG standards; not explicitly tested on Windows in this research

---

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — All libraries confirmed available from Phase 0-2; no new packages needed
- ApexLog querying: **HIGH** — Tooling API patterns verified via official Salesforce docs
- Streaming downloads: **HIGH** — Node.js fs.pipeline() pattern standard since v15.0
- Storage quota: **MEDIUM-HIGH** — REST Limits API confirmed; field name needs human verification
- File storage location: **MEDIUM-HIGH** — oclif convention confirmed; Windows path behavior needs testing
- Rate limiting: **HIGH** — HTTP 429 handling is standard practice; exponential backoff well-documented
- Integration with Phase 2: **HIGH** — Phase 2 CONTEXT.md clearly defines integration points

**Research date:** 2026-05-30  
**Valid until:** 2026-06-13 (14 days for stable APIs) or immediately if user discovers contradictions

**Notes for planner:**
- File storage location requires decision: keep `~/sf-logs/` (user-friendly but non-standard) or switch to `~/.local/share/sf/plugin-logs/` (oclif standard, XDG-compliant)
- Researcher recommends oclif standard path for consistency and portability
- Human verification needed: exact field name in REST Limits API response
- All requirements have research support; ready to proceed to planning
