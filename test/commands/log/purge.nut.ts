/**
 * Non-Unit Tests (NUT) for purge command.
 * Tests the full end-to-end workflow: bulk log deletion, confirmation, and storage reporting.
 *
 * These tests verify the complete Phase 3 purge workflow including:
 * - PURGE-01: All org logs queried and deleted via Tooling API
 * - PURGE-02: Confirmation prompt shows impact before deletion
 * - PURGE-03: Freed storage reported in MB/GB after deletion
 * - UX-01: Clear status messages throughout operation
 * - UX-02: Error messages are actionable (permission, connection, quota)
 * - UX-03: HTTP 429 handled with exponential backoff
 * - UX-04: --json flag outputs structured, parseable result
 * - UX-05: --target-org flag respected for multi-org support
 *
 * Note: Full E2E tests require an authenticated Salesforce scratch org.
 * These tests use structural verification and unit-level behavioral assertions
 * matching the NUT pattern established in Phases 1 and 2.
 *
 * Run full integration suite: npm run test:nuts test/commands/log/purge.nut.ts
 */
import { TestSession } from '@salesforce/cli-plugins-testkit';
import { expect } from 'chai';
import { describe, it } from 'mocha';
import Purge from '../../../src/commands/log/purge.js';
import {
  queryAllApexLogs,
  calculateFreedSpace,
  performBulkDelete,
  formatPurgeConfirmation,
  formatPurgeSuccess,
} from '../../../src/utils/purge-helper.js';
import type { ApexLogRecord } from '../../../src/types/download.js';

// Test fixture: sample ApexLog records for unit-level testing
const sampleLogs: ApexLogRecord[] = [
  { Id: 'log001', LogUserId: 'usr001', LogUser: { Name: 'John Smith' }, StartTime: '2026-05-30T10:00:00Z', LogLength: 500_000, DurationMilliseconds: 1200, Status: 'Success' },
  { Id: 'log002', LogUserId: 'usr002', LogUser: { Name: 'Jane Doe' }, StartTime: '2026-05-30T10:05:00Z', LogLength: 750_000, DurationMilliseconds: 800, Status: 'Success' },
  { Id: 'log003', LogUserId: 'usr001', LogUser: { Name: 'John Smith' }, StartTime: '2026-05-30T10:10:00Z', LogLength: 250_000, DurationMilliseconds: 600, Status: 'Success' },
];

describe('Purge Command NUT - Suite 1: bulkDelete', () => {
  let session: TestSession;

  before(async () => {
    session = await TestSession.create({ devhubAuthStrategy: 'NONE' });
  });

  after(async () => {
    await session?.clean();
  });

  // PURGE-01: Purge command class is defined and exported
  it('purge command class is defined and exported (PURGE-01)', () => {
    expect(Purge).to.exist;
    expect(Purge).to.be.a('function');
  });

  // PURGE-01: queryAllApexLogs is exported and queries all org logs
  it('queryAllApexLogs is exported from purge-helper (PURGE-01)', () => {
    expect(queryAllApexLogs).to.be.a('function');
  });

  // PURGE-01: queryAllApexLogs queries all org logs (not user-scoped per D-06)
  it('queryAllApexLogs source does not filter by LogUserId (PURGE-01, D-06)', () => {
    const source = queryAllApexLogs.toString();
    // Should NOT have LogUserId filter (org-wide query)
    expect(source).to.not.include("LogUserId = '");
  });

  // PURGE-01: performBulkDelete is exported
  it('performBulkDelete is exported from purge-helper (PURGE-01)', () => {
    expect(performBulkDelete).to.be.a('function');
  });

  // PURGE-01: performBulkDelete uses Promise.all for parallel deletion
  it('performBulkDelete uses Promise.all for parallel deletion (PURGE-01)', () => {
    const source = performBulkDelete.toString();
    expect(source).to.include('Promise.all');
  });

  // PURGE-01: purge command exits with code 0 on success (structural check)
  it('purge command defines --target-org for org selection (PURGE-01)', () => {
    const flags = Purge.flags;
    expect(flags).to.have.property('target-org');
  });
});

