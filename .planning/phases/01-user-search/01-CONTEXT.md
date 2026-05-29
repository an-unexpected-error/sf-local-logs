# Phase 1 Context: User Search

**Date:** 2026-05-29  
**Phase:** 1 (User Search)  
**Status:** Context captured, ready for research & planning  

---

## Domain

Enable Salesforce admins and engineers to efficiently locate users in their org by searching for names, with clear, paginated results and iterative search refinement. This phase implements the first critical user interaction in the debug log workflow and establishes the pattern for user-facing CLI search experiences.

---

## Requirements (Locked)

**USER-01:** User can search for a Salesforce user by name (first, last, or both)  
**USER-02:** User receives paginated results when search returns multiple users  
**USER-03:** User can view user details in search results (ID, email, last login)  
**UX-01:** CLI displays status messages clearly explaining what's happening  
**UX-02:** Error messages provide actionable remediation guidance  
**UX-04:** All commands support `--json` output for programmatic use  
**UX-05:** Plugin respects `--target-org` flag for multi-org environments  

See `/planning/REQUIREMENTS.md` for full requirement text.

---

## Implementation Decisions

### Search Matching Strategy

**Decision:** Fuzzy matching on user names (handles typos and variations)

**Why:** More forgiving for admins who may not remember exact spelling of names. 'Jon' finds 'John', 'Jonatan' finds similar variations. Reduces need for follow-up searches.

**Implementation:** When searching, match on both first and last name using fuzzy algorithm. User enters `--name "John"` or interactive prompt, returns matches ordered by relevance and last login date.

### Results Ordering & Pagination

**Decision:** Order results by last login (most recent first), limit to 20 results per "page"

**Why:** Most recently active users are typically most relevant for admins debugging issues. Fixed limit (20) is readable in terminal without overwhelming. Aligns with typical CLI result presentation.

**Implementation:**
- Query returns up to 20 users sorted by last login descending
- Display as table with User ID, Name, Email, Last Login
- If results exceed 20, indicate "20 of N users shown"
- Allow user to interactively refine their search input to narrow results further
- No traditional pagination (next/previous) — instead, encourage iterative refinement

**Example flow:**
```
Search for user name: > john
Found 20 of 47 users. Showing most recently active.

[Table with results]

Refine search (or press Enter to select): > john d
Found 8 of 47 users. Showing most recently active.

[Table with results]
```

### Results Display Format

**Decision:** Table format by default; support `--json` for programmatic use

**Why:** Table is human-friendly in interactive mode and aligns with admin expectations. JSON enables scripting and integration with automation tools.

**Implementation:**
- Default: columnar table with User ID, Name, Email, Last Login
- With `--json` flag: structured JSON array of user objects
- Columns in table: `ID` | `Name` | `Email` | `Last Login`
- Last Login format: human-readable relative date ("2 hours ago", "Yesterday") in table; ISO 8601 in JSON

### Empty Results & Error Handling

**Decision:** Clear guidance with retry prompts on empty results; actionable errors on API failures

**Why:** Helps admins understand why search failed and how to recover. Reduces frustration and support burden.

**Implementation:**
- **No results:** "No users found for '[search term]'. Try refining your search or use a broader term."
  - Offer suggestion: "Tip: search by first or last name alone (e.g., 'john' or 'smith')"
  - Prompt user to try again if in interactive mode
- **API errors (e.g., org unreachable, invalid org):** Display org/connection error with remediation
  - "Unable to connect to org [orgname]. Verify you have permission and org is active."
  - Suggest: "Run `sf org list` to verify your org, or use `--target-org` to specify a different org."
- **Rate limiting / API timeouts:** Inform user and suggest retry
  - "Search timed out. Salesforce org may be busy. Try again in a moment."

---

## Technology Stack (Locked from Phase 0)

| Technology | Version | Purpose |
|-----------|---------|---------|
| Node.js | 18.0.0+ | Runtime |
| TypeScript | 5.5.4+ | Language |
| oclif | ^4.23.7 | CLI framework |
| @salesforce/sf-plugins-core | ^12 | Plugin base classes |
| @salesforce/core | ^8.31.0 | Org connection and auth |
| jsforce | (via @salesforce/core) | Salesforce REST API |

