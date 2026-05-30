/**
 * Unit tests for quota-calculator utilities.
 *
 * Code review-based tests that verify function signatures, API patterns,
 * error message formatting, and quota calculation logic.
 *
 * Coverage:
 * - getRemainingQuota: REST Limits API parsing, T-03-04 validation, fallback behavior
 * - getRemainingQuotaFallback: SOQL aggregation, empty org case
 * - validateQuotaAvailable: threshold check, D-05 error message format
 * - formatQuotaMessage: human-readable quota display
 *
 * Per RESEARCH.md Validation Architecture: covers DOWNLOAD-03 and DOWNLOAD-04 requirements.
 */

import { expect } from 'chai';
import { describe, it } from 'mocha';
import {
  getRemainingQuota,
  getRemainingQuotaFallback,
  validateQuotaAvailable,
  formatQuotaMessage,
} from '../../src/utils/quota-calculator.js';

describe('getRemainingQuota', () => {
  it('is exported as an async function', () => {
    expect(getRemainingQuota).to.be.a('function');
  });

  it('accepts one parameter: connection', () => {
    expect(getRemainingQuota.length).to.equal(1);
  });

  it('returns { usedMB, remainingMB, totalMB } when REST Limits API responds correctly', async () => {
    // Example: Max=1e9, Remaining=5e8 → usedMB=500, remainingMB=500, totalMB=1000
    const fakeConnection = {
      request: () =>
        Promise.resolve({
          DebugLogs: {
            Max: 1_000_000_000,
            Remaining: 500_000_000,
          },
        }),
    };
    const quota = await getRemainingQuota(fakeConnection as never);
    expect(quota.usedMB).to.be.closeTo(500, 0.1);
    expect(quota.remainingMB).to.be.closeTo(500, 0.1);
    expect(quota.totalMB).to.be.closeTo(1000, 0.1);
  });

  it('calls REST Limits API via GET /services/data/v67.0/limits', () => {
    // Verify the source code uses the correct REST endpoint
    const source = getRemainingQuota.toString();
    expect(source).to.include('/services/data/');
    expect(source).to.include('limits');
  });

  it('parses DebugLogs.Max as total bytes and DebugLogs.Remaining as remaining bytes', async () => {
    const fakeConnection = {
      request: () =>
        Promise.resolve({
          DebugLogs: {
            Max: 1_000_000_000,
            Remaining: 250_000_000,
          },
        }),
    };
    const quota = await getRemainingQuota(fakeConnection as never);
    // Used = Max - Remaining = 750MB
    expect(quota.usedMB).to.be.closeTo(750, 0.1);
    expect(quota.remainingMB).to.be.closeTo(250, 0.1);
    expect(quota.totalMB).to.be.closeTo(1000, 0.1);
  });

  it('falls back to aggregation when REST Limits API response has invalid values (T-03-04)', async () => {
    // T-03-04: invalid response (used > total) should trigger fallback
    const fakeConnection = {
      request: () =>
        Promise.resolve({
          DebugLogs: {
            Max: 500_000_000, // Max < what's "used" — invalid
            Remaining: 700_000_000, // Remaining > Max: violates Max >= Remaining
          },
        }),
      tooling: {
        query: () =>
          Promise.resolve({
            records: [{ totalSize: 0 }],
          }),
      },
    };
    // Should fall back gracefully (no throw)
    const quota = await getRemainingQuota(fakeConnection as never);
    expect(quota).to.have.property('usedMB');
    expect(quota).to.have.property('remainingMB');
    expect(quota).to.have.property('totalMB');
  });

  it('falls back to aggregation when DebugLogs field is missing from REST Limits API', async () => {
    const fakeConnection = {
      request: () =>
        Promise.resolve({
          // No DebugLogs field
          Apex: { Max: 1000, Remaining: 500 },
        }),
      tooling: {
        query: () =>
          Promise.resolve({
            records: [{ totalSize: 100_000_000 }],
          }),
      },
    };
    const quota = await getRemainingQuota(fakeConnection as never);
    expect(quota).to.have.property('totalMB');
    expect(quota.totalMB).to.be.closeTo(1000, 0.1); // 1GB total
  });

  it('falls back to aggregation when REST Limits API throws an error', async () => {
    const fakeConnection = {
      request: () => Promise.reject(new Error('API unavailable')),
      tooling: {
        query: () =>
          Promise.resolve({
            records: [{ totalSize: 200_000_000 }],
          }),
      },
    };
    // Should not throw — uses fallback
    const quota = await getRemainingQuota(fakeConnection as never);
    expect(quota.usedMB).to.be.closeTo(200, 0.1);
  });

  it('wraps API call in executeWithRetry (rate limiting handled)', () => {
    // Verified by code review: getRemainingQuota wraps connection.request() in executeWithRetry
    const source = getRemainingQuota.toString();
    expect(source).to.include('executeWithRetry');
  });
});

