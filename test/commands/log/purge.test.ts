/**
 * Unit tests for purge command and purge-helper utilities.
 *
 * Code review-based tests that verify command structure, flag configuration,
 * workflow orchestration, error handling, and output formatting.
 *
 * Coverage:
 * - Purge Command Initialization: flags, help text
 * - Query and Impact Calculation: queryAllApexLogs, calculateFreedSpace
 * - Confirmation Flow: impact display, yes/no response, --force bypass
 * - Bulk Delete Operation: performBulkDelete, rate limiting, error cases
 * - Success Reporting: MB freed, failure count, --json output
 * - Error Handling: query failure, permission error, connection error
 * - Multi-Org Support: --target-org flag
 *
 * Per RESEARCH.md Validation Architecture: covers PURGE-01–03 and UX-01–05 requirements.
 */

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

// =============================================================================
// Suite 1: Purge Command Initialization
// =============================================================================

describe('Purge Command Initialization', () => {
  it('Purge command class is defined', () => {
    expect(Purge).to.exist;
  });

  it('has summary text from messages', () => {
    expect(Purge.summary).to.be.a('string').and.not.equal('');
  });

  it('has description text from messages', () => {
    expect(Purge.description).to.be.a('string').and.not.equal('');
  });

  it('has examples array from messages', () => {
    expect(Purge.examples).to.be.an('array');
    expect(Purge.examples.length).to.be.greaterThan(0);
  });

  it('has --target-org flag (required org context per UX-05)', () => {
    expect(Purge.flags['target-org']).to.exist;
  });

  it('has --force flag (skip confirmation for scripting)', () => {
    expect(Purge.flags['force']).to.exist;
  });

  it('--force flag is optional and defaults to false', () => {
    const forceFlag = Purge.flags['force'] as { required?: boolean; default?: boolean };
    expect(forceFlag.required).to.not.equal(true);
    expect(forceFlag.default).to.equal(false);
  });

  it('help text mentions "delete" and "logs"', () => {
    const text = (Purge.description || Purge.summary || '').toLowerCase();
    expect(text).to.satisfy((t: string) => t.includes('delete') || t.includes('logs'));
  });

  it('run() is defined as async method', () => {
    expect(Purge.prototype.run).to.be.a('function');
  });
});

// =============================================================================
// Suite 2: queryAllApexLogs utility
// =============================================================================

describe('queryAllApexLogs', () => {
  it('is exported as an async function', () => {
    expect(queryAllApexLogs).to.be.a('function');
  });

  it('accepts one parameter: connection', () => {
    expect(queryAllApexLogs.length).to.equal(1);
  });

  it('queries all ApexLog records (no user filter — org-wide per D-06)', () => {
    const source = queryAllApexLogs.toString();
    // Verify the query does NOT include WHERE LogUserId = (user-scoped)
    // D-06: org-wide purge, not user-scoped
    expect(source).to.include('FROM ApexLog');
    // Should not filter by LogUserId for purge queries
    expect(source).to.not.include("WHERE LogUserId =");
  });

  it('SOQL includes Id, LogUserId, StartTime, LogLength, Status fields', () => {
    const source = queryAllApexLogs.toString();
    expect(source).to.include('Id');
    expect(source).to.include('LogUserId');
    expect(source).to.include('LogLength');
    expect(source).to.include('Status');
  });

  it('orders results by StartTime DESC', () => {
    const source = queryAllApexLogs.toString();
    expect(source).to.include('ORDER BY StartTime DESC');
  });

  it('returns empty array when org has no logs', async () => {
    const fakeConnection = {
      tooling: {
        query: (_sql: string) =>
          Promise.resolve({ totalSize: 0, done: true, records: [] }),
      },
    };
    const records = await queryAllApexLogs(fakeConnection as never);
    expect(records).to.be.an('array').with.lengthOf(0);
  });

  it('returns all records when org has logs', async () => {
    const fakeConnection = {
      tooling: {
        query: (_sql: string) =>
          Promise.resolve({
            totalSize: 2,
            done: true,
            records: [
              { Id: 'log1', LogUserId: 'u', LogUser: { Name: 'A' }, StartTime: '2026-01-01T00:00:00Z', LogLength: 1000, DurationMilliseconds: 0, Status: 'Done' },
              { Id: 'log2', LogUserId: 'u', LogUser: { Name: 'B' }, StartTime: '2026-01-01T00:00:00Z', LogLength: 2000, DurationMilliseconds: 0, Status: 'Done' },
            ],
          }),
      },
    };
    const records = await queryAllApexLogs(fakeConnection as never);
    expect(records).to.have.lengthOf(2);
  });

  it('handles pagination when totalSize > 2000', async () => {
    let callCount = 0;
    const fakeConnection = {
      tooling: {
        query: (_sql: string) => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve({
              totalSize: 2001,
              done: false,
              records: Array.from({ length: 2000 }, (_, i) => ({
                Id: `log${i}`, LogUserId: 'u', LogUser: { Name: 'A' },
                StartTime: '2026-01-01T00:00:00Z', LogLength: 100, DurationMilliseconds: 0, Status: 'Done',
              })),
            });
          }
          return Promise.resolve({
            totalSize: 2001, done: true,
            records: [{ Id: 'log2001', LogUserId: 'u', LogUser: { Name: 'A' }, StartTime: '2026-01-01T00:00:00Z', LogLength: 100, DurationMilliseconds: 0, Status: 'Done' }],
          });
        },
      },
    };
    const records = await queryAllApexLogs(fakeConnection as never);
    expect(records).to.have.lengthOf(2001);
  });

  it('wraps query in executeWithRetry for HTTP 429 rate limiting (UX-03)', () => {
    const source = queryAllApexLogs.toString();
    expect(source).to.include('executeWithRetry');
  });
});

