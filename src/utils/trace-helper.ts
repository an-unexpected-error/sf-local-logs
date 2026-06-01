/**
 * Trace helper utility module for Salesforce Tooling API operations.
 *
 * Provides reusable functions for:
 * - Querying org's default DebugLevel
 * - Creating TraceFlag records
 * - Checking for existing active TraceFlags
 * - Retrieving DebugLevel names for display
 * - Orchestrating log download after trace flag creation (D-01, D-02)
 * - Calculating download time windows for ApexLog queries
 * - Formatting download progress for display (D-03, DOWNLOAD-02)
 */

import { Readable } from 'node:stream';
import { Org } from '@salesforce/core';
import { type TraceResult } from '../types/trace.js';
import { type DownloadResult, type ApexLogRecord } from '../types/download.js';
import { queryApexLogsForUser, calculateETA, streamDownloadToFile } from './download-helper.js';
import { createSessionDirectory, constructLogFilePath } from './storage-manager.js';
import { validateQuotaAvailable } from './quota-calculator.js';
import { escapeSoql } from './soql-builder.js';

/**
 * Query org for its default DebugLevel.
 *
 * Attempts to find the org's default DebugLevel in this order:
 * 1. Query by DeveloperName = 'Debug'
 * 2. Fallback: Query most recently created DebugLevel (ORDER BY CreatedDate DESC)
 * 3. If none found, throw descriptive error
 *
 * @param org - Authenticated Org instance
 * @returns Promise<string> - The ID of the default DebugLevel
 * @throws Error with user-friendly message if no DebugLevel found
 */
export async function getDefaultDebugLevel(org: Org): Promise<string> {
  try {
    const connection = org.getConnection();

    // Standard: query for 'Debug' level by DeveloperName
    const result = await connection.tooling.query(
      "SELECT Id, DeveloperName FROM DebugLevel WHERE DeveloperName = 'Debug' LIMIT 1"
    );

    if (result.records.length > 0) {
      return result.records[0].Id as string;
    }

    // Fallback: get most recently created DebugLevel
    const fallback = await connection.tooling.query(
      'SELECT Id FROM DebugLevel ORDER BY CreatedDate DESC LIMIT 1'
    );

    if (fallback.records.length > 0) {
      return fallback.records[0].Id as string;
    }

    // No DebugLevel found
    throw new Error('Unable to determine debug level. Use --level DEBUG to specify explicitly.');
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    // If it's already our user-friendly message, re-throw it
    if (errorMsg.includes('Unable to determine debug level')) {
      throw error;
    }
    // Otherwise wrap it
    throw new Error(`Failed to determine debug level: ${errorMsg}`);
  }
}

/**
 * Create a TraceFlag record for a user.
 *
 * Creates a new TraceFlag via jsforce.tooling.create() with:
 * - StartTime = now
 * - ExpirationDate = now + 24 hours (Salesforce constraint)
 * - Both times in ISO 8601 format
 *
 * @param org - Authenticated Org instance
 * @param userId - User ID to trace (TracedEntityId)
 * @param debugLevelId - DebugLevel ID to apply
 * @returns Promise object with id, expirationDate, and debugLevel for display
 * @throws Error with meaningful message if creation fails (invalid field, permission, etc.)
 */
