# summary

Download Salesforce debug logs to local disk.

# description

Downloads ApexLog records from the target org for a specific user.
Uses streaming I/O to handle large log files (10-100MB) without memory issues.
Respects the org's 1GB debug log storage quota.
Organized locally by user and trace session timestamp.

# examples

- <%= config.bin %> <%= command.id %> --target-org my-org

# statusDownloadStarted

Downloading logs for user %s...

# statusDownloadProgress

Downloaded %d log(s) • %dMB • ETA: %s

# statusDownloadCompleted

Download complete. %d log(s) saved to %s

# errorQuotaExceeded

Storage quota exceeded. Current: %dMB/%dMB. Run: sf log purge to delete old logs.

# errorDownloadFailed

Download failed for log %s: %s

# errorNoLogsFound

No logs found for user %s in the time window.

# errorAPITimeout

Download timed out. Salesforce org may be busy. Try again in a moment.

# errorRateLimited

Rate limited. Retrying in %ds...
