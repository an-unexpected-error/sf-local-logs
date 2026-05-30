---
phase: 03-log-management
reviewed: 2026-05-31T14:30:00Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - messages/log.purge.md
  - messages/log.trace.md
  - src/commands/log/purge.ts
  - src/commands/log/trace.ts
  - src/utils/purge-helper.ts
  - src/utils/trace-helper.ts
  - test/commands/log/purge.nut.ts
  - test/commands/log/purge.test.ts
  - test/commands/log/trace.nut.ts
  - test/commands/log/trace.test.ts
  - test/utils/download-helper.test.ts
  - test/utils/quota-calculator.test.ts
  - test/utils/storage-manager.test.ts
findings:
  critical: 3
  warning: 5
  info: 4
  total: 12
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-05-31T14:30:00Z  
**Depth:** standard  
**Files Reviewed:** 13  
**Status:** issues_found

## Summary

This review of Phase 3 log management commands reveals **3 critical SQL injection vulnerabilities** and **5 quality warnings** that must be addressed before release. The purge command is well-structured with good error handling and test coverage, but the trace command has multiple injection risks from unsanitized user IDs in SOQL queries. Additionally, there are concerns about error handling completeness, type safety edge cases, and test mocking patterns that could mask runtime failures.

Core strengths:
- Comprehensive confirmation workflow for destructive purge operation
- Proper error message localization and user-friendly guidance
- Rate limiting retry logic with exponential backoff
- Good test coverage for happy paths and edge cases

Critical issues:
- SQL injection via unsanitized userId in SOQL queries (3 instances)
- Missing null/type safety in Trace.extractQuotaValues regex parsing
- Incomplete error handling in trace command download flow

---

## Critical Issues

### CR-01: SQL Injection Vulnerability — Unsanitized userId in queryApexLogsForUser

**File:** `src/utils/download-helper.ts:57`

**Issue:**  
The userId parameter is interpolated directly into the SOQL query without sanitization:
```typescript
const baseQuery = `SELECT Id, LogUserId, LogUser.Name, StartTime, LogLength, DurationMilliseconds, Status FROM ApexLog WHERE LogUserId = '${userId}' AND StartTime >= ${startTimeISO} AND StartTime <= ${endTimeISO} ORDER BY StartTime DESC`;
```

An attacker controlling userId (e.g., via an org display user search) could inject malicious SOQL:
- Input: `005XX' OR '1'='1`  
- Payload executes as: `WHERE LogUserId = '005XX' OR '1'='1' AND StartTime >= ...`  
- Result: Unauthorized log access from any user

While userId should come from Salesforce's own 15-18 character format, defensive programming requires sanitization. SOQL injection can bypass field-level security and expose logs from other users.

**Fix:**
```typescript
// Import escapeSoql from soql-builder.ts (which already exists)
import { escapeSoql } from './soql-builder.js';

const baseQuery = `SELECT Id, LogUserId, LogUser.Name, StartTime, LogLength, DurationMilliseconds, Status FROM ApexLog WHERE LogUserId = '${escapeSoql(userId)}' AND StartTime >= ${startTimeISO} AND StartTime <= ${endTimeISO} ORDER BY StartTime DESC`;
```

---

### CR-02: SQL Injection Vulnerability — Unsanitized userId in checkExistingTraceFlag

**File:** `src/utils/trace-helper.ts:154`

**Issue:**  
The userId parameter is directly interpolated into the Tooling API query:
```typescript
const result = await connection.tooling.query(
  `SELECT Id FROM TraceFlag WHERE TracedEntityId = '${userId}' AND ExpirationDate > ${now} LIMIT 1`
);
```

Same injection risk as CR-01: an attacker could craft a malicious userId to retrieve trace flags for other users.

**Fix:**
```typescript
import { escapeSoql } from './soql-builder.js';

const result = await connection.tooling.query(
  `SELECT Id FROM TraceFlag WHERE TracedEntityId = '${escapeSoql(userId)}' AND ExpirationDate > ${now} LIMIT 1`
);
```

---

### CR-03: SQL Injection Vulnerability — Unsanitized userId in Trace Command User Query

