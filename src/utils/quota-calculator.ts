/**
 * Quota calculator utility for checking Salesforce debug log storage limits.
 *
 * Provides functions for:
 * - Querying org's remaining 1GB debug log storage via REST Limits API (DOWNLOAD-03)
 * - Fallback aggregation via ApexLog.LogLength SUM query
 * - Validating quota before download operations (DOWNLOAD-04)
 * - Formatting quota status for user-facing display
 *
 * Security mitigations:
 * - T-03-04: Validate REST Limits API response (Max > Remaining; both positive integers)
 * - T-03-04: Reject unexpected response format and fall back to aggregation
 *
 * Per RESEARCH.md Pitfall 2: check quota periodically during download (not just upfront);
 * other processes may consume quota concurrently.
 */

import { type Connection } from "@salesforce/core";
import { executeWithRetry } from "./download-helper.js";

/**
 * Total debug log storage quota in bytes (1GB = 1,000,000,000 bytes).
 * Used as the denominator for quota percentage calculations and the
 * fallback total when the REST Limits API doesn't report a Max value.
 */
const DEBUG_LOG_QUOTA_BYTES = 1_000_000_000;

/**
 * Response shape for the Salesforce REST Limits API /limits endpoint.
 * Only the DebugLogs field is required; other limits are ignored.
 */
interface LimitsApiResponse {
  DebugLogs?: {
    Max: number; // Total quota in bytes (e.g., 1000000000 for 1GB)
    Remaining: number; // Remaining bytes available
  };
}

/**
 * Response shape for the ApexLog.LogLength aggregate fallback query.
 */
interface AggregateQueryResult {
  totalSize: number; // SUM(LogLength) across all ApexLog records
}

/**
 * Query the org's remaining debug log storage quota using the REST Limits API.
 *
 * Primary approach (Option A from RESEARCH.md Pattern 3):
 * - GET /services/data/v67.0/limits
 * - Parse DebugLogs.Max (total bytes) and DebugLogs.Remaining (remaining bytes)
 * - Convert to MB: divide by 1e6
 *
 * If the REST Limits API call fails or returns unexpected data,
 * falls back to getRemainingQuotaFallback() automatically.
 *
 * Wrapped in executeWithRetry() to handle HTTP 429 rate limiting (UX-03).
 *
 * T-03-04 mitigation: validates API response structure before use; rejects
 * negative values or inverted (used > total) quota data.
 *
 * @param connection - Authenticated Salesforce connection from @salesforce/core
 * @returns Quota breakdown in megabytes: { usedMB, remainingMB, totalMB }
 * @throws If both primary and fallback quota checks fail
 */
export async function getRemainingQuota(
  connection: Connection
): Promise<{ usedMB: number; remainingMB: number; totalMB: number }> {
  try {
    const limitsResponse = await executeWithRetry(() =>
      connection.request<LimitsApiResponse>({
        method: "GET",
        url: "/services/data/v67.0/limits",
      })
    );

    // T-03-04: Validate REST Limits API response structure
    const debugLogs = limitsResponse.DebugLogs;

    if (
      debugLogs &&
      typeof debugLogs.Max === "number" &&
      typeof debugLogs.Remaining === "number" &&
      Number.isInteger(debugLogs.Max) &&
      Number.isInteger(debugLogs.Remaining) &&
      debugLogs.Max > 0 &&
      debugLogs.Remaining >= 0 &&
      debugLogs.Max >= debugLogs.Remaining // Used cannot exceed total
    ) {
      return {
        usedMB: (debugLogs.Max - debugLogs.Remaining) / 1e6,
        remainingMB: debugLogs.Remaining / 1e6,
        totalMB: debugLogs.Max / 1e6,
      };
    }

    // Unexpected response format — fall back to aggregation
    return getRemainingQuotaFallback(connection);
  } catch {
    // REST Limits API unavailable — fall back to aggregation
    return getRemainingQuotaFallback(connection);
  }
}

/**
 * Fallback quota calculation by aggregating ApexLog.LogLength across all records.
 *
 * Per RESEARCH.md Pattern 3, Option B: use when REST Limits API is unavailable.
 * Less accurate than the primary approach (query may be slower on large orgs),
 * but provides a reasonable estimate of current storage usage.
 *
 * SELECT SUM(LogLength) totalSize FROM ApexLog
 *
 * @param connection - Authenticated Salesforce connection
 * @returns Quota breakdown in megabytes: { usedMB, remainingMB, totalMB }
 * @throws If the aggregation query fails
 */
export async function getRemainingQuotaFallback(
  connection: Connection
): Promise<{ usedMB: number; remainingMB: number; totalMB: number }> {
  const result = await executeWithRetry(() =>
    connection.tooling.query<AggregateQueryResult>(
      "SELECT SUM(LogLength) totalSize FROM ApexLog"
    )
  );

  const usedBytes = (result.records[0] as AggregateQueryResult | undefined)?.totalSize ?? 0;
  const remainingBytes = Math.max(0, DEBUG_LOG_QUOTA_BYTES - usedBytes);

  return {
    usedMB: usedBytes / 1e6,
    remainingMB: remainingBytes / 1e6,
    totalMB: DEBUG_LOG_QUOTA_BYTES / 1e6,
  };
}

/**
 * Check if the org has sufficient quota to download a specific number of bytes.
 *
 * Per DOWNLOAD-03 and DOWNLOAD-04: validate quota is available before download.
 * Per RESEARCH.md Pitfall 2: also call periodically during download loops.
 *
 * Throws a quota exceeded error with actionable remediation guidance (D-05 decision):
 * "Storage quota exceeded. Current: {usedMB}MB/{totalMB}MB. Run: sf log purge to delete old logs."
 *
 * @param connection - Authenticated Salesforce connection
 * @param requiredBytes - Number of bytes needed for the upcoming download
 * @returns true if sufficient quota is available
 * @throws Error with quota exceeded message if remaining quota < requiredBytes
 */
export async function validateQuotaAvailable(
  connection: Connection,
  requiredBytes: number
): Promise<boolean> {
  const quota = await getRemainingQuota(connection);
  const remainingBytes = quota.remainingMB * 1e6;

  if (remainingBytes < requiredBytes) {
    // D-05 (locked): quota exceeded error with sf log purge suggestion
    throw new Error(
      `Storage quota exceeded. Current: ${quota.usedMB.toFixed(0)}MB/${quota.totalMB.toFixed(0)}MB. Run: sf log purge to delete old logs.`
    );
  }

  return true;
}

/**
 * Format a quota status for human-readable display.
 *
 * Returns: "Used: {usedMB}MB / {totalMB}MB (Remaining: {remainingMB}MB)"
 * Numbers are rounded to 1 decimal place for readability.
 *
 * @param usedMB - Megabytes of storage used
 * @param remainingMB - Megabytes of storage remaining
 * @param totalMB - Total megabytes of storage quota
 * @returns Human-readable quota status string
 */
export function formatQuotaMessage(
  usedMB: number,
  remainingMB: number,
  totalMB: number
): string {
  return `Used: ${usedMB.toFixed(1)}MB / ${totalMB.toFixed(1)}MB (Remaining: ${remainingMB.toFixed(1)}MB)`;
}
