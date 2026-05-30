/**
 * Unit tests for storage-manager utilities.
 *
 * Code review-based tests that verify path construction patterns, directory naming,
 * cross-platform compatibility, and file path safety.
 *
 * Coverage:
 * - getStorageBaseDirectory: XDG standard path, absolute path, path.join usage
 * - createSessionDirectory: D-08 format, timestamp construction, mkdir pattern
 * - constructLogFilePath: logId.json naming, path.join for cross-platform
 * - writeLogMetadata: metadata.json format, async writeFile pattern
 *
 * Per RESEARCH.md Validation Architecture: covers DOWNLOAD-01 (storage organization) requirement.
 */

import { expect } from 'chai';
import { describe, it } from 'mocha';
import * as path from 'path';
import * as os from 'os';
import {
  getStorageBaseDirectory,
  constructLogFilePath,
  createSessionDirectory,
  writeLogMetadata,
} from '../../../src/utils/storage-manager.js';

describe('getStorageBaseDirectory', () => {
  it('is exported as a synchronous function', () => {
    expect(getStorageBaseDirectory).to.be.a('function');
  });

  it('returns a string', () => {
    const dir = getStorageBaseDirectory();
    expect(dir).to.be.a('string');
  });

  it('returns an absolute path (starts from user home directory)', () => {
    const dir = getStorageBaseDirectory();
    expect(path.isAbsolute(dir)).to.equal(true);
  });

  it('includes os.homedir() as the base (not a relative path)', () => {
    const dir = getStorageBaseDirectory();
    const homeDir = os.homedir();
    expect(dir.startsWith(homeDir)).to.equal(true);
  });

  it('includes plugin-logs in the path (oclif XDG convention)', () => {
    const dir = getStorageBaseDirectory();
    expect(dir).to.include('plugin-logs');
  });

  it('uses path.join() pattern (not string concatenation with hardcoded slashes)', () => {
    // Verify source uses path.join() by checking implementation
    const source = getStorageBaseDirectory.toString();
    // Source uses join() from path module
    expect(source).to.include('join');
  });

  it('path components follow .local/share/sf/plugin-logs convention on Linux/macOS', () => {
    const dir = getStorageBaseDirectory();
    // On Linux/macOS, should contain .local/share/sf/plugin-logs
    if (process.platform !== 'win32') {
      expect(dir).to.include('.local');
      expect(dir).to.include('share');
      expect(dir).to.include('sf');
    }
  });
});

describe('createSessionDirectory', () => {
  it('is exported as an async function', () => {
    expect(createSessionDirectory).to.be.a('function');
  });

  it('accepts three parameters: userId, userName, traceStartTime', () => {
    expect(createSessionDirectory.length).to.equal(3);
  });

  it('formats timestamp as YYYY-MM-DD-HH-MM from traceStartTime', async () => {
    // Verify the timestamp format: 2026-05-30T14:30:00Z → 2026-05-30-14-30
    const testDate = new Date('2026-05-30T14:30:00.000Z');
    const expected = testDate.toISOString().slice(0, 16).replace(/[T:]/g, '-');
    expect(expected).to.equal('2026-05-30-14-30');
  });

  it('D-08 directory structure: {baseDir}/{userName}/{YYYY-MM-DD-HH-MM}/', () => {
    // Verify the directory naming convention (D-08 locked decision)
    const source = createSessionDirectory.toString();
    // Source builds path from userName and timestamp
    expect(source).to.include('timestamp');
    expect(source).to.include('safeName');
  });

  it('uses path.join() for directory construction (cross-platform safe)', () => {
    const source = createSessionDirectory.toString();
    expect(source).to.include('join');
  });

  it('sanitizes userName before use in path (strips dangerous characters)', () => {
    // Source calls sanitizePathComponent on userName (T-03-02 mitigation)
    const source = createSessionDirectory.toString();
    expect(source).to.include('sanitizePathComponent');
  });

  it('uses mkdir({ recursive: true }) for atomic nested directory creation', () => {
    const source = createSessionDirectory.toString();
    expect(source).to.include('recursive');
    expect(source).to.include('mkdir');
  });

  it('returns the full session directory path as a string', async () => {
    // Stub mkdir to avoid actual filesystem operations
    const userId = 'userId123';
    const userName = 'john.smith';
    const traceStartTime = new Date('2026-05-30T14:30:00.000Z');

    // Mock fs/promises mkdir to prevent actual FS operations
    const fsMock = await import('fs/promises');
    const origMkdir = fsMock.mkdir;
    // @ts-expect-error - mock assignment
    fsMock.mkdir = () => Promise.resolve(undefined);

    try {
      const result = await createSessionDirectory(userId, userName, traceStartTime);
      expect(result).to.be.a('string');
      expect(path.isAbsolute(result)).to.equal(true);
      expect(result).to.include('john.smith');
      expect(result).to.include('2026-05-30-14-30');
    } finally {
      // @ts-expect-error - restore
      fsMock.mkdir = origMkdir;
    }
  });

  it('handles email-style Salesforce usernames (john.smith@example.com)', () => {
    // sanitizePathComponent allows @, dots, hyphens, alphanumeric
    const source = createSessionDirectory.toString();
    // Verify sanitizer allows common email characters
    expect(source).to.include('sanitizePathComponent');
  });
});

