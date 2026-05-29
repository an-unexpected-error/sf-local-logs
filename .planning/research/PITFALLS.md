# Domain Pitfalls: Salesforce CLI Debug Log Plugin

**Domain:** Salesforce CLI plugin for debug log management and filtering  
**Researched:** 2026-05-29  
**Focus:** Common mistakes in Salesforce CLI plugin development, debug log handling, and high-volume data scenarios

---

## Critical Pitfalls

These mistakes cause performance degradation, data loss, or complete feature failure. Address early in development.

### Pitfall 1: Loading Entire Debug Logs into Memory

**What goes wrong:**  
Plugin reads entire debug log files (10-100MB each) into memory at once for filtering, parsing, or analysis. In high-volume scenarios (1000+ logs/minute), this causes out-of-memory errors, process crashes, and failures to process large logs.

**Why it happens:**  
Easy to write: `fs.readFileSync()` → load into string → split by lines → filter. Works for small files, fails catastrophically at scale.

**Consequences:**
- Plugin crashes when processing logs > available heap memory
- In high-volume scenarios, Node.js garbage collection pauses become severe
- Users lose context of partially-downloaded logs
- Cannot filter/analyze logs larger than available system RAM

**Prevention:**
- Use Node.js streams (`fs.createReadStream()`) for all file I/O
- Implement backpressure handling: pause source stream when destination buffer fills
- Set `highWaterMark` on streams (16KB-64KB chunks) appropriate for log volume
- Use line-reading libraries that stream (e.g., `readline`, `split2`) instead of splitting loaded strings
- Test with logs at 50MB, 100MB, 500MB to ensure no memory spike

**Detection:**
- Watch Node.js heap usage during log download/filter operations
- Monitor for "JavaScript heap out of memory" errors
- Profile with `node --inspect` or clinic.js to see memory timeline

**Phase Impact:** Phase 1 (Download) and Phase 3 (Filter) must implement streaming from day one. Non-negotiable.

---

### Pitfall 2: Unbounded Concurrent API Requests

**What goes wrong:**  
Plugin initiates unlimited parallel API calls to fetch debug logs, user data, or org metadata. Salesforce rate-limits aggressive clients; plugin exhausts daily API quotas quickly and hits rate-limiting throttles.

**Why it happens:**  
In high-volume scenarios, tempting to parallelize all requests: fetch all users' logs in parallel, download all logs at once, etc. Without limits, dozens of concurrent requests compound into quota exhaustion.

**Consequences:**
- API rate-limiting (HTTP 429 Too Many Requests) blocks further operations
- Daily API quotas (base 100K/day + 1K per user) exhausted within hours
- org-wide impact: other integrations/tools blocked by CLI plugin's quota usage
- No graceful degradation; plugin stops completely when limit hit

**Prevention:**
- Implement concurrency queue with max 5-10 parallel API requests (tune based on org size)
- Use libraries like `p-queue` to manage concurrency limits
- Add exponential backoff + retry logic for 429/503 responses
- Monitor daily API usage via `/services/data/v60.0/limits` endpoint before each batch
- Batch user queries: fetch 2000 users per SOQL query (OFFSET/LIMIT) rather than individual lookups
- Log API call counts per operation; fail gracefully with clear message when quota low

**Detection:**
- Org API limit dashboard shows spike in calls from plugin
- HTTP 429 responses in plugin logs
- Plugin commands slow down or hang indefinitely

**Phase Impact:** Phase 1 (User Search) requires careful pagination. Phase 2 (Initiate Debug) must batch trace flag operations. Phase 4 (Download) critical—most API-intensive.

---

### Pitfall 3: Ignoring Salesforce Debug Log Storage Limits

**What goes wrong:**  
Plugin downloads logs without checking org's 1GB debug log storage quota. Downloaded logs hit limit; subsequent downloads fail silently. Old logs are auto-purged by Salesforce (7-day retention), but plugin doesn't anticipate this and references stale log IDs.