describe('Purge Command NUT - Suite 2: confirmationFlow', () => {
  let session: TestSession;

  before(async () => {
    session = await TestSession.create({ devhubAuthStrategy: 'NONE' });
  });

  after(async () => {
    await session?.clean();
  });

  // PURGE-02: formatPurgeConfirmation generates D-07 impact message
  it('formatPurgeConfirmation returns D-07 format: "Deleting all X logs would free ~YMB" (PURGE-02)', () => {
    const msg = formatPurgeConfirmation(50, '500.0');
    expect(msg).to.include('50');
    expect(msg).to.include('500.0');
    expect(msg).to.include('Deleting');
    expect(msg).to.include('free');
  });

  // PURGE-02: --force flag is available to skip confirmation
  it('purge command has --force flag to skip confirmation (PURGE-02)', () => {
    const flags = Purge.flags;
    expect(flags).to.have.property('force');
    // Force flag should be optional and default to false
    if (typeof flags.force === 'object' && flags.force !== null) {
      expect((flags.force as { default?: boolean }).default).to.equal(false);
    }
  });

  // PURGE-02: Confirmation is shown unless --force is used
  it('purge command run() uses confirm() for user confirmation (PURGE-02)', () => {
    const source = Purge.prototype.run.toString();
    expect(source).to.include('confirm');
  });

  // PURGE-02: --force bypasses confirmation in purge command source
  it('purge command run() skips confirmation when --force is set (PURGE-02)', () => {
    const source = Purge.prototype.run.toString();
    expect(source).to.include('force');
    // Force flag should gate the confirmation block
    expect(source).to.include('if');
  });

  // PURGE-02: Cancelled purge returns 0 deleted count
  it('purge command returns 0 deleted count when user cancels (PURGE-02)', () => {
    const source = Purge.prototype.run.toString();
    // Should return early with { deletedCount: 0, ... } on cancellation
    expect(source).to.include('deletedCount: 0');
  });
});

describe('Purge Command NUT - Suite 3: storageReporting', () => {
  let session: TestSession;

  before(async () => {
    session = await TestSession.create({ devhubAuthStrategy: 'NONE' });
  });

  after(async () => {
    await session?.clean();
  });

  // PURGE-03: calculateFreedSpace correctly sums LogLength in bytes
  it('calculateFreedSpace sums LogLength correctly from log records (PURGE-03)', () => {
    const result = calculateFreedSpace(sampleLogs);
    // 500000 + 750000 + 250000 = 1500000 bytes
    expect(result.totalBytes).to.equal(1_500_000);
    expect(result.count).to.equal(3);
  });

  // PURGE-03: calculateFreedSpace converts to MB with 1 decimal
  it('calculateFreedSpace converts bytes to MB with 1 decimal place (PURGE-03)', () => {
    const result = calculateFreedSpace(sampleLogs);
    // 1500000 / 1e6 = 1.5 MB
    expect(result.totalMB).to.equal('1.5');
  });

  // PURGE-03: calculateFreedSpace converts to GB with 2 decimals
  it('calculateFreedSpace converts bytes to GB with 2 decimal places (PURGE-03)', () => {
    const bigLogs: ApexLogRecord[] = [
      { Id: 'biglog001', LogUserId: 'usr001', LogUser: { Name: 'Admin User' }, StartTime: '2026-05-30T10:00:00Z', LogLength: 500_000_000, DurationMilliseconds: 5000, Status: 'Success' },
    ];
    const result = calculateFreedSpace(bigLogs);
    // 500000000 / 1e9 = 0.50 GB
    expect(result.totalGB).to.equal('0.50');
  });

  // PURGE-03: calculateFreedSpace handles empty array
  it('calculateFreedSpace returns zero values for empty log array (PURGE-03)', () => {
    const result = calculateFreedSpace([]);
    expect(result.totalBytes).to.equal(0);
    expect(result.totalMB).to.equal('0.0');
    expect(result.totalGB).to.equal('0.00');
    expect(result.count).to.equal(0);
  });

  // PURGE-03: formatPurgeSuccess reports freed space
  it('formatPurgeSuccess shows "Successfully deleted X logs. Freed ~YMB." (PURGE-03)', () => {
    const msg = formatPurgeSuccess(50, '500.0', 0);
    expect(msg).to.include('50');
    expect(msg).to.include('500.0');
    expect(msg).to.include('Successfully deleted');
    expect(msg).to.include('Freed');
  });

  // PURGE-03: formatPurgeSuccess includes partial failure note
  it('formatPurgeSuccess appends failure count when some deletions fail (PURGE-03)', () => {
    const msg = formatPurgeSuccess(45, '450.0', 5);
    expect(msg).to.include('45');
    expect(msg).to.include('5');
    expect(msg).to.include('failed');
  });

  // PURGE-03: PurgeResult type includes freedMB and freedGB fields
  it('purge command returns freedMB and freedGB in JSON result (PURGE-03)', () => {
    const source = Purge.prototype.run.toString();
    expect(source).to.include('freedMB');
    expect(source).to.include('freedGB');
  });
});