---

## Canonical References

Downstream agents (researcher, planner) must consult these docs:

- **CLAUDE.md** — Technology stack rationale, key API patterns, jsforce usage
- **ROADMAP.md** — Phase 1 success criteria and requirements
- **REQUIREMENTS.md** — USER-01, USER-02, USER-03, UX-01, UX-02, UX-04, UX-05 requirement text
- **Phase 0 CONTEXT.md** (`.planning/phases/00-plugin-setup/00-CONTEXT.md`) — Single unified command decision (`sf log search` as part of `sf log trace` flow)
- **JSforce Documentation** — User/Account SOQL queries, fuzzy matching approaches
- **Salesforce Tooling API Docs** — User object fields (Id, Name, Email, LastLoginDate, etc.)

---

## Code Context

**Current state:** Phase 0 scaffolded a basic search command:

1. **Command scaffold** — `src/commands/log/search.ts`
   - Inherits from `SfCommand`
   - Flags: `--target-org`, `--api-version`, `--name`
   - Result type: `SearchResult` with array of user objects (id, name, email, lastLogin)
   - Placeholder implementation (returns empty array)

2. **Messages file** — `messages/log/search.md` (likely exists with help text)

3. **Test scaffolds** — `test/commands/log/search.test.ts` (unit test scaffold present)

Phase 1 will fill in:
- SOQL query construction with fuzzy matching on user names
- Org connection and query execution via jsforce
- Result formatting (table + JSON)
- Error handling and empty-state messages
- Interactive mode with search refinement prompts
- Test coverage for search logic, pagination, and error cases

---

## Future Phase Implications

With search implemented:

- **Phase 2 (Debug Sessions):** Will build on user search results — user selects a user from search, then initiates debug session for that user
- **Phase 3 (Log Management):** Will reference searched user to download/manage their logs
- **Phase 4 (Log Filtering):** Will operate on logs from the user found in Phase 1

Search becomes the entry point for the entire workflow.

---

## Deferred Ideas

- **Advanced filtering / facets** (v2) — Filter by user role, department, or status. Deferred to future version.
- **Bulk search / import** (v2) — Search multiple users at once. Different phase.
- **Search history / bookmarks** (v2) — Remember previous searches. Out of scope for v1.

---

## Notes for Downstream Agents

1. **Researcher:** Verify:
   - jsforce Connection API supports SOQL queries with LIKE operators for fuzzy/substring matching
   - What's the best approach for fuzzy matching in Salesforce SOQL (LIKE with wildcards, or post-query filtering)?
   - Confirm User object fields available: Id, Name, Email, LastLoginDate
   - Are there any org-specific limits on search result counts (Salesforce API pagination limits)?

2. **Planner:** Locked decisions:
   - Fuzzy matching on names (not exact)
   - 20 results per view, ordered by last login descending
   - Table format by default; --json flag for programmatic use
   - Clear error messages with remediation guidance
   - Iterative search refinement (no traditional pagination)
   - Flag structure already in Phase 0 scaffold: `--name`, `--target-org`, `--json` (add if not present)

3. **Execution notes:**
   - After Phase 1 completes: `sf log search --name "john"` should return a table of matching users
   - `sf log search --name "john" --json` should return JSON array
   - Interactive mode should prompt for refinement if initial search returns many users
   - Error cases should provide actionable messages (not generic Salesforce API errors)

---

## Session Notes

**Discussion flow:**
- Discussed search matching strategy: decided on fuzzy matching for admin-friendly search
- Discussed pagination: decided on iterative refinement (20 results, ordered by last login) rather than traditional next/previous pagination
- Discussed display: table format by default with --json option
- Discussed empty state and errors: clear guidance with retry prompts

**User priorities:** Admin-friendly, iterative search refinement, clear feedback on results.

---

*Context captured by discuss-phase on 2026-05-29*
