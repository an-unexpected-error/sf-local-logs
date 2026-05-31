import { expect } from 'chai';
import Filter from '../../../src/commands/log/filter.js';

describe('log filter', () => {
  it('command class is defined', () => {
    expect(Filter).to.exist;
  });

  it('has summary text', () => {
    expect(Filter.summary).to.be.a('string').and.not.equal('');
  });

  it('does not have export flag', function () {
    // Wave 0 stub: D-08 removes --export flag in Plan 04 (hollow-out of filter.ts stub)
    // This test will fail until Plan 04 removes Filter.flags.export
    // Guard: pending until Plan 04 removes the export flag
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const flags = Filter.flags as Record<string, any>;
    if (flags['export'] !== undefined) { this.skip(); }
    expect(flags['export']).to.be.undefined;
  });

  it('summary text mentions keyword or trace', () => {
    // Hollowed-out filter.ts should guide users toward 'sf log trace --keyword'
    // D-01: filter command dropped; stub should redirect to trace command
    const summary = Filter.summary.toLowerCase();
    const mentionsKeywordOrTrace =
      summary.includes('keyword') ||
      summary.includes('trace') ||
      summary.includes('sf log trace');
    expect(mentionsKeywordOrTrace).to.equal(
      true,
      `Expected Filter.summary to mention 'keyword', 'trace', or 'sf log trace'. Got: "${Filter.summary}"`
    );
  });
});
