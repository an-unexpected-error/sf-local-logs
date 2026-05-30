/**
 * Purge command: Delete all debug logs in the org to free storage quota.
 *
 * Implements the full purge workflow:
 * 1. Query all ApexLog records in the org (queryAllApexLogs)
 * 2. Calculate impact: how many logs, how much space freed (calculateFreedSpace)
 * 3. Show confirmation prompt with impact details (unless --force)
 * 4. Perform bulk deletion via Tooling API (performBulkDelete)
 * 5. Report results: deleted count and freed storage in MB/GB
 *
 * Security mitigations:
 * - T-03-13: ApexLog IDs from queryAllApexLogs only; no user-supplied IDs in delete payload
 * - T-03-14: Requires explicit yes/no confirmation before delete (PURGE-02); --force requires
 *            documented scripting intent; confirmation message shows impact (D-07, T-03-16)
 * - T-03-15: All API errors caught and translated to user-friendly messages; no raw API leakage
 * - T-03-17: --json output assembled once at end via JSON.stringify; no streaming JSON
 *
 * Implements PURGE-01 (delete all org logs), PURGE-02 (confirmation), PURGE-03 (report freed).
 * Implements UX-01 (clear messages), UX-02 (actionable errors), UX-04 (--json), UX-05 (--target-org).
 */

import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { confirm } from '@inquirer/prompts';
import {
  queryAllApexLogs,
  calculateFreedSpace,
  performBulkDelete,
  formatPurgeConfirmation,
  formatPurgeSuccess,
} from '../../utils/purge-helper.js';

// eslint-disable-next-line @typescript-eslint/naming-convention
const __filename = fileURLToPath(import.meta.url);
// eslint-disable-next-line @typescript-eslint/naming-convention
const __dirname = dirname(__filename);

Messages.importMessagesDirectory(__dirname);
const messages = Messages.loadMessages('sf-local-logs', 'log.purge');

/**
 * Structured result for --json output.
 * T-03-17: assembled once at end; no streaming output.
 */
export type PurgeResult = {
  /** Number of logs successfully deleted */
  deletedCount: number;
  /** Number of logs that failed to delete (permissions, locks) */
  failedCount: number;
  /** Storage freed in megabytes (1 decimal place) */
  freedMB: string;
  /** Storage freed in gigabytes (2 decimal places) */
  freedGB: string;
};

export default class Purge extends SfCommand<PurgeResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    'target-org': Flags.requiredOrg(),
    'api-version': Flags.orgApiVersion(),
    /** Skip confirmation prompt. Useful for scripting. Per plan note: JSON + force work together. */
    force: Flags.boolean({
      summary: messages.getMessage('flagForce'),
      required: false,
      default: false,
    }),
  };

  public async run(): Promise<PurgeResult> {
    const { flags } = await this.parse(Purge);

    const org = flags['target-org'];
    const force = flags['force'];

    // Step 1: Get authenticated connection
    const connection = org.getConnection(flags['api-version']);

    // Step 2: Query all ApexLog records in the org
    this.log(messages.getMessage('statusQuerying'));

    let logRecords;
    try {
      logRecords = await queryAllApexLogs(connection);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      // T-03-15: Translate permission and connection errors to user-friendly messages
      if (errorMsg.includes('INSUFFICIENT_ACCESS') || errorMsg.includes('Permission denied') ||
          errorMsg.includes('NOT_AUTHORIZED')) {
        throw new Error(messages.getMessage('errorInsufficientAccess'));
      }

      if (errorMsg.includes('ENOTFOUND') || errorMsg.includes('ECONNREFUSED') ||
          errorMsg.includes('ETIMEDOUT') || errorMsg.includes('Request timeout')) {
        throw new Error(messages.getMessage('errorConnectionFailed'));
      }

      throw new Error(messages.getMessage('errorQueryFailed', [errorMsg]));
    }

    // Step 3: Check if there are any logs to delete
    if (logRecords.length === 0) {
      this.log(messages.getMessage('statusNoLogs'));
      return { deletedCount: 0, failedCount: 0, freedMB: '0.0', freedGB: '0.00' };
    }

    // Step 4: Calculate impact for confirmation message
    const freedSpace = calculateFreedSpace(logRecords);

    // Step 5: Show confirmation (unless --force bypasses it)
    if (!force) {
      // D-07 (locked): show impact before confirmation
      const confirmMessage = formatPurgeConfirmation(logRecords.length, freedSpace.totalMB);

      let confirmed: boolean;
      try {
        confirmed = await confirm({ message: confirmMessage });
      } catch {
        // User cancelled (Ctrl+C)
        this.log(messages.getMessage('statusCancelled'));
        return { deletedCount: 0, failedCount: 0, freedMB: '0.0', freedGB: '0.00' };
      }

      if (!confirmed) {
        this.log(messages.getMessage('statusCancelled'));
        return { deletedCount: 0, failedCount: 0, freedMB: '0.0', freedGB: '0.00' };
      }
    }

    // Step 6: Perform bulk deletion
    const logIds = logRecords.map((record) => record.Id);
    this.log(messages.getMessage('statusDeleting', [logIds.length]));

    let deleteResult;
    try {
      deleteResult = await performBulkDelete(connection, logIds);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      // T-03-15: Translate API errors
      if (errorMsg.includes('INSUFFICIENT_ACCESS') || errorMsg.includes('Permission denied') ||
          errorMsg.includes('NOT_AUTHORIZED')) {
        throw new Error(messages.getMessage('errorInsufficientAccess'));
      }

      if (errorMsg.includes('ENOTFOUND') || errorMsg.includes('ECONNREFUSED') ||
          errorMsg.includes('ETIMEDOUT')) {
        throw new Error(messages.getMessage('errorConnectionFailed'));
      }

      throw new Error(messages.getMessage('errorDeleteFailed', [errorMsg]));
    }

    // If every record failed, report as an error
    if (deleteResult.successCount === 0 && deleteResult.failureCount > 0) {
      throw new Error(messages.getMessage('errorDeleteFailed', ['All records failed to delete. Check permissions and try again.']));
    }

    // Step 7: Report results
    // T-03-17: Build result once at end; no streaming
    const result: PurgeResult = {
      deletedCount: deleteResult.successCount,
      failedCount: deleteResult.failureCount,
      freedMB: freedSpace.totalMB,
      freedGB: freedSpace.totalGB,
    };

    if (!this.jsonEnabled()) {
      const successMsg = formatPurgeSuccess(
        deleteResult.successCount,
        freedSpace.totalMB,
        deleteResult.failureCount
      );
      this.log(successMsg);
    }

    return result;
  }
}