**File:** `src/commands/log/trace.ts:144`

**Issue:**  
The userId is interpolated directly into a SOQL query:
```typescript
const userResult = await connection.query<{ FirstName: string; LastName: string; Email: string }>(
  `SELECT FirstName, LastName, Email FROM User WHERE Id = '${userId}' LIMIT 1`
);
```

While this query targets the User object (not ApexLog), injection could still expose user data. More critically, this undermines the security posture established by escapeSoql in soql-builder.ts and creates inconsistency across the codebase.

**Fix:**
```typescript
import { escapeSoql } from '../../utils/soql-builder.js';

const userResult = await connection.query<{ FirstName: string; LastName: string; Email: string }>(
  `SELECT FirstName, LastName, Email FROM User WHERE Id = '${escapeSoql(userId)}' LIMIT 1`
);
```

---

## Warnings

### WR-01: Missing Null Safety in Trace.extractQuotaValues Regex Parsing

**File:** `src/commands/log/trace.ts:287`

**Issue:**  
The regex match fallback assumes numeric values without validation:
```typescript
private static extractQuotaValues(errorMsg: string): [number, number] {
  const match = /Current:\s*(\d+(?:\.\d+)?)MB\/(\d+(?:\.\d+)?)MB/.exec(errorMsg);
  if (match) {
    return [parseFloat(match[1]), parseFloat(match[2])];
  }
  return [0, 1000];
}
```

Risk: If the regex matches but parseFloat returns NaN (e.g., malformed input), the function silently passes NaN to the message formatter, which could display "NaN MB" to the user or cause type errors downstream.

**Fix:**
```typescript
private static extractQuotaValues(errorMsg: string): [number, number] {
  const match = /Current:\s*(\d+(?:\.\d+)?)MB\/(\d+(?:\.\d+)?)MB/.exec(errorMsg);
  if (match) {
    const used = parseFloat(match[1]);
    const total = parseFloat(match[2]);
    // Validate parseFloat did not return NaN
    if (!Number.isNaN(used) && !Number.isNaN(total) && used >= 0 && total > 0) {
      return [used, total];
    }
  }
  return [0, 1000];
}
```

---

### WR-02: Incomplete Error Handling in Trace Download Flow — Non-Fatal vs. Blocking

**File:** `src/commands/log/trace.ts:220`

**Issue:**  
Download errors are caught and warned, but quota errors are fatal:
```typescript
if (errorMsg.includes('Storage quota exceeded')) {
  this.error(messages.getMessage('errorQuotaExceeded', Trace.extractQuotaValues(errorMsg)));
}

// Other download errors: warn but don't fail the whole command
this.warn(messages.getMessage('errorDownloadFailed', [errorMsg]));
```

The quota error calls `this.error()` which terminates the command with a non-zero exit code, while other download failures only warn. This is inconsistent UX: if quota is exceeded mid-download (a recoverable scenario), the trace flag has already been created successfully. The user should receive the trace result with a partial download, not a command failure.

Also, line 221 will never execute because line 217 calls `this.error()` which throws and exits.

**Fix:**
```typescript
if (errorMsg.includes('Storage quota exceeded')) {
  this.warn(messages.getMessage('errorQuotaExceeded', Trace.extractQuotaValues(errorMsg)));
} else {
  this.warn(messages.getMessage('errorDownloadFailed', [errorMsg]));
}
// Fall through to return result with partial/no downloads
```

---

### WR-03: Missing Await on Async Path Operations in Trace Command

**File:** `src/commands/log/trace.ts:188`

**Issue:**  
The call to `initiateDownloadAfterTrace` is awaited, but the function's internal async operations could fail silently if error handling is incomplete. More critically, while the code does await the download, the error handler at line 220-222 cannot be reached if line 217 calls `this.error()` (which exits the process).

This is a control flow issue where the error handling at 220-222 is effectively dead code following the quota error at 217.

**Fix:** See WR-02 — change `this.error()` to `this.warn()` to allow the command to complete.

---

### WR-04: Test Mocking Does Not Verify Query Injection Prevention