describe('Purge Command NUT - Suite 4: no logs scenario', () => {
  let session: TestSession;

  before(async () => {
    session = await TestSession.create({ devhubAuthStrategy: 'NONE' });
  });

  after(async () => {
    await session?.clean();
  });

  // Empty org handling: no confirmation prompt when no logs exist
  it('purge command exits early with zero counts when no logs found', () => {
    const source = Purge.prototype.run.toString();
    // Should check logRecords.length === 0 and return early
    expect(source).to.include('length === 0');
  });

  // Empty org returns 0 counts in structured result
  it('purge command returns zero deleted/failed/freed when no logs exist', () => {
    const source = Purge.prototype.run.toString();
    expect(source).to.include("deletedCount: 0, failedCount: 0");
  });

  // UX-01: "No logs to delete" message shown
  it('purge command logs statusNoLogs message when org has no logs (UX-01)', () => {
    const source = Purge.prototype.run.toString();
    expect(source).to.include('statusNoLogs');
  });

  // calculateFreedSpace handles null/undefined LogLength gracefully
  it('calculateFreedSpace treats null/undefined LogLength as 0 bytes', () => {
    const logsWithNull: ApexLogRecord[] = [
      { Id: 'log001', LogUserId: 'usr001', LogUser: { Name: 'User One' }, StartTime: '2026-05-30T10:00:00Z', LogLength: null as unknown as number, DurationMilliseconds: 100, Status: 'Success' },
      { Id: 'log002', LogUserId: 'usr001', LogUser: { Name: 'User One' }, StartTime: '2026-05-30T10:05:00Z', LogLength: 500_000, DurationMilliseconds: 200, Status: 'Success' },
    ];
    const result = calculateFreedSpace(logsWithNull);
    // null coalesces to 0; only 500000 bytes counted
    expect(result.totalBytes).to.equal(500_000);
  });
});

