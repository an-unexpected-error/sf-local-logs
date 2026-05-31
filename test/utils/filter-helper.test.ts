/**
 * Unit tests for filter-helper utilities.
 *
 * Tests verify the behavior contracts for scanFirstNLines()
 * and filterDownloadedLogs() implemented in Plan 02.
 *
 * Coverage:
 * - scanFirstNLines: keyword found in first 100 lines, absent, case-insensitive, after line 100
 * - filterDownloadedLogs: return shape, move non-matching to rejected/, preserve matching,
 *   exclude metadata.json, create rejected/ dir, matched/rejected counts
 *
 * Per RESEARCH.md Validation Architecture: covers FILTER-01, FILTER-02, FILTER-03 requirements.
 * Implementation provided in Plan 02 (filter-helper.ts).
 */

import { expect } from 'chai';
import { describe, it, before, after } from 'mocha';
import { writeFile, mkdir, rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanFirstNLines, filterDownloadedLogs } from '../../src/utils/filter-helper.js';

// ---------------------------------------------------------------------------
// Helpers for creating temp files
// ---------------------------------------------------------------------------

let testDir: string;

before(async () => {
  testDir = join(tmpdir(), `filter-helper-test-${Date.now()}`);
  await mkdir(testDir, { recursive: true });
});

after(async () => {
  await rm(testDir, { recursive: true, force: true });
});

async function createTempFile(name: string, lines: string[]): Promise<string> {
  const filePath = join(testDir, name);
  await writeFile(filePath, lines.join('\n'), 'utf-8');
  return filePath;
}

// ---------------------------------------------------------------------------
// describe('scanFirstNLines')
// ---------------------------------------------------------------------------

describe('scanFirstNLines', () => {
  it('returns true when keyword found in first 100 lines (case-insensitive)', async () => {
    // D-03, D-04: scan first 100 lines, case-insensitive substring match
    // When: filePath points to a file with keyword on line 1
    // Then: scanFirstNLines(filePath, 100, 'account') returns true
    const lines = ['Account: some value', ...Array(50).fill('other content')];
    const filePath = await createTempFile('scan-found.json', lines);
    const result = await scanFirstNLines(filePath, 100, 'account');
    expect(result).to.equal(true);
  });

  it('returns false when keyword absent from first 100 lines', async () => {
    // D-03: keyword not present anywhere in first 100 lines → returns false
    const lines = Array(50).fill('no relevant content here');
    const filePath = await createTempFile('scan-absent.json', lines);
    const result = await scanFirstNLines(filePath, 100, 'missingkeyword');
    expect(result).to.equal(false);
  });

  it('is case-insensitive: lowercase keyword matches uppercase line', async () => {
    // D-04: simple case-insensitive substring match
    // 'account' must match 'Account', 'ACCOUNT', 'aCcOuNt'
    // Implementation: line.toLowerCase().includes(keyword.toLowerCase())
    const lines = ['ACCOUNT trigger fired', 'other content'];
    const filePath = await createTempFile('scan-case.json', lines);
    const result = await scanFirstNLines(filePath, 100, 'account');
    expect(result).to.equal(true);
  });

  it('returns false when keyword only appears after line 100', async () => {
    // D-03: first 100 lines constraint — keyword on line 101+ is not detected
    // Implementation: lineCount >= maxLines → rl.close(); break (without returning true)
    // File has 200 lines; keyword only appears on line 150
    const lines: string[] = [];
    for (let i = 0; i < 200; i++) {
      lines.push(i === 149 ? 'keyword appears here' : `line ${i} content`);
    }
    const filePath = await createTempFile('scan-after100.json', lines);
    const result = await scanFirstNLines(filePath, 100, 'keyword');
    expect(result).to.equal(false);
  });
});

// ---------------------------------------------------------------------------
// describe('filterDownloadedLogs')
// ---------------------------------------------------------------------------

