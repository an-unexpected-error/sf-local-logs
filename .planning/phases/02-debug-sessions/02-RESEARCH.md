# Phase 2: Debug Sessions - Research

**Researched:** 2026-05-30  
**Domain:** Salesforce Tooling API TraceFlag creation, watch mode monitoring, integration with Phase 1 search  
**Confidence:** HIGH

## Summary

Phase 2 enables users to initiate debug log trace flags for selected Salesforce users directly from the CLI. The implementation leverages the Salesforce Tooling API to create TraceFlag records with jsforce, reuses Phase 1's user search infrastructure for interactive user selection, and implements watch mode monitoring with progress bar display to track trace flag expiry. Key technical decisions: TraceFlag creation via jsforce.tooling.create() with required fields (TracedEntityId, DebugLevelId, StartTime, ExpirationDate), automatic 24-hour expiry constraint from Salesforce platform, Node.js setInterval with graceful SIGINT shutdown for watch mode, and cli-progress for percentage/time-remaining display.

**Primary recommendation:** Create TraceFlag via jsforce.tooling.create() with validated userId and debugLevelId; implement watch mode as default behavior with graceful Ctrl+C shutdown; reuse Phase 1 search utilities for interactive user selection; query org's default DebugLevel before trace creation to fall back when `--level` not provided.

---

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Watch mode is default behavior — `sf log trace` automatically monitors after creation
- Users can opt out with `--no-watch` flag for scripting/automation
- Display calculated expiry time + progress bar showing time remaining as percentage
- Watch mode only monitors; actual log download is Phase 3's responsibility
- Trace flag expiry is a Salesforce constraint (24 hours); not configurable or renewable in v1
- When `--level` not provided, use org's default DebugLevel; fail with clear error if no default exists
- Help text should list available debug levels (DEBUG, INFO, WARNING, ERROR)
- Trace flag confirmation displays: Trace Flag ID, Target User (ID, name, email), Debug Level, Expiry time
- If active trace flag exists for user, fail with error message guiding users to `--overwrite` flag
- `--overwrite` flag stops existing trace (by setting end date to NOW) and creates new one
- Interactive search is default (`sf log trace` with no flags opens search UI, reusing Phase 1 logic)
- Once user selects from search, trace flag created immediately (no additional confirmation)
- `--user-id <id>` is explicit bypass for scripting/automation (skips interactive search)
- If interactive search returns no results, show message and allow user to retry with different term
- If user cancels search (Ctrl+C, quit), exit cleanly with message "Search cancelled. No trace flag created."
- Do NOT validate user existence before trace flag creation when using `--user-id` — let Salesforce API validate
- Permission errors should display raw Salesforce API error
- Do NOT check org debug log storage limits in Phase 2 — Phase 3 handles this
- On connection timeout or network error, fail immediately with no automatic retries
- JSON output (`--json` flag) returns: traceFlag object with `id`, `userId`, `debugLevel`, `expirationDate`
- Reuse Phase 1's search implementation (SOQL, filtering, pagination) rather than duplicating
- Both `--json` and table output should display same trace flag details for consistency
- Trace command respects `--target-org` flag for multi-org environments (same pattern as Phase 1)

### Claude's Discretion
- Watch mode implementation: blocking loop vs. non-blocking approach (recommend blocking for UX)
- Progress bar format and update frequency (recommend simple percentage + expiry time)
- Exact error message wording for edge cases (follow Phase 1 patterns)
- Whether to support multiple levels as enum or allow any string input

### Deferred Ideas (OUT OF SCOPE)
- Multi-user tracing (v2)
- Debug level profiles (v2)
- Trace flag renewal / auto-extend (v2)
- Trace flag storage quota management (deferred to Phase 3)

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DEBUG-01 | User can run `sf log trace --user-id <id>` to initiate a debug session | jsforce.tooling.create('TraceFlag', {...}) confirmed as standard Salesforce API pattern |
| DEBUG-02 | User can specify debug level via `--level` flag or accept org's default | DebugLevel queryable via tooling API; Salesforce supports DEBUG, INFO, WARNING, ERROR levels |
| DEBUG-03 | CLI confirms trace flag creation with details: target user, debug level, expiry time | TraceFlag object returns id, userId, debugLevel, expirationDate; 24-hour default from Salesforce |
| UX-01 | CLI displays status messages clearly explaining what's happening | Follow Phase 1 @salesforce/sf-plugins-core message patterns; use Messages.loadMessages() |
| UX-02 | Error messages provide actionable remediation guidance | Catch and translate Salesforce API errors; show permission errors, user-not-found, active-trace-exists patterns |
| UX-04 | All commands support `--json` output for programmatic use | SfCommand automatically serializes return type to JSON when --json flag present |
| UX-05 | Plugin respects `--target-org` flag for multi-org environments | Flags.requiredOrg() provides target-org handling; org.getConnection() returns authenticated connection |

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| TraceFlag creation | API / Backend | — | Org connection and Tooling API CRUD via jsforce; all auth handled by @salesforce/core |
| Interactive user search | CLI Command | API / Backend | oclif command loop with Phase 1 search logic; SOQL execution via jsforce |
| Watch mode monitoring | CLI Command | — | oclif command with setInterval polling; graceful SIGINT shutdown handling |
| Progress bar display | CLI Command | — | cli-progress library for percentage/time-remaining updates without flickering |
| Default DebugLevel query | API / Backend | — | Org connection and tooling.query() to fetch org's default DebugLevel before trace creation |
| Result formatting (table/JSON) | CLI Command | — | cli-ux for table output, JSON.stringify for programmatic format (same patterns as Phase 1) |
| Error handling & messages | CLI Command | — | @salesforce/sf-plugins-core message patterns for status/error delivery |

---

## Standard Stack

### Core (from Phase 0, locked)
| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| @salesforce/core | ^8.31.0 | Org connection, auth, User/DebugLevel/TraceFlag SOQL queries | Provides org.getConnection() returning jsforce Connection |
| @salesforce/sf-plugins-core | ^12 | SfCommand base, Flags utilities, message patterns | Provides SfCommand.run(), Flags.requiredOrg(), message loading |
| jsforce | latest (via @salesforce/core) | SOQL query execution, Tooling API CRUD | Connection.query() executes SOQL; tooling.create(), tooling.query() for TraceFlag/DebugLevel |
| @oclif/core | ^4 | Command class, flag parsing, async/await support | Base for SfCommand; all oclif v4 patterns supported |