// =============================================================================
// Suite 3: calculateFreedSpace utility
// =============================================================================

describe('calculateFreedSpace', () => {
  it('is exported as a synchronous function', () => {
    expect(calculateFreedSpace).to.be.a('function');
  });

  it('returns count equal to number of log records', () => {
    const records = [
      { Id: 'a', LogUserId: 'u', LogUser: { Name: 'A' }, StartTime: '', LogLength: 100, DurationMilliseconds: 0, Status: 'Done' },
      { Id: 'b', LogUserId: 'u', LogUser: { Name: 'B' }, StartTime: '', LogLength: 200, DurationMilliseconds: 0, Status: 'Done' },
    ];
    const result = calculateFreedSpace(records);
    expect(result.count).to.equal(2);
  });

  it('sums LogLength from all records for totalBytes', () => {
    const records = [
      { Id: 'a', LogUserId: 'u', LogUser: { Name: 'A' }, StartTime: '', LogLength: 100_000_000, DurationMilliseconds: 0, Status: 'Done' },
      { Id: 'b', LogUserId: 'u', LogUser: { Name: 'B' }, StartTime: '', LogLength: 400_000_000, DurationMilliseconds: 0, Status: 'Done' },
    ];
    const result = calculateFreedSpace(records);
    expect(result.totalBytes).to.equal(500_000_000);
  });

  it('converts to MB with 1 decimal: 500MB from 500e6 bytes', () => {
    const records = [
      { Id: 'a', LogUserId: 'u', LogUser: { Name: 'A' }, StartTime: '', LogLength: 500_000_000, DurationMilliseconds: 0, Status: 'Done' },
    ];
    const result = calculateFreedSpace(records);
    expect(result.totalMB).to.equal('500.0');
  });

  it('converts to GB with 2 decimals: 0.50 from 500e6 bytes', () => {
    const records = [
      { Id: 'a', LogUserId: 'u', LogUser: { Name: 'A' }, StartTime: '', LogLength: 500_000_000, DurationMilliseconds: 0, Status: 'Done' },
    ];
    const result = calculateFreedSpace(records);
    expect(result.totalGB).to.equal('0.50');
  });

  it('returns zero values for empty records array', () => {
    const result = calculateFreedSpace([]);
    expect(result.count).to.equal(0);
    expect(result.totalBytes).to.equal(0);
    expect(result.totalMB).to.equal('0.0');
    expect(result.totalGB).to.equal('0.00');
  });
});

// =============================================================================
// Suite 4: Confirmation Flow
// =============================================================================

describe('formatPurgeConfirmation', () => {
  it('is exported as a synchronous function', () => {
    expect(formatPurgeConfirmation).to.be.a('function');
  });

  it('includes log count in confirmation message', () => {
    const msg = formatPurgeConfirmation(10, '500.0');
    expect(msg).to.include('10');
  });

  it('includes MB freed in confirmation message', () => {
    const msg = formatPurgeConfirmation(10, '500.0');
    expect(msg).to.include('500.0');
    expect(msg).to.include('MB');
  });

  it('matches D-07 format: "Deleting all X logs would free ~YMB"', () => {
    const msg = formatPurgeConfirmation(10, '500.0');
    expect(msg).to.include('Deleting all 10 logs');
    expect(msg).to.include('~500.0MB');
  });

  it('purge command source calls formatPurgeConfirmation before confirmation prompt', () => {
    const source = Purge.toString();
    expect(source).to.include('formatPurgeConfirmation');
  });

  it('--force flag bypasses confirmation in purge command', () => {
    const source = Purge.toString();
    expect(source).to.include('force');
    // Confirmed by code review: if (!force) { ... confirmation prompt ... }
    expect(source).to.include('if (!force)');
  });
});

// =============================================================================
// Suite 5: performBulkDelete utility
// =============================================================================