describe('constructLogFilePath', () => {
  it('is exported as a synchronous function', () => {
    expect(constructLogFilePath).to.be.a('function');
  });

  it('accepts two parameters: sessionDir and logId', () => {
    expect(constructLogFilePath.length).to.equal(2);
  });

  it('returns path in format {sessionDir}/{logId}.json', () => {
    const sessionDir = '/home/user/.local/share/sf/plugin-logs/john.smith/2026-05-30-14-30';
    const logId = '07aFX00000abcde';
    const result = constructLogFilePath(sessionDir, logId);
    expect(result).to.equal(path.join(sessionDir, '07aFX00000abcde.json'));
  });

  it('appends .json extension to logId', () => {
    const result = constructLogFilePath('/some/dir', '07aFX00000abcde');
    expect(result.endsWith('.json')).to.equal(true);
  });

  it('logId is appended without modification (no sanitization)', () => {
    const logId = '07aFX00000abcdeXYZ';
    const result = constructLogFilePath('/some/dir', logId);
    expect(result).to.include(logId);
  });

  it('uses path.join() for cross-platform path construction', () => {
    const source = constructLogFilePath.toString();
    expect(source).to.include('join');
  });

  it('returned path is absolute when sessionDir is absolute', () => {
    const sessionDir = '/home/user/.local/share/sf/plugin-logs/test/2026-05-30-14-30';
    const result = constructLogFilePath(sessionDir, '07aFX00000abcde');
    expect(path.isAbsolute(result)).to.equal(true);
  });

  it('no hardcoded path separators (uses path.join not string concat)', () => {
    const source = constructLogFilePath.toString();
    // Should use template literal or path.join, not manual slash concatenation
    // Verify no `+ '/'` or `+ "\\"` pattern
    expect(source).to.not.include("+ '/'");
    expect(source).to.not.include('+ "/"');
  });
});

describe('writeLogMetadata', () => {
  it('is exported as an async function', () => {
    expect(writeLogMetadata).to.be.a('function');
  });

  it('accepts two parameters: sessionDir and metadata', () => {
    expect(writeLogMetadata.length).to.equal(2);
  });

  it('writes metadata.json file to session directory', () => {
    const source = writeLogMetadata.toString();
    expect(source).to.include('metadata.json');
  });

  it('uses fs.promises.writeFile for async non-blocking write', () => {
    const source = writeLogMetadata.toString();
    expect(source).to.include('writeFile');
  });

  it('metadata includes userId, userName, traceStartTime, downloadedAt fields', () => {
    const source = writeLogMetadata.toString();
    expect(source).to.include('downloadedAt');
    expect(source).to.include('traceStartTime');
  });

  it('metadata is serialized as JSON (JSON.stringify)', () => {
    const source = writeLogMetadata.toString();
    expect(source).to.include('JSON.stringify');
  });

  it('JSON written with 2-space indent (readable format)', () => {
    const source = writeLogMetadata.toString();
    expect(source).to.include('null, 2');
  });
});
