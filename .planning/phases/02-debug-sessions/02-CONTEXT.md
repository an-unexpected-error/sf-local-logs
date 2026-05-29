# Phase 2: Debug Sessions - Context

**Gathered:** 2026-05-30  
**Status:** Ready for planning

---

## Phase Boundary

Enable users to initiate debug log trace flags for selected Salesforce users directly from the CLI. The trace command creates a TraceFlag that enables Salesforce to generate debug logs for a user's activity. Users can search for a user interactively or provide a user ID directly. After creation, the command monitors the trace flag's remaining time with a progress bar. Phase 2 focuses on trace flag creation and monitoring only; actual log downloading is Phase 3's responsibility.

---

## Implementation Decisions

### Trace Flag Duration & Monitoring

- **D-01:** Watch mode is the **default behavior** — `sf log trace` automatically enters monitoring after creation, displaying expiry time and time-remaining progress bar
- **D-02:** Users can opt out with `--no-watch` flag to create the flag and exit immediately (useful for scripting/automation)
- **D-03:** During watch mode, display **calculated expiry time** (exact timestamp, e.g., "2026-05-31 14:30 UTC") alongside a progress bar showing time remaining as a percentage
- **D-04:** Watch mode only **monitors** the trace flag — actual log downloading happens in Phase 3. Phase 2 does not initiate downloads
- **D-05:** Trace flag expiry is a Salesforce constraint (24 hours) — not configurable or renewable from CLI in v1

### Default Debug Level

- **D-06:** When `--level` flag is not provided, use the **org's default DebugLevel**
- **D-07:** If org has no default DebugLevel, **fail with a clear error** message: `"Unable to determine debug level. Use --level DEBUG to specify explicitly."`
- **D-08:** Help text should **list available debug levels** (DEBUG, INFO, WARNING, ERROR) so users know valid options
- **D-09:** Trace flag confirmation **displays all four details**: Trace Flag ID, Target User (ID, name, email), Debug Level applied, and Expiry time
- **D-10:** If a trace flag already exists for the user, **fail with an error** guiding users to the `--overwrite` flag (or similar). Error message: `"User already has an active trace flag. Use --overwrite to stop existing trace and create a new one."`
- **D-11:** The `--overwrite` flag **stops the existing trace** (by setting its end date to NOW) and creates a new one, giving admins a way to refresh the monitoring window
- **D-12:** `--level` flag works in **both interactive search and explicit `--user-id` modes**

### User Selection Flow

