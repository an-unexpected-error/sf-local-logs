import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { cli } from 'cli-ux';
import { getDefaultDebugLevel, createTraceFlag, checkExistingTraceFlag, getDebugLevelName } from '../../utils/trace-helper.js';
import { watchTraceFlag } from '../../utils/trace-monitor.js';
import { TraceResult } from '../../types/trace.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

Messages.importMessagesDirectory(__dirname);
const messages = Messages.loadMessages('sf-local-logs', 'log.trace');

/**
 * Trace command: Initiate a debug log session for a Salesforce user.
 *
 * Creates a TraceFlag that enables Salesforce to generate debug logs for a user's activity.
 * Users can provide --user-id to directly specify a user, or use interactive search (Phase 3).
 *
 * By default, monitors the trace flag with a progress bar showing time remaining (watch mode).
 * Users can skip watch mode with --no-watch for scripting/automation.
 *
 * Implements DEBUG-01, DEBUG-02, DEBUG-03 (trace creation, debug level, confirmation),
 * UX-01, UX-02 (status messages, error handling),
 * UX-04, UX-05 (JSON output, multi-org support via --target-org).
 */
export default class Trace extends SfCommand<TraceResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    'target-org': Flags.requiredOrg(),
    'api-version': Flags.orgApiVersion(),
    'user-id': Flags.string({
      summary: 'Salesforce user ID to trace (required for now; interactive search coming in Phase 3)',
      required: false,
    }),
    'level': Flags.string({
      summary: 'Debug level to apply (DEBUG, INFO, WARNING, ERROR). Omit to use org default.',
      required: false,
    }),
    'no-watch': Flags.boolean({
      summary: 'Exit immediately after creating trace flag. Skips the 24-hour monitoring period.',
      required: false,
      default: false,
    }),
    'overwrite': Flags.boolean({
      summary: 'Stop the existing active trace flag and create a new one.',
      required: false,
      default: false,
    }),
  };

  public async run(): Promise<TraceResult> {
    const { flags } = await this.parse(Trace);

    const org = flags['target-org'];
    const userId = flags['user-id'];
    const levelFlag = flags['level'];
    const noWatch = flags['no-watch'];
    const overwrite = flags['overwrite'];

    // Validate --user-id provided (Phase 3 adds interactive search)
    if (!userId) {
      throw new Error(messages.getMessage('errorUserIdRequired'));
    }

    try {
      // Step 1: Determine debug level (either from flag or org default)
      let debugLevelId: string;
      if (levelFlag) {
        // For now, accept the level value as-is (future: validate against allowed values)
        // In Phase 3+, we might add validation, but per CONTEXT.md, we let Salesforce API handle it
        debugLevelId = levelFlag;
      } else {
        // Query org's default DebugLevel
        try {
          debugLevelId = await getDefaultDebugLevel(org);
        } catch (error) {
          throw new Error(messages.getMessage('errorDebugLevelFailed', [error instanceof Error ? error.message : String(error)]));
        }
      }

      // Step 2: Check for existing active trace flag
      try {
        await checkExistingTraceFlag(org, userId, overwrite);
        if (overwrite) {
          this.log(messages.getMessage('statusStoppingExistingTrace', [userId]));
        }
      } catch (error) {
        // Re-throw error from checkExistingTraceFlag (either "already exists" or other)
        throw error;
      }

      // Step 3: Create new TraceFlag
      this.log(messages.getMessage('statusCreatingTrace', [userId]));
      let traceFlagResult: { id: string; expirationDate: string; debugLevel: string };
      try {
        traceFlagResult = await createTraceFlag(org, userId, debugLevelId);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (errorMsg.includes('Permission denied')) {
          throw new Error(messages.getMessage('errorPermissionDenied', [errorMsg]));
        } else if (errorMsg.includes('Invalid user ID')) {
          throw new Error(messages.getMessage('errorUserNotFound', [userId]));
        } else {
          throw new Error(messages.getMessage('errorTraceCreationFailed', [errorMsg]));
        }
      }

      // Step 4: Query user details for display (name, email)
      let userName = userId;
      let userEmail = 'unknown';
      try {
        const connection = org.getConnection();
        const userResult = await connection.query<{ FirstName: string; LastName: string; Email: string }>(
          `SELECT FirstName, LastName, Email FROM User WHERE Id = '${userId}' LIMIT 1`
        );
        if (userResult.records.length > 0) {
          const user = userResult.records[0];
          userName = `${user.FirstName} ${user.LastName}`;
          userEmail = user.Email;
        }
      } catch (error) {
        // If user query fails, continue with defaults; don't fail the whole command
        this.warn(`Could not retrieve user details: ${error}`);
      }

      // Step 5: Query DebugLevel name for display
      let debugLevelName: string;
      try {
        debugLevelName = await getDebugLevelName(org, debugLevelId);
      } catch (error) {
        // If query fails, use the ID as fallback
        debugLevelName = debugLevelId;
      }

      // Step 6: Log success message
      this.log(messages.getMessage('statusTraceCreated'));

      // Step 7: Build result
      const result: TraceResult = {
        traceFlag: {
          id: traceFlagResult.id,
          userId,
          userName,
          userEmail,
          debugLevel: debugLevelName,
          expirationDate: traceFlagResult.expirationDate,
        },
      };

      // Display result in table format (unless --json flag is used, which SfCommand handles)
      if (!this.jsonEnabled()) {
        cli.table(
          [
            {
              'Trace Flag ID': result.traceFlag.id,
              'User': result.traceFlag.userName,
              'Email': result.traceFlag.userEmail,
              'Debug Level': result.traceFlag.debugLevel,
              'Expires At': result.traceFlag.expirationDate,
            },
          ],
          {
            'Trace Flag ID': { get: (row: Record<string, string>) => row['Trace Flag ID'] },
            'User': { get: (row: Record<string, string>) => row['User'] },
            'Email': { get: (row: Record<string, string>) => row['Email'] },
            'Debug Level': { get: (row: Record<string, string>) => row['Debug Level'] },
            'Expires At': { get: (row: Record<string, string>) => row['Expires At'] },
          }
        );

        // Step 8: Enter watch mode if not disabled by --no-watch flag
        if (!noWatch) {
          this.log(messages.getMessage('statusEnteringWatchMode', [result.traceFlag.expirationDate]));
          await watchTraceFlag(org, result.traceFlag.id, result.traceFlag.expirationDate, { log: this.log });
        }
      }

      return result;
    } catch (error) {
      // Re-throw with proper error message
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(errorMsg);
    }
  }
}
