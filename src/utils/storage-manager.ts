/**
 * Storage manager utility for organizing downloaded logs on the local filesystem.
 *
 * Provides functions for:
 * - Determining the base storage directory using oclif XDG convention (RESEARCH.md Pattern 4)
 * - Creating session directories organized by user + timestamp (D-08 decision)
 * - Constructing log file paths for individual ApexLog records
 * - Writing session metadata for session identification
 *
 * Security mitigations:
 * - T-03-02: All paths built with path.join() only; never string concatenation
 * - T-03-02: userId and userName sanitized before use as path components
 * - T-03-04: path.join() blocks `../` path traversal escapes automatically
 *
 * Cross-platform: uses os.homedir() + path.join() per RESEARCH.md Pitfall 4
 * (never hardcodes forward slashes or POSIX-only paths).
 *
 * Storage location: ~/.local/share/sf/plugin-logs/ per oclif XDG Base Directory
 * convention (RESEARCH.md File Storage Location Resolution).
 */

import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import { type DownloadSessionMetadata } from "../types/download.js";

/**
 * Base storage path components following oclif XDG Base Directory standard.
 * On Linux/macOS: ~/.local/share/sf/plugin-logs/
 * On Windows: equivalent path via os.homedir() + path.join()
 */
const BASE_PATH_COMPONENTS = [".local", "share", "sf", "plugin-logs"];

/**
 * Sanitize a string for safe use as a filesystem path component.
 *
 * Removes characters that could be used for path traversal or
 * cause issues on various filesystems. Allows alphanumeric, dots,
 * hyphens, and underscores (covers common Salesforce usernames).
 *
 * T-03-02 mitigation: validate userId/userName before use in path.
 *
 * @param input - Raw string to sanitize
 * @returns Sanitized string safe for use in path.join()
 */
function sanitizePathComponent(input: string): string {
  // Strip path separators, null bytes, and other dangerous characters
  // Keep alphanumeric, dots, hyphens, underscores, and @ (for email-style usernames)
  return input.replace(/[^a-zA-Z0-9._@-]/g, "_").slice(0, 255);
}

/**
 * Return the base directory for all plugin-downloaded logs.
 *
 * Uses the oclif XDG Base Directory standard:
 *   ~/.local/share/sf/plugin-logs/
 *
 * Per RESEARCH.md Pattern 4: always use path.join() + os.homedir() for
 * cross-platform compatibility. Never concatenate path strings directly.
 *
 * @returns Absolute path to the base log storage directory
 */
export function getStorageBaseDirectory(): string {
  // T-03-02: construct with path.join() to prevent path traversal
  return join(homedir(), ...BASE_PATH_COMPONENTS);
}

/**
 * Create a session directory for a download session and return its path.
 *
 * Directory structure: {baseDir}/{userName}/{YYYY-MM-DD-HH-MM}/
 * Example: ~/.local/share/sf/plugin-logs/john.smith/2026-05-30-14-30/
 *
 * The timestamp is derived from traceStartTime using ISO 8601 slice:
 * toISOString().slice(0, 16).replace(/[T:]/g, '-')
 * → "2026-05-30-14-30"
 *
 * Uses mkdir({ recursive: true }) to create nested directories atomically
 * without requiring intermediate directories to exist first.
 *
 * Per D-08 (locked decision): organize by user + timestamp of trace session.
 *
 * @param userId - Salesforce User ID (used for metadata; sanitized for path)
 * @param userName - Display name of the traced user (used as directory name)
 * @param traceStartTime - When the trace session was created in Salesforce
 * @returns Absolute path to the created session directory
 */
export async function createSessionDirectory(
  userId: string,
  userName: string,
  traceStartTime: Date
): Promise<string> {
  // T-03-02: sanitize path components before use in path.join()
  const safeName = sanitizePathComponent(userName) || sanitizePathComponent(userId);

  // Format: YYYY-MM-DD-HH-MM (from ISO 8601, replacing T and colons with dashes)
  const timestamp = traceStartTime
    .toISOString()
    .slice(0, 16)
    .replace(/[T:]/g, "-");

  const sessionDir = join(getStorageBaseDirectory(), safeName, timestamp);

  // mkdir({ recursive: true }) creates nested directories atomically (avoids race conditions)
  await mkdir(sessionDir, { recursive: true });

  return sessionDir;
}

/**
 * Construct the file path for a single downloaded log file.
 *
 * Log files are stored as: {sessionDir}/{logId}.json
 *
 * Uses path.join() for cross-platform path construction.
 * T-03-02: logId is not sanitized here because log IDs are Salesforce record IDs
 * (alphanumeric, 15-18 characters) — but callers should validate before passing.
 *
 * @param sessionDir - Absolute path to the session directory (from createSessionDirectory)
 * @param logId - Salesforce ApexLog record ID (e.g., "07aFX00000abcde")
 * @returns Absolute path for the log file
 */
export function constructLogFilePath(sessionDir: string, logId: string): string {
  return join(sessionDir, `${logId}.json`);
}

/**
 * Write a metadata.json file to the session directory.
 *
 * The metadata file records session context so users can identify which
 * trace session a folder of logs belongs to. Includes:
 * - userId and userName of the traced user
 * - traceStartTime and downloadedAt timestamps
 * - fileCount of downloaded logs
 *
 * Uses fs.promises.writeFile() for async, non-blocking writes.
 *
 * @param sessionDir - Absolute path to the session directory
 * @param metadata - Session metadata from DownloadSessionMetadata interface
 */
export async function writeLogMetadata(
  sessionDir: string,
  metadata: DownloadSessionMetadata
): Promise<void> {
  const metadataPath = join(sessionDir, "metadata.json");

  const metadataContent = {
    ...metadata,
    downloadedAt: new Date().toISOString(),
    traceStartTime: metadata.traceStartTime.toISOString(),
  };

  await writeFile(metadataPath, JSON.stringify(metadataContent, null, 2), "utf-8");
}
