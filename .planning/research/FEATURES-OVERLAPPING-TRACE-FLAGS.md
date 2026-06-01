# Feature Landscape: Overlapping Trace Flag Handling

**Domain:** Salesforce Debug Log CLI Plugin v1.1 — Trace Flag Conflict Management
**Researched:** 2026-06-01
**Milestone:** v1.1 Overlapping Trace Flag Handling (subsequent to v1 core features)
**Scope:** Features specifically for detecting, reporting, and resolving overlapping/conflicting trace flags

---

## Executive Summary

When admins or engineers attempt to initiate a new debug session (v1 feature), an existing active trace flag for that user blocks creation. The Salesforce Tooling API allows multiple trace flags per user without uniqueness constraints, but Salesforce's practical limits (1GB storage, performance degradation) and common workflows (frequent re-tracing) create a **friction point** in the debug workflow.

**Core Problem:** User runs `sf debug trace new` for user X, but X already has an active trace. CLI currently fails with an API error, forcing manual cleanup:
1. User finds old trace in Developer Console
2. User deletes or expires it
3. User retries `sf debug trace new`

**Solution (v1.1):** Detect existing traces, show user what's blocking them, automatically expire old traces, confirm action, report results.

**Key Insight:** Salesforce tools (SFDX CLI, Speedy Debugger extension) use a `--force` flag pattern to auto-replace conflicting flags. This is table stakes UX for trace management tools.

---

## Table Stakes