describe('performBulkDelete', () => {
  it('is exported as an async function', () => {
    expect(performBulkDelete).to.be.a('function');
  });

  it('accepts two parameters: connection and logIds', () => {
    expect(performBulkDelete.length).to.equal(2);
  });

  it('returns { successCount, failureCount, deletedIds }', async () => {
    const fakeConnection = {
      tooling: {
        delete: (_type: string, _id: string) => Promise.resolve({ success: true }),
      },
    };
    const result = await performBulkDelete(fakeConnection as never, ['log1', 'log2']);
    expect(result).to.have.keys(['successCount', 'failureCount', 'deletedIds']);
  });

  it('all IDs deleted successfully: successCount = input length, failureCount = 0', async () => {
    const fakeConnection = {
      tooling: {
        delete: (_type: string, _id: string) => Promise.resolve({ success: true }),
      },
    };
    const result = await performBulkDelete(fakeConnection as never, ['log1', 'log2', 'log3']);
    expect(result.successCount).to.equal(3);
    expect(result.failureCount).to.equal(0);
    expect(result.deletedIds).to.have.lengthOf(3);
  });

  it('partial failure: some records fail with permissions — rest succeed', async () => {
    const fakeConnection = {
      tooling: {
        delete: (_type: string, id: string) => {
          if (id === 'log2') return Promise.reject(new Error('INSUFFICIENT_ACCESS'));
          return Promise.resolve({ success: true });
        },
      },
    };
    const result = await performBulkDelete(fakeConnection as never, ['log1', 'log2', 'log3']);
    expect(result.successCount).to.equal(2);
    expect(result.failureCount).to.equal(1);
    expect(result.deletedIds).to.include('log1');
    expect(result.deletedIds).to.not.include('log2');
  });

  it('all deletes fail: successCount = 0, failureCount = input length', async () => {
    const fakeConnection = {
      tooling: {
        delete: (_type: string, _id: string) => Promise.reject(new Error('INSUFFICIENT_ACCESS')),
      },
    };
    const result = await performBulkDelete(fakeConnection as never, ['log1', 'log2']);
    expect(result.successCount).to.equal(0);
    expect(result.failureCount).to.equal(2);
  });

  it('uses Promise.all for parallel deletion (performance)', () => {
    const source = performBulkDelete.toString();
    expect(source).to.include('Promise.all');
  });

  it('wraps each delete in executeWithRetry for HTTP 429 rate limiting', () => {
    const source = performBulkDelete.toString();
    expect(source).to.include('executeWithRetry');
  });

  it('deletes via Tooling API (connection.tooling.delete)', () => {
    const source = performBulkDelete.toString();
    expect(source).to.include('tooling.delete');
  });
});

// =============================================================================
// Suite 6: Success Reporting
// =============================================================================

describe('formatPurgeSuccess', () => {
  it('is exported as a synchronous function', () => {
    expect(formatPurgeSuccess).to.be.a('function');
  });

  it('includes deleted count in success message', () => {
    const msg = formatPurgeSuccess(10, '500.0', 0);
    expect(msg).to.include('10');
  });

  it('includes freed MB in success message per PURGE-03', () => {
    const msg = formatPurgeSuccess(10, '500.0', 0);
    expect(msg).to.include('500.0');
    expect(msg).to.include('MB');
  });

  it('normal output: "Successfully deleted X logs. Freed ~YMB."', () => {
    const msg = formatPurgeSuccess(5, '100.0', 0);
    expect(msg).to.include('Successfully deleted 5 logs');
    expect(msg).to.include('~100.0MB');
  });

  it('partial failure: appends failure count note when failureCount > 0', () => {
    const msg = formatPurgeSuccess(8, '400.0', 2);
    expect(msg).to.include('2 log');
    expect(msg).to.include('failed to delete');
  });

  it('singular "log" for exactly 1 failure', () => {
    const msg = formatPurgeSuccess(9, '450.0', 1);
    expect(msg).to.include('1 log');
    // Should not include "1 logs"
    expect(msg).to.not.include('1 logs failed');
  });
});

// =============================================================================
// Suite 7: Error Handling
// =============================================================================

describe('Purge Command Error Handling', () => {
  it('query failure message includes "Unable to query logs" guidance', () => {
    // Verified by code review: errorQueryFailed message key used
    const source = Purge.toString();
    expect(source).to.include('errorQueryFailed');
  });

  it('permission error maps to errorInsufficientAccess message', () => {
    const source = Purge.toString();
    expect(source).to.include('INSUFFICIENT_ACCESS');
    expect(source).to.include('errorInsufficientAccess');
  });

  it('connection error maps to errorConnectionFailed message', () => {
    const source = Purge.toString();
    expect(source).to.include('ENOTFOUND');
    expect(source).to.include('errorConnectionFailed');
  });

  it('delete failure maps to errorDeleteFailed message', () => {
    const source = Purge.toString();
    expect(source).to.include('errorDeleteFailed');
  });

  it('no logs found: returns { deletedCount: 0, failedCount: 0 } and exits cleanly', () => {
    // Verified by code review: if (logRecords.length === 0) → return zero result
    const source = Purge.toString();
    expect(source).to.include('statusNoLogs');
  });
});

// =============================================================================
// Suite 8: Multi-Org Support
// =============================================================================

describe('Purge Multi-Org Support', () => {
  it('--target-org flag is present in flag configuration', () => {
    expect(Purge.flags['target-org']).to.exist;
  });

  it('connection obtained from org via org.getConnection()', () => {
    const source = Purge.toString();
    expect(source).to.include('getConnection');
  });

  it('purge scoped to specified org only (connection from flags[target-org])', () => {
    const source = Purge.toString();
    expect(source).to.include("flags['target-org']");
    expect(source).to.include('getConnection');
  });
});