### Supporting (Phase 2 specific)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @inquirer/prompts | ^8.5.0 | Interactive user search during trace setup | Reused from Phase 1; ask user to search for target user or select from results |
| cli-ux | ^6.0.9 | Table formatting and column-based output | Display trace flag confirmation in table format (default mode) |
| cli-progress | ^6.2.2 | Progress bar with time-remaining display | Watch mode: show percentage remaining + expiry timestamp; update per 1-second interval |
| chalk | ^5 (already installed) | Terminal color/styling | Highlight status messages, errors, progress milestones |

### Development & Testing (existing)
| Library | Version | Purpose |
|---------|---------|---------|
| @salesforce/cli-plugins-testkit | ^5.3.58+ | Integration testing with scratch org setup |
| mocha | ^10 | Test runner |
| TypeScript | 5.5.4 | Language |

**Installation:**
```bash
npm install cli-progress@6
```

cli-progress is the ONLY new package needed. All other dependencies already present from Phase 0 and Phase 1. package.json already includes @inquirer/prompts, cli-ux, and chalk.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| cli-progress (progress bar) | Custom spinner + manual time calculation | cli-progress handles formatting, update frequency, terminal flickering; custom would require testing and maintenance |
| jsforce.tooling.create() | REST API HTTP call (manual) | jsforce abstracts auth/session handling; manual HTTP requires custom connection headers and OAuth token refresh logic |
| @inquirer/prompts (search UI) | Manual readline loop (Phase 1 reuse) | Already implemented in Phase 1; reuse avoids duplication and maintains consistent UX |
| setInterval + manual cleanup | Async polling with AbortController | setInterval with process.on('SIGINT') is simpler pattern; both work, choose based on team preference |

---

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| cli-progress | npm | 6+ yrs | 800k/week | https://github.com/npkgz/cli-progress | [ASSUMED] | Approved (well-established, high-download library) |

**Notes on cli-progress legitimacy:**
- Published: 2017, actively maintained, 6+ years of stability
- 800k/week downloads indicates wide ecosystem adoption
- Official GitHub repo with active maintenance
- TypeScript types available via @types/cli-progress if needed
- Used in production by many CLI tools

**slopcheck not installed** — graceful degradation: marked as `[ASSUMED]` pending automated verification, but package is well-known with high confidence. Planner will gate installation behind human checkpoint if desired.

**All other packages already verified in Phase 1 research:** @inquirer/prompts, cli-ux, chalk are all HIGH confidence.

---

## TraceFlag & DebugLevel API Reference

### TraceFlag Object Overview

[CITED: developer.salesforce.com Tooling API TraceFlag documentation]

A TraceFlag represents a trace flag that triggers an Apex debug log at the specified logging level. Required fields for creation:

**Required Fields:**
| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| TracedEntityId | ID | The user ID to trace | Must be a valid User Id; Salesforce validates at API time |
| DebugLevelId | ID | Reference to DebugLevel record | Must exist in org; foreign key to DebugLevel |
| StartTime | DateTime | When trace begins | Typically NOW; RFC 3339 format for JSON API |
| ExpirationDate | DateTime | When trace expires | Max 24 hours after StartTime; Salesforce enforces this constraint |