**Why it happens:**  
Easy to assume logs exist forever. Salesforce's auto-purge (7-day retention, plus 20MB per log cap) is transparent to the user. Plugin never queries org's current debug log storage usage before operations.

**Consequences:**
- Downloaded log IDs become invalid after 7 days; subsequent analysis fails
- Org storage fills to 1GB; Salesforce blocks new trace flag creation; plugin download command fails with cryptic API error
- Plugin silently loses data: downloads logs but org purges them before user can analyze
- High-volume scenarios: 1000s logs/minute fill 1GB quota in minutes; plugin must aggressively delete or manage retention

**Prevention:**
- Before any download operation, query org's current debug log storage via `/services/data/v60.0/limits` → DebugLog storage metrics
- Implement retention policy: proactively delete oldest logs when org approaches 80% quota
- Show user: "Org at 850MB/1GB storage. Downloading this log (50MB) will trigger auto-purge of logs older than 7 days. Continue? [Y/n]"
- Handle 7-day expiration gracefully: if user references log ID > 7 days old, show clear error "Log has been auto-purged by Salesforce"
- For Phase 4 (purge), implement batch delete with confirmation; show which logs will be deleted and recovered space

**Detection:**
- Trace flag operations fail with "storage limit exceeded" errors
- User references log ID that no longer exists in org
- Org storage dashboard shows logs disappearing without user action

**Phase Impact:** Phase 2 (Initiate Debug) must monitor storage limits. Phase 4 (Purge) critical—this is core value proposition. Test with small orgs to simulate quota exhaustion.

---

### Pitfall 4: No Pagination / Incomplete Log Lists

**What goes wrong:**  
Plugin queries debug logs via Tooling API but doesn't handle pagination correctly. SOQL returns only first 2000 records; plugin assumes this is complete list. In orgs with high log volume, most logs are invisible to user.

**Why it happens:**  
Tooling API SOQL pagination uses `queryMore` pattern or cursor-based offsets. Easy to forget to loop through pages or assume single request is sufficient.

**Consequences:**
- User searches for debug logs; plugin shows only first 2000
- Missing logs from the list, especially older ones
- High-volume scenarios: 1000s logs/minute means pagination critical; skipping even one page loses data
- User can't find a specific log because it's on page 2, 3, or 4

**Prevention:**
- Always implement full pagination for ApexLog queries:
  - Use SOQL with `ORDER BY CreatedDate DESC LIMIT 2000 OFFSET 0` for first page
  - Check if more rows exist; if so, fetch next page with OFFSET 2000, 4000, etc.
  - OR use Tooling API `queryMore` with query locator (preferred; less API overhead)
- Cursor remains valid for 2 days; safe to paginate large result sets
- Limit total logs shown to user: fetch all, sort, show top 100 (most recent) by default; offer `--limit N` flag
- Test with org containing 10K+ debug logs; verify all are surfaced

**Detection:**
- User says "I know we created that log but it's not in the list"
- Org with many users shows incomplete log count compared to UI
- Debug log timestamps show gaps (e.g., latest is 5 minutes old but org created 1000 logs in last 2 minutes)

**Phase Impact:** Phase 1 (User Search) uses ApexLog queries; pagination required from start. Phase 3 (Filter) works on whatever logs are retrieved; bad pagination upstream = incomplete data downstream.

---

### Pitfall 5: Blocking / Synchronous Operations in CLI

**What goes wrong:**  
Plugin performs long-running operations (bulk log downloads, filtering large files, API queries) synchronously on the main CLI thread. User sees no progress; plugin appears frozen; CLI times out or user force-kills process.

**Why it happens:**  
Sequential code is simpler to write: fetch user, then fetch logs, then download each. No progress feedback, no timeout handling, no user control.

**Consequences:**
- CLI command hangs for minutes; user impatient, hits Ctrl+C
- No indication of progress: user doesn't know if plugin is working or stuck
- Timeout limits (typical 30-60s in CI/CD) trigger; plugin exits before completing operation
- In high-volume scenarios, downloading 100 logs sequentially can take 10+ minutes; unacceptable UX

