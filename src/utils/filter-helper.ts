/**
 * Filter helper utilities for scanning downloaded log files by keyword.
 *
 * Provides functions for:
 * - Scanning the first N lines of a log file for a keyword match (FILTER-01, D-03, D-04)
 * - Filtering a session directory's log files, moving non-matching files to rejected/ (FILTER-03, D-06, D-07)
 *
 * Security mitigations:
 * - T-04-02-01: keyword is used only in String.prototype.includes(); cannot cause regex injection (D-04 bans regex)
 * - T-04-02-02: sessionDir is derived from createSessionDirectory() which sanitizes path components; user cannot inject custom path in v1
 * - T-04-02-03: readline.createInterface streams line-by-line; maxLines=100 caps scan at 100 lines regardless of file size (DoS mitigation)
 * - T-04-02-04: readdir entries filtered with f.endsWith('.json') excludes 'rejected' directory entry naturally (Pitfall 2 mitigation)
 *
 * Cross-platform: uses path.join() per Anti-Patterns section of RESEARCH.md.
 * Never uses fs.unlink() — D-07 requires preservation of all files.
 *
 * @see .planning/phases/04-log-filtering/04-RESEARCH.md Pattern 1, Pattern 2
 */

import { createInterface } from 'node:readline';
import { createReadStream } from 'node:fs';
import { mkdir, rename, readdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Scan the first N lines of a file for a keyword match.
 *
 * Uses readline.createInterface with a readable stream to scan line-by-line
 * without loading the entire file into memory. This is safe for 10-100MB log files.
 *
 * The keyword match is case-insensitive substring match (D-04): uses
 * line.toLowerCase().includes(keyword.toLowerCase()) — no regex, no glob.
 *
 * Closes the readline interface on early match (Pitfall 1: avoids file descriptor leak).
 * Also closes on maxLines reached (Pitfall 1 mitigation for the break path).
 *
 * Security note: keyword is used only in String.prototype.includes(); cannot cause
 * regex injection (T-04-02-01). D-04 explicitly bans regex patterns.
 *
 * @param filePath - Absolute path to the log file to scan
 * @param maxLines - Maximum number of lines to scan (hard limit per D-03; use 100)
 * @param keyword - Search keyword (case-insensitive substring match per D-04)
 * @returns true if keyword found within the first maxLines lines; false otherwise
 */
export async function scanFirstNLines(
  filePath: string,
  maxLines: number,
  keyword: string
): Promise<boolean> {
  const kwLower = keyword.toLowerCase();
  let lineCount = 0;

  const rl = createInterface({
    input: createReadStream(filePath),
    crlfDelay: Infinity, // handles \r\n line endings on Windows
  });

  for await (const line of rl) {
    if (line.toLowerCase().includes(kwLower)) {
      // Pitfall 1: always close readline before returning true (early exit)
      // Prevents file descriptor leak when breaking out before exhausting all lines
      rl.close();
      return true;
    }
    lineCount++;
    if (lineCount >= maxLines) {
      // Pitfall 1: always close readline before breaking
      rl.close();
      break;
    }
  }

  return false;
}

/**
 * Filter downloaded log files in a session directory by keyword.
 *
 * Creates a rejected/ subdirectory and moves non-matching log files there.
 * Matching files stay in the session directory (D-06).
 * Non-matching files are moved (not deleted) to sessionDir/rejected/ (D-07).
 *
 * File scan: checks only the first 100 lines per file (D-03 hard limit).
 * Keyword match: case-insensitive substring match via scanFirstNLines (D-04).
 *
 * Exclusions (Pitfall 2 mitigation):
 * - metadata.json is skipped (not a log file)
 * - the rejected/ directory itself is skipped (ends in '/', not '.json')
 *
 * mkdir({ recursive: true }) is called before any rename operations to ensure
 * the rejected/ directory exists atomically (idempotent if already exists).
 *
 * Security note: sessionDir is derived from createSessionDirectory() which applies
 * sanitizePathComponent(); user cannot inject a custom path in v1 (T-04-02-02).
 *
 * @param sessionDir - Absolute path to the session download directory
 * @param keyword - Search keyword for filtering (case-insensitive substring match)
 * @returns Object with matched count, rejected count, and session directory path
 */
export async function filterDownloadedLogs(
  sessionDir: string,
  keyword: string
): Promise<{ matched: number; rejected: number; sessionDir: string }> {
  // Create rejected/ subfolder upfront (idempotent via recursive)
  const rejectedDir = join(sessionDir, 'rejected');
  await mkdir(rejectedDir, { recursive: true });

  // List only log files (exclude metadata.json and the rejected/ subdir)
  // Pitfall 2: readdir returns both files and directories; filter to .json only
  // 'rejected' directory does not end in '.json' so it is naturally excluded
  const entries = await readdir(sessionDir);
  const logFiles = entries.filter(
    (f) => f.endsWith('.json') && f !== 'metadata.json'
  );

  let matched = 0;
  let rejected = 0;

  for (const logFile of logFiles) {
    const filePath = join(sessionDir, logFile);
    const isMatch = await scanFirstNLines(filePath, 100, keyword);

    if (isMatch) {
      matched++;
    } else {
      rejected++;
      // D-07: move (not delete) non-matching files; rename is atomic within same filesystem
      await rename(filePath, join(rejectedDir, logFile));
    }
  }

  return { matched, rejected, sessionDir };
}