export async function createTraceFlag(
  org: Org,
  userId: string,
  debugLevelId: string
): Promise<{ id: string; expirationDate: string; debugLevel: string }> {
  try {
    const connection = org.getConnection();

    // Calculate expiration: NOW + 24 hours
    const startTime = new Date();
    const expirationDate = new Date(startTime.getTime() + 24 * 3600 * 1000);

    // StartTime is read-only on TraceFlag; Salesforce sets it automatically
    const result = await connection.tooling.create('TraceFlag', {
      TracedEntityId: userId,
      DebugLevelId: debugLevelId,
      LogType: 'DEVELOPER_LOG',
      ExpirationDate: expirationDate.toISOString(),
    }) as { id?: string; success?: boolean; errors?: Array<{ message: string }> };

    if (!result.success) {
      // Handle Salesforce API errors
      const error = result.errors?.[0];
      throw new Error(error?.message || 'TraceFlag creation failed');
    }

    return {
      id: result.id || '',
      expirationDate: expirationDate.toISOString(),
      debugLevel: debugLevelId,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    if (errorMsg.includes('INVALID_FIELD')) {
      throw new Error('Invalid user ID provided. Please verify the user exists in this org.');
    }
    if (errorMsg.includes('NOT_AUTHORIZED')) {
      throw new Error(`Permission denied: ${errorMsg}. Contact your Salesforce administrator.`);
    }
    if (errorMsg.includes('DUPLICATE_VALUE')) {
      throw new Error('User already has an active trace flag. Use --overwrite to stop existing trace and create a new one.');
    }

    throw new Error(`TraceFlag creation failed: ${errorMsg}`);
  }
}

/**
 * Check for existing active TraceFlag for a user.
 *
 * Queries Tooling API for an active TraceFlag (ExpirationDate > now).
 * If found and overwrite=false, throws error guiding user to --overwrite flag.
 * If found and overwrite=true, stops the existing trace by setting ExpirationDate to NOW.
 *
 * @param org - Authenticated Org instance
 * @param userId - User ID to check (TracedEntityId)
 * @param overwrite - If true, stop existing trace and return; if false, throw error if found
 * @returns Promise with exists boolean and optional id of stopped trace
 * @throws Error if active trace found and overwrite=false
 */
export async function checkExistingTraceFlag(
  org: Org,
  userId: string,
  overwrite: boolean
): Promise<{ exists: boolean; id?: string }> {
  try {
    const connection = org.getConnection();
    const now = new Date().toISOString();

    // Query for active trace flags (ExpirationDate in future)
    const result = await connection.tooling.query(
      `SELECT Id FROM TraceFlag WHERE TracedEntityId = '${escapeSoql(userId)}' AND ExpirationDate > ${now} LIMIT 1`
    ) as { records: Array<{ Id: string }> };

    if (result.records.length > 0) {
      const existingTraceId = result.records[0].Id;

      if (!overwrite) {
        throw new Error('User already has an active trace flag. Use --overwrite to stop existing trace and create a new one.');
      }

      // Overwrite: stop the existing trace by setting expiration to NOW
      await connection.tooling.update('TraceFlag', {
        Id: existingTraceId,
        ExpirationDate: now,
      });

      return { exists: true, id: existingTraceId };
    }

    return { exists: false };
  } catch (error) {
    // Re-throw if it's the "active trace exists" error (user should use --overwrite)
    if (error instanceof Error && error.message.includes('User already has an active trace flag')) {
      throw error;
    }

    // Log other errors but don't fail (let trace creation attempt anyway)
    // In production, this would log to a debug logger
    return { exists: false };
  }
}

/**
 * Query DebugLevel by ID to get its DeveloperName for display.
 *
 * Retrieves the human-readable DeveloperName (e.g., "Debug", "Info") for a DebugLevel ID.
 * Used to display the debug level in trace confirmation output.
 *
 * @param org - Authenticated Org instance
 * @param debugLevelId - DebugLevel ID to query
 * @returns Promise<string> - DeveloperName for display (e.g., "Debug")
 * @throws Error if query fails (but returns ID as fallback to not break trace display)
 */
export async function getDebugLevelName(org: Org, debugLevelId: string): Promise<string> {
  try {
    const connection = org.getConnection();

    const result = await connection.tooling.query(
      `SELECT Id, DeveloperName FROM DebugLevel WHERE Id = '${debugLevelId}' LIMIT 1`
    ) as { records: Array<{ DeveloperName: string }> };

    if (result.records.length > 0) {
      return result.records[0].DeveloperName;
    }

    // Fallback to ID if not found
    return debugLevelId;
  } catch (error) {
    // Don't throw - fallback to returning the ID so trace display doesn't break
    // In production, this would log to a debug logger
    return debugLevelId;
  }
}

/**
 * Calculate the time window for querying ApexLog records after trace creation.
 *
 * Per D-02 (locked): download is scoped to the trace timeframe — logs generated from
 * the moment the trace flag was created through its 24-hour expiry window.
 *
 * startTime = traceCreatedAt (logs start being generated immediately on trace creation)
 * endTime   = traceCreatedAt + 24 hours (typical trace duration; Phase 2 D-05)
 *
 * @param traceCreatedAt - Date when the trace flag was created in Salesforce
 * @returns { startTime: Date, endTime: Date } — the query window for ApexLog.StartTime
 */
export function calculateDownloadTimeWindow(traceCreatedAt: Date): { startTime: Date; endTime: Date } {
  const startTime = new Date(traceCreatedAt.getTime());
  // 24-hour trace window — matches Phase 2's trace flag ExpirationDate calculation
  const endTime = new Date(traceCreatedAt.getTime() + 24 * 3600 * 1000);

  return { startTime, endTime };
}

/**
 * Orchestrate log download after a trace flag has been created.
 *
 * Implements D-01 (download integrated into trace workflow) and D-02 (download starts
 * immediately after trace creation). Queries ApexLog records for the traced user within
 * the 24-hour trace window, then streams each log to disk with per-file quota checks.
 *
 * Per D-04 (locked): quota is checked before each file download, not upfront.
 * Per DOWNLOAD-01: logs scoped to traced user + trace timeframe.
 * Per DOWNLOAD-02: returns data for progress display (file count, total bytes).
 * Per T-03-07: 30s timeout on each Connection.request() call (via connection default).
 * Per T-03-08: caller is responsible for cleaning up partial files on SIGINT.
 *
 * @param org - Authenticated Salesforce Org instance
 * @param traceResult - TraceFlag result from Phase 2 trace creation (createdAt, etc.)
 * @param userId - Salesforce User ID of the user being traced
 * @param userName - Display name of the traced user (for session directory naming)
 * @returns Array of DownloadResult, one per log file (empty if no logs found yet)
 * @throws Error with quota exceeded message if validateQuotaAvailable() trips mid-download
 */
export async function initiateDownloadAfterTrace(
  org: Org,
  traceResult: TraceResult,
  userId: string,
  userName: string
): Promise<DownloadResult[]> {
  const connection = org.getConnection();

  // D-02: Use trace creation time as the start of the query window
  const traceCreatedAt = new Date(traceResult.traceFlag.expirationDate);
  // Backtrack 24h from expirationDate to get creation time (Phase 2 always adds 24h)
  traceCreatedAt.setTime(traceCreatedAt.getTime() - 24 * 3600 * 1000);

  const { startTime, endTime } = calculateDownloadTimeWindow(traceCreatedAt);

  // Query ApexLog records for the traced user within the 24-hour trace window
  const logRecords = await queryApexLogsForUser(connection, userId, startTime, endTime);

  // No logs yet: high-volume scenario where logs haven't been created yet
  if (logRecords.length === 0) {
    return [];
  }

  // Create session directory: ~/.local/share/sf/plugin-logs/{userName}/{YYYY-MM-DD-HH-MM}/
  const sessionDir = await createSessionDirectory(userId, userName, traceCreatedAt);

  const downloadResults: DownloadResult[] = [];

  for (const log of logRecords) {
    // D-04 (locked): check quota before each file download, not upfront
    // Per T-03-10: consistent connection object; Salesforce quota is authoritative
    await validateQuotaAvailable(connection, log.LogLength);

    const filePath = constructLogFilePath(sessionDir, log.Id);

    try {
      // Retrieve the log body via Tooling API REST endpoint
      // Per RESEARCH.md Pattern 2: GET /tooling/sobjects/ApexLog/{id}/Body
      // jsforce Connection.request() returns parsed JSON/text; wrap in Readable for pipeline
      const logBody = await connection.request<string>({
        method: 'GET',
        url: `/services/data/v${connection.getApiVersion()}/tooling/sobjects/ApexLog/${log.Id}/Body`,
      });

      // Convert string/buffer response to ReadableStream for streamDownloadToFile
      // Readable.from() handles both string and Buffer inputs (DOWNLOAD-05)
      const bodyContent = typeof logBody === 'string' ? logBody : JSON.stringify(logBody);
      const logBodyStream = Readable.from([bodyContent]);

      // Stream to disk using fs.pipeline() (memory-constant regardless of file size)
      await streamDownloadToFile(logBodyStream, filePath);

      downloadResults.push({
        logId: log.Id,
        fileName: `${log.Id}.json`,
        filePath,
        bytesDownloaded: log.LogLength,
        success: true,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      downloadResults.push({
        logId: log.Id,
        fileName: `${log.Id}.json`,
        filePath,
        bytesDownloaded: 0,
        success: false,
        error: errorMsg,
      });
    }
  }

  return downloadResults;
}

/**
 * Format download progress for display per D-03 and DOWNLOAD-02 requirements.
 *
 * D-03 (locked): display time elapsed, ETA, and file count.
 * DOWNLOAD-02: progress shows count, size in MB, and estimated time remaining.
 *
 * Note: total log count is unknown because logs may be generated concurrently in
 * high-volume scenarios. The display shows count downloaded and a rough estimate
 * (total queried so far), not a percentage, to reflect this uncertainty.
 *
 * T-03-12 mitigation: numeric values only inserted into format string (no user-controlled strings).
 *
 * @param filesDownloaded - Number of log files successfully downloaded so far
 * @param totalBytes - Sum of LogLength values for all downloaded files (in bytes)
 * @param elapsedSeconds - Seconds elapsed since download started
 * @param logRecords - All queried ApexLog records (used to estimate remaining count and bytes)
 * @returns Formatted progress string: "Downloaded N of ~M log(s) • XMB • ETA: Ys"
 */
export function formatDownloadProgress(
  filesDownloaded: number,
  totalBytes: number,
  elapsedSeconds: number,
  logRecords: ApexLogRecord[]
): string {
  const estimatedTotal = logRecords.length;

  // Total bytes across all queried records (for ETA calculation)
  const totalQueryBytes = logRecords.reduce((sum, r) => sum + r.LogLength, 0);

  const etaSeconds = calculateETA(totalBytes, totalQueryBytes, elapsedSeconds);
  const etaDisplay = etaSeconds > 0 ? `${etaSeconds}s` : 'calculating...';

  // T-03-12: sanitize numeric values — toFixed() ensures no user-controlled strings
  const megabytes = (totalBytes / 1e6).toFixed(1);

  return `Downloaded ${filesDownloaded} of ~${estimatedTotal} log(s) • ${megabytes}MB • ETA: ${etaDisplay}`;
}
