/**
 * Type definitions for the log download workflow.
 *
 * These types model the Salesforce Tooling API ApexLog object and
 * the plugin's internal state for tracking download progress and
 * organizing downloaded logs locally.
 *
 * @see https://developer.salesforce.com/docs/atlas.en-us.api_tooling.meta/api_tooling/tooling_api_objects_apexlog.htm
 */

/**
 * Represents an ApexLog record returned by the Salesforce Tooling API.
 *
 * Fields match the Tooling API SOQL query:
 *   SELECT Id, LogUserId, LogUser.Name, StartTime, LogLength, DurationMilliseconds, Status FROM ApexLog
 *
 * LogLength is in bytes; individual logs can be 10-100MB in high-volume orgs.
 * StartTime is ISO 8601 format and used to filter by trace session window.
 */
export interface ApexLogRecord {
  /** Unique Salesforce record ID for this log (e.g., "07aFX00000abcde") */
  Id: string;
  /** Salesforce User ID of the user whose activity was logged */
  LogUserId: string;
  /** Related LogUser object with display name */
  LogUser: {
    /** Full display name of the log user (e.g., "John Smith") */
    Name: string;
  };
  /** ISO 8601 timestamp when the log was created (e.g., "2026-05-30T14:30:00.000Z") */
  StartTime: string;
  /** Size of the log body in bytes (used for quota and progress calculations) */
  LogLength: number;
  /** Total duration of the logged operation in milliseconds */
  DurationMilliseconds: number;
  /** Log generation status (typically "Done" when complete) */
  Status: string;
}

/**
 * Result of a single log download operation.
 *
 * Returned per-file to track which logs were successfully downloaded
 * and which encountered errors. Used for --json output serialization.
 */
export interface DownloadResult {
  /** Salesforce ApexLog record ID */
  logId: string;
  /** Local filename (e.g., "07aFX00000abcde.json") */
  fileName: string;
  /** Absolute path to the downloaded file on the local filesystem */
  filePath: string;
  /** Number of bytes written to disk (should match ApexLogRecord.LogLength) */
  bytesDownloaded: number;
  /** Whether the download completed successfully */
  success: boolean;
  /** Error message if download failed; undefined on success */
  error?: string;
}

/**
 * Tracks the state of an in-progress download session.
 *
 * Used to calculate ETA (DOWNLOAD-02 requirement) and display progress
 * to the user during a download. The total log count is not known upfront
 * because logs may be generated concurrently during high-volume scenarios.
 *
 * ETA is estimated using: (totalBytes - bytesDownloaded) / currentRate
 * where currentRate = bytesDownloaded / elapsedSeconds.
 */
export interface DownloadProgress {
  /** Number of log files downloaded so far */
  filesDownloaded: number;
  /** Total bytes written to disk across all downloaded files */
  totalBytes: number;
  /** When the download session started (for elapsed time calculation) */
  startTime: Date;
  /** Current download rate in bytes per second (rolling average) */
  currentRate: number;
}

/**
 * Metadata for a download session, written to metadata.json in the session directory.
 *
 * Provides context for the downloaded logs: which user they belong to,
 * when the trace session started, and when logs were downloaded.
 * Helps users identify which debugging session a folder of logs corresponds to.
 *
 * Per D-08 decision, logs are organized by user + timestamp of trace session.
 */
export interface DownloadSessionMetadata {
  /** Salesforce User ID of the traced user */
  userId: string;
  /** Display name of the traced user (e.g., "john.smith") */
  userName: string;
  /** When the trace session was created in Salesforce */
  traceStartTime: Date;
  /** Formatted timestamp used as the session directory name (YYYY-MM-DD-HH-MM) */
  sessionTimestamp: string;
}
