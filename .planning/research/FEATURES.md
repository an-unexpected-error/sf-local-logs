# Feature Landscape: Salesforce Debug Log CLI Plugin

**Domain:** Salesforce CLI debugging and log management
**Researched:** 2026-05-29
**Confidence:** HIGH (official docs, existing plugin reference, ecosystem patterns)

## Executive Summary

Salesforce admins and engineers face a critical pain point: debug logs are identified only by timestamp and logged-in user context, making it impossible to find the right log in high-volume scenarios (1000s logs/minute). The native `sf apex` commands provide basic download/list functionality but lack user-friendly log discovery, trace flag management, and storage lifecycle management.

The competitive landscape consists of:
- **Native CLI:** `sf apex list log`, `sf apex get log` (basic, timestamp-only)
- **Third-party plugins:** sf-debug-log (trace flag creation, user-scoped retrieval, deletion)
- **Analysis tools:** Apex Log Analyzer (VS Code), Nebula Logger (in-app logging framework), Chrome extensions (browser-based viewing)

Table stakes for a log management plugin center on **bridging the discovery gap** (find logs by user name, not timestamp) and **storage lifecycle** (respect 1GB org limit). Differentiators emerge around **intelligent filtering** (by SObject/entry point) and **developer experience** (progress feedback, interactive selection).

## Table Stakes

Features users expect. Missing these = product feels incomplete for the use case.

| Feature | Why Expected | Complexity | Dependency | Notes |
|---------|--------------|-----------|-----------|-------|
| Search for users by name (not ID) | Logs are only associated with user context; users remember colleague names, not IDs. Native CLI doesn't support this. | Medium | — | Requires User SOQL query + selection UI. Core differentiator vs native `sf apex get log`. |
| Initiate debug session for selected user | Setting up trace flags manually is error-prone; users need to create TraceFlag records with correct DebugLevel, dates. | Medium | User search | Can use `sf data create record` on TraceFlag SObject or existing trace flag management. |
| Download logs as they are created | High-volume scenario: user initiates debug session, performs action, needs immediate log retrieval. | Low | Initiate session | Polling mechanism or streaming; respects Salesforce 1GB org limit notification. |
| Filter downloaded logs by keyword | Logs are often 10-100MB; users need to find relevant sections (SObject entry points, Platform Events). Native `sf apex get log` returns raw files. | Medium | Download | Grep-style or NDJSON parsing for structured log filtering. |
| Manage/purge logs to stay within 1GB limit | Org limits storage to 1GB total; automatic log purging isn't enforced. Storage pressure is the core motivation. | Low | — | Delete stale logs by age or size; warn when approaching limit. |
| Plugin installable via `sf plugin install` | Users must be able to install without manual setup. Standard SF CLI plugin architecture. | Low | — | Must publish to npm with correct plugin structure. |
| Clear status/progress communication | High-volume workflows need visibility: "Searching users...", "Creating trace flag...", "Downloading log (50MB/100MB)". | Low | All commands | CLI progress bars, spinners, clear error messages. |
| Handle high-volume scenarios without degradation | Core constraint: 1000s logs/minute. Must not timeout or crash under load. | High | All features | Pagination, streaming, batch operations, connection pooling. |

## Differentiators

Features that set product apart. Not expected, but valued by power users.

