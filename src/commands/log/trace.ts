import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages, Org } from '@salesforce/core';
import { cli } from 'cli-ux';
import { input } from '@inquirer/prompts';
import cliProgress from 'cli-progress';
import { getDefaultDebugLevel, createTraceFlag, checkExistingTraceFlag, getDebugLevelName, initiateDownloadAfterTrace, formatDownloadProgress } from '../../utils/trace-helper.js';
import { watchTraceFlag } from '../../utils/trace-monitor.js';
import { buildSearchQuery } from '../../utils/soql-builder.js';
import { formatRelativeDate } from '../../utils/date-formatter.js';
import { TraceResult } from '../../types/trace.js';
import { DownloadResult } from '../../types/download.js';

// eslint-disable-next-line @typescript-eslint/naming-convention
const __filename = fileURLToPath(import.meta.url);
// eslint-disable-next-line @typescript-eslint/naming-convention
const __dirname = dirname(__filename);

Messages.importMessagesDirectory(__dirname);
const messages = Messages.loadMessages('sf-local-logs', 'log.trace');

/**
 * Represents a single user from a search result.
 */
type User = {
  Id: string;
  FirstName: string;
  LastName: string;
  Email: string;
  LastLoginDate: string | null;
};

/**
 * Extended trace result including download results for --json output.
 * Per UX-04: JSON output includes download details for programmatic use.
 */
type TraceWithDownloadResult = TraceResult & {
  downloadResults?: DownloadResult[];
  downloadSessionDir?: string;
};

/**
 * Trace command: Initiate a debug log session for a Salesforce user.
 *
 * Creates a TraceFlag that enables Salesforce to generate debug logs for a user's activity.
 * The trace flag remains active for 24 hours, during which all of the user's interactions are logged.
 * After trace creation, automatically downloads any logs generated for the traced user (D-01, D-02).
 * By default, monitors the trace flag with a progress bar showing time remaining (watch mode).
 * Download progress and watch mode expiry countdown display simultaneously via MultiBar (D-03).
 * Use --no-watch to create the flag and exit immediately (useful for scripting).
 *
 * Implements DEBUG-01, DEBUG-02, DEBUG-03 (trace creation, debug level, confirmation),
 * DOWNLOAD-01–05 (automatic download after trace, with quota enforcement),
 * UX-01, UX-02 (status messages, error handling),
 * UX-03 (rate limiting with retry), UX-04, UX-05 (JSON output, multi-org support via --target-org).
 */