describe('getRemainingQuotaFallback', () => {
  it('is exported as an async function', () => {
    expect(getRemainingQuotaFallback).to.be.a('function');
  });

  it('queries ApexLog: SELECT SUM(LogLength) totalSize FROM ApexLog', () => {
    const source = getRemainingQuotaFallback.toString();
    expect(source).to.include('SUM(LogLength)');
    expect(source).to.include('ApexLog');
  });

  it('calculates remaining as 1GB minus total used bytes', async () => {
    const fakeConnection = {
      tooling: {
        query: () =>
          Promise.resolve({
            records: [{ totalSize: 300_000_000 }], // 300MB used
          }),
      },
    };
    const quota = await getRemainingQuotaFallback(fakeConnection as never);
    expect(quota.usedMB).to.be.closeTo(300, 0.1);
    expect(quota.remainingMB).to.be.closeTo(700, 0.1);
    expect(quota.totalMB).to.be.closeTo(1000, 0.1);
  });

  it('returns same format as getRemainingQuota: { usedMB, remainingMB, totalMB }', async () => {
    const fakeConnection = {
      tooling: {
        query: () =>
          Promise.resolve({ records: [{ totalSize: 0 }] }),
      },
    };
    const quota = await getRemainingQuotaFallback(fakeConnection as never);
    expect(quota).to.have.keys(['usedMB', 'remainingMB', 'totalMB']);
  });

  it('handles empty org (no logs exist): totalSize defaults to 0, remaining = 1GB', async () => {
    const fakeConnection = {
      tooling: {
        query: () =>
          Promise.resolve({
            records: [{ totalSize: null }], // null totalSize from SUM on empty set
          }),
      },
    };
    const quota = await getRemainingQuotaFallback(fakeConnection as never);
    expect(quota.usedMB).to.equal(0);
    expect(quota.remainingMB).to.be.closeTo(1000, 0.1);
  });
});

describe('validateQuotaAvailable', () => {
  it('is exported as an async function', () => {
    expect(validateQuotaAvailable).to.be.a('function');
  });

  it('returns true when remaining quota >= required bytes', async () => {
    const fakeConnection = {
      request: () =>
        Promise.resolve({
          DebugLogs: { Max: 1_000_000_000, Remaining: 500_000_000 },
        }),
    };
    const result = await validateQuotaAvailable(fakeConnection as never, 100_000_000);
    expect(result).to.equal(true);
  });

  it('throws when remaining quota < required bytes', async () => {
    const fakeConnection = {
      request: () =>
        Promise.resolve({
          DebugLogs: { Max: 1_000_000_000, Remaining: 50_000_000 }, // 50MB remaining
        }),
    };
    try {
      await validateQuotaAvailable(fakeConnection as never, 100_000_000); // Need 100MB
      expect.fail('should have thrown');
    } catch (error) {
      expect((error as Error).message).to.include('Storage quota exceeded');
    }
  });

  it('error message follows D-05 format: includes used/total MB and purge suggestion', async () => {
    const fakeConnection = {
      request: () =>
        Promise.resolve({
          DebugLogs: { Max: 1_000_000_000, Remaining: 50_000_000 }, // 950MB used
        }),
    };
    try {
      await validateQuotaAvailable(fakeConnection as never, 100_000_000);
      expect.fail('should have thrown');
    } catch (error) {
      const msg = (error as Error).message;
      // D-05 format: "Storage quota exceeded. Current: XMB/YMB. Run: sf log purge..."
      expect(msg).to.include('Storage quota exceeded');
      expect(msg).to.include('MB');
      expect(msg).to.include('sf log purge');
    }
  });

  it('error message includes actual used MB and total MB values', async () => {
    const fakeConnection = {
      request: () =>
        Promise.resolve({
          DebugLogs: { Max: 1_000_000_000, Remaining: 50_000_000 },
        }),
    };
    try {
      await validateQuotaAvailable(fakeConnection as never, 100_000_000);
      expect.fail('should have thrown');
    } catch (error) {
      const msg = (error as Error).message;
      // Should contain numeric values (950MB used, 1000MB total)
      expect(msg).to.match(/\d+MB/);
    }
  });

  it('calls getRemainingQuota to check current quota', () => {
    // Verified by code review: validateQuotaAvailable calls getRemainingQuota internally
    const source = validateQuotaAvailable.toString();
    expect(source).to.include('getRemainingQuota');
  });
});

describe('formatQuotaMessage', () => {
  it('is exported as a synchronous function', () => {
    expect(formatQuotaMessage).to.be.a('function');
  });

  it('accepts three parameters: usedMB, remainingMB, totalMB', () => {
    expect(formatQuotaMessage.length).to.equal(3);
  });

  it('formats message as "Used: XMB / YMB (Remaining: ZMB)"', () => {
    const msg = formatQuotaMessage(500, 500, 1000);
    expect(msg).to.include('Used:');
    expect(msg).to.include('500.0MB');
    expect(msg).to.include('1000.0MB');
    expect(msg).to.include('Remaining:');
  });

  it('rounds to 1 decimal place: 500.456MB → 500.5MB', () => {
    const msg = formatQuotaMessage(500.456, 499.544, 1000);
    expect(msg).to.include('500.5');
  });

  it('handles edge case: 0MB used', () => {
    const msg = formatQuotaMessage(0, 1000, 1000);
    expect(msg).to.include('0.0MB');
    expect(msg).to.include('1000.0MB');
  });

  it('handles edge case: quota completely full (1000MB used)', () => {
    const msg = formatQuotaMessage(1000, 0, 1000);
    expect(msg).to.include('1000.0MB');
    expect(msg).to.include('0.0MB');
  });
});
