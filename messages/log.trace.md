# summary
Initiate a debug log session for a Salesforce user.

# description
Creates a TraceFlag for the specified user so Salesforce generates debug logs for their activity.
The trace flag remains active for 24 hours, during which all of the user's interactions are logged.
By default, the command monitors the trace flag and displays a progress bar showing time remaining.
Use --no-watch to create the flag and exit immediately (useful for scripting).

# examples
- <%= config.bin %> <%= command.id %> --user-id 005XXXXXXXXXXXXXXX --target-org my-org
- <%= config.bin %> <%= command.id %> --user-id 005XXXXXXXXXXXXXXX --level INFO --target-org my-org
- <%= config.bin %> <%= command.id %> --user-id 005XXXXXXXXXXXXXXX --no-watch --target-org my-org
- <%= config.bin %> <%= command.id %> --user-id 005XXXXXXXXXXXXXXX --overwrite --target-org my-org
- <%= config.bin %> <%= command.id %> --user-id 005XXXXXXXXXXXXXXX --json --target-org my-org

# statusCreatingTrace
Creating trace flag for %s...

# statusTraceCreated
Trace flag created successfully.

# statusStoppingExistingTrace
Stopping existing trace for %s...

# statusEnteringWatchMode
Monitoring trace flag... Press Ctrl+C to exit. Trace expires at %s.

# statusTraceExpired
Trace flag expired. No more logs will be generated.

# errorUserIdRequired
User ID required. Use --user-id <id> to specify the user to trace.

# errorDebugLevelNotFound
Unable to determine debug level. Use --level DEBUG to specify explicitly. Available levels: DEBUG, INFO, WARNING, ERROR.

# errorDebugLevelFailed
Failed to query debug level from org. %s. Try again or use --level to specify explicitly.

# errorTraceCreationFailed
Failed to create trace flag. %s. Verify you have TraceFlag creation permission.

# errorActiveTraceExists
User %s already has an active trace flag. Use --overwrite to stop the existing trace and create a new one.

# errorUserNotFound
User %s not found in this org. Verify the user ID and try again.

# errorPermissionDenied
Permission denied. You may not have permission to create trace flags. Contact your Salesforce admin. (Technical detail: %s)

# errorOrgConnectionFailed
Unable to connect to org. Verify org is active and you are authenticated. Try: sf org list

# errorInvalidInput
Invalid input. %s

# promptSearchTerm
Search for user by first or last name (e.g., 'john' or 'smith')

# statusSearching
Searching for users...

# messageNoUsersFound
No users found matching '%s'. Try searching again with different search term.

# statusSearchCancelled
Search cancelled. No trace flag created.

# errorMinLength
Search term must be at least 2 characters

# errorOrgConnectionFailed
Unable to connect to org %s. Verify org is active and you are authenticated. Try: sf org list

# errorSearchTimedOut
Search timed out. Network connection issue. Try again.

# errorQueryFailed
Search query failed. Try again or contact your Salesforce admin.

# downloadStarting
Starting download of logs for user %s...

# downloadProgress
Downloaded %d of ~%d log(s) • %dMB • ETA: %s

# downloadCompleted
Download complete. %d log(s) saved to %s

# downloadNotStarted
No logs available yet. Logs may still be generating. Trace flag remains active.

# errorQuotaExceeded
Storage quota exceeded. Current: %dMB/%dMB. Run: sf log purge to delete old logs.

# errorDownloadFailed
Download failed: %s

# errorDownloadTimeout
Download timed out. Try again in a moment.

# errorRateLimited
Rate limited by Salesforce. Retrying in %ds...

# statusBothActive
Trace flag expiry and log download in progress...

# statusWatchModeOnly
Monitoring trace flag expiry...

# statusDownloadOnly
Downloading logs for traced user...

# statusTraceCancelled
Trace and download cancelled. Partial logs may remain in %s.