**Prevention:**
- All long-running operations must show progress:
  - Use `ux.styledHeader()` to indicate each major step
  - Implement progress bar for bulk downloads: `progress` or `cli-progress` library
  - Show ETA and current file count: "Downloaded 45/1000 logs (15 mins remaining)"
- Implement concurrent operations where safe (with backpressure): parallel downloads with queue limit
- Add `--timeout` flag to commands; default to generous value (e.g., 5 minutes for download)
- Provide `--json` output showing incremental progress, not just final result
- Offer `--watch` or stream mode for real-time log tailing (Phase 2+ feature)

**Detection:**
- Plugin output goes silent for > 10 seconds
- CLI timeout errors in CI/CD pipelines
- User complains "I thought the plugin crashed"

**Phase Impact:** Phase 1 requires fast user search (< 5s). Phase 2 acceptable slower (trace flag creation). Phase 4 (Download/Filter) critical—most user-facing; show progress.

---

### Pitfall 6: Poor Error Messages and Unhandled Exceptions

**What goes wrong:**  
Plugin encounters API error (429, 401, metadata timeout) and displays raw error or no error at all. User has no idea what went wrong or how to fix it.

**Why it happens:**  
Error handling is tedious; easy to log raw exception or swallow it silently.

**Consequences:**
- User sees "Error: ECONNREFUSED" instead of "Could not reach Salesforce. Check network or org auth."
- Plugin exits without explaining what operation failed or how to retry
- API errors (quota, auth, network) are indistinguishable from plugin bugs
- In high-volume scenarios, unclear errors make debugging impossible

**Prevention:**
- Wrap all API calls and file operations in try/catch with specific error handling:
  - Catch 401 → "Session expired. Re-authenticate: sf auth org login"
  - Catch 429 → "Rate limited. Org API quota exceeded. Wait or increase concurrency limit."
  - Catch 503 → "Salesforce API temporarily unavailable. Retry in 60 seconds."
  - Catch ENOENT → "Log file not found. Has it been auto-purged by Salesforce?"
- Use SfCommand error utilities: `this.error()` with exit code and structured JSON in `--json` mode
- Always include remediation: "To fix: [action]"
- Log full error + stack trace to `~/.sf/sf.log` even when user sees simplified message
- Test with intentional failures: expired session, throttling, disk full, network down

**Detection:**
- User posts error message in community forum
- Plugin usage drops because errors are confusing
- Support tickets reference unclear error output

**Phase Impact:** All phases. Error handling is foundational. Each phase adds new error scenarios (auth, storage, API limits, disk space).

---

## Moderate Pitfalls

These mistakes degrade experience or cause occasional failures. Catch during development.

### Pitfall 7: Uncontrolled File System Growth

**What goes wrong:**  
Plugin downloads debug logs to local disk without managing storage. Users accumulate 10GB+ of local logs; plugin continues to download more. Disk fills up; plugin crashes mid-download with cryptic "No space left on device" error.

**Why it happens:**  
Easy to download and forget. No tracking of local log cache size or cleanup mechanism.

**Consequences:**
- Local disk fills; plugin crashes
- User's laptop or CI/CD agent storage exhausted
- Plugin doesn't warn before downloading large log
- No way to view or delete downloaded logs without manual file system exploration

**Prevention:**
- Track total local log cache size; show to user before download
- Implement `--cache-dir` flag; default to `~/.sf/debug-logs` (cross-platform)
- Before download: "Local cache is 2.5GB. Download 500MB log? [Y/n]"
- Implement `sf log-cache cleanup --max-age 7d --max-size 5GB` command to manage local storage
- Show available disk space before download; warn if < 1GB free
- Use `disk-usage` or similar library to detect low-disk scenarios
- All downloaded logs go to cache dir, not random temp locations

**Detection:**
- User reports "plugin crashed when downloading"
- Local cache dir is several GB
- Disk space warnings in `~/.sf/sf.log`

**Phase Impact:** Phase 4 (Download) introduces local log storage. Implement cleanup from start.

