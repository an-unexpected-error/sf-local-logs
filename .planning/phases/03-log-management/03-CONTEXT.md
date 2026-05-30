# Phase 3 Context: Log Management

**Date:** 2026-05-30  
**Phase:** 3 (Log Management)  
**Status:** Context captured, ready for research & planning

---

## Domain

Enable Salesforce admins to download debug logs as they are created and manage storage by purging old/unnecessary logs while respecting Salesforce's 1GB organization limit. This phase integrates log download directly into the trace workflow from Phase 2, giving admins a complete debugging experience: search → trace → monitor → download → manage storage.

---

## Requirements (Locked from ROADMAP.md)

**DOWNLOAD-01:** User can download debug logs as they are created  
**DOWNLOAD-02:** Plugin displays progress (count, size, ETA) while downloading  
**DOWNLOAD-03:** Plugin respects organization's 1GB debug log storage limit  
**DOWNLOAD-04:** Plugin warns user if download would exceed remaining storage quota  
**DOWNLOAD-05:** Plugin uses streaming I/O to handle 10-100MB log files without memory issues  
**PURGE-01:** User can delete debug log files to free storage quota  
**PURGE-02:** User receives confirmation before deleting logs  
**PURGE-03:** Plugin displays storage freed after deletion  
**UX-01:** CLI displays status messages clearly explaining what's happening  
**UX-02:** Error messages provide actionable remediation guidance  
**UX-03:** Plugin handles rate limiting gracefully with exponential backoff  
**UX-04:** All commands support `--json` output for programmatic use  
**UX-05:** Plugin respects `--target-org` flag for multi-org environments

See `/planning/REQUIREMENTS.md` for full requirement text.

---

## Implementation Decisions

### Download Scope & Architecture

**D-01: Download is integrated into the trace workflow, not a standalone command**

- Download does NOT have a separate `sf log download` command
- Download is triggered automatically after `sf log trace` creates the trace flag
- Logs are scoped to: **specific user + timeframe of their trace** (typically 24 hours from trace creation)
- Downloads all logs generated for that user during the active trace window

**Why:** High-volume debug scenario requires tight integration. Users want to immediately access logs from the user they just traced, not hunt for them later. Reduces context-switching and UI complexity.

### Download Trigger & Timing

**D-02: Download starts immediately after trace is created**

- After user initiates trace in `sf log trace` and the trace flag is created, download begins automatically
- Does not wait for watch mode to complete; both happen in parallel
- User sees both trace expiry monitoring (watch mode) and download progress simultaneously

**Why:** Immediate feedback and parallel processing speeds up the workflow. User doesn't have to wait for watch mode to expire to see if logs were captured.

### Download Progress Display

**D-03: Watch mode and download progress display in parallel**

- Show trace flag expiry countdown (from Phase 2) and download progress at the same time (split view or stacked display)
- Download progress displays: **time elapsed, estimated time remaining (ETA), and file count**
- Note: Total log count is **unknown** because logs are being generated concurrently; ETA is estimated based on current download rate

**Why:** User sees both the monitoring window and log retrieval in real-time. Unknown total acknowledges Salesforce's concurrent log generation during high-volume scenarios. Count-based feedback is more meaningful than percent when total is unknown.

### Storage Quota Checking

**D-04: Check remaining storage quota during download progress**

- Monitor org's remaining 1GB storage continuously during download
- Do NOT check quota upfront (expensive query); check periodically as download progresses
- If quota would be exceeded, **stop download immediately** (conservative)

**Why:** Storage can change during download (other processes may consume space). Conservative approach protects user from partial downloads and data loss.

### Over-Quota Error Messaging

**D-05: Show remaining quota and suggest purge command**

- Error message format: `"Storage quota exceeded. Current: 950MB/1GB. Run: sf log purge to delete old logs."`
- Include current usage and remaining capacity for transparency
- Suggest next action (purge) explicitly

**Why:** Actionable guidance per UX-02 requirement. User immediately knows how much space is used and what to do next.

### Purge Command Behavior

**D-06: `sf log purge` deletes all debug logs in the org by default**

- Running `sf log purge` targets **all logs in the entire org** (not scoped to a single user)
- This is appropriate for the high-volume, storage-critical scenario where space must be freed quickly

**Why:** In high-volume situations (1000s logs/minute), users need fast storage cleanup. Single-user purging would be too granular. Org-wide purge is the quickest path to free space.