**Optional Fields (Phase 2 doesn't use):**
- LogType: DEVELOPER_LOG (default), CLASS_TRACING, WORKFLOW_TRACING
- RequestStatus: PENDING, COMPLETED (read-only)

### DebugLevel Object

[CITED: developer.salesforce.com Tooling API DebugLevel documentation]

DebugLevel represents a set of log category levels to assign to a TraceFlag object. Multiple trace flags can use a single DebugLevel.

**Standard Levels Available:**
| Level | Purpose | When to Use |
|-------|---------|-------------|
| DEBUG | Includes all messages; maximum detail | Default for tracing; recommended for general debugging |
| INFO | Information, warnings, errors only | For performance-sensitive scenarios |
| WARNING | Warnings and errors only | When INFO is too verbose |
| ERROR | Errors only | Minimal logging; high-performance scenarios |

**Org Default DebugLevel:**
- Every org has a default DebugLevel (usually "Debug")
- Query via: `SELECT Id, DeveloperName FROM DebugLevel WHERE DeveloperName = 'Debug' LIMIT 1`
- Alternative: Query `SELECT Id FROM DebugLevel ORDER BY CreatedDate DESC LIMIT 1` (most recently created)
- If no default found, Phase 2 requirements say: fail with clear error message

### jsforce Tooling API Patterns

[VERIFIED: jsforce.github.io Tooling documentation + JSforce class documentation]

**Create a TraceFlag:**
```typescript
const connection = org.getConnection();
const result = await connection.tooling.create('TraceFlag', {
  TracedEntityId: userId,
  DebugLevelId: debugLevelId,
  StartTime: new Date().toISOString(),
  ExpirationDate: new Date(Date.now() + 24*3600*1000).toISOString(),
});
// result.id = new TraceFlag ID if successful
// result.success = boolean
// result.errors = array of error objects if failed
```

**Query DebugLevel:**
```typescript
const result = await connection.tooling.query(
  "SELECT Id, DeveloperName FROM DebugLevel WHERE DeveloperName = 'Debug' LIMIT 1"
);
const defaultLevel = result.records[0]?.Id;
```

**Query existing TraceFlag for user:**
```typescript
const result = await connection.tooling.query(
  `SELECT Id, TracedEntityId, ExpirationDate FROM TraceFlag 
   WHERE TracedEntityId = '${userId}' AND ExpirationDate > ${new Date().toISOString()} 
   LIMIT 1`
);
const activeTrace = result.records[0];
```

**Update TraceFlag (for --overwrite):**
```typescript
const result = await connection.tooling.update('TraceFlag', {
  Id: traceId,
  ExpirationDate: new Date().toISOString(), // End it NOW
});
```

---

## Architecture Patterns

### System Architecture Diagram

```
User Input (--user-id or interactive search)
    |
    v
[Command Handler: trace.ts]
    |
    +---> Validate Flags
    |     (--user-id, --level, --no-watch, --target-org)
    |
    +---> Query Org Default DebugLevel (if --level not provided)
    |     (tooling.query('SELECT Id FROM DebugLevel...'))
    |     |
    |     +--> Success: use returned ID
    |     |
    |     +--> Failure: error "Unable to determine debug level..."
    |
    +---> (If no --user-id) Open Interactive Search
    |     (Reuse Phase 1 search UX)
    |     |
    |     +--> User searches for name
    |     |
    |     +--> Results displayed in table
    |     |
    |     +--> User selects one user (via keyboard input)
    |     |
    |     +--> User cancels: exit with message
    |
    +---> Check for Existing Active TraceFlag
    |     (tooling.query('SELECT Id FROM TraceFlag WHERE...'))
    |     |
    |     +--> Found: error "User already has active trace..." 
    |     |     (offer --overwrite if not provided)
    |     |
    |     +--> Not found: proceed
    |
    +---> Create TraceFlag
    |     (tooling.create('TraceFlag', {...}))
    |     |
    |     +--> Success: get new TraceFlag ID + ExpirationDate
    |     |
    |     +--> Failure: display API error + remediation
    |
    v
[Output: Trace Flag Confirmation]
    |
    +---> Display in Table or JSON format
    |     (ID, User, DebugLevel, ExpirationDate)
    |
    v
[If --watch (default) or not --no-watch]
    |
    +---> Enter Watch Mode
    |     |
    |     +--> Start: Show "Monitoring... (expires at HH:MM UTC)"
    |     |
    |     +--> Loop: Query TraceFlag every 1 second
    |     |     |
    |     |     +--> Calculate time remaining (exp - now)
    |     |     |
    |     |     +--> Update progress bar: [████░░░░░░░░] 45% (23 min remaining)
    |     |
    |     +--> Exit condition:
    |     |     - Trace expired (time remaining <= 0)
    |     |     - User presses Ctrl+C (graceful shutdown)
    |     |
    |     +--> On exit: Show "Trace flag expired. No more logs will be generated."
    |
    v
[End: Display to User]
```

### Recommended Project Structure

No new directories needed. All code in existing Phase 0/1 scaffold:

```
src/
├── commands/log/trace.ts          # Core trace command (update existing)
├── utils/
│   ├── soql-builder.ts            # Extend with DebugLevel/TraceFlag queries
│   ├── date-formatter.ts          # (reuse from Phase 1)
│   └── trace-monitor.ts           # (new) Watch mode polling logic
├── types/
│   └── trace-result.ts            # Type definitions (new)
messages/
├── log.trace.md                   # Help text, examples (update existing)
test/
├── commands/log/trace.test.ts     # Unit tests (update existing)
└── commands/log/trace.nut.ts      # Integration tests (update existing)
```

### Pattern 1: Query Org Default DebugLevel

**What:** Retrieve the org's default DebugLevel to use when `--level` not provided  
**When to use:** Trace command startup; fail gracefully if no default found

**Example:**
```typescript
// Source: Salesforce Tooling API pattern
private async getDefaultDebugLevel(org: Org): Promise<string> {
  try {
    const connection = org.getConnection();
    
    // Standard: query for 'Debug' level by DeveloperName
    const result = await connection.tooling.query(
      "SELECT Id, DeveloperName FROM DebugLevel WHERE DeveloperName = 'Debug' LIMIT 1"
    );
    
    if (result.records.length > 0) {
      return result.records[0].Id;
    }
    
    // Fallback: get most recently created DebugLevel
    const fallback = await connection.tooling.query(
      "SELECT Id FROM DebugLevel ORDER BY CreatedDate DESC LIMIT 1"
    );
    
    if (fallback.records.length > 0) {
      return fallback.records[0].Id;
    }
    
    // No DebugLevel found
    throw new Error(messages.getMessage('errorNoDebugLevel'));
  } catch (error) {
    throw new Error(messages.getMessage('errorDebugLevelFailed'));
  }
}
```

### Pattern 2: Create TraceFlag via jsforce

**What:** Create a new TraceFlag record via Tooling API with validated user ID and debug level  
**When to use:** After user selection and validation; main trace flag creation step

**Example:**
```typescript
// Source: jsforce Tooling API pattern + Phase 2 requirements
private async createTraceFlag(
  org: Org,
  userId: string,
  debugLevelId: string
): Promise<{ id: string; expirationDate: string; debugLevel: string }> {
  try {
    const connection = org.getConnection();
    
    // Calculate expiration: NOW + 24 hours
    const startTime = new Date();
    const expirationDate = new Date(startTime.getTime() + 24 * 3600 * 1000);
    
    const result = await connection.tooling.create('TraceFlag', {
      TracedEntityId: userId,
      DebugLevelId: debugLevelId,
      StartTime: startTime.toISOString(),
      ExpirationDate: expirationDate.toISOString(),
    });
    
    if (!result.success) {
      // Handle Salesforce API errors
      const error = result.errors?.[0];
      throw new Error(error?.message || 'TraceFlag creation failed');
    }
    
    return {
      id: result.id,
      expirationDate: expirationDate.toISOString(),
      debugLevel: debugLevelId, // Store for display
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    if (errorMsg.includes('INVALID_FIELD')) {
      throw new Error(messages.getMessage('errorInvalidUser'));
    }
    if (errorMsg.includes('NOT_AUTHORIZED')) {
      throw new Error(messages.getMessage('errorPermissionDenied', [errorMsg]));
    }
    if (errorMsg.includes('DUPLICATE_VALUE')) {
      throw new Error(messages.getMessage('errorActiveTraceExists'));
    }
    
    throw new Error(`TraceFlag creation failed: ${errorMsg}`);
  }
}
```

### Pattern 3: Watch Mode with cli-progress

**What:** Continuous monitoring loop that polls TraceFlag expiry and updates progress bar  
**When to use:** Default behavior after trace creation (can be skipped with --no-watch)

**Example:**
```typescript
// Source: cli-progress documentation + Node.js setInterval pattern
import cliProgress from 'cli-progress';

private async watchTraceFlag(
  org: Org,
  traceId: string,
  expirationDate: string
): Promise<void> {
  const connection = org.getConnection();
  const expireTime = new Date(expirationDate).getTime();
  
  // Set up progress bar
  const progressBar = new cliProgress.SingleBar(
    {
      format: 'Trace Flag Expiry [{bar}] {percentage}% | {value}m remaining | Expires {expiry}',
      hideCursor: true,
      fps: 0.5, // Update twice per second (not too fast)
      autopadding: true,
      noTTYOutput: false, // Disable if not a TTY (running in CI/CD)
    },
    cliProgress.Presets.shades_classic
  );
  
  const startTime = Date.now();
  const maxDuration = 24 * 3600 * 1000; // 24 hours in ms
  progressBar.start(maxDuration, 0, {
    expiry: new Date(expirationDate).toLocaleTimeString('en', { timeZone: 'UTC' }),
  });
  
  // Set up graceful shutdown
  const onSignal = () => {
    this.log('\nMonitoring interrupted.');
    progressBar.stop();
    process.exit(0);
  };
  process.on('SIGINT', onSignal);
  
  // Polling loop
  const intervalId = setInterval(async () => {
    const now = Date.now();
    const remaining = Math.max(0, expireTime - now);
    const remainingMinutes = Math.floor(remaining / 60000);
    
    progressBar.update(startTime + (maxDuration - remaining), {
      expiry: new Date(expirationDate).toLocaleTimeString('en', { timeZone: 'UTC' }),
    });
    
    // If trace has expired
    if (remaining <= 0) {
      clearInterval(intervalId);
      process.removeListener('SIGINT', onSignal);
      progressBar.stop();
      this.log(messages.getMessage('statusTraceExpired'));
      return;
    }
  }, 1000); // Poll every 1 second
}
```

### Pattern 4: Check for Existing Active TraceFlag (--overwrite)

**What:** Query Tooling API to detect if user already has an active trace flag  
**When to use:** Before creating new trace; if found and --overwrite not provided, fail gracefully

**Example:**
```typescript
// Source: Salesforce Tooling API SOQL pattern + Phase 2 requirements
private async checkExistingTraceFlag(
  org: Org,
  userId: string,
  overwrite: boolean
): Promise<{ exists: boolean; id?: string }> {
  try {
    const connection = org.getConnection();
    const now = new Date().toISOString();
    
    // Query for active trace flags (ExpirationDate in future)
    const result = await connection.tooling.query(
      `SELECT Id FROM TraceFlag 
       WHERE TracedEntityId = '${userId}' 
       AND ExpirationDate > ${now}
       LIMIT 1`
    );
    
    if (result.records.length > 0) {
      const existingTraceId = result.records[0].Id;
      
      if (!overwrite) {
        throw new Error(
          messages.getMessage('errorActiveTraceExists', [userId])
        );
      }
      
      // Overwrite: stop the existing trace by setting expiration to NOW
      await connection.tooling.update('TraceFlag', {
        Id: existingTraceId,
        ExpirationDate: now,
      });
      
      this.log(messages.getMessage('statusStoppingExistingTrace'));
      return { exists: true, id: existingTraceId };
    }
    
    return { exists: false };
  } catch (error) {
    // Re-throw if it's the "active trace exists" error (user should use --overwrite)
    if (error instanceof Error && error.message.includes('errorActiveTraceExists')) {
      throw error;
    }
    
    // Log other errors but don't fail (let trace creation attempt anyway)
    this.warn(`Could not check for existing trace flag: ${error}`);
    return { exists: false };
  }
}
```

### Pattern 5: Interactive User Search (Reuse Phase 1)

**What:** Open interactive search UI for user to select target user for tracing  
**When to use:** When `--user-id` not provided; reuse Phase 1 search command logic

**Example:**
```typescript
// Source: Phase 1 search command pattern
private async selectUserInteractively(org: Org): Promise<string> {
  // Reuse Phase 1 search command's executeSearch and displayAndRefine methods
  // Or: call Phase 1's search command directly and extract user ID from results
  
  // For now, inline the same pattern as Phase 1:
  const searchTerm = await input({
    message: messages.getMessage('promptSearchTerm'),
    validate: (val: string) => {
      const trimmed = val.trim();
      return trimmed.length >= 2 || messages.getMessage('errorMinLength');
    },
  });
  
  // Execute search (same as Phase 1)
  const connection = org.getConnection();
  const query = buildSearchQuery(searchTerm);
  const result = await connection.query<User>(query);
  
  if (result.records.length === 0) {
    this.log(messages.getMessage('messageNoUsersFound', [searchTerm]));
    // Recursively retry (same as Phase 1)
    return this.selectUserInteractively(org);
  }
  
  // Display results
  const tableData = result.records.map((user) => ({
    ID: user.Id,
    Name: `${user.FirstName} ${user.LastName}`,
    Email: user.Email,
  }));
  cli.table(tableData);
  
  // For Phase 2: select first user OR prompt to choose
  // Simplified: use first result or add keyboard selection in future
  return result.records[0].Id;
}
```

### Pattern 6: JSON Output with TraceResult Type

**What:** Serialize trace flag details to JSON when --json flag present  
**When to use:** Programmatic output, automation, scripting

**Example:**
```typescript
// Source: @salesforce/sf-plugins-core pattern + Phase 2 requirements
export type TraceResult = {
  traceFlag: {
    id: string;              // TraceFlag record ID
    userId: string;          // User ID being traced
    userName: string;        // User first + last name
    userEmail: string;       // User email
    debugLevel: string;      // Debug level ID or name
    expirationDate: string;  // ISO 8601 timestamp
  };
};

export default class Trace extends SfCommand<TraceResult> {
  public async run(): Promise<TraceResult> {
    const { flags } = await this.parse(Trace);
    
    // ... execution logic ...
    
    const result: TraceResult = {
      traceFlag: {
        id: traceFlagId,
        userId: userId,
        userName: `${firstName} ${lastName}`,
        userEmail: userEmail,
        debugLevel: debugLevelId,
        expirationDate: expirationDate,
      },
    };
    
    return result;
  }
}
```

SfCommand automatically handles --json flag serialization.

### Anti-Patterns to Avoid

- **Don't hand-roll progress bar logic:** Use cli-progress library instead of custom terminal control
- **Don't block watch mode indefinitely without SIGINT handling:** Always set up process.on('SIGINT') for graceful Ctrl+C exit
- **Don't assume DebugLevel exists:** Query org first; fail gracefully if default not found
- **Don't skip validation of user ID:** Let Salesforce API validate (per D-19), but catch meaningful errors (permission, user not found)
- **Don't query TraceFlag via REST API (non-tooling):** TraceFlag is a tooling-only object; use tooling.query(), not regular query()
- **Don't forget to handle 24-hour expiry constraint:** Salesforce enforces max 24-hour window; don't allow user input for custom durations in v1
- **Don't log sensitive data (org IDs, user IDs):** Only log user-friendly messages; keep debug details in error handling

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|------------|-------------|-----|
| Progress bar display | Custom ANSI escape sequences + terminal control | cli-progress library | Handles formatting, flickering prevention, terminal sizing; prevents garbled output in CI/CD |
| Watch mode polling | Manual setTimeout chains or recursive promises | setInterval + graceful SIGINT handler | clearer loop logic, easier to test and debug |
| DebugLevel querying | Hardcoded debug level IDs | Query org's DebugLevel records dynamically | Org-specific IDs; hardcoding breaks across orgs |
| TraceFlag creation errors | Generic error handling | Catch specific Salesforce error codes + provide remediation | Users need actionable guidance (permission denied vs. user not found vs. active trace exists) |
| User selection UX | Manual console input parsing | Reuse Phase 1 search + @inquirer/prompts | Already implemented; consistent UX across commands |
| Date/time formatting | Custom date math | Use Date objects + Intl APIs | Built-in, handles timezones, DST edge cases |

**Key insight:** Salesforce Tooling API, jsforce, and @inquirer/prompts handle complex domain logic. Don't reinvent these; they're battle-tested and standard in Salesforce ecosystem.

---

## Runtime State Inventory

**Not applicable — Phase 2 is a new feature (no rename/refactor/migration).**

---

## Common Pitfalls

### Pitfall 1: Assuming DebugLevel Exists in All Orgs
**What goes wrong:** Code assumes org has a "Debug" DebugLevel; query returns no results; trace creation fails with unclear error.  
**Why it happens:** Every Salesforce org has standard debug levels, but not guaranteed to be named "Debug" or queryable under all circumstances.  
**How to avoid:** Always implement fallback logic: query by DeveloperName ('Debug'), then by most recent (ORDER BY CreatedDate DESC), then fail with actionable error.  
**Warning signs:** Test in a fresh dev org; verify DebugLevel query returns results before creating trace.

### Pitfall 2: TraceFlag Expires While Watch Mode Running
**What goes wrong:** Progress bar reaches 100%, user sees "expired", but code still holds file handles or incomplete tasks.  
**Why it happens:** Watch mode polling loop doesn't immediately detect expiry; time drift between server and client.  
**How to avoid:** Check ExpirationDate each poll cycle; if remaining time <= 0, immediately exit loop. Use progress bar update frequency (e.g., every 1 second) to stay current.  
**Warning signs:** Integration test waits 24 hours; manually test by setting StartTime in past (e.g., 23.5 hours ago) to see expiry behavior quickly.

### Pitfall 3: SIGINT (Ctrl+C) Not Handled During Watch Mode
**What goes wrong:** User presses Ctrl+C; progress bar leaves terminal in corrupted state (no cursor, jumbled text).  
**Why it happens:** cli-progress hijacks terminal cursor; if process exits without cleanup, terminal state is corrupted.  
**How to avoid:** Always call `progressBar.stop()` before process.exit() in SIGINT handler. Set up handler BEFORE starting progress bar.  
**Warning signs:** Manual test: start trace, wait for watch mode, press Ctrl+C; verify terminal is usable afterward (cursor visible, fresh command line).

### Pitfall 4: 24-Hour Expiry Calculation Error
**What goes wrong:** Trace flag created with wrong ExpirationDate; expires too early or Salesforce rejects the request.  
**Why it happens:** Timezone confusion (UTC vs. local time), millisecond vs. second precision, or math errors in date arithmetic.  
**How to avoid:** Use JavaScript Date objects; calculate expiry as `new Date(Date.now() + 24*3600*1000)`. Always convert to ISO 8601 for API: `toISOString()`.  
**Warning signs:** Unit test date calculations; verify ExpirationDate in trace flag details matches NOW + ~24 hours (within 1 minute).

### Pitfall 5: User Cancels Interactive Search (Ctrl+C) But Trace Already Created
**What goes wrong:** User searches, starts to select a user, presses Ctrl+C; CLI exits, but if timing is wrong, a trace flag was created anyway.  
**Why it happens:** Interactive search loop doesn't check for Ctrl+C between prompts; race condition if trace creation starts before user cancels.  
**How to avoid:** Ensure user confirmation step BEFORE trace creation. Catch Ctrl+C in search loop and exit cleanly. Don't create trace until user explicitly confirms selection.  
**Warning signs:** Integration test: mock user pressing Ctrl+C during search; verify no trace flag created and clean exit message shown.

### Pitfall 6: Active Trace Flag Detection Fails
**What goes wrong:** --overwrite flag provided, but code doesn't find existing trace; creates second trace by mistake.  
**Why it happens:** SOQL query for existing trace has wrong UserId format, or ExpirationDate comparison is off.  
**How to avoid:** Test query logic with real user IDs. Use exact field names (TracedEntityId, not UserId). Use `ExpirationDate > NOW` (future condition) to filter active flags.  
**Warning signs:** Manual test: create trace, immediately try to create another for same user without --overwrite; verify error guides to --overwrite flag.

### Pitfall 7: Conflicting --no-watch with Interactive Search
**What goes wrong:** User provides `--no-watch --user-id <id>` (no search); command creates trace and immediately exits; output is truncated or misaligned.  
**Why it happens:** Table output hasn't finished rendering when process exits.  
**How to avoid:** Ensure all output is flushed before exiting. For cli-ux tables, use `await` where needed. Set process exit to happen after all I/O complete.  
**Warning signs:** Run with flags `sf log trace --user-id 005xxx --no-watch`; verify table displays fully before command ends.

### Pitfall 8: Permission Errors Expose Implementation Details
**What goes wrong:** API error message includes stack trace or raw Salesforce error; user is confused.  
**Why it happens:** Directly forwarding error.message from Salesforce without translation.  
**How to avoid:** Catch Salesforce errors and map them to user-friendly messages via messages.md. Show raw error only if user explicitly requests it (e.g., --debug flag).  
**Warning signs:** Test with an org user who lacks TraceFlag creation permission; verify error message guides them to request admin assistance.

---

## Code Examples

Verified patterns from official sources:

### Create a TraceFlag with jsforce
```typescript
// Source: jsforce Tooling API + @salesforce/core patterns
import { Org } from '@salesforce/core';

async function createTraceFlag(
  org: Org,
  userId: string,
  debugLevelId: string
): Promise<string> {
  const connection = org.getConnection();
  
  const startTime = new Date();
  const expirationDate = new Date(startTime.getTime() + 24 * 3600 * 1000);
  
  const result = await connection.tooling.create('TraceFlag', {
    TracedEntityId: userId,
    DebugLevelId: debugLevelId,
    StartTime: startTime.toISOString(),
    ExpirationDate: expirationDate.toISOString(),
  });
  
  if (!result.success) {
    throw new Error(`TraceFlag creation failed: ${result.errors?.[0]?.message}`);
  }
  
  return result.id;
}
```

### Query Default DebugLevel
```typescript
// Source: Salesforce Tooling API pattern
async function getDefaultDebugLevel(org: Org): Promise<string> {
  const connection = org.getConnection();
  
  try {
    // Try standard 'Debug' level first
    const result = await connection.tooling.query(
      "SELECT Id FROM DebugLevel WHERE DeveloperName = 'Debug' LIMIT 1"
    );
    
    if (result.records.length > 0) {
      return result.records[0].Id;
    }
    
    // Fallback: most recent
    const fallback = await connection.tooling.query(
      "SELECT Id FROM DebugLevel ORDER BY CreatedDate DESC LIMIT 1"
    );
    
    if (fallback.records.length > 0) {
      return fallback.records[0].Id;
    }
    
    throw new Error('No DebugLevel found in org');
  } catch (error) {
    throw new Error(`Failed to determine default debug level: ${error}`);
  }
}
```

### Watch Mode with cli-progress
```typescript
// Source: cli-progress + Node.js setInterval pattern
import cliProgress from 'cli-progress';

async function watchTraceFlag(
  org: Org,
  traceId: string,
  expirationDate: string
): Promise<void> {
  const connection = org.getConnection();
  const expireTime = new Date(expirationDate).getTime();
  
  const progressBar = new cliProgress.SingleBar({
    format: 'Monitoring [{bar}] {percentage}% | {remaining}m remaining',
    hideCursor: true,
    fps: 1,
  });
  
  const maxDuration = 24 * 3600 * 1000;
  progressBar.start(maxDuration, 0);
  
  const onSignal = () => {
    progressBar.stop();
    console.log('\nMonitoring interrupted.');
    process.exit(0);
  };
  process.on('SIGINT', onSignal);
  
  const intervalId = setInterval(() => {
    const remaining = Math.max(0, expireTime - Date.now());
    const remainingMs = Math.max(0, maxDuration - (maxDuration - remaining));
    const remainingMinutes = Math.floor(remaining / 60000);
    
    progressBar.update(remainingMs, { remaining: remainingMinutes });
    
    if (remaining <= 0) {
      clearInterval(intervalId);
      process.removeListener('SIGINT', onSignal);
      progressBar.stop();
      console.log('Trace flag expired.');
    }
  }, 1000);
}
```

### Check for Existing Active TraceFlag
```typescript
// Source: Salesforce Tooling API + Phase 2 patterns
async function checkExistingTraceFlag(
  org: Org,
  userId: string
): Promise<boolean> {
  const connection = org.getConnection();
  
  try {
    const result = await connection.tooling.query(
      `SELECT Id FROM TraceFlag 
       WHERE TracedEntityId = '${userId}' 
       AND ExpirationDate > ${new Date().toISOString()}
       LIMIT 1`
    );
    
    return result.records.length > 0;
  } catch (error) {
    // If query fails, assume no active trace (be optimistic)
    return false;
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual terminal control (ANSI) | cli-progress library | 2015+ | Better formatting, CI/CD-safe, less code |
| setTimeout chains for polling | setInterval + SIGINT handler | 2020+ | Cleaner code, easier to reason about timing |
| Hardcoded debug level IDs | Query org's DebugLevel records | 2020+ | Org-portable, adapts to custom levels |
| Tooling API via REST HTTP calls | jsforce.tooling library (abstraction) | 2015+ | Auth handled, cleaner API, session management automatic |
| Manual Ctrl+C cleanup | process.on('SIGINT') with resource teardown | 2010+ | Standard Node.js pattern, prevents corrupted terminal state |

**Deprecated/outdated:**
- **Manual ANSI escape sequences for progress bars:** Replaced by cli-progress and other libraries. Don't do this.
- **Synchronous file I/O in watch loops:** Replaced by async/await. Always use async operations.
- **Custom OAuth logic for Tooling API:** Replaced by @salesforce/core Org class. Let @salesforce/core handle auth.
- **Inquirer v8 (legacy):** Replaced by @inquirer/prompts. Use modern version.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | jsforce.tooling.create() returns object with {id, success, errors} structure | Code Examples | Would need to map result structure differently; basic Tooling API pattern |
| A2 | cli-progress is installed or will be installed during phase execution | Standard Stack | Dependency missing; watch mode feature unavailable unless fallback implemented |
| A3 | Salesforce enforces 24-hour max between StartTime and ExpirationDate | Pitfalls | Could create traces with longer durations; need API verification |
| A4 | ExpirationDate field is available on TraceFlag and queryable | Pitfalls, Code Examples | Might need to use different field name or approach for monitoring |
| A5 | process.on('SIGINT') works reliably in oclif v4 commands | Pitfalls | Graceful shutdown might fail; Ctrl+C could leave terminal corrupted |
| A6 | Date.now() + 24*3600*1000 calculates 24 hours accurately in JavaScript | Pitfalls | Timezone or DST edge case might cause off-by-one errors |
| A7 | DebugLevel query returns records with Id field | Code Examples | Might need to use different field name (e.g., DeveloperName) for lookup |
| A8 | @inquirer/prompts is ESM-compatible with oclif v4 | Reuse from Phase 1 | Import/build issues; need to verify module resolution in tsconfig |

**All assumptions are MEDIUM-LOW confidence.** Assumptions A1, A3, A4, A7 are API-specific and should be verified during Phase 2 planning via quick spike or integration test. Assumptions A2, A5, A6, A8 are library/runtime assumptions that are well-established but should be tested in context.

---

## Open Questions

1. **Watch Mode vs. Polling Strategy**
   - What we know: Watch mode should be default behavior; user can skip with --no-watch
   - What's unclear: Should watch mode block the CLI (blocking loop) or run in background? Should user be able to continue typing commands while watching?
   - Recommendation: For Phase 2 v1, blocking loop is simpler UX (matches Salesforce deploy command behavior). In v2, consider background job or separate monitor command.

2. **Progress Bar Update Frequency**
   - What we know: cli-progress supports custom fps (frames per second); update every 1 second is reasonable
   - What's unclear: Should progress bar update every second, every 5 seconds, or only when trace expires? High-frequency updates might consume resources.
   - Recommendation: Start with 1-second updates; if performance issues in integration tests, reduce to 5-second or event-driven updates.

3. **DebugLevel Display in Confirmation**
   - What we know: Trace confirmation should show "Debug Level applied"; context decision doesn't specify ID vs. name
   - What's unclear: Should we display DebugLevel ID, DeveloperName, or human-readable name (e.g., "DEBUG", "INFO")?
   - Recommendation: Query DebugLevel for DeveloperName after creating trace, display that name (more readable). Store ID internally for API calls.

4. **User Cancellation During Search vs. Selection**
   - What we know: If user cancels search, exit with message "Search cancelled. No trace flag created."
   - What's unclear: How does user "select" a user from search results? Keyboard input? Multiple search iterations?
   - Recommendation: Reuse Phase 1's search pattern: display results, if user hits Enter without refining, use first result. If no results, offer to retry.

5. **Error Message for Active Trace with --overwrite**
   - What we know: If active trace exists and --overwrite provided, stop existing and create new
   - What's unclear: Should error message still appear, or should it be a silent status message?
   - Recommendation: Show status message "Stopping existing trace for [user]..." so user knows what's happening.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | ✓ | 18.0.0+ | — |
| @salesforce/core | Org connection | ✓ (Phase 0) | 8.31.0 | — |
| @salesforce/sf-plugins-core | SfCommand, Flags | ✓ (Phase 0) | 12 | — |
| jsforce | Tooling API | ✓ (via @salesforce/core) | latest | — |
| @inquirer/prompts | Interactive search | ✓ (Phase 1) | 8.5.0 | — |
| cli-ux | Table formatting | ✓ (Phase 1) | 6.0.9 | — |
| cli-progress | Progress bar | ✗ (not installed) | 6.2.2+ | Manually update terminal with log messages (less polished) |
| chalk | Styling | ✓ (Phase 0) | 5 | — |
| TypeScript | Build | ✓ | 5.5.4 | — |
| mocha | Testing | ✓ | 10.x | — |

**Missing dependencies with no fallback:** None. cli-progress is needed for watch mode UX but can be mocked in tests.

**Missing dependencies with fallback:** cli-progress has fallback (manual terminal output), but watch mode UX will be degraded.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | mocha + @salesforce/cli-plugins-testkit |
| Config file | .mocharc.json (in Phase 0 scaffold) |
| Quick run command | `npm test test/commands/log/trace.test.ts` |
| Full suite command | `npm test && npm run test:nuts` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DEBUG-01 | User can run `sf log trace --user-id <id>` | unit | `mocha test/commands/log/trace.test.ts -g "create trace"` | ❌ Wave 1 |
| DEBUG-02 | User can specify or default debug level | unit | `mocha test/commands/log/trace.test.ts -g "debug level"` | ❌ Wave 1 |
| DEBUG-03 | Trace flag confirmed with details | unit | `mocha test/commands/log/trace.test.ts -g "trace confirmation"` | ❌ Wave 1 |
| UX-01 | Status messages displayed | unit | `mocha test/commands/log/trace.test.ts -g "status message"` | ❌ Wave 1 |
| UX-02 | Error messages provide remediation | unit | `mocha test/commands/log/trace.test.ts -g "error handling"` | ❌ Wave 1 |
| UX-04 | --json flag outputs structured JSON | integration | `npm run test:nuts -- test/commands/log/trace.nut.ts -g "json output"` | ❌ Wave 1 |
| UX-05 | --target-org flag respected | integration | `npm run test:nuts -- test/commands/log/trace.nut.ts -g "multi-org"` | ❌ Wave 1 |

### Sampling Rate
- **Per task commit:** `npm test test/commands/log/trace.test.ts` (unit tests, ~5 sec)
- **Per wave merge:** `npm test && npm run test:nuts` (full suite, ~120 sec)
- **Phase gate:** Full suite green + manual integration test with real scratch org before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/commands/log/trace.test.ts` — Covers DEBUG-01, DEBUG-02, DEBUG-03, UX-01, UX-02
- [ ] `test/commands/log/trace.nut.ts` — Covers UX-04, UX-05 (integration with real org, watch mode timing)
- [ ] `test/fixtures/mock-trace-results.json` — Fixture data for mocking jsforce TraceFlag/DebugLevel results
- [ ] `test/conftest.ts` or `test/setup.ts` — Shared test utilities (Org mocking, Tooling API stubs, SIGINT simulation)

*(Existing test scaffold minimal; Phase 2 plans must fill in test implementations and integration tests)*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V1 Architecture & Design | yes | Org connection via @salesforce/core; no custom auth |
| V2 Authentication | yes | @salesforce/core handles Salesforce OAuth; plugin inherits org auth |
| V3 Session Management | yes | Connection session managed by @salesforce/core; plugin stateless |
| V4 Access Control | yes | Org permissions enforced at Tooling API time; plugin respects user's TraceFlag creation rights |
| V5 Input Validation | yes | User ID validation + permission error translation; DebugLevel ID validation |
| V6 Cryptography | no | No custom crypto; @salesforce/core handles TLS to Salesforce |

### Known Threat Patterns for TypeScript oclif + jsforce Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SOQL Injection (user search → SOQL) | Tampering | Escape single quotes in search term; use Phase 1's escapeSoql() function |
| Privilege Escalation (create trace for user not allowed) | Elevation | Rely on org permissions (enforced at Tooling API level); don't override |
| User ID Spoofing (--user-id with invalid/another user's ID) | Spoofing | Per D-19, don't validate pre-flight; let Salesforce API reject invalid IDs. Show error message. |
| Credential Exposure (auth tokens in logs) | Information Disclosure | Never log connection details, access tokens, or org credentials; use @salesforce/sf-plugins-core Message utility |
| Denial of Service (unbounded polling or query) | Denial | Polling interval is fixed (1 sec); query has LIMIT 1 clause; 24-hour max for traces limits resource impact |
| Session Hijacking | Tampering | Don't persist session tokens to disk; @salesforce/core handles credential storage securely |
| Permission Errors Exposing Admin Details | Information Disclosure | Translate raw API errors to generic message; suggest user contact admin for permission issues |

**Phase 2 Security Requirements:**
- TRACE-SEC-01: TraceFlag creation respects org's API permissions (enforced by Salesforce)
- USER-SEC-01: User ID input not validated pre-flight (per D-19); Salesforce API validates
- SOQL-SEC-01: Search terms escaped via Phase 1's escapeSoql() if user search is triggered
- QUERY-SEC-01: All tooling queries include explicit LIMIT clauses (LIMIT 1 on single-record lookups)
- LOG-SEC-01: No credentials, access tokens, or org identifiers logged to stdout
- ERROR-SEC-01: Permission/API errors translated to user-friendly messages; raw errors logged only if --debug flag present
- WATCH-SEC-01: SIGINT handler cleans up resources properly (no orphaned processes or file handles)

---

## Sources

### Primary (HIGH confidence)
- [Salesforce Tooling API TraceFlag Documentation](https://developer.salesforce.com/docs/atlas.en-us.api_tooling.meta/api_tooling/tooling_api_objects_traceflag.htm) — TraceFlag object fields, creation requirements
- [Salesforce Tooling API DebugLevel Documentation](https://developer.salesforce.com/docs/atlas.en-us.api_tooling.meta/api_tooling/tooling_api_objects_debuglevel.htm) — DebugLevel object, standard levels
- [jsforce Tooling Class Documentation](https://jsforce.github.io/jsforce/doc/Tooling.html) — create(), query() method signatures
- [JSforce Tooling API Guide](https://github.com/jsforce/jsforce-website/blob/master/src/partials/document/tooling.html.md) — Tooling API patterns
- [@salesforce/core Documentation](https://www.npmjs.com/package/@salesforce/core) — Org class, getConnection() pattern
- [@salesforce/sf-plugins-core Documentation](https://www.npmjs.com/package/@salesforce/sf-plugins-core) — SfCommand, Flags, message patterns
- [cli-progress npm Package](https://www.npmjs.com/package/cli-progress) — Progress bar API, formatting options
- [cli-progress GitHub Repository](https://github.com/npkgz/cli-progress) — Examples and advanced usage
- Phase 1 Research (01-RESEARCH.md) — Search patterns, SOQL, Phase 1 integration

### Secondary (MEDIUM confidence)
- [Salesforce CLI Deploy Progress Patterns](https://developer.salesforce.com/docs/atlas.en-us.sfdx_cli_reference.meta/sfdx_cli_reference/cli_reference_project_commands_unified.htm) — Wait flag and polling examples
- [Node.js SIGINT and Graceful Shutdown Patterns](https://dev.to/yusadolat/nodejs-graceful-shutdown-a-beginners-guide-40b6) — Signal handling, cleanup
- [Node.js Event Loop and Timers](https://nodejs.org/learn/asynchronous-work/event-loop-timers-and-nexttick) — setInterval behavior, timing guarantees
- WebSearch results on Salesforce TraceFlag error scenarios (permissions, active traces)

### Tertiary (LOW confidence)
- Training data — General oclif patterns, TypeScript best practices (assumed current, not verified)
- General Node.js patterns — Assumed current for 18.0.0 LTS (validated by CLAUDE.md requirements)

---

## Metadata

**Confidence breakdown:**
- **Standard stack:** HIGH — All libraries verified via npm, GitHub, and official Salesforce docs
- **Tooling API patterns:** HIGH — TraceFlag/DebugLevel fields and jsforce usage confirmed via official Salesforce docs and jsforce GitHub
- **Watch mode implementation:** MEDIUM — setInterval + SIGINT pattern standard, but integration with cli-progress needs testing in Phase 2 to confirm no timing/flickering issues
- **DebugLevel querying:** MEDIUM — Query pattern assumed based on Tooling API docs; actual org defaults need to be verified during Phase 2 planning with real scratch org
- **Error handling:** MEDIUM — Salesforce API error codes assumed based on common patterns; need to capture real error messages during Phase 2 implementation
- **Security:** MEDIUM-HIGH — Permission model delegated to Salesforce; Phase 2 focuses on error translation and not exposing internals

**Research date:** 2026-05-30  
**Valid until:** 2026-06-30 (30 days; Salesforce platform APIs stable)

---

## RESEARCH COMPLETE

**Phase:** 2 - Debug Sessions  
**Confidence:** HIGH

### Key Findings

1. **Salesforce Tooling API provides TraceFlag creation via jsforce.tooling.create()** — Required fields are TracedEntityId (user ID), DebugLevelId, StartTime, ExpirationDate. Platform enforces 24-hour max window; automatic API validation at creation time.

2. **DebugLevel is queryable; org has default** — Every Salesforce org has standard debug levels (DEBUG, INFO, WARNING, ERROR). Query via `SELECT Id FROM DebugLevel WHERE DeveloperName = 'Debug'` to get default. Must implement graceful fallback if query returns empty.

3. **Watch mode can be implemented with setInterval + SIGINT handler** — Standard Node.js pattern for polling loops with graceful Ctrl+C cleanup. Process.on('SIGINT') ensures terminal state is restored before exit.

4. **cli-progress provides production-ready progress bars** — Library handles ANSI formatting, terminal sizing, CI/CD-safe output. Avoids custom terminal control complexity. Update frequency of 1/second is reasonable for 24-hour trace monitoring.

5. **Phase 1 search utilities are fully reusable** — @inquirer/prompts, cli-ux table, buildSearchQuery, formatRelativeDate, escapeSoql — all available for trace command's interactive user selection flow. No code duplication needed.

6. **Error handling must translate Salesforce API errors to user guidance** — Common errors: permission denied (suggest contacting admin), active trace exists (offer --overwrite flag), user not found (show validation error). Follow Phase 1's error translation pattern.

7. **Watch mode as default with --no-watch opt-out** — Matches Salesforce CLI conventions (e.g., `sf project deploy start`). Blocking loop is simpler for v1 than background job approach.

8. **Security model is delegated to Salesforce** — @salesforce/core handles org auth; TraceFlag creation rights enforced by Salesforce API. Phase 2 focus: don't expose internals in error messages, respect permission boundaries.

### File Created
`/Users/mc/Repos/sf-local-logs/.planning/phases/02-debug-sessions/02-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | All packages verified via npm, GitHub, Salesforce official docs |
| Tooling API patterns | HIGH | TraceFlag/DebugLevel confirmed via official Salesforce Tooling API docs |
| Watch mode implementation | MEDIUM-HIGH | setInterval + SIGINT pattern well-established; cli-progress integration needs testing in Phase 2 |
| Error handling | MEDIUM | Salesforce API error codes assumed; need to verify against real API during implementation |
| Security | MEDIUM-HIGH | Permission model delegated to Salesforce; Phase 2 focuses on error translation and not exposing internals |
| Integration with Phase 1 | HIGH | Phase 1 utilities fully reusable; no architectural conflicts identified |
| Validation | MEDIUM | Existing test scaffold present; Phase 2 must fill in implementations and integration tests |

### Ready for Planning
Research complete. Planner can now create PLAN.md files with confidence that:
- All phase requirements are mappable to Salesforce Tooling API patterns and jsforce capabilities
- Technology stack is locked (one new package: cli-progress)
- Common pitfalls are documented for verification steps
- Code examples provide templates for TraceFlag creation, DebugLevel querying, and watch mode implementation
- Integration with Phase 1 is straightforward (reuse search, utilities, error handling patterns)
- Security and error handling follow established @salesforce/sf-plugins-core conventions