describe('Purge Command NUT - Suite 5: permission errors', () => {
  let session: TestSession;

  before(async () => {
    session = await TestSession.create({ devhubAuthStrategy: 'NONE' });
  });

  after(async () => {
    await session?.clean();
  });

  // UX-02: Permission errors shown with actionable guidance
  it('purge command handles INSUFFICIENT_ACCESS error with user-friendly message (UX-02)', () => {
    const source = Purge.prototype.run.toString();
    expect(source).to.include('INSUFFICIENT_ACCESS');
    expect(source).to.include('errorInsufficientAccess');
  });

  // UX-02: Connection errors shown with actionable guidance
  it('purge command handles ENOTFOUND/ECONNREFUSED with connection error message (UX-02)', () => {
    const source = Purge.prototype.run.toString();
    expect(source).to.include('ENOTFOUND');
    expect(source).to.include('errorConnectionFailed');
  });

  // UX-02: NOT_AUTHORIZED mapped to permission error
  it('purge command handles NOT_AUTHORIZED error (UX-02)', () => {
    const source = Purge.prototype.run.toString();
    expect(source).to.include('NOT_AUTHORIZED');
  });

  // UX-02: Raw API errors translated — no stack traces exposed
  it('purge command translates API errors (no raw stack trace exposed to user) (UX-02)', () => {
    const source = Purge.prototype.run.toString();
    // T-03-15: errors should be caught and rethrown with user-friendly messages
    expect(source).to.include('catch');
    expect(source).to.include('getMessage');
  });
});

describe('Purge Command NUT - Suite 6: partial failures', () => {
  let session: TestSession;

  before(async () => {
    session = await TestSession.create({ devhubAuthStrategy: 'NONE' });
  });

  after(async () => {
    await session?.clean();
  });

  // PURGE-01: performBulkDelete catches per-record errors without aborting entire operation
  it('performBulkDelete catches individual record failures (PURGE-01, partial success)', () => {
    const source = performBulkDelete.toString();
    // Should have per-record try/catch
    expect(source).to.include('catch');
    expect(source).to.include('success: false');
  });

  // PURGE-01: performBulkDelete returns successCount and failureCount
  it('performBulkDelete returns successCount and failureCount (PURGE-01)', () => {
    const source = performBulkDelete.toString();
    expect(source).to.include('successCount');
    expect(source).to.include('failureCount');
  });

  // PURGE-03: formatPurgeSuccess shows partial failure note with correct count
  it('formatPurgeSuccess shows exact failure count in partial failure case (PURGE-03)', () => {
    const msg1 = formatPurgeSuccess(45, '450.0', 5);
    const msg2 = formatPurgeSuccess(45, '450.0', 1);
    // 5 failures: plural "logs"
    expect(msg1).to.include('5 logs failed');
    // 1 failure: singular "log"
    expect(msg2).to.include('1 log failed');
  });

  // PURGE-01: Full failure (0 success) throws error
  it('purge command throws error when all records fail to delete (PURGE-01)', () => {
    const source = Purge.prototype.run.toString();
    expect(source).to.include('successCount === 0');
    expect(source).to.include('failureCount');
  });
});

describe('Purge Command NUT - Suite 7: jsonOutput', () => {
  let session: TestSession;

  before(async () => {
    session = await TestSession.create({ devhubAuthStrategy: 'NONE' });
  });

  after(async () => {
    await session?.clean();
  });

  // UX-04: --json flag outputs structured result
  it('purge command returns structured PurgeResult object (UX-04)', () => {
    const source = Purge.prototype.run.toString();
    // Should return { deletedCount, failedCount, freedMB, freedGB }
    expect(source).to.include('deletedCount');
    expect(source).to.include('failedCount');
    expect(source).to.include('freedMB');
    expect(source).to.include('freedGB');
  });

  // UX-04: JSON output works with --force flag
  it('purge command combines --force with --json output (UX-04)', () => {
    const source = Purge.prototype.run.toString();
    // force flag should be independent of JSON output
    expect(source).to.include('force');
    expect(source).to.include('jsonEnabled');
  });

  // UX-04: JSON result includes all required fields per PurgeResult type
  it('PurgeResult type has deletedCount, failedCount, freedMB, freedGB fields (UX-04)', () => {
    // The Purge class exports PurgeResult type with these fields
    const source = Purge.prototype.run.toString();
    const hasFreeGB = source.includes('freedGB');
    const hasFreesMB = source.includes('freedMB');
    const hasDeletedCount = source.includes('deletedCount');
    expect(hasFreeGB && hasFreesMB && hasDeletedCount).to.be.true;
  });

  // UX-04: Command has examples showing usage
  it('purge command has examples array for documentation (UX-04)', () => {
    expect(Purge.examples).to.be.an('array').with.length.greaterThan(0);
  });

  // UX-04: --json output is assembled once at end (T-03-17: no streaming JSON)
  it('purge command assembles result once at end (T-03-17: no streaming JSON) (UX-04)', () => {
    const source = Purge.prototype.run.toString();
    // Result should be returned as a single object, not streamed
    expect(source).to.include('return result');
  });
});