---

### Pitfall 8: Hard-Coded Org-Specific Assumptions

**What goes wrong:**  
Plugin assumes org structure: "all users are in Department__c field", "debug logs are always < 50MB", "trace flags set for admins are permanent". Org configuration varies; plugin breaks in unfamiliar orgs.

**Why it happens:**  
Built against one org's data; assumptions feel universal.

**Consequences:**
- Plugin fails when custom field doesn't exist in another org
- Filtering logic doesn't work for different log formats
- Plugin assumes metadata API timeout is always 60s; breaks in slow orgs

**Prevention:**
- Never assume custom fields exist; make filtering optional: `sf log filter --by keyword [--custom-field FieldName]`
- Query org's ApexLog object properties first; adjust parsing based on what's available
- Handle variable metadata API response times: parameterize timeouts, default generous (120s), allow override
- Test against at least 2 different org configs (if possible) during development

**Detection:**
- Works in sandbox, fails in different sandbox
- User reports "command fails for our org specifically"

**Phase Impact:** Phase 3 (Filter) most at risk. Make filtering flexible, not prescriptive.

---

### Pitfall 9: Inadequate Testing for High-Volume Scenarios

**What goes wrong:**  
Plugin is tested with 10 debug logs, 50 users, small org. Deployed to high-volume org with 10K users, 1000 logs/minute. Performance collapses; plugin is too slow or runs out of memory. User-facing bugs only surface at scale.

**Why it happens:**  
High-volume scenarios are hard to simulate during development. Easy to test happy path with small data.

**Consequences:**
- Plugin works fine in dev/test; unusable in production
- Performance degradation is non-linear; small scaling issues compound
- Users blame plugin; trust erodes

**Prevention:**
- Write load tests before Phase 1 complete:
  - Simulate 1000+ debug logs
  - Mock 5000+ users
  - Measure memory usage, API call count, execution time at each scale
  - Establish performance baselines: "Download 1000 logs in < 2 minutes"
- Use load testing tools: `autocannon`, `loadtest`, custom scripts
- Measure memory baseline and peak during operations
- Test pagination with realistic data volumes
- Benchmark file streaming performance with 100MB+ files
- Profile with clinic.js or Node.js inspector under load

**Detection:**
- Command executes instantly in dev, takes minutes in production
- Memory usage spikes unexpectedly
- User reports timeouts in high-volume orgs

**Phase Impact:** Before Phase 1 complete, establish performance testing framework. Benchmark each phase.

---

### Pitfall 10: Lost Context When Debug Sessions Expire

**What goes wrong:**  
Plugin initiates debug trace flag for user, which expires after 24 hours (Salesforce limit). User comes back next day expecting logs; trace flag is gone, no new logs captured, user is confused about whether trace is still active.

**Why it happens:**  
Plugin doesn't track trace flag lifecycle or warn user about expiration.

**Consequences:**
- User initiates debug, forgets about it, comes back next day confused
- No logs captured for operations that happened after trace expired
- User thinks plugin broke; actually, Salesforce auto-expired the flag

**Prevention:**
- Track initiated trace flags locally: store flag ID, user, creation time, expiration time
- When listing active trace flags, show: "Trace for user X expires in 3 hours"
- Implement `sf log status --user User1` to show current trace status and time remaining
- Warn user during initiate: "Trace flag will auto-expire in 24 hours. You must monitor logs before expiration."
- Implement optional `--auto-renew 8h` to automatically renew flag if it will expire soon (Phase 2+ feature)
- Store metadata in org-scoped cache (not local), so trace state persists across CLI invocations

**Detection:**
- User says "I initiated debug yesterday but no logs appeared"
- User tries to download logs after flag expired; gets unexpected empty result

**Phase Impact:** Phase 2 (Initiate Debug) introduces this. Document 24h lifetime clearly. Phase 2+ could auto-renew.

---

## Minor Pitfalls

These are quality-of-life issues. Address during polish.

### Pitfall 11: Inconsistent Flag Naming and Output Format