Features users expect in trace flag management tools. Missing = forces manual intervention.

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|-----------|--------------|-------|
| **Detect existing active trace flags for target user** | User needs to know WHY trace creation failed. Without detection, CLI errors with opaque Tooling API messages. Prevents silent failures. | **Medium** | v1: User search (already done) + Tooling API query | Query: `SELECT Id, TracedEntityId, StartDate, ExpirationDate, DebugLevel.DeveloperName FROM TraceFlag WHERE TracedEntityId = :userId AND StartDate <= :now AND ExpirationDate > :now` Handles: no active traces, one active trace, multiple overlapping traces (edge case but possible per Tooling API behavior). |
| **Display conflicting trace flag details to user** | User must understand WHAT is blocking them (when it expires, who set it, what's being logged). Enables informed decisions. | **Low** | Detection (above) | Display: Trace ID, StartDate, ExpirationDate, debug level name, created by (CreatedDate available; may not have user info). Format clearly in table or readable text. |
| **Automatically expire overlapping trace flags** | Core value: seamless UX. When user initiates new trace, silently expire old flags (set EndTime to current timestamp) instead of failing. This is the "just works" feature. | **Medium** | Detection + Tooling API update | Tooling API PATCH: Update EndTime to NOW. Handle: single trace (straightforward), multiple overlapping traces (update all? or ask user?). Race condition: user manually deletes while we're expiring (handle gracefully). |
| **Confirm action before expiring existing traces** | Safety net: prevent accidental loss of in-flight logs. User explicitly consents to terminating existing debug sessions. | **Low** | Expiration logic | Prompt: "Existing trace for user X expires [time]. Expire it now? (y/N)". Support: `--force` flag to skip confirmation, non-TTY stdin (don't hang). |
| **Report what actions were taken** | Close feedback loop. User understands trace lifecycle: "I expired 1 old trace and created a new one" vs "Created new trace (no prior traces)". | **Low** | All above | Show: "Expired trace ID X (was set for 30 min)" + "Created new trace ID Y (30 min duration)" + success/failure status. Use consistent messaging (not "trace deleted", use "expired"). |

---

## Differentiators

Features that set this tool apart from basic implementations. Not expected, but valued by power users.

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| **List all active traces in org** | Org-wide visibility: audit who's being traced, spot forgotten traces. Helps admins understand storage consumption. | **Medium** | Tooling API query (like detect, but no user filter) | Command: `sf trace list` or `sf trace --list-active`. Query: All active TraceFlags (no time filter). Return: user, trace ID, duration remaining, debug level. Useful for cleanup. |
| **Show time remaining on traces** | User sees countdown ("30m remaining", not just "expires at 2026-06-01 15:30:00"). Improves UX for visibility. | **Low** | Detection + date math | Calculate: ExpirationDate - NOW. Display: "expires in 1h 23m" or "22:30:00" (absolute). Handle: timezones carefully (use UTC throughout). |
| **Interactive confirmation with trace preview** | Instead of just confirming yes/no, show user old trace details before asking. Reduces mistakes. | **Low** | Detection + display logic | Enhance confirmation: show old trace details (start, end, debug level), ask "Expire this?" vs blind "yes/no". |
| **Batch expire stale traces** | Admin can bulk-expire multiple old traces at once (e.g., all > 1hr old). Addresses storage/hygiene. | **Medium** | Expiration logic + bulk operations | Command: `sf trace expire --older-than 1h --dry-run`. With `--dry-run`, show what would expire. Without it, confirm then execute. Error handling: report which traces failed. |
| **Show what debug level was applied** | User sees what was being logged (ApexCode: FINEST, Database: DEBUG, etc.). Critical for understanding log verbosity. | **Low** | DebugLevel relation query; formatting | Include in trace display. DebugLevel is optional (nullable); handle missing gracefully with "(default)". |
| **Duration template support** | Instead of hardcoding 30m, user specifies `--duration 24h` or `--duration 6h`. Reduces repetitive configuration. | **Low** | Time parsing library | Support: 30m (default), 1h, 6h, 12h, 24h, custom (with validation). Parse via standard library or tiny library (Chrono for Rust, date-fns for JS). |
| **Skip confirmation with `--force` flag** | Power users want non-interactive mode for scripts/automation. `--force` skips confirmation, expires old traces automatically. | **Low** | Confirmation logic | Flag already used in Salesforce CLI plugins (standard pattern). Bypass prompt if flag present. Must still display what happened. |
| **Export trace history to JSON/CSV** | Users want to audit trace lifecycle for compliance. "Show me all traces created for user X in the past 7 days." | **Medium** | Tooling API query + formatting | Query: TraceFlag with date range filter. Export: JSON (verbose) or CSV (summary). Store locally; no org persistence. |

---

## Anti-Features

Features to explicitly NOT build for v1.1. Deferring keeps scope tight.

| Anti-Feature | Why Avoid | Deferred To | What to Do Instead |
|--------------|-----------|------------|-------------------|
| **Custom debug level creation from CLI** | Debug levels are org-specific, require understanding 8 categories × 5 log levels. Decision fatigue. Salesforce best practice: use pre-existing debug levels. | v2 or never | Use org's default debug level or hardcode to `SFDXDebugLevel` (standard Salesforce choice). Document debug levels in README with recommendations. If user needs custom: point to Developer Console setup. |
| **Multi-org trace flag management** | Current scope is single-org context (from PROJECT.md). Multi-org adds state management, context switching. | v2 | Always use current org (`--target-org`); error clearly if not set. Users manage multi-org via sequential commands or shell scripts. |
| **Trace flag templates ("save my setup as template")** | "Save my debug config, apply to other users" requires metadata storage, versioning, sharing. Premature. | v2 | Document recommended debug levels in README. Users can script CLI commands if needed. |
| **Real-time trace expiration alerts** | "Alert me when my trace is about to expire" requires background monitoring + notification system (email, Slack). | v2 | CLI displays "expires in X" on every command. Users can cron a `sf trace list` job if they want monitoring. |
| **Automatic trace re-enable on expiration** | "Keep tracing this user indefinitely" sounds useful but violates Salesforce best practices (continuous tracing = performance hit + storage waste). Explicitly reject. | Never | Document: "Traces expire intentionally to respect Salesforce performance/storage limits. Create new trace when ready." |
| **AI-powered cleanup recommendations** | "AI suggests which traces to expire" adds complexity without clear ROI. | v2+ | Provide `sf trace list --sort age` to help manual decision-making. Show org storage usage % (1GB limit). |
| **Automatic garbage collection of expired traces** | Background cleanup of expired (but not deleted) TraceFlag records. | v2 (storage management) | CLI can offer `sf trace cleanup` command (manual). Don't auto-clean; let user control. |

---

## Feature Dependencies

**Critical Path (in order):**

```
1. Detect existing active trace flags
   ↓
2. Display conflicting trace flag details
   ↓
3. Automatically expire overlapping trace flags
   ↓
4. Confirm action before expiring
   ↓
5. Report what was done
```

**Optional extensions (can layer on top):**

```
List all active traces ← requires Detect logic
Show time remaining ← requires Detect + date math
Show debug level applied ← requires Detect + DebugLevel query
Interactive confirmation ← requires Display + Confirm
Batch expire stale traces ← requires Detect + Expire logic
Duration templates ← orthogonal to core path
--force flag ← orthogonal to core path
Export history ← requires Detect + formatting
```

**Not blocking each other:**
- `--force` and `--duration` are CLI flags that work independently
- Time remaining and debug level are display enhancements

---

## MVP Recommendation for v1.1

**Must ship (table stakes):**
1. ✅ **Detect existing active trace flags** — Without this, no seamless UX
2. ✅ **Display conflicting trace flag details** — User must see why it failed
3. ✅ **Automatically expire old trace flags** — Core value: "just works"
4. ✅ **Confirm action before expiring** — Safety net
5. ✅ **Report what was done** — Closes feedback loop

**Should include (nice-to-have, if time permits):**
- Show time remaining on traces
- Show debug level applied
- `--force` flag to skip confirmation (power-user feature)

**Nice-to-have (lower priority):**
- Interactive confirmation with trace preview
- List all active traces in org
- Duration templates (`--duration 6h`)

**Explicitly defer to v1.2+:**
- Batch expire stale traces (low complexity but not blocking MVP)
- Export trace history (nice-to-have audit feature)
- Custom debug level creation (requires UX design)

**Never build:**
- Templates, auto-re-enable, alerts, automatic cleanup, AI recommendations

---

## Complexity Assessment

| Feature | Why It's Complex | Estimated Effort | Risk Level | Mitigation |
|---------|-----------------|------------------|------------|-----------|
| **Detect existing trace flags** | Requires Tooling API query with time-based filtering (StartDate <= NOW, ExpirationDate > NOW). Multiple results handling. | **1-2 days** | Low | Test with: 0 traces, 1 trace, 3 overlapping traces. Mock org query results. |
| **Display conflicting trace flag details** | Formatting + clear communication. Not technically hard. | **0.5 days** | None | Use existing Salesforce CLI table formatting (oclif provides this). |
| **Automatically expire old trace flags** | Tooling API PATCH to update EndTime. Race condition: user deletes while we're expiring. Multiple traces: expire all, or ask user? | **2-3 days** | Medium | Strategy decision: expire ALL (simplest) vs ask user (safest). Test simultaneous delete. Error handling for partial failures. |
| **Confirm action before expiring** | CLI prompt handling. Non-TTY environments (pipes, scripts) must not hang. `--force` flag support. | **1 day** | Low | Test: TTY (interactive), non-TTY (stdin closed), `--force` flag. |
| **Report what was done** | Logging/messaging to user. Clear language. | **0.5 days** | None | Template messages; consistent tone. |
| **List all active traces** | Similar query to detect; add org-wide scope (no user filter). Pagination if 1000+ traces. | **1-2 days** | Medium | Test with large org. Implement pagination if needed. |
| **Show time remaining** | Date math (ExpirationDate - NOW). Timezone handling (use UTC). | **0.5 days** | Low | Always work in UTC; format for display. Test DST edge cases. |
| **Show debug level applied** | Requires DebugLevel object JOIN in query. DebugLevel nullable; handle missing. | **1-2 days** | Low | Test: trace with DebugLevel, trace without (edge case). Format names clearly. |
| **Interactive confirmation** | Enhance confirmation prompt with trace details. UX polish. | **0.5 days** | None | Reuse display logic. |
| **Batch expire stale traces** | Bulk Tooling API updates or loop + update. Handle partial failures. Report which expired, which failed. | **2-3 days** | Medium | Error handling: fail loudly on any error, or report partial success? Define with team. |
| **Duration templates** | Time parsing library or simple regex. Validation. | **0.5 days** | Low | Use standard library. Test: 30m, 1h, 6h, 24h, invalid (100y should error). |
| **`--force` flag** | Flag parsing (oclif handles this). Condition: skip prompt if present. | **0.5 days** | None | oclif flag definitions; standard pattern. |
| **Export history** | Tooling API query with date range. JSON/CSV formatting. | **1-2 days** | Low | Test: valid query, no results, large result set. Format validation. |

---

## Constraints & Gotchas

### Salesforce Tooling API Behavior
- **No uniqueness constraint on TraceFlag:** API allows multiple traces per user. No conflict prevention at API level. (Source: [Tooling API Known Issue](https://issues.salesforce.com/issue/a028c00000qQ94XAAS/))
- **Expired traces may still cache:** If EndTime is set, expiration may not be respected immediately. Stale flags can trigger logging. (Source: [Trailblazer](https://trailblazer.salesforce.com/issues_view?id=a1p30000000T5U9AAK))
- **Max 24-hour window:** Trace flags span at most 24 hours. Expirations beyond that window are not meaningful.
- **StartDate <= NOW AND ExpirationDate > NOW for active:** A trace is active only if both conditions hold. Use this in queries.

### Storage & Performance Constraints
- **1GB debug log limit:** When exceeded, Salesforce disables ALL trace flags org-wide and notifies admins. v1.1 should respect this boundary.
- **250MB per 15 minutes:** Heavy tracing can hit this limit quickly. Multiple overlapping traces accelerate storage usage.
- **Query performance on large orgs (10k+ users):** Org-wide `sf trace list` may timeout. Implement pagination or filtering.

### User Experience Traps
- **Forgotten traces:** Users set traces, forget to expire, storage fills up. (Source: [Salesforce Ben](https://www.salesforceben.com/an-admins-guide-to-debug-logs-in-salesforce/))
- **Silent expiration fear:** Users worry "will I lose logs?" when auto-expiring old traces. Must communicate clearly.
- **Non-TTY environments:** If user pipes `sf debug trace new` to another command, can't prompt interactively. Must support `--force` or error gracefully.
- **Timezone confusion:** Date fields in Salesforce use user's TZ (or UTC?). Must verify and document.

---

## Success Criteria for MVP

| Criterion | Validation |
|-----------|-----------|
| Detect existing active trace flags | Query returns correct TracedEntityId matches; handles 0, 1, and 3+ traces; no false positives |
| Display details clearly | User can identify: trace ID, start/end times, debug level name, when it expires |
| Automatically expire | EndTime updated to NOW; verified in org after CLI returns; no partial failures silently ignored |
| Confirm before expiring | Prompt shown by default; `--force` flag skips prompt; non-TTY (pipe) doesn't hang |
| Report results | User sees clear message: "Expired trace X. Created trace Y." or "Created trace Z (no prior traces)." Success and failure both reported |
| Handle edge cases | Multiple traces expire cleanly; race condition (user deletes) doesn't crash; API errors reported clearly |

---

## Test Scenarios

These should be validated during implementation:

1. **Happy path:** No existing trace → Create new trace. Output: "Created trace ID abc123."
2. **One existing trace:** Active trace exists → Confirm → Expire old trace → Create new trace. Output: "Expired trace XYZ. Created trace ID abc123."
3. **Multiple overlapping traces (edge case):** 3 active traces exist → Confirm → Expire all → Create new trace. Output: "Expired 3 traces. Created trace ID abc123."
4. **User declines:** Existing trace → Confirm → User enters "n" → Exit without creating. Output: "Cancelled."
5. **Force flag:** Existing trace → `--force` flag → No prompt → Expire and create. Output: "Expired trace. Created trace ID abc123."
6. **Non-TTY (pipe):** Command runs in non-interactive stdin → `--force` flag required or error. Output: Error message or success (if flag present).
7. **API failure:** Expiration API call fails → Report error; don't create new trace. Output: "Failed to expire old trace (API error: XYZ). Please manually delete and retry."
8. **Timezone edge case:** Trace expires at 23:59:59 UTC, user in PST (UTC-8). Ensure "expires in X" is calculated correctly.

---

## Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| **Table stakes identification** | **HIGH** | SFDX CLI, Speedy Debugger extension, sf-debug-log plugin all implement detection + expiration pattern. Multiple sources confirm. |
| **Tooling API behavior (no uniqueness)** | **HIGH** | Documented in official Salesforce Known Issue; verified in multiple community posts. Tested by existing tools. |
| **Expiration mechanism (EndTime)** | **MEDIUM-HIGH** | Works via StartDate/ExpirationDate fields. Date filtering confirmed. Edge cases (caching, timezone) less thoroughly documented. |
| **Storage limits (1GB, 250MB/15m)** | **HIGH** | Official Salesforce documentation; well-documented constraints. |
| **Query performance on large orgs** | **MEDIUM** | Theoretical concern; not explicitly documented. Mitigation: test and implement pagination. |
| **User pain points** | **MEDIUM-HIGH** | Community posts + Salesforce guides confirm; specific frequency/impact less quantified. |
| **Differentiators** | **MEDIUM** | Based on competitive tool analysis. May underestimate demand for specific features (e.g., batch expire). |

---

## Gaps & Open Questions for Phase-Specific Research

1. **Exact error when creating trace for user with existing active flag?** — Query fails? Create succeeds but doesn't enable? Must test with real org during implementation phase.
2. **Query performance on large orgs (10k+ users)?** — Potential timeout when listing all traces. Pagination strategy needed.
3. **Can we query CreatedBy user info on TraceFlag?** — Show "created by [username]" or just date? Check Tooling API CreatedBy field availability.
4. **Timezone handling in Salesforce Tooling API** — Do date fields use user TZ or UTC? Must verify to avoid off-by-one expiration times.
5. **Can DebugLevel names be user-facing?** — Show "ApexCode: FINEST" vs internal names? Verify against existing Salesforce tools.
6. **Batch expiration error handling strategy** — Fail if ANY trace fails, or report partial success? Define with product owner before implementing.
7. **Does `--duration` flag conflict with existing `--duration` usage in other commands?** — Check oclif flag registry; avoid collisions.

---

## Sources

- [Salesforce CLI Plugin Template (package.json)](https://github.com/salesforcecli/plugin-template-sf)
- [Best practices for using debug logs with trace flags](https://help.salesforce.com/s/articleView?id=000395769&language=en_US&type=1)
- [TraceFlag | Tooling API](https://developer.salesforce.com/docs/atlas.en-us.api_tooling.meta/api_tooling/tooling_api_objects_traceflag.htm)
- [DebugLevel | Tooling API](https://developer.salesforce.com/docs/atlas.en-us.api_tooling.meta/api_tooling/tooling_api_objects_debuglevel.htm)
- [Tooling API Known Issue: Multiple TraceFlags per entity](https://issues.salesforce.com/issue/a028c00000qQ94XAAS/tooling-api-traceflag-can-be-set-more-than-once-on-an-apex-class-resulting-in-class-showing-up-multiple-times-in-the-setup-menu)
- [Expired TraceFlag caching issue](https://trailblazer.salesforce.com/issues_view?id=a1p30000000T5U9AAK)
- [An Admin's Guide to Debug Logs in Salesforce](https://www.salesforceben.com/an-admins-guide-to-debug-logs-in-salesforce/)
- [GitHub: sf-debug-log plugin](https://github.com/PreziosiRaffaele/sf-debug-log)
- [Turning on trace debugging with the Salesforce CLI](https://lekkimworld.com/2021/02/16/turning-on-trace-debugging-with-the-salesforce-cli/)
- [Debug Logs on the Salesforce CLI](https://blog.justinlyon.me/post/debug-logs-sf-cli)
- [Medium: Debug Logs + Trace Flags: How to See the Whole Story](https://medium.com/@shirley_peng/debug-logs-trace-flags-the-whole-story-55d7789aa0af)
- [Set Up Apex Class and Trigger Trace Flags](https://help.salesforce.com/s/articleView?id=platform.code_debug_log_classes_setup.htm&language=en_US&type=5)
