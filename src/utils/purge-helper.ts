/**
 * Purge helper utility module for bulk deletion of Salesforce debug logs.
 *
 * Provides functions for:
 * - Querying all ApexLog records in the org (org-wide scope, PURGE-01)
 * - Calculating storage freed by deleting all logs (PURGE-03)
 * - Performing bulk delete via Tooling API with per-record error handling
 * - Formatting confirmation and success messages per D-07 and UX-02
 *
 * Security mitigations:
 * - T-03-13: ApexLog IDs used in delete come directly from queryAllApexLogs result;
 *            no user-supplied IDs are accepted into the delete payload
 * - T-03-15: All API errors are caught and translated to user-friendly messages;
 *            raw API error details (stack traces, internal IDs) are not forwarded to user
 * - T-03-16: Confirmation prompt shows impact before deletion (D-07)
 *
 * Per D-06 (locked): purge targets all org logs (org-wide scope, not user-scoped).
 * Per RESEARCH.md Pattern 5: use Tooling API delete for each record individually.
 * Per RESEARCH.md Common Pitfalls: handle per-record failures gracefully.
 */

import { type Connection } from "@salesforce/core";
import { type ApexLogRecord } from "../types/download.js";
import { executeWithRetry } from "./download-helper.js";

/**
 * Maximum number of records returned per Tooling API query page.
 * Salesforce Tooling API caps results at 2000 records per query.
 * Use OFFSET to paginate beyond this limit.
 */
const TOOLING_API_PAGE_SIZE = 2000;

/**
 * Query all ApexLog records in the org (org-wide, not user-scoped).
 *
 * Per PURGE-01 and D-06 (locked decisions): retrieves ALL org logs regardless of user.
 * This is appropriate for high-volume storage-critical scenarios where a fast,
 * complete purge is needed.
 *
 * SOQL: SELECT Id, LogUserId, LogUser.Name, StartTime, LogLength, Status FROM ApexLog
 * ORDER BY StartTime DESC
 *
 * Handles pagination automatically: if totalSize > 2000, loops with OFFSET to fetch
 * all records. This prevents silent data loss when an org has thousands of logs.
 *
 * Wrapped in executeWithRetry() to handle HTTP 429 rate limiting (UX-03).
 *
 * @param connection - Authenticated Salesforce connection from @salesforce/core
 * @returns Array of all ApexLog records in the org
 * @throws If the Tooling API query fails after maxAttempts retries
 */
export async function queryAllApexLogs(connection: Connection): Promise<ApexLogRecord[]> {
  const baseQuery =
    "SELECT Id, LogUserId, LogUser.Name, StartTime, LogLength, DurationMilliseconds, Status FROM ApexLog ORDER BY StartTime DESC";

  const allRecords: ApexLogRecord[] = [];

  // Fetch first page
  const firstResult = await executeWithRetry(() =>
    connection.tooling.query<ApexLogRecord>(`${baseQuery} LIMIT ${TOOLING_API_PAGE_SIZE}`)
  );

  allRecords.push(...firstResult.records);

  // Handle pagination if totalSize exceeds one page
  if (firstResult.totalSize > TOOLING_API_PAGE_SIZE) {
    let offset = TOOLING_API_PAGE_SIZE;

    while (offset < firstResult.totalSize) {
      const nextPage = await executeWithRetry(() =>
        connection.tooling.query<ApexLogRecord>(
          `${baseQuery} LIMIT ${TOOLING_API_PAGE_SIZE} OFFSET ${offset}`
        )
      );

      allRecords.push(...nextPage.records);
      offset += TOOLING_API_PAGE_SIZE;
    }
  }

  return allRecords;
}

/**
 * Calculate the total storage that would be freed by deleting all provided log records.
 *
 * Sums LogLength from all records to calculate total bytes, then converts to MB and GB.
 * Used to show impact before confirmation (D-07 locked decision) and in success reporting
 * after deletion (PURGE-03 requirement).
 *
 * @param logRecords - Array of ApexLog records (from queryAllApexLogs)
 * @returns Object with count, totalBytes, totalMB (1 decimal), totalGB (2 decimals)
 */