- **D-13:** **Interactive search is the default** — `sf log trace` with no flags opens the search UI (reusing Phase 1's search logic)
- **D-14:** As user types in the search UI, the command **filters and displays matching users** (same UX as Phase 1)
- **D-15:** Once user selects a user from search results, the trace flag is **created immediately** (no additional confirmation step)
- **D-16:** `--user-id <id>` is available as an **explicit bypass** for scripting and automation (skips interactive search entirely)
- **D-17:** If interactive search returns **no results**, show message and **allow user to retry with a different search term** (don't exit)
- **D-18:** If user **cancels/exits the search** (Ctrl+C, quit, etc.), **exit cleanly** with message "Search cancelled. No trace flag created."
- **D-19:** Do **not validate user existence** before attempting trace flag creation when using explicit `--user-id` — let Salesforce API validation handle it

### Error Handling & Edge Cases

- **D-20:** Permission errors should **display the raw Salesforce API error** (technical users can debug; non-technical users can share with support)
- **D-21:** Do **not check org debug log storage limits** in Phase 2 — Phase 3 (log download) handles storage warnings and purging
- **D-22:** On connection timeout or network error, **fail immediately with no automatic retries** — user can re-run manually
- **D-23:** JSON output (`--json` flag) returns structured result with `traceFlag` object containing: `id`, `userId`, `debugLevel`, `expirationDate`

### Integration Points

- **D-24:** Reuse Phase 1's search implementation (SOQL query, filtering, pagination) rather than duplicating search logic
- **D-25:** Both `--json` and table output (default) should display the same trace flag details for consistency
- **D-26:** The trace command respects `--target-org` flag for multi-org environments (same pattern as Phase 1)

---

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Phase Goals
- `.planning/ROADMAP.md` — Phase 2 goal, success criteria, and dependency on Phase 1
- `.planning/REQUIREMENTS.md` — DEBUG-01, DEBUG-02, DEBUG-03, UX-01, UX-02, UX-04, UX-05 requirement definitions
- `.planning/PROJECT.md` — Core value and constraints (performance, storage, UX clarity, TypeScript)

### Technology Stack & Patterns
- `CLAUDE.md` — Tech stack rationale (oclif v4, @salesforce/sf-plugins-core, @salesforce/core, jsforce)
- `CLAUDE.md` § Key API Patterns — TraceFlag creation, Salesforce API interactions, command patterns
- `.planning/phases/01-user-search/01-CONTEXT.md` — Phase 1 decisions on search UX, user selection, SOQL patterns (reuse these patterns)

### Salesforce API Documentation
- **Salesforce Tooling API — TraceFlag object** — Create, query, update TraceFlag records; expirationDate field; supported DebugLevel values
- **Salesforce Tooling API — DebugLevel object** — Query org's default DebugLevel; available levels (DEBUG, INFO, WARNING, ERROR)
- **JSforce Documentation** — tooling.create(), tooling.query() for TraceFlag and DebugLevel CRUD operations

---

## Existing Code Insights

### Reusable Assets
- **Phase 1 Search Implementation** (`src/utils/soql-builder.ts`, search command): Reuse SOQL query building and user search patterns for consistency
- **Message system** (`messages/log.*.md`): Already scaffolded trace messages file; add detailed flag descriptions and help text
- **Trace command scaffold** (`src/commands/log/trace.ts`): Existing command structure with `--target-org`, `--api-version`, `--user-id` flags; needs implementation fill-in
- **SfCommand base class** and `Flags` utilities from `@salesforce/sf-plugins-core`: Consistent flag handling, error reporting, JSON output

### Established Patterns
- **Flag parsing & validation**: Phase 1 uses `Flags.requiredOrg()`, `Flags.string()` pattern; follow same style for consistency
- **Error messages**: Phase 1 provides actionable guidance; replicate that pattern (not raw API errors, except where user chose raw errors for technical situations)
- **JSON output**: Phase 1 returns structured `SearchResult` type; trace command should similarly return `TraceResult` with trace flag details
- **Interactive prompts**: Phase 1 uses `@inquirer/prompts`; reuse for search UI in trace command

### Integration Points
- **Org connection**: Use `flags['target-org'].getConnection()` pattern from Phase 1 to query users and create trace flags
- **User search before trace**: Interactive flow in trace command integrates Phase 1's user search UX (no separate command call needed)
- **Messages loading**: Follow Phase 1's `Messages.loadMessages()` pattern for trace command help text and error messages

---

## Specific Ideas

- Progress bar format: Show expiry time + percentage remaining (e.g., "Expires 2026-05-31 14:30 UTC [████████░░░░░░░░░░░░ 75%]")
- Overwrite flow: When user provides `--overwrite`, show brief confirmation: "Stopping existing trace and creating a new one..." before proceeding
- Search integration: Trace command should feel like a natural extension of Phase 1 — users familiar with `sf log search` will immediately understand the search UI in `sf log trace`

---

## Deferred Ideas

- **Multi-user tracing (v2)** — Ability to create traces for multiple users in one command. Out of scope for v1; belongs in future phase.
- **Debug level profiles (v2)** — Predefined debug level profiles (e.g., "Admin", "Developer", "Integration"). Out of scope for v1; deferred.
- **Trace flag renewal / auto-extend (v2)** — Automatically extend trace before expiry. Out of scope for v1; belongs with monitoring enhancements.
- **Trace flag storage quota management (v2)** — Check storage limits before creating trace. Deferred to Phase 3 (log download) where storage is actively managed.

---

*Phase: 2-Debug Sessions*  
*Context gathered: 2026-05-30*