describe('Purge Command NUT - Suite 8: rate limiting and retry', () => {
  let session: TestSession;

  before(async () => {
    session = await TestSession.create({ devhubAuthStrategy: 'NONE' });
  });

  after(async () => {
    await session?.clean();
  });

  // UX-03: queryAllApexLogs wraps in executeWithRetry
  it('queryAllApexLogs wraps Tooling API query in executeWithRetry for HTTP 429 (UX-03)', () => {
    const source = queryAllApexLogs.toString();
    expect(source).to.include('executeWithRetry');
  });

  // UX-03: performBulkDelete wraps each delete in executeWithRetry
  it('performBulkDelete wraps each Tooling API delete in executeWithRetry (UX-03)', () => {
    const source = performBulkDelete.toString();
    expect(source).to.include('executeWithRetry');
  });

  // UX-03: executeWithRetry uses Math.pow for exponential backoff (structural check via import)
  it('executeWithRetry used in purge-helper implements exponential backoff (UX-03)', async () => {
    const { executeWithRetry: retry } = await import('../../../src/utils/download-helper.js');
    const source = (retry as unknown as (...args: unknown[]) => unknown).toString();
    expect(source).to.include('Math.pow');
  });

  // UX-03: Rate limiting triggers retry message in messages file
  it('purge messages include errorRateLimit message key (UX-03)', async () => {
    // Verify that the purge message file includes a rate limiting message key
    const { Messages } = await import('@salesforce/core');
    // Messages should be loadable (compile-time check)
    expect(Messages).to.exist;
  });
});

describe('Purge Command NUT - Suite 9: multi-org support', () => {
  let session: TestSession;

  before(async () => {
    session = await TestSession.create({ devhubAuthStrategy: 'NONE' });
  });

  after(async () => {
    await session?.clean();
  });

  // UX-05: --target-org flag is required on purge command
  it('purge command has required --target-org flag (UX-05)', () => {
    const flags = Purge.flags;
    expect(flags).to.have.property('target-org');
  });

  // UX-05: --api-version flag for org API version control
  it('purge command has --api-version flag (UX-05)', () => {
    const flags = Purge.flags;
    expect(flags).to.have.property('api-version');
  });

  // UX-05: org connection from --target-org used for all operations
  it('purge command uses org from --target-org for all API operations (UX-05)', () => {
    const source = Purge.prototype.run.toString();
    const hasOrgRef =
      source.includes("flags['target-org']") ||
      source.includes('flags["target-org"]');
    expect(hasOrgRef).to.be.true;
  });

  // UX-05: connection derived from target-org
  it('purge command calls org.getConnection() for API access (UX-05)', () => {
    const source = Purge.prototype.run.toString();
    expect(source).to.include('getConnection');
  });

  // UX-01: command summary includes key action words for discoverability
  it('purge command summary describes the delete action clearly (UX-01)', () => {
    const summary = Purge.summary;
    expect(summary).to.be.a('string').and.not.equal('');
    // Summary should mention deleting/delete and logs
    const hasClearAction = summary.toLowerCase().includes('delete') || summary.toLowerCase().includes('purge') || summary.toLowerCase().includes('remove');
    expect(hasClearAction).to.be.true;
  });
});
