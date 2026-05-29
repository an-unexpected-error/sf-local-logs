# Phase 2: Debug Sessions - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-30  
**Phase:** 2-Debug Sessions  
**Areas discussed:** Trace flag duration & renewal, Default debug level, User selection flow, Error handling & edge cases

---

## Trace Flag Duration & Renewal

| Option | Description | Selected |
|--------|-------------|----------|
| Show calculated expiry time (Recommended) | Display the exact expiry time (e.g., '2026-05-31 at 14:30 UTC'). Helps admins plan when logs will stop being captured. | ✓ |
| Show relative time only | Display 'Expires in 24 hours' or similar. Less precision but clearer for quick scanning. | |
| Show both | Display both exact time and relative time. Most informative but takes more space. | |

**User's choice:** Show calculated expiry time (Recommended)

**Notes:** User clarified that the trace command should keep running in watch mode, monitoring the trace flag's remaining time with a progress bar showing expiry time and percentage complete. This enables admins to monitor while Phase 3's download commands pull logs separately.

| Option | Description | Selected |
|--------|-------------|----------|
| No warning (Recommended) | Keep the command simple. If trace flag exists, let the user re-run the command to create a new one. | |
| Warn but create anyway | Show a warning that an active trace flag exists, but still create a new one for the user. | |
| Require confirmation | Show a warning and ask user to confirm they want a new trace flag (prevents accidental duplicates). | |

**User's choice:** (Custom input) Fail with error, but provide `--overwrite` flag to stop existing trace and create a new one. Error message should guide users: "User has an existing trace, please use the --XXXX flag to overwrite it"

**Notes:** User wants a fail-safe default (prevents accidental duplicates) while still allowing power users to refresh the trace via explicit flag.

---

## Default Debug Level

| Option | Description | Selected |
|--------|-------------|----------|
| Use org's default DebugLevel (Recommended) | Salesforce orgs have a system default. Respects org admin's existing policy. | ✓ |
| Use 'DEBUG' as fallback | Hardcode 'DEBUG' if org has no default. Ensures predictable behavior in all orgs. | |
| Prompt user to choose | If no default, interactively ask which level they want (DEBUG, INFO, WARNING, ERROR, etc.). | |

**User's choice:** Use org's default DebugLevel (Recommended)

**Notes:** Respects org admin's existing debug policies.

| Option | Description | Selected |
|--------|-------------|----------|
| Fail with clear error (Recommended) | Command exits with guidance: 'Unable to determine debug level. Use `--level DEBUG` to specify explicitly.' | ✓ |
| Silently use 'DEBUG' | Automatically fall back to 'DEBUG' without telling the user. Simpler but less transparent. | |
| Prompt user interactively | Ask the user: 'No default DebugLevel found. Which level would you like?' (adds a step but gives control). | |

**User's choice:** Fail with clear error (Recommended)

**Notes:** User values transparency and explicit control.

| Option | Description | Selected |
|--------|-------------|----------|
| Trace Flag ID | The Salesforce ID of the trace flag (useful for reference/debugging). | ✓ |
| Target User details | Which user was traced (ID, name, email). | ✓ |
| Debug Level applied | Which debug level is active (DEBUG, INFO, etc.). | ✓ |
| Expiry time | Exact timestamp when the trace flag expires. | ✓ |

**User's choice:** All of the above

**Notes:** User wants comprehensive confirmation output so admins have all context about what was just created.

| Option | Description | Selected |
|--------|-------------|----------|
| List available levels (Recommended) | Show enum of valid levels (DEBUG, INFO, WARNING, ERROR) in help text and error messages when invalid level provided. | ✓ |
| Link to docs | Point users to Salesforce docs for debug level reference: 'Valid levels: DEBUG, INFO, WARNING, ERROR (see Salesforce docs for details).' | |
| Don't document | Assume users know Salesforce's debug levels. Minimal help text. | |

**User's choice:** List available levels (Recommended)

**Notes:** Help users understand valid options without requiring external research.

| Option | Description | Selected |
|--------|-------------|----------|
| Warn but allow (Recommended) | Show: 'Note: User already has active trace flag. Creating a new one will extend the monitoring window.' Then proceed. | |
| Fail with error | Prevent duplicate trace flags: 'Trace flag already active for this user. Use --force to override.' | |
| Check & replace | Automatically check if active flag exists and replace it. No warnings, cleaner UX. | |

**User's choice:** (Custom input) Default to error, but allow `--overwrite` flag to stop existing trace and create new one. Error should say: "User has an existing trace, please use the -XXXX flag to overwrite it"

**Notes:** User wants safety by default with an escape hatch for power users.

---

## User Selection Flow