**What goes wrong:**  
Plugin uses unclear flag names (`-u` for user, but also used for org), inconsistent output format between commands (`--json` on some, not others), unclear examples in help text.

**Why it happens:**  
Edge cases; easy to miss consistency across commands.

**Consequences:**
- Users confused by inconsistent UX
- Scripting breaks because output format varies
- Help text examples don't work

**Prevention:**
- Follow official [Salesforce CLI Design Guidelines](https://developer.salesforce.com/docs/platform/salesforce-cli-plugin/guide/design-guidelines.html)
- All commands must support `--json` (outputs valid JSON; required for bundled plugins)
- Use consistent flag naming: `--user` (not `-u`), `--org` (not `-o`), `--keyword` (not `-k`)
- Test help text examples: run each example in the help manually
- Use `sf-symbols` for consistent terminal styling (headers, success, warnings)

**Detection:**
- User confused by flag names
- JSON output invalid
- Help examples fail

**Phase Impact:** Integrate style checks into development; design all commands in Phase 0 planning.

---

### Pitfall 12: Missing Progress Feedback in Batch Operations

**What goes wrong:**  
Plugin downloads 1000 logs but shows no feedback until complete. User thinks it's stuck. Especially bad for long operations (10+ minutes).

**Why it happens:**  
Adding progress bars requires logging structured updates; easy to skip.

**Consequences:**
- User impatience; force-kill process before completion
- Incomplete downloads
- Poor perceived performance even if operation is fast

**Prevention:**
- All batch operations must include progress bar or status updates every 5-10 seconds
- Use `cli-progress` for visual progress bar; show count and ETA
- Emit JSON progress events in `--json` mode: `{type: 'progress', completed: 45, total: 1000, eta: '2m'}`
- Example: "Downloaded 45/1000 logs (4.5%) | ETA 2m 15s | Speed: 3 logs/sec"

**Detection:**
- User complains command appears to hang
- Long operations have poor UX

**Phase Impact:** Phase 4 (Download) critical. Add to Phase 2 if trace initiation is slow.

---

### Pitfall 13: Ignoring Salesforce Authentication and Org Context

**What goes wrong:**  
Plugin assumes authenticated org context (`sf org login`) exists. User runs command without auth; gets confusing error. Plugin doesn't respect `--org` flag or `SFDX_DEFAULT_ORG` env var; always uses hardcoded org.

**Why it happens:**  
Easy to assume user is authenticated; testing usually done in pre-auth state.

**Consequences:**
- User runs plugin without logging in; cryptic "no credentials" error
- `--org` flag ignored; plugin runs against wrong org
- Scripting breaks because org context not respected

**Prevention:**
- All commands require authenticated org; use `SfCommand` base class which enforces this
- Support `--org OrgAlias` flag on all commands; test with different orgs
- Respect `SFDX_DEFAULT_ORG` env var for scripting
- Error message on missing auth: "No org context. Run `sf auth org login` first."
- Document org requirements in README

**Detection:**
- User reports "command failed when I ran it at home"
- Org context is wrong in CI/CD

**Phase Impact:** Phase 0 (setup). Ensure all commands respect org context from start.

---

## Phase-Specific Warnings

| Phase | Topic | Likely Pitfall | Mitigation |
|-------|-------|---------------|-----------|
| Phase 1: User Search | Pagination | Missing results in high-volume orgs | Implement SOQL pagination (OFFSET/LIMIT) or queryMore from start; test with 10K+ users |
| Phase 1: User Search | API Efficiency | N+1 queries (fetch user, then fetch their logs separately) | Use SOQL joins: `SELECT Id, Name FROM User WHERE Id IN (SELECT UserId FROM ApexLog)` |
| Phase 2: Initiate Debug | Rate Limiting | Bulk trace flag creation hits API quota | Batch flag operations; queue with concurrency limit; monitor API usage |
| Phase 2: Initiate Debug | Trace Expiration | User forgets trace expires in 24h | Show expiration time; store flag metadata; warn user |
| Phase 3: Filter | Memory Usage | Filtering large logs in memory causes OOM | Use streams; process line-by-line; avoid loading entire file |
| Phase 3: Filter | Regex Complexity | Complex filters cause regex engine to hang | Validate user regex; timeout regex matching after 5s; suggest simpler alternatives |
| Phase 4: Download | Disk Space | Downloads fill local disk | Check available space; warn before large downloads; implement cache cleanup |
| Phase 4: Download | Network Stability | Long downloads interrupted by network flake | Implement retry logic with exponential backoff; support resume from offset |
| Phase 4: Purge | Data Loss | Batch delete without confirmation causes accidental purge | Always confirm deletion; show file list; offer dry-run mode |
| Phase 4: Purge | Storage Quota | Purge doesn't free quota immediately; user blocked | Explain Salesforce's storage quota mechanics; show recovery timeline |

---

## Sources

- [Salesforce CLI Plugin Developer Guide - Design Principles](https://developer.salesforce.com/docs/platform/salesforce-cli-plugin/guide/design-guidelines.html)
- [Salesforce CLI Plugin Developer Guide - Common Coding Patterns](https://developer.salesforce.com/docs/platform/salesforce-cli-plugin/guide/common-coding-patterns.html)
- [Streams and Buffers in Node.js — Handling Large Files](https://medium.com/@ankitrathod4596/streams-and-buffers-in-node-js-efficiently-handling-large-files-73bb7b31ee3a)
- [Backpressuring in Streams | Node.js Documentation](https://nodejs.org/learn/modules/backpressuring-in-streams)
- [Salesforce Store More and Larger Debug Logs](https://help.salesforce.com/s/articleView?language=en_US&id=release-notes.rn_debugging_debug_logs.htm&release=220&type=5)
- [API Request Limits and Allocations | Salesforce Developer Limits](https://developer.salesforce.com/docs/atlas.en-us.salesforce_app_limits_cheatsheet.meta/salesforce_app_limits_cheatsheet/salesforce_app_limits_platform_api.htm)
- [ApexLog | Tooling API | Salesforce Developers](https://developer.salesforce.com/docs/atlas.en-us.api_tooling.meta/api_tooling/tooling_api_objects_apexlog.htm)
- [Processing Large Amounts of Data with APIs | Salesforce Developers Blog](https://developer.salesforce.com/blogs/2022/12/processing-large-amounts-of-data-with-apis-part-1-of-2)
- [Tooling API - Salesforce Implementation Guide](https://blog.bessereau.eu/assets/pdfs/api_tooling.pdf)
- [sf apex get test - Heap Out of Memory Issue | GitHub #5589](https://github.com/forcedotcom/salesforcedx-vscode/issues/5589)
- [Salesforce Scanner CLI - Heap Out of Memory | GitHub #564](https://github.com/forcedotcom/sfdx-scanner/issues/564)
- [Debug Logs Viewer - Salesforce Inspector Reloaded](https://tprouvot.github.io/Salesforce-Inspector-reloaded/logs-viewer/)
- [Excessive Parallel Network Connections | npm/cli GitHub #7272](https://github.com/npm/cli/issues/7272)
- [Concurrency in Node.js - TSH.io](https://tsh.io/blog/simple-guide-concurrency-node-js)
- [Salesforce CLI Error Handling and Customization](https://developer.salesforce.com/docs/atlas.en-us.sfdx_cli_plugins.meta/sfdx_cli_plugins/cli_plugins_customize_errors.htm)
- [Using Salesforce CLI Output and Scripting | Developers Blog](https://developer.salesforce.com/blogs/2020/02/using-salesforce-cli-output-and-scripting)
- [Log Messages and Log Levels | Salesforce CLI Setup](https://developer.salesforce.com/docs/atlas.en-us.sfdx_setup.meta/sfdx_setup/sfdx_dev_cli_log_messages.htm)

---

**Last Updated:** 2026-05-29  
**Confidence Level:** HIGH (verified against official Salesforce CLI Plugin Developer Guide, Tooling API docs, and community issues)