**File:** `test/utils/download-helper.test.ts:56-81`

**Issue:**  
The test for `queryApexLogsForUser` validates LogLength filtering but never tests with malicious userId input:
```typescript
it('filters records returning only valid LogLength values (positive integer <= 1GB)', async () => {
  // Test only validates LogLength filtering, not userId injection safety
```

No test verifies that `userId = "005XX' OR '1'='1"` is properly escaped in the resulting SOQL. This allows the SQL injection vulnerability (CR-01) to exist without test coverage detection.

**Fix:**  
Add test case:
```typescript
it('escapes userId to prevent SOQL injection', async () => {
  const fakeConnection = {
    tooling: {
      query: (sql: string) => {
        // Verify the SQL does not contain unescaped single quotes around userId
        expect(sql).to.not.include("LogUserId = '005XX' OR");
        return Promise.resolve({ totalSize: 0, done: true, records: [] });
      },
    },
  };
  await queryApexLogsForUser(
    fakeConnection as never,
    "005XX' OR '1'='1",
    new Date(),
    new Date()
  );
});
```

---

### WR-05: Incomplete Type Validation in calculateFreedSpace

**File:** `src/utils/purge-helper.ts:100`

**Issue:**  
The function coalesces null/undefined LogLength to 0 but doesn't validate the total result:
```typescript
const totalBytes = logRecords.reduce((sum, record) => sum + (record.LogLength ?? 0), 0);
```

If all records have null/undefined LogLength, the result is 0 bytes, which is silent and incorrect. The message formatter will show "0MB freed," but this may mask a data quality issue (corrupted ApexLog records).

Also, no overflow check: if logRecords contains extremely large LogLength values, the sum could exceed JavaScript's Number.MAX_SAFE_INTEGER, resulting in loss of precision in the freed space calculation.

**Fix:**
```typescript
let totalBytes = 0;
let nullCount = 0;
for (const record of logRecords) {
  const length = record.LogLength ?? 0;
  if (record.LogLength === null || record.LogLength === undefined) {
    nullCount++;
  }
  if (length > Number.MAX_SAFE_INTEGER - totalBytes) {
    // Overflow guard
    throw new Error('Total log size exceeds safe integer range');
  }
  totalBytes += length;
}

if (nullCount > 0 && nullCount === logRecords.length) {
  // All records had null LogLength — data quality issue
  console.warn(`Warning: all ${logRecords.length} records have null LogLength`);
}
```

---

## Info

### IN-01: Unused Import in Purge.ts

**File:** `src/commands/log/purge.ts:26`

**Issue:**  
The import `Messages` is unused after line 41 loads the messages:
```typescript
import { Messages } from '@salesforce/core';
// ...
const messages = Messages.loadMessages('sf-local-logs', 'log.purge');
```

After line 41, `Messages` is never referenced again; only the `messages` instance is used.

**Fix:**  
Remove the import or use it directly:
```typescript
// Option 1: Remove unused class import
import { Org } from '@salesforce/core';

// Option 2: Import only Messages if not using other core exports
import type { Messages as MessagesType } from '@salesforce/core';
```

---

### IN-02: Magic Number 1e6 and 1e9 Repeated Across Codebase

**File:** `src/utils/purge-helper.ts:105-106` and other files

**Issue:**  
The byte-to-MB conversion `/ 1e6` and GB conversion `/ 1e9` are repeated throughout without named constants:
```typescript
totalMB: (totalBytes / 1e6).toFixed(1),
totalGB: (totalBytes / 1e9).toFixed(2),
```

This pattern appears in purge-helper.ts, quota-calculator.ts, and download-helper.ts. While 1e6 and 1e9 are technically correct (MB = 10^6 bytes, GB = 10^9 bytes), the lack of named constants makes the code less maintainable.

**Fix:**  
Define named constants in a shared utils file:
```typescript
// utils/constants.ts
export const BYTES_PER_MB = 1_000_000;
export const BYTES_PER_GB = 1_000_000_000;

// Then use:
totalMB: (totalBytes / BYTES_PER_MB).toFixed(1),
totalGB: (totalBytes / BYTES_PER_GB).toFixed(2),
```