**D-07: Purge requires confirmation showing impact**

- Before deletion, display: `"Deleting all X logs would free ~500MB. Proceed? (yes/no)"`
- Show estimated storage freed so user understands the impact
- Confirmation prevents accidental data loss

**Why:** Informed consent. User sees what will be deleted and how much space it frees. UX-02 requires clear guidance; this gives it.

### Local Log Storage

**D-08: Downloaded logs stored with user + timestamp organization**

- Directory structure: `~/.local/share/sf/plugin-logs/{username}/{YYYY-MM-DD-HH-MM}/`
  - **macOS:** `~/.local/share/sf/plugin-logs/{username}/{timestamp}/`
  - **Windows:** `%APPDATA%\sf\plugin-logs\{username}\{timestamp}\`
  - **Linux:** `~/.local/share/sf/plugin-logs/{username}/{timestamp}/`
- Each trace session creates a timestamped folder under the user's directory
- Uses oclif XDG Base Directory standard (same convention as other SF CLI plugins)

**Why:** Aligns with workflow (user-centric debugging) AND follows oclif ecosystem conventions. Timestamp helps locate logs from a specific debugging session. Uses cross-platform standard paths. Verified via GitHub discussion on Salesforce CLI conventions.

**RESOLVED (Research finding):** Salesforce CLI plugins follow oclif XDG Base Directory standard. This location is preferred over `~/sf-logs/` for consistency with the plugin ecosystem.

---

## Relationship to Prior Phases

### Integration with Phase 2 (Debug Sessions)

- Phase 2 creates trace flags and monitors them
- Phase 3 extends Phase 2's workflow by automatically downloading logs for the traced user
- User workflow: `sf log trace` → (watch mode + download in parallel) → logs available locally
- Phase 3 does NOT require the user to specify which user to download for (it's locked to the trace target)

### Reuse of Phase 1 & 2 Patterns

- **Error handling:** Follow Phase 1's pattern of actionable error messages (not raw API errors)
- **JSON output:** All commands should support `--json` flag for programmatic use (Phase 1, 2 pattern)
- **Org connection:** Use Phase 1/2's `flags['target-org'].getConnection()` pattern for org access
- **Streaming I/O:** DOWNLOAD-05 requires streaming to handle 10-100MB files; jsforce supports this pattern

---

## Technology Stack (Locked from Phase 0)

| Technology | Version | Purpose |
|-----------|---------|---------|
| Node.js | 18.0.0+ | Runtime |
| TypeScript | 5.5.4+ | Language |
| oclif | ^4.23.7 | CLI framework |
| @salesforce/sf-plugins-core | ^12 | Plugin base classes |
| @salesforce/core | ^8.31.0 | Org connection and auth |
| jsforce | (via @salesforce/core) | Salesforce Tooling API (TraceFlag, ApexLog queries) |

**New libraries likely needed:**
- **fs/fs.promises** (Node.js built-in) — Streaming I/O for log file writes
- **node:path, node:os** — Path handling and home directory detection
- **cli-progress** (already used in Phase 2 for watch mode) — Progress bar for download

---

## Canonical References

Downstream agents (researcher, planner) must consult these docs:

### Requirements & Phase Goals
- **ROADMAP.md** — Phase 3 goal, success criteria, and dependency on Phase 2
- **REQUIREMENTS.md** — DOWNLOAD-01–05, PURGE-01–03, UX-01–05 requirement definitions

### Phase Context & Integration
- **Phase 2 CONTEXT.md** (`.planning/phases/02-debug-sessions/02-CONTEXT.md`) — Trace flag creation, watch mode patterns, integration points
- **Phase 1 CONTEXT.md** (`.planning/phases/01-user-search/01-CONTEXT.md`) — Search patterns and error handling style

### Technology & Patterns
- **CLAUDE.md** — Tech stack rationale, Salesforce API patterns, jsforce usage examples
- **JSforce Documentation** — ApexLog queries (logs are ApexLog records in Tooling API)
- **Salesforce Tooling API — ApexLog object** — Log retrieval, fields (Id, Request, LogUser, StartTime, Duration, etc.)
- **Node.js fs/streams documentation** — Streaming file I/O for large files (DOWNLOAD-05 requirement)

### SF CLI Plugin Best Practices (Critical for D-08)
- **Salesforce CLI plugin storage conventions** — Researcher must determine where plugins store persistent data
- **@salesforce/core file/directory handling patterns** — How do other plugins manage local file storage?

---

## Code Context & Reusable Assets

### From Phase 2
- **Trace command scaffold** (`src/commands/log/trace.ts`) — Will be extended to include automatic download after trace creation
- **TraceHelper utilities** — Can be extended with download helper utilities
- **Messages file** (`messages/log/trace.md`) — Add download-specific messages

### New in Phase 3
- **Download utilities** — Query ApexLog records for traced user, stream downloads, handle 10-100MB files efficiently
- **Purge utilities** — Query all ApexLog records, delete with confirmation, calculate freed space
- **Local storage manager** — Create session directories, track downloads, organize by user/timestamp
- **Storage quota checker** — Query org's LogFileStorageUsed field, calculate remaining 1GB capacity

### Test Infrastructure
- **Unit tests** for storage quota calculation, path construction, file operations
- **NUT (Non-Unit Tests)** for end-to-end download/purge workflow with test org logs

---

## Deferred Ideas

- **Selective purge / filtering** (v2) — Purge by age, size, keyword match. v1 uses all-or-nothing.
- **Bulk download for multiple users** (v2) — Download logs for several users at once. Out of scope for v1.
- **Log archival to S3** (v2) — Backup logs to cloud storage. v1 keeps only local copies.
- **Concurrent download optimization** (v2) — Parallel streaming of multiple log files. v1 sequential.
- **Custom storage location** (v2) — Allow users to specify where logs are stored. v1 uses `~/sf-logs/` convention.

---

## Key Unknowns (for Researcher)

1. **File storage location for SF CLI plugins** — Where should Phase 3 store downloaded logs? Standard practice?
2. **ApexLog query patterns for active user** — How to query logs generated for a specific user during a time window?
3. **Storage quota API** — How to retrieve org's LogFileStorageUsed? Is there a standard API or must we calculate from log metadata?
4. **Streaming download performance** — Benchmarks for 10-100MB files in Node.js streaming context?

---

## Notes for Downstream Agents

### Researcher
1. Verify ApexLog Tooling API query patterns for retrieving logs by user and timestamp
2. **Critical:** Determine SF CLI plugin best practices for file storage location (D-08 blocker)
3. Query organization's storage quota API (LogFileStorageUsed field, or calculated from ApexLogs)
4. Test streaming I/O patterns with large files (10-100MB)
5. Confirm jsforce connection supports concurrent downloads without memory issues

### Planner
- Locked decisions:
  - Download is integrated into trace (no standalone command)
  - Auto-download after trace creation
  - Parallel watch mode + download display
  - Storage quota monitoring during download (stop if exceeded)
  - Purge deletes all org logs with confirmation showing freed space
  - Local storage: `~/sf-logs/{user}/{YYYY-MM-DD-HH-MM}/` (pending FS location verification)
  - Progress display: time elapsed, ETA (estimated), file count
- Dependencies:
  - Must extend Phase 2's trace command (not create separate download command)
  - Must reuse Phase 1's error message patterns and Phase 2's progress bar patterns
  - Requires researcher's findings on file storage location and ApexLog query patterns

### Execution Notes
- After Phase 3 completes:
  - `sf log trace` should show both trace expiry countdown and download progress in parallel
  - Logs should appear in `~/sf-logs/{user}/{YYYY-MM-DD-HH-MM}/` after download completes
  - `sf log purge` should delete all org logs with confirmation of freed space
  - Over-quota download should fail gracefully with suggestion to purge
  - All output should support `--json` flag for programmatic use

---

## Session Notes

**Discussion flow:**
- Discussed download scope: decided download is integrated into trace workflow, scoped to specific user + timeframe
- Discussed download timing: automatic after trace creation, in parallel with watch mode
- Discussed quota checking: during download progress, stop immediately if exceeded
- Discussed purge mechanism: all org logs by default, with confirmation showing freed space
- Discussed local storage: user + timestamp organization, pending FS location verification
- Discussed progress display: time elapsed, ETA, file count (total unknown due to concurrent generation)

**User priorities:** Integrated workflow (trace → monitor → download seamlessly), aggressive storage cleanup for high-volume scenarios, clear feedback on progress and quota status.

**Critical open item:** File storage location for downloads (~/sf-logs/ vs ~/.sf/ or other). Researcher must determine before planning.

---

*Context captured by discuss-phase on 2026-05-30*
