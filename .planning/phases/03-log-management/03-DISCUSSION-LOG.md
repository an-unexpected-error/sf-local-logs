# Phase 3 Discussion Log

**Date:** 2026-05-30  
**Facilitator:** Claude (discuss-phase workflow)  
**Phase:** 3 - Log Management

---

## Discussion Overview

Four implementation areas identified and discussed:
1. Log discovery & download scope
2. Storage quota & warnings
3. Purge UX & log selection
4. Local log storage & progress

---

## Area 1: Log Discovery & Download Scope

### Question 1.1: Download Target (Standalone vs. Specific User)
**Prompt:** Should download pull logs for a specific user or all logs in org?

**Options presented:**
- Specific user only
- All logs in org
- Both (with flag toggle)

**User response:** "Download is not a standalone command, it should happen as part of the flow for the trace command. Only download the logs for the specific user for the specific timeframe of the initiated trace."

**Decision locked:** Download integrates into trace workflow, scoped to specific user + trace timeframe. ✓

---

### Question 1.2: Download Trigger (Automatic vs. Manual)
**Prompt:** After trace is initiated, should download be automatic or require explicit action?

**Options presented:**
- Automatic after trace
- Manual follow-up command
- Optional during watch mode

**User response:** "Automatic after trace"

**Decision locked:** Download starts automatically after trace flag creation. ✓

---

### Question 1.3: Download Timing (Parallel vs. Sequential)
**Prompt:** When does automatic download happen relative to watch mode?

**Options presented:**
- Download starts immediately after trace created
- User exits watch mode first, then download starts
- User chooses when to download during watch

**User response:** "Download starts immediately after trace created"

**Decision locked:** Download begins right after trace creation, not after watch mode ends. ✓

---

### Question 1.4: Dual Progress Display (Sequential vs. Parallel)
**Prompt:** While download happens, should watch mode and download progress be shown together or separately?

**Options presented:**
- Sequential: watch first, then download
- Parallel: both at once
- Smart: default sequential, user can 'q' to jump to download

**User response:** "Parallel: show both at once"

**Decision locked:** Watch mode expiry countdown and download progress display in parallel. ✓

---

## Area 2: Storage Quota & Warnings

### Question 2.1: Quota Check Timing
**Prompt:** When should plugin check remaining 1GB storage quota?

**Options presented:**
- Before download starts
- During download progress
- Both (upfront + ongoing)

**User response:** "During download progress"

**Decision locked:** Check quota continuously during download, not upfront. Monitor for quota exhaustion mid-download. ✓

---

### Question 2.2: Over-Quota Behavior
**Prompt:** If download would exceed 1GB limit, what should happen?

**Options presented:**
- Stop download immediately
- Warn & pause, let user choose
- Auto-purge oldest logs

**User response:** "Stop download immediately"

**Decision locked:** Conservative approach — halt download if quota exceeded; user must manually purge, then retry. ✓

---

### Question 2.3: Error Message Guidance
**Prompt:** When stopped due to quota, what guidance should error show?

**Options presented:**
- Show quota + suggest purge command
- Show quota + calculate space needed + offer purge options
- Simple message + docs link

**User response:** "Show current/remaining quota, suggest purge command"

**Decision locked:** Error format: "Storage quota exceeded. Current: 950MB/1GB. Run: sf log purge to delete old logs." ✓

---

## Area 3: Purge UX & Log Selection

### Question 3.1: Log Selection Mechanism
**Prompt:** How should users select which logs to delete in `sf log purge`?

**Options presented:**
- Interactive list (user selects individually)
- Criteria-based (oldest, largest)
- Hybrid (interactive default, criteria flags for automation)

**User response:** "All logs, with a warning"

**Decision locked:** Purge deletes ALL logs in org by default (not interactive selection). Informed consent via confirmation. ✓

---

### Question 3.2: Purge Scope (Org-wide vs. User-scoped)
**Prompt:** Does "all logs" mean entire org or just current user?

**Options presented:**
- All logs in entire org
- All logs for the current user
- Configurable (default user, --all flag for org)