---

### IN-03: Unhandled Promise Rejection Risk in selectUserInteractively

**File:** `src/commands/log/trace.ts:344-349`

**Issue:**  
The error handler catches "User force closed the prompt" errors but doesn't re-throw or rethrow generic errors. The catch block at line 349 re-throws the error, which exits the command. However, the pattern is:

```typescript
try {
  // input prompt + search
} catch (error) {
  if (errorMsg.includes('User force closed')) {
    this.log(...);
    process.exit(0);
  }
  throw error; // Re-throws any other error
}
```

If `input()` throws an unexpected error (e.g., terminal I/O failure), it propagates as a command error with a stack trace. While this is caught, the error message shown to the user is the raw error, not a user-friendly message from the messages file.

**Fix:**  
```typescript
catch (error) {
  const errorMsg = error instanceof Error ? error.message : String(error);
  if (errorMsg.includes('User force closed')) {
    this.log(messages.getMessage('statusSearchCancelled'));
    process.exit(0);
  }
  // Provide user-friendly message for unexpected errors
  throw new Error(messages.getMessage('errorOrgConnectionFailed', [org.getOrgId()]));
}
```

---

### IN-04: Missing Defensive Copy in calculateDownloadTimeWindow

**File:** `src/utils/trace-helper.ts:230-235`

**Issue:**  
The function creates a new Date from traceCreatedAt but directly mutates startTime in calculateDownloadTimeWindow:
```typescript
export function calculateDownloadTimeWindow(traceCreatedAt: Date): { startTime: Date; endTime: Date } {
  const startTime = new Date(traceCreatedAt.getTime());
  const endTime = new Date(traceCreatedAt.getTime() + 24 * 3600 * 1000);
  return { startTime, endTime };
}
```

While the function does create a new Date (defensive copy), callers might mutate the returned startTime object. More critically, the caller in trace-helper.ts line 267 creates a separate traceCreatedAt and modifies it:

```typescript
const traceCreatedAt = new Date(traceResult.traceFlag.expirationDate);
traceCreatedAt.setTime(traceCreatedAt.getTime() - 24 * 3600 * 1000);
```

This is mutation-heavy and error-prone. If traceCreatedAt calculation is off by even 1ms, the download window becomes incorrect.

**Fix:**  
```typescript
export function calculateDownloadTimeWindow(traceCreatedAt: Date): { startTime: Date; endTime: Date } {
  // Defensive: create a copy to prevent caller mutation
  const safeTraceTime = new Date(traceCreatedAt.getTime());
  const startTime = new Date(safeTraceTime);
  const endTime = new Date(safeTraceTime.getTime() + 24 * 60 * 60 * 1000);
  return { startTime, endTime };
}

// In initiateDownloadAfterTrace:
const traceCreatedAtMs = new Date(traceResult.traceFlag.expirationDate).getTime() - (24 * 60 * 60 * 1000);
const traceCreatedAt = new Date(traceCreatedAtMs);
const { startTime, endTime } = calculateDownloadTimeWindow(traceCreatedAt);
```

---

## Summary of Findings

| Category | Count | Severity |
|----------|-------|----------|
| SQL Injection Vulnerabilities | 3 | **BLOCKER** |
| Type Safety / Null Handling | 2 | WARNING |
| Control Flow / Error Handling | 2 | WARNING |
| Test Coverage Gaps | 1 | WARNING |
| Code Quality / Maintainability | 4 | INFO |
| **Total** | **12** | — |

### Blockers (Must Fix)
- CR-01, CR-02, CR-03: SQL injection via unsanitized userId in SOQL queries

### Should Fix (Before Merge)
- WR-02: Incomplete error handling in trace download (unreachable code path)
- WR-04: Test coverage does not verify injection prevention

### Nice to Have (Post-Merge)
- IN-01 through IN-04: Code quality improvements

---

_Reviewed: 2026-05-31T14:30:00Z_  
_Reviewer: Claude (gsd-code-reviewer)_  
_Depth: standard_