export function calculateFreedSpace(logRecords: ApexLogRecord[]): {
  count: number;
  totalBytes: number;
  totalMB: string;
  totalGB: string;
} {
  const totalBytes = logRecords.reduce((sum, record) => sum + (record.LogLength ?? 0), 0);

  return {
    count: logRecords.length,
    totalBytes,
    totalMB: (totalBytes / 1e6).toFixed(1),
    totalGB: (totalBytes / 1e9).toFixed(2),
  };
}

/**
 * Perform bulk deletion of ApexLog records via Tooling API.
 *
 * Deletes each ApexLog record individually using connection.tooling.delete().
 * Uses Promise.all() to run deletes in parallel for performance.
 *
 * Per RESEARCH.md Pattern 5: Tooling API bulk delete pattern — delete each record
 * individually (not bulk DML) to handle per-record failures gracefully.
 * Per RESEARCH.md Common Pitfalls: per-record errors (permissions, locks) are caught
 * individually; the entire operation does NOT fail if some records fail to delete.
 *
 * Each delete is wrapped in executeWithRetry() for HTTP 429 rate limiting (UX-03).
 *
 * T-03-13 mitigation: logIds come directly from queryAllApexLogs result;
 * the caller (purge command) must not inject user-supplied IDs.
 *
 * @param connection - Authenticated Salesforce connection from @salesforce/core
 * @param logIds - Array of ApexLog record IDs to delete (from queryAllApexLogs)
 * @returns Summary: { successCount, failureCount, deletedIds }
 */
export async function performBulkDelete(
  connection: Connection,
  logIds: string[]
): Promise<{ successCount: number; failureCount: number; deletedIds: string[] }> {
  const deletedIds: string[] = [];
  let failureCount = 0;

  // Delete all records in parallel; catch errors per record to allow partial success
  const results = await Promise.all(
    logIds.map(async (logId) => {
      try {
        await executeWithRetry(() => connection.tooling.delete("ApexLog", logId));
        return { logId, success: true };
      } catch (error) {
        // Per RESEARCH.md: per-record failures (permission, lock) are normal in bulk ops
        return { logId, success: false };
      }
    })
  );

  for (const result of results) {
    if (result.success) {
      deletedIds.push(result.logId);
    } else {
      failureCount++;
    }
  }

  return {
    successCount: deletedIds.length,
    failureCount,
    deletedIds,
  };
}

/**
 * Format the confirmation message shown to the user before purge begins.
 *
 * Per D-07 (locked decision): show impact in confirmation message so user understands
 * what will be deleted and how much space will be freed.
 * Per PURGE-02 requirement: require explicit confirmation before deletion.
 * Per UX-02 requirement: clear guidance on consequences.
 *
 * @param logCount - Number of logs that would be deleted
 * @param totalMB - Storage freed in megabytes (from calculateFreedSpace)
 * @returns Confirmation message string for display to user
 */
export function formatPurgeConfirmation(logCount: number, totalMB: string): string {
  return `Deleting all ${logCount} logs would free ~${totalMB}MB. Proceed? (yes/no)`;
}

/**
 * Format the success message shown after purge completes.
 *
 * Per PURGE-03 requirement: report storage freed after deletion.
 * Per UX-01 requirement: clear status message after operation.
 * If some records failed to delete, appends a note about the failure count.
 *
 * @param deleteCount - Number of logs successfully deleted
 * @param totalMB - Storage freed in megabytes
 * @param failureCount - Number of records that failed to delete (0 = full success)
 * @returns Success message string for display to user
 */
export function formatPurgeSuccess(
  deleteCount: number,
  totalMB: string,
  failureCount: number
): string {
  const base = `Successfully deleted ${deleteCount} logs. Freed ~${totalMB}MB.`;

  if (failureCount > 0) {
    return `${base} (${failureCount} log${failureCount === 1 ? "" : "s"} failed to delete due to permissions or locks)`;
  }

  return base;
}