**User response:** "All logs in entire org"

**Decision locked:** `sf log purge` targets org-wide logs, not user-scoped. Appropriate for high-volume storage cleanup. ✓

---

### Question 3.3: Deletion Confirmation
**Prompt:** What confirmation is required before deleting all org logs?

**Options presented:**
- Simple yes/no prompt
- Risk confirmation showing storage freed
- Require --force flag

**User response:** "Risk confirmation: show storage freed"

**Decision locked:** Confirmation displays "Deleting all X logs would free ~500MB. Proceed? (yes/no)" — informed consent. ✓

---

## Area 4: Local Log Storage & Progress Display

### Question 4.1: Local Storage Structure
**Prompt:** How should downloaded logs be organized locally?

**Options presented:**
- Flat directory (~/sf-logs/)
- Organized by user (~/sf-logs/{username}/)
- Organized by date (~/sf-logs/{YYYY-MM-DD}/)

**User response:** "By trace session, unsure if the script will have access to ~/sf-logs we may need to find the best practice for storing this information"

**Note:** User raised concern about FS access constraints for SF CLI plugins. ✓

**Decision locked (pending verification):** Organize by user + timestamp. Researcher must verify FS access conventions. ✓

---

### Question 4.2: Session Organization Detail
**Prompt:** For "by trace session" organization, what structure exactly?

**Options presented:**
- Trace session ID (~/sf-logs/{sessionId}/)
- User + timestamp (~/sf-logs/{user}/{YYYY-MM-DD-HH-MM}/)
- Current working directory (./sf-logs/{timestamp}/)

**User response:** "User + timestamp: ~/sf-logs/{user}/{YYYY-MM-DD-HH-MM}/"

**Decision locked:** Human-readable structure with user directory and timestamped subdirectories. ✓

---

### Question 4.3: Progress Display Content
**Prompt:** What should download progress display show?

**Options presented:**
- File count & total size
- Time elapsed & ETA
- Download speed

**User response:** "Time elapsed & ETA, We won't know the total logs as they are being generated concurrently. But a count of all total files downloaded would be good"

**Key insight:** Total logs unknown during concurrent generation; ETA is estimate based on current rate. Count is more meaningful than percent.

**Decision locked:** Progress shows time elapsed, estimated time remaining (ETA), and file count. ✓

---

## Summary of Locked Decisions

| Area | Decision |
|------|----------|
| Download trigger | Integrated into trace workflow (not standalone command) |
| Download scope | Specific user + timeframe of trace |
| Download automation | Automatic after trace creation |
| Timing | Starts immediately after trace |
| Display | Watch mode and download progress in parallel |
| Quota check | During download progress (not upfront) |
| Over-quota behavior | Stop download immediately (conservative) |
| Error message | Show quota + suggest purge |
| Purge scope | All org logs (not user-scoped) |
| Purge confirmation | Show estimated freed space before deletion |
| Local storage | `~/sf-logs/{user}/{YYYY-MM-DD-HH-MM}/` (pending FS verification) |
| Progress display | Time elapsed, ETA, file count |

---

## Critical Open Item

**File storage location:** User noted concern about FS access for `~/sf-logs/`. Researcher must determine:
- Where do other SF CLI plugins store persistent data?
- Should we use `~/.sf/`, a plugin-specific directory, or user-configurable location?

This is a blocker for planning and execution.

---

## Deferred Ideas (for Future Phases)

- Selective purge (delete by age/size/keyword) — v2
- Bulk download for multiple users — v2
- Log archival to S3 — v2
- Concurrent download optimization — v2
- Custom storage location configuration — v2

---

## Next Steps

1. **Researcher:** Investigate ApexLog queries, storage quota API, and SF CLI file storage conventions
2. **Planner:** Design extended Phase 2 trace command with integrated download flow
3. **Execution:** Implement download during Phase 3 trace command extension, purge command, local storage manager

---

*Discussion completed: 2026-05-30*
*All gray areas resolved. Ready for research and planning.*
