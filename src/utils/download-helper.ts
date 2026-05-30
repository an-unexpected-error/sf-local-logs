/**
 * Download helper utilities for querying and streaming ApexLog records.
 *
 * Provides functions for:
 * - Querying ApexLog records for a specific user within a time window (DOWNLOAD-01)
 * - Streaming log body content to disk without buffering in memory (DOWNLOAD-05)
 * - Calculating ETA for download progress display (DOWNLOAD-02)
 * - Retrying rate-limited requests with exponential backoff (UX-03)
 *
 * Security mitigations:
 * - T-03-01: LogLength validated as positive integer before quota calculations
 * - T-03-03: fs.pipeline() used for streaming; no full-file buffering
 * - T-03-05: Retries capped at 3 attempts with 2^n delays; fail-fast after max attempts
 *
 * @see https://developer.salesforce.com/docs/atlas.en-us.api_tooling.meta/api_tooling/tooling_api_objects_apexlog.htm
 */

import { type Connection } from "@salesforce/core";
import { pipeline } from "stream/promises";
import { createWriteStream } from "fs";
import { type ApexLogRecord } from "../types/download.js";
import { escapeSoql } from "./soql-builder.js";

/**
 * Maximum number of records returned per Tooling API query page.
 * Salesforce Tooling API caps results at 2000 records per query.
 * Use OFFSET to paginate beyond this limit (RESEARCH.md Pitfall 3).
 */
const TOOLING_API_PAGE_SIZE = 2000;

/**
 * Query ApexLog records for a specific user within a time window.
 *
 * Filters by LogUserId (the indexed field for user filtering) and StartTime
 * to scope results to logs generated during a specific trace session.
 *
 * Handles pagination automatically: if totalSize > 2000, loops with OFFSET
 * until all records are fetched (prevents silent data loss per RESEARCH.md Pitfall 3).
 *
 * Wrapped in executeWithRetry() to handle HTTP 429 rate limiting (UX-03).
 *
 * @param connection - Authenticated Salesforce connection from @salesforce/core
 * @param userId - Salesforce User ID to filter logs by (LogUserId field)
 * @param startTime - Start of the time window (inclusive)
 * @param endTime - End of the time window (inclusive)
 * @returns Array of ApexLog records for the user in the time window
 * @throws If the Tooling API query fails after maxAttempts retries
 */
export async function queryApexLogsForUser(
  connection: Connection,
  userId: string,
  startTime: Date,
  endTime: Date
): Promise<ApexLogRecord[]> {
  const startTimeISO = startTime.toISOString();
  const endTimeISO = endTime.toISOString();

  const baseQuery = `SELECT Id, LogUserId, LogUser.Name, StartTime, LogLength, DurationMilliseconds, Status FROM ApexLog WHERE LogUserId = '${escapeSoql(userId)}' AND StartTime >= ${startTimeISO} AND StartTime <= ${endTimeISO} ORDER BY StartTime DESC`;

  const allRecords: ApexLogRecord[] = [];

  // Fetch first page
  const firstResult = await executeWithRetry(
    () => connection.tooling.query<ApexLogRecord>(`${baseQuery} LIMIT ${TOOLING_API_PAGE_SIZE}`)
  );

  allRecords.push(...firstResult.records);

  // Handle pagination if totalSize exceeds one page
  if (firstResult.totalSize > TOOLING_API_PAGE_SIZE) {
    let offset = TOOLING_API_PAGE_SIZE;

    while (offset < firstResult.totalSize) {
      const nextPage = await executeWithRetry(
        () =>
          connection.tooling.query<ApexLogRecord>(
            `${baseQuery} LIMIT ${TOOLING_API_PAGE_SIZE} OFFSET ${offset}`
          )
      );

      allRecords.push(...nextPage.records);
      offset += TOOLING_API_PAGE_SIZE;
    }
  }

  // T-03-01: Validate LogLength is a positive integer; filter out invalid records
  return allRecords.filter((record) => {
    const length = record.LogLength;
    return (
      typeof length === "number" &&
      Number.isInteger(length) &&
      length >= 0 &&
      length <= 1e9
    );
  });
}

