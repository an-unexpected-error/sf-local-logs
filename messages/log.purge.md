# summary

Delete all debug logs to manage storage quota.

# description

Delete all debug logs in the org to free storage quota. Requires confirmation.
Displays the number of logs that would be deleted and estimated storage freed before proceeding.
Use --force to skip confirmation for scripting.

# examples

- <%= config.bin %> <%= command.id %> --target-org my-org
- <%= config.bin %> <%= command.id %> --target-org my-org --force --json

# flagForce

Skip confirmation prompt. Useful for scripting. Shows freed storage in output.

# confirmationPrompt

Deleting all %d logs would free ~%sMB. Proceed?

# statusQuerying

Querying debug logs in org...

# statusDeleting

Deleting %d log(s)...

# statusNoLogs

No logs to delete. Your org is clean!

# statusSuccess

Successfully deleted %d logs. Freed ~%sMB.

# statusSuccessWithFailures

Deleted %d logs. Freed ~%sMB. (%d logs failed to delete due to permissions or locks.)

# statusCancelled

Purge cancelled.

# errorQueryFailed

Unable to query logs: %s. Try again or contact your Salesforce admin.

# errorDeleteFailed

Failed to delete logs: %s. Check permissions and try again.

# errorInsufficientAccess

You do not have permission to delete debug logs. Contact your Salesforce admin.

# errorConnectionFailed

Unable to connect to org. Verify you have permission and org is active.

# warningRateLimited

Rate limited by Salesforce. Retrying in %ds...