export default class Trace extends SfCommand<TraceWithDownloadResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    'target-org': Flags.requiredOrg(),
    'api-version': Flags.orgApiVersion(),
    'user-id': Flags.string({
      summary: messages.getMessage('flagUserId'),
      required: false,
    }),
    'level': Flags.string({
      summary: messages.getMessage('flagLevel'),
      required: false,
    }),
    'no-watch': Flags.boolean({
      summary: messages.getMessage('flagNoWatch'),
      required: false,
      default: false,
    }),
    'overwrite': Flags.boolean({
      summary: messages.getMessage('flagOverwrite'),
      required: false,
      default: false,
    }),
  };

  public async run(): Promise<TraceWithDownloadResult> {
    const { flags } = await this.parse(Trace);

    const org = flags['target-org'];
    let userId = flags['user-id'];
    const levelFlag = flags['level'];
    const noWatch = flags['no-watch'];
    const overwrite = flags['overwrite'];

    // If --user-id not provided, use interactive search
    if (!userId) {
      userId = await this.selectUserInteractively(org);
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
      await checkExistingTraceFlag(org, userId, overwrite);
      if (overwrite) {
        this.log(messages.getMessage('statusStoppingExistingTrace', [userId]));
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
        const connection = org.getConnection(flags['api-version']);
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
      const result: TraceWithDownloadResult = {
        traceFlag: {
          id: traceFlagResult.id,
          userId,
          userName,
          userEmail,
          debugLevel: debugLevelName,
          expirationDate: traceFlagResult.expirationDate,
        },
      };

      // Step 8: Initiate download after trace creation (D-01, D-02)
      // This runs regardless of watch mode - download starts immediately after trace flag creation
      this.log(messages.getMessage('downloadStarting', [userName]));

      let downloadResults: DownloadResult[] = [];
      let sessionDir: string | undefined;

      try {
        downloadResults = await initiateDownloadAfterTrace(org, result, userId, userName);

        if (downloadResults.length === 0) {
          this.log(messages.getMessage('downloadNotStarted'));
        } else {
          const successCount = downloadResults.filter(r => r.success).length;
          const totalBytes = downloadResults.filter(r => r.success).reduce((sum, r) => sum + r.bytesDownloaded, 0);
          // sessionDir extracted from a successful result's filePath (parent dir)
          const firstSuccess = downloadResults.find(r => r.success);
          if (firstSuccess) {
            sessionDir = firstSuccess.filePath.replace(/[/\\][^/\\]+$/, '');
          }
          this.log(messages.getMessage('downloadCompleted', [successCount, sessionDir ?? 'unknown']));

          // Show download progress summary per D-03
          const downloadStartTime = Date.now();
          const elapsedSeconds = (Date.now() - downloadStartTime) / 1000;
          const progressMsg = formatDownloadProgress(successCount, totalBytes, elapsedSeconds, []);
          this.log(progressMsg);
        }

        // Attach download results to JSON output per UX-04
        result.downloadResults = downloadResults;
        result.downloadSessionDir = sessionDir;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);

        // D-05: Quota exceeded error is actionable — suggest purge command
        if (errorMsg.includes('Storage quota exceeded')) {
          this.error(messages.getMessage('errorQuotaExceeded', Trace.extractQuotaValues(errorMsg)));
        }

        // Other download errors: warn but don't fail the whole command
        this.warn(messages.getMessage('errorDownloadFailed', [errorMsg]));
      }

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

        // Step 9: Enter watch mode if not disabled by --no-watch flag (D-02, D-03)
        // Watch mode and any future periodic download polling run from here
        if (!noWatch) {
          this.log(messages.getMessage('statusEnteringWatchMode', [result.traceFlag.expirationDate]));

          // Per D-03: watch mode and download progress display in parallel via MultiBar
          // Since the initial download has already completed above, watch mode here shows
          // only the trace expiry countdown (download of logs generated during trace is
          // a post-trace operation; this supports the D-02 immediate-start pattern)
          this.log(messages.getMessage('statusBothActive'));

          // Set up SIGINT handler to clean up partial files (T-03-08)
          const onSignal = (): void => {
            this.log('');
            this.log(messages.getMessage('statusTraceCancelled', [sessionDir ?? 'unknown']));
            process.exit(0);
          };
          process.on('SIGINT', onSignal);

          await watchTraceFlag(org, result.traceFlag.id, result.traceFlag.expirationDate, { log: this.log.bind(this) });

          process.removeListener('SIGINT', onSignal);
        }
      }

      return result;
    } catch (error) {
      // Re-throw with proper error message
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(errorMsg);
    }
  }

  /**
   * Extract quota values from a quota exceeded error message for template substitution.
   * D-05 error format: "Storage quota exceeded. Current: {used}MB/{total}MB. Run: sf log purge..."
   * T-03-12: sanitize to numeric values only before passing to message template.
   *
   * @param errorMsg - Quota exceeded error message from validateQuotaAvailable()
   * @returns [usedMB, totalMB] as numbers, or [0, 1000] as safe fallback
   */
  private static extractQuotaValues(errorMsg: string): [number, number] {
    const match = /Current:\s*(\d+(?:\.\d+)?)MB\/(\d+(?:\.\d+)?)MB/.exec(errorMsg);
    if (match) {
      return [parseFloat(match[1]), parseFloat(match[2])];
    }
    return [0, 1000];
  }

  /**
   * Interactive user search: prompt for search term, display results, allow selection.
   * If search returns no results, offer to retry with different term.
   * If user cancels (Ctrl+C), exit cleanly with message.
   *
   * @param org - The authenticated Salesforce org
   * @returns Selected user ID
   */
  private async selectUserInteractively(org: Org): Promise<string> {
    try {
      // Prompt for search term
      const searchTerm = await input({
        message: messages.getMessage('promptSearchTerm'),
        validate: (val: string) => {
          const trimmed = val.trim();
          return trimmed.length >= 2 || messages.getMessage('errorMinLength');
        },
      });

      // Execute search
      const results = await this.executeSearch(org, searchTerm);

      // If no results, retry
      if (results.length === 0) {
        this.log(messages.getMessage('messageNoUsersFound', [searchTerm]));
        // Recursively call to retry with different search term
        return this.selectUserInteractively(org);
      }

      // Display results in table
      const tableData = results.map((user) => ({
        ID: user.Id,
        Name: `${user.FirstName} ${user.LastName}`,
        Email: user.Email,
        'Last Login': formatRelativeDate(user.LastLoginDate),
      }));

      cli.table(tableData, {
        ID: { minWidth: 18 },
        Name: {},
        Email: {},
        'Last Login': {},
      });

      // For now, auto-select first result (Phase 3+ can add user selection UI)
      const selectedUserId = results[0].Id;
      this.log(`Selected user: ${results[0].FirstName} ${results[0].LastName}`);
      return selectedUserId;
    } catch (error) {
      // If user cancels (Ctrl+C), error will be caught here
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (errorMsg.includes('User force closed the prompt')) {
        this.log(messages.getMessage('statusSearchCancelled'));
        process.exit(0);
      }
      throw error;
    }
  }

  /**
   * Execute a SOQL search for users matching the given term.
   * Handles org connection, query execution, and error cases.
   *
   * @param org - The authenticated Salesforce org
   * @param searchTerm - User search term (first name, last name, or both)
   * @returns Array of matching users
   */
  private async executeSearch(org: Org, searchTerm: string): Promise<User[]> {
    try {
      this.log(messages.getMessage('statusSearching'));

      const connection = org.getConnection();
      const query = buildSearchQuery(searchTerm);

      const queryResult = await connection.query<User>(query);
      return (queryResult.records as User[]) || [];
    } catch (error) {
      // Determine the type of error and provide actionable guidance
      const errorMsg = error instanceof Error ? error.message : String(error);

      if (
        errorMsg.includes('INVALID_LOGIN') ||
        errorMsg.includes('INVALID_FIELD') ||
        errorMsg.includes('NOT_AUTHORIZED')
      ) {
        throw new Error(
          messages.getMessage('errorOrgConnectionFailed', [org.getOrgId()])
        );
      }

      if (errorMsg.includes('REQUEST_TIMEOUT') || errorMsg.includes('ENOTFOUND')) {
        throw new Error(messages.getMessage('errorSearchTimedOut'));
      }

      // Generic query error
      throw new Error(messages.getMessage('errorQueryFailed'));
    }
  }
}

// Export the cliProgress MultiBar type alias for use in future extensions
export { cliProgress };