/**
 * Execute an async operation with exponential backoff retry on HTTP 429 errors.
 *
 * Catches HTTP 429 (Too Many Requests) and retries with increasing delays:
 * - Attempt 1 fails → wait 2^0 * 1000 = 1000ms
 * - Attempt 2 fails → wait 2^1 * 1000 = 2000ms
 * - Attempt 3 fails → throw error (max retries exceeded)
 *
 * For non-429 errors or when maxAttempts is exhausted, the error is rethrown.
 * This prevents infinite retry loops (T-03-05: cap retries at 3 attempts).
 *
 * Per UX-03 requirement: rate limiting handled gracefully with exponential backoff.
 *
 * @param operation - Async function to execute with retry
 * @param maxAttempts - Maximum number of attempts (default: 3); capped per T-03-05
 * @returns Result of the successful operation
 * @throws Last caught error when maxAttempts is exceeded or non-429 error occurs
 */
export async function executeWithRetry<T>(
  operation: () => PromiseLike<T> | Promise<T>,
  maxAttempts: number = 3
): Promise<T> {
  // T-03-05: Cap retries at 3 to prevent DoS via unlimited retries
  const effectiveMaxAttempts = Math.min(maxAttempts, 3);

  for (let attempt = 1; attempt <= effectiveMaxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error: unknown) {
      const err = error as Record<string, unknown>;
      const statusCode = (err?.status as number) ?? (err?.response as Record<string, unknown>)?.status;

      // Only retry on HTTP 429 (Too Many Requests)
      if (statusCode === 429 && attempt < effectiveMaxAttempts) {
        // Exponential backoff: 1s, 2s, 4s (2^(attempt-1) * 1000ms)
        const delayMs = Math.pow(2, attempt - 1) * 1000;
        await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      // Non-429 error or max attempts exceeded — propagate to caller
      throw error;
    }
  }

  // TypeScript flow analysis requires this; unreachable in practice
  throw new Error("executeWithRetry: exhausted all attempts");
}

/**
 * Calculate estimated time remaining (ETA) for an in-progress download.
 *
 * Estimates remaining time based on current download rate and amount left.
 * Returns 0 in degenerate cases (no elapsed time, no bytes downloaded, or
 * zero download rate) to avoid displaying meaningless negative ETAs.
 *
 * Formula: remainingBytes / currentRate
 * where currentRate = bytesDownloaded / elapsedSeconds
 *
 * Per DOWNLOAD-02 requirement: display ETA during download progress.
 * Note: ETA is estimated; total log count is unknown during concurrent generation.
 *
 * @param bytesDownloaded - Number of bytes downloaded so far
 * @param totalBytes - Total expected bytes (from sum of ApexLogRecord.LogLength)
 * @param elapsedSeconds - Number of seconds since download started
 * @returns Estimated remaining time in seconds, or 0 if indeterminate
 */
export function calculateETA(
  bytesDownloaded: number,
  totalBytes: number,
  elapsedSeconds: number
): number {
  // Handle division by zero and insufficient data cases
  if (elapsedSeconds < 1 || bytesDownloaded <= 0) {
    return 0;
  }

  const currentRate = bytesDownloaded / elapsedSeconds; // bytes per second

  if (currentRate <= 0) {
    return 0;
  }

  const remainingBytes = totalBytes - bytesDownloaded;

  if (remainingBytes <= 0) {
    return 0;
  }

  return Math.ceil(remainingBytes / currentRate);
}

/**
 * Stream an ApexLog body from a readable source to a local file path.
 *
 * Uses Node.js fs.pipeline() for automatic backpressure handling:
 * - If the write stream is slower than the read stream, reads are paused
 * - On error, pipeline() automatically destroys both streams (prevents leaks)
 * - Memory usage stays ~64KB regardless of file size (per DOWNLOAD-05)
 *
 * T-03-03 mitigation: streaming-only; never buffers the entire file in memory.
 *
 * Per RESEARCH.md Pattern 2 and "Don't Hand-Roll" guidance:
 * use fs.pipeline(), NOT manual chunk buffering or axios.
 *
 * @param readableStream - Readable stream from a Salesforce Connection.request() call
 * @param filePath - Absolute path to the local file to write
 * @throws If the stream pipeline fails (file write error, stream abort, etc.)
 */
export async function streamDownloadToFile(
  readableStream: NodeJS.ReadableStream,
  filePath: string
): Promise<void> {
  const writableStream = createWriteStream(filePath);

  // pipeline() handles backpressure and cleans up both streams on error
  await pipeline(readableStream, writableStream);
}
