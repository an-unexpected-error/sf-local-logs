/**
 * Unit tests for trace-helper utilities.
 *
 * Code review-based and behavior-contract tests for trace flag operations.
 *
 * Coverage:
 * - detectAndExpireOverlappingTraces: overlap detection, batch expiration, error handling
 *
 * Per 05-RESEARCH.md Validation Architecture: covers TRACE-01, TRACE-03, TRACE-08.
 */

import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
import sinon from 'sinon';
import { detectAndExpireOverlappingTraces } from '../../src/utils/trace-helper.js';

describe('detectAndExpireOverlappingTraces', () => {
  let sandbox: sinon.SinonSandbox;
  let fakeConnection: {
    tooling: {
      query: sinon.SinonStub;
      update: sinon.SinonStub;
    };
  };
  let fakeOrg: { getConnection: sinon.SinonStub };

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    fakeConnection = {
      tooling: {
        query: sandbox.stub(),
        update: sandbox.stub(),
      },
    };
    fakeOrg = {
      getConnection: sandbox.stub().returns(fakeConnection),
    };
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('returns empty array when no overlapping traces are found (no overlap)', async () => {
    // tooling.query returns empty records array → function returns []
    fakeConnection.tooling.query.resolves({
      totalSize: 0,
      done: true,
      records: [],
    });

    const result = await detectAndExpireOverlappingTraces(fakeOrg as never, 'userId001');

    expect(result).to.be.an('array').with.lengthOf(0);
  });

  it('returns array with one element when single overlapping trace is found and expired (single overlap)', async () => {
    // tooling.query returns one record; tooling.update resolves successfully
    fakeConnection.tooling.query.resolves({
      totalSize: 1,
      done: true,
      records: [{ Id: 'tf001', ExpirationDate: '2026-06-02T00:00:00Z' }],
    });
    fakeConnection.tooling.update.resolves([{ id: 'tf001', success: true, errors: [] }]);

    const result = await detectAndExpireOverlappingTraces(fakeOrg as never, 'userId001');

    expect(result).to.be.an('array').with.lengthOf(1);
    expect(result[0].id).to.equal('tf001');
    expect(result[0].expirationDate).to.equal('2026-06-02T00:00:00Z');
  });

  it('expires all traces in a single batch call when multiple overlapping traces exist (multiple overlaps)', async () => {
    // tooling.query returns 3 records; tooling.update should be called ONCE with array of 3
    const records = [
      { Id: 'tf001', ExpirationDate: '2026-06-02T00:00:00Z' },
      { Id: 'tf002', ExpirationDate: '2026-06-03T00:00:00Z' },
      { Id: 'tf003', ExpirationDate: '2026-06-04T00:00:00Z' },
    ];
    fakeConnection.tooling.query.resolves({
      totalSize: 3,
      done: true,
      records,
    });
    fakeConnection.tooling.update.resolves([
      { id: 'tf001', success: true, errors: [] },
      { id: 'tf002', success: true, errors: [] },
      { id: 'tf003', success: true, errors: [] },
    ]);

    const result = await detectAndExpireOverlappingTraces(fakeOrg as never, 'userId001');

    // tooling.update must be called exactly ONCE (batch, not sequential) — TRACE-08
    expect(fakeConnection.tooling.update.calledOnce).to.equal(true);
    // Second argument must be an array of length 3
    const updateArg = fakeConnection.tooling.update.firstCall.args[1];
    expect(updateArg).to.be.an('array').with.lengthOf(3);
    // Result should contain all 3 stopped traces
    expect(result).to.be.an('array').with.lengthOf(3);
  });

  it('returns empty array and does NOT throw when the detection query fails (query fails)', async () => {
    // tooling.query rejects → function should return [] without throwing (per D-13)
    fakeConnection.tooling.query.rejects(new Error('SOQL error'));

    const result = await detectAndExpireOverlappingTraces(fakeOrg as never, 'userId001');

    expect(result).to.be.an('array').with.lengthOf(0);
  });

  it('throws an error containing "Failed to expire overlapping traces" when batch update fails (batch update fails)', async () => {
    // tooling.query resolves with records; tooling.update rejects (per D-12)
    fakeConnection.tooling.query.resolves({
      totalSize: 1,
      done: true,
      records: [{ Id: 'tf001', ExpirationDate: '2026-06-02T00:00:00Z' }],
    });
    fakeConnection.tooling.update.rejects(new Error('Batch update network error'));

    try {
      await detectAndExpireOverlappingTraces(fakeOrg as never, 'userId001');
      expect.fail('should have thrown');
    } catch (error) {
      expect((error as Error).message).to.include('Failed to expire overlapping traces');
    }
  });
});