describe('filterDownloadedLogs', () => {
  let sessionDir: string;

  before(async () => {
    sessionDir = join(testDir, `session-${Date.now()}`);
    await mkdir(sessionDir, { recursive: true });
  });

  it('returns { matched, rejected, sessionDir } object shape', async () => {
    // Contract: filterDownloadedLogs returns the exact shape specified in Pattern 2
    // { matched: number; rejected: number; sessionDir: string }
    // sessionDir is the same string passed in (not modified)
    const emptySession = join(testDir, 'shape-session');
    await mkdir(emptySession, { recursive: true });
    const result = await filterDownloadedLogs(emptySession, 'Account');
    expect(result).to.have.keys(['matched', 'rejected', 'sessionDir']);
    expect(result.matched).to.be.a('number');
    expect(result.rejected).to.be.a('number');
    expect(result.sessionDir).to.equal(emptySession);
  });

  it('moves non-matching log files to rejected/ subfolder using rename', async () => {
    // D-07: non-matching files moved to {sessionDir}/rejected/ via fs.rename (atomic)
    // reject does NOT delete files — fs.unlink is forbidden per D-07
    const moveSession = join(testDir, 'move-session');
    await mkdir(moveSession, { recursive: true });
    await writeFile(join(moveSession, 'log1.json'), 'no match content\nother line', 'utf-8');
    await filterDownloadedLogs(moveSession, 'AccountKeywordNotPresent');
    const rejectedEntries = await readdir(join(moveSession, 'rejected'));
    expect(rejectedEntries).to.include('log1.json');
  });

  it('does not move matching log files', async () => {
    // D-06: matching logs stay in session download directory (not moved or copied)
    const staySession = join(testDir, 'stay-session');
    await mkdir(staySession, { recursive: true });
    await writeFile(join(staySession, 'matchlog.json'), 'Account trigger fired\nother line', 'utf-8');
    await filterDownloadedLogs(staySession, 'Account');
    // File should remain in the session dir (not moved to rejected/)
    const sessionEntries = await readdir(staySession);
    expect(sessionEntries).to.include('matchlog.json');
    // rejected/ should be empty (or have no json files from this test)
    const rejectedEntries = await readdir(join(staySession, 'rejected'));
    expect(rejectedEntries).to.not.include('matchlog.json');
  });

  it('excludes metadata.json from scan and move operations', async () => {
    // Contract: readdir results filtered to f.endsWith('.json') && f !== 'metadata.json'
    // metadata.json is not a log file and must not be scanned or moved to rejected/
    const metaSession = join(testDir, 'meta-session');
    await mkdir(metaSession, { recursive: true });
    await writeFile(join(metaSession, 'metadata.json'), '{"userId":"005xxx"}', 'utf-8');
    // Use a keyword that would not match the metadata content
    await filterDownloadedLogs(metaSession, 'ZZZnotpresent');
    // metadata.json should never appear in rejected/
    const rejectedEntries = await readdir(join(metaSession, 'rejected'));
    expect(rejectedEntries).to.not.include('metadata.json');
    // metadata.json should still be in session dir
    const sessionEntries = await readdir(metaSession);
    expect(sessionEntries).to.include('metadata.json');
  });

  it('creates rejected/ directory with mkdir recursive before moving files', async () => {
    // Contract: mkdir({ recursive: true }) called before any rename operations
    // Idempotent: if rejected/ already exists, mkdir with recursive does not throw
    // rejectedDir = path.join(sessionDir, 'rejected')
    const mkdirSession = join(testDir, 'mkdir-session');
    await mkdir(mkdirSession, { recursive: true });
    await writeFile(join(mkdirSession, 'log1.json'), 'no match here', 'utf-8');
    // If rejected/ is not created before rename, rename would fail
    // Successful execution proves mkdir was called
    await filterDownloadedLogs(mkdirSession, 'ZZZnotpresent');
    const sessionEntries = await readdir(mkdirSession);
    expect(sessionEntries).to.include('rejected');
  });

  it('returns matched count equal to number of matching files', async () => {
    // Contract: result.matched === number of files that passed scanFirstNLines check
    // If 3 files scanned, 2 match → result.matched === 2
    const countSession = join(testDir, 'count-session');
    await mkdir(countSession, { recursive: true });
    await writeFile(join(countSession, 'match1.json'), 'Account trigger fired', 'utf-8');
    await writeFile(join(countSession, 'match2.json'), 'ACCOUNT sobject insert', 'utf-8');
    await writeFile(join(countSession, 'nomatch.json'), 'Contact trigger fired', 'utf-8');
    const result = await filterDownloadedLogs(countSession, 'Account');
    expect(result.matched).to.equal(2);
  });

  it('returns rejected count equal to number of non-matching files', async () => {
    // Contract: result.rejected === number of files moved to rejected/
    // result.matched + result.rejected === total log files (excluding metadata.json)
    const rejCountSession = join(testDir, 'rejcount-session');
    await mkdir(rejCountSession, { recursive: true });
    await writeFile(join(rejCountSession, 'match1.json'), 'Account trigger fired', 'utf-8');
    await writeFile(join(rejCountSession, 'match2.json'), 'ACCOUNT sobject insert', 'utf-8');
    await writeFile(join(rejCountSession, 'nomatch.json'), 'Contact trigger fired', 'utf-8');
    const result = await filterDownloadedLogs(rejCountSession, 'Account');
    expect(result.rejected).to.equal(1);
  });
});