| Feature | Value Proposition | Complexity | Dependency | Notes |
|---------|-------------------|-----------|-----------|-------|
| Intelligent filtering by SObject/Platform Event entry points | Users say "show me logs where Account was created" instead of grepping raw text. Reduces analysis time significantly. | High | Download + Filter | Parse log structure; identify record operations; expose entry points as filterable UI. Requires understanding Salesforce log format. |
| Interactive user selection with preview | Show user info (profile, last login) before selecting. Reduce mistakes when managing large orgs. | Medium | User search | Enhance SOQL query with profile name, last login date. CLI tables with preview. |
| Bulk operations (delete multiple users' logs at once) | High-volume admins need to clean up logs from multiple users in one operation. | Low | Manage logs | Accept multiple users in one command; batch delete via SOQL. |
| Custom debug level configuration from CLI | Users currently must browse browser UI to set up debug levels (Apex, Validation, Workflow, etc.). CLI-first alternative. | Medium | Initiate session | Support `sf debuglevel create` or similar; allow user to specify category verbosity levels. |
| Log retention policies (auto-delete logs older than N days) | Users want hands-off lifecycle management. Set it once, logs auto-purge on schedule. | Medium | Manage logs | Background job or cron-style command; requires org polling or batch operations. |
| Export/archive logs to local storage | For compliance or analysis: export logs to CSV, JSON, or cloud storage before deletion. | Medium | Download | Format transformation; optional cloud integration (S3, GCS). |
| Streaming logs to stdout (tail-like experience) | Real-time log viewing as they are created, piped to grep/awk for advanced filtering. | Medium | Initiate session | WebSocket streaming or polling; compatible with POSIX pipes. |

## Anti-Features

Features to explicitly NOT build. These create maintenance burden or solve problems for adjacent use cases.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Real-time log streaming UI in CLI | Salesforce logs are generated after transaction execution; "live streaming" implies errors are happening in real-time, which is uncommon. Streaming adds significant complexity. | Provide `tail -f` style polling with clear latency expectations. Users can pipe to `grep` for filtering. |
| Multi-org log aggregation | Plugin scopes to single org context (PROJECT.md out-of-scope for v1). Aggregation adds connection management, data synchronization, and state complexity. | Defer to v2. For now, users run same commands against different orgs sequentially. |
| Report generation (HTML/PDF exports) | Report generation is a separate product concern. Debug logs are raw operational data; users want to filter and export, not visualize. | Provide raw log exports (JSON, CSV) and let analysis tools (Apex Log Analyzer, Nebula Logger) do visualization. |
| Debug level AI recommendations | "AI suggests debug levels based on your code" sounds nice but: (a) requires ML models, (b) debug levels are org-specific, (c) Standard debug levels exist for common cases. | Document debug level best practices; expose `sf debuglevel list` so users can inspect existing levels. |
| Browser-based UI for log management | SF CLI plugins are CLI-first. A browser UI contradicts the core value (stay in CLI, no context switching). | Keep CLI-first. Users needing UI can use native Salesforce Setup or Nebula Logger dashboard. |
| Multi-user simultaneous trace flags | Setting up trace flags for multiple users at once sounds efficient but: (a) trace flags have duration/expiration, (b) managing overlapping flags is complex, (c) adds state management burden. | Single-user trace flag per command. Users can run in parallel/script if needed. |
| Real-time metrics/alerting on logs | "Alert me when logs exceed 100MB/second" implies monitoring system. That's observability product, not log management. | Defer to Salesforce Shield Event Monitoring or Agentforce Observability Suite (2025-2026 GA). |
| Log analysis (cost analysis, performance recommendations) | Analysis implies understanding customer code intent. Too opinionated; conflicts with CLI-first simplicity. | Provide structured log output (NDJSON) for users to feed into their own analysis tools. |

## Feature Dependencies

```
Core workflow chain:
  1. Search for user by name → User selection
  2. User selection → Initiate debug session (create trace flag)
  3. Initiate session → Download logs (poll for new logs)
  4. Download logs → Filter by keyword (parse + grep)
  5. Filter results → Review findings
  6. Review → Manage logs (bulk delete stale logs)

Optional extensions:
  - Custom debug level config → Initiate session (pre-select debug level)
  - Interactive preview (profile/login) → Search for user (enhance SOQL)
  - Bulk operations → Manage logs (delete multiple users)
  - Streaming logs → Download logs (real-time variant)
  - Retention policies → Manage logs (auto-purge)
```

## MVP Recommendation

**Prioritize (Phase 1):**
1. ✓ Search for users by name (table stakes; core differentiator vs `sf apex get log`)
2. ✓ Initiate debug session (table stakes; enables debugging workflow)
3. ✓ Download logs (table stakes; retrieve generated logs)
4. ✓ Filter by keyword (table stakes; solves the "find relevant section" pain)
5. ✓ Manage/purge logs (table stakes; solves 1GB storage pressure)
6. ✓ Clear status/progress communication (table stakes; high-volume UX)

**Consider for Phase 1 or 1.5 (early differentiator):**
- Interactive user selection with preview (medium complexity; improves UX significantly)
- Custom debug level configuration from CLI (medium complexity; common pain point)

**Defer to Phase 2 (post-launch validation):**
- Intelligent SObject/entry point filtering (high complexity; powerful but niche use case)
- Bulk operations (low complexity but less common than single-user operations)
- Log archival/export (nice-to-have; users can pipe output to their own storage)
- Streaming logs (medium complexity; niche use case for real-time monitoring)
- Retention policies (requires background job infrastructure; premature optimization)

**Never build:**
- Real-time streaming UI, multi-org aggregation, report generation, AI recommendations, browser UI, multi-user simultaneous flags, metrics/alerting, log analysis

## Competitive Positioning

### vs. Native `sf apex` commands
- **Native:** Lists logs by timestamp, downloads by log ID or count, requires manual user ID lookup
- **Our plugin:** Discover by user name, create trace flags (not just download), intelligent filtering, storage lifecycle
- **Gap:** Native lacks discovery (timestamp-only identification) and trace flag management

### vs. sf-debug-log plugin (Raffo)
- **sf-debug-log:** Creates trace flags, lists debug levels, retrieves by user, deletes logs (existing competitor)
- **Our plugin:** Focus on user discovery (name search), intelligent filtering (SObject/entry point), clear progress feedback, storage management
- **Gap:** sf-debug-log solves trace flag creation but doesn't address the "find the right log" problem well

### vs. Browser-based tools (Nebula Logger, Chrome extensions, Apex Log Analyzer)
- **Browser tools:** Visual log analysis, flame charts, SOQL/DML breakdowns, formatted output
- **Our plugin:** CLI-first discovery and management, feed logs to browser tools for analysis
- **Gap:** We handle log discovery/management; browser tools handle visualization

## Sources

- [GitHub - sf-debug-log plugin](https://github.com/PreziosiRaffaele/sf-debug-log)
- [Salesforce Debug Logs Best Practices](https://www.salesforceben.com/an-admins-guide-to-debug-logs-in-salesforce/)
- [Debug Logs Analysis & Optimization - Trailhead](https://trailhead.salesforce.com/content/learn/modules/developer_console/developer_console_logs)
- [Salesforce CLI Command Reference - Apex Commands](https://developer.salesforce.com/docs/atlas.en-us.sfdx_cli_reference.meta/sfdx_cli_reference/cli_reference_apex_commands_unified.htm)
- [Download Recent Salesforce Debug Logs Using Salesforce CLI – SFDC Arjuna](https://sfdcarjuna.com/2025/10/18/download-recent-salesforce-debug-logs-using-salesforce-cli/)
- [Debugging Tips For Salesforce CLI - Medium](https://medium.com/@mohitkumarsrivastav/debugging-tips-for-salesforce-cli-305ca89989b5)
- [Salesforce Log Inspector - Chrome Web Store](https://chromewebstore.google.com/detail/salesforce-log-inspector/jebmhhcaiafpcjneboknfkmijegiihoe)
- [Apex Log Analyzer - Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=financialforce.lana)
- [Storage Limits - Salesforce Help](https://help.salesforce.com/s/articleView?id=platform.code_debug_log.htm&language=en_US&type=5)
- [Debug Logs - Salesforce Help](https://help.salesforce.com/s/articleView?id=000392579&language=en_US&type=1)
- [Turning on trace debugging with the Salesforce CLI – lekkimworld.com](https://lekkimworld.com/2021/02/16/turning-on-trace-debugging-with-the-salesforce-cli/)
- [Salesforce Observability Architecture 2026 - Vantage Point](https://vantagepoint.io/blog/sf/salesforce-observability-architecting-resilience-ai-scale-2026)