| Option | Description | Selected |
|--------|-------------|----------|
| Require --user-id (Recommended) | Keep trace focused. Users who don't have a user ID can run `sf log search` first to find it. | |
| Integrate Phase 1 search | If --user-id not provided, prompt user to search: 'User ID not provided. Search for a user?' (reuses Phase 1 logic). | |
| Optional --name flag | Add `--name` flag as an alternative to `--user-id`: `sf log trace --name "john doe"` searches and traces first match. | |

**User's choice:** (Custom input) Interactive search should be the **default** (when no `--user-id`). User types search terms and sees filtered results as they type (same UX as Phase 1). After selecting, trace is created immediately. `--user-id` available as a backup for scripting.

**Notes:** User envisions a seamless workflow where search is the first-class experience, with explicit IDs as a fallback for automation.

| Option | Description | Selected |
|--------|-------------|----------|
| Work in both modes (Recommended) | User can run `sf log trace --level INFO` and search interactively, then trace with INFO level. | ✓ |
| Only with --user-id | If using interactive search, always use org's default level. `--level` only applies to scripted runs with explicit user ID. | |

**User's choice:** Work in both modes (Recommended)

**Notes:** Flexibility for admins — they can override debug level in both interactive and scripted contexts.

| Option | Description | Selected |
|--------|-------------|----------|
| Show message and retry (Recommended) | 'No users found. Try a different search term.' Prompt user to search again. | ✓ |
| Exit with error | Exit gracefully: 'No matching users. Run with --user-id <id> to bypass search.' | |
| Allow manual user ID entry | Offer: 'No results found. Enter a user ID manually?' (fallback for edge cases). | |

**User's choice:** Show message and retry (Recommended)

**Notes:** Keep users in the search flow rather than forcing them out.

| Option | Description | Selected |
|--------|-------------|----------|
| Exit cleanly (Recommended) | Exit with message: 'Search cancelled. No trace flag created.' | ✓ |
| Ask to confirm exit | Warn: 'Exit search? (y/n)' to prevent accidental cancellations. | |
| Try alternative input | Offer: 'Exit search? You can also try --user-id <id> instead.' (helpful redirect). | |

**User's choice:** Exit cleanly (Recommended)

**Notes:** Respect user intent without friction.

---

## Error Handling & Edge Cases

| Option | Description | Selected |
|--------|-------------|----------|
| Clear permission guidance (Recommended) | 'You don't have permission to create trace flags. Contact your org admin or check your user permissions.' | |
| Generic error with docs link | 'Unable to create trace flag. See Salesforce docs: [link] for troubleshooting.' | |
| Raw API error | Show the actual Salesforce API error. Technical but may confuse non-technical users. | ✓ |

**User's choice:** Raw API error

**Notes:** Technical CLI users prefer raw errors for debugging; they can share with support or investigate themselves.

| Option | Description | Selected |
|--------|-------------|----------|
| Warn but allow trace (Recommended) | 'Warning: Org is near/at 1GB debug log limit. Trace will still be created, but new logs may not be captured until space is freed.' | |
| Fail and require cleanup | 'Org storage full. Cannot create trace. Run `sf log purge` to free space, then try again.' | |
| Just create it | Don't check storage. Let Phase 3 handle storage warnings during download. | ✓ |

**User's choice:** Just create it

**Notes:** Keep Phase 2 focused on trace flag creation. Phase 3 (download/management) owns storage concerns.

| Option | Description | Selected |
|--------|-------------|----------|
| Retry with exponential backoff (Recommended) | Retry up to 3 times with increasing delays (1s, 2s, 4s). Better resilience for flaky networks. | |
| No retry, fail immediately | Exit on first timeout. User can re-run manually. Simpler implementation. | ✓ |
| Ask user before retrying | Show: 'Connection lost. Retry? (y/n)' Give user control. | |

**User's choice:** No retry, fail immediately

**Notes:** Keep Phase 2 simple; let users re-run if needed.

| Option | Description | Selected |
|--------|-------------|----------|
| Validate first (Recommended) | Query user first. If not found, fail with helpful error before attempting trace creation. | |
| Just attempt trace creation | Skip validation. If user doesn't exist, Salesforce API will fail with an error. Simpler, one less query. | ✓ |

**User's choice:** Just attempt trace creation

**Notes:** Reduce unnecessary queries; let Salesforce API handle validation.

---

## Claude's Discretion

None — user made explicit decisions on all areas discussed.

---

## Deferred Ideas

- **Multi-user tracing (v2)** — Ability to create traces for multiple users in one command. Out of scope for v1.
- **Debug level profiles (v2)** — Predefined debug level profiles (e.g., "Admin", "Developer", "Integration"). Out of scope for v1.
- **Trace flag renewal / auto-extend (v2)** — Automatically extend trace before expiry. Deferred to future enhancements.
- **Trace flag storage quota management (v2)** — Check storage limits before creating trace. Deferred to Phase 3 where storage is actively managed.

---

*Discussion logged: 2026-05-30*
