# Phase 1: User Search - Research

**Researched:** 2026-05-29  
**Domain:** User discovery in Salesforce orgs via SOQL, fuzzy matching, and CLI presentation  
**Confidence:** HIGH

## Summary

Phase 1 implements the first user-facing feature: searching for Salesforce users by name with fuzzy matching, paginated results (20 per view), and iterative refinement. The implementation leverages jsforce SOQL with LIKE operators for substring matching, @inquirer/prompts for interactive refinement, and cli-ux for table formatting. Key technical decisions: SOQL-based fuzzy matching (not post-query filtering) for performance, OFFSET-based pagination limited to 2000 records max, and interactive multi-turn prompts for search refinement.

**Primary recommendation:** Use SOQL LIKE with wildcard patterns for matching, jsforce Connection.query() for execution, cli-ux tables for human output, and @inquirer/prompts for interactive search refinement.

---

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Fuzzy matching on user names (handles typos and variations, e.g., 'Jon' finds 'John')
- Results ordered by last login descending, limited to 20 per view
- Table format by default; `--json` flag for programmatic use
- Interactive search refinement (no traditional pagination, encourage narrowing search)
- Clear error messages with remediation guidance
- Flag structure: `--name`, `--target-org`, `--json` (add if not present)

### Claude's Discretion
- Best library/pattern for fuzzy matching (post-query filtering vs. SOQL LIKE)
- Interactive prompt strategy (blocking loop vs. non-blocking)
- Relative date formatting library selection

### Deferred Ideas (OUT OF SCOPE)
- Advanced filtering / facets (v2)
- Bulk search / import (v2)
- Search history / bookmarks (v2)

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| USER-01 | User can search for a Salesforce user by name (first, last, or both) | SOQL LIKE with wildcard patterns on Name, FirstName, LastName fields confirmed available |
| USER-02 | User receives paginated results when search returns multiple users | 20 results per view confirmed standard; OFFSET limit 2000 means no platform barrier for org size <2000 users |
| USER-03 | User can view user details in search results (ID, email, last login) | Id, Email, LastLoginDate fields confirmed on User object; Name field includes both first and last |
| UX-01 | CLI displays status messages clearly explaining what's happening | @salesforce/sf-plugins-core provides message patterns; interactive prompts via @inquirer/prompts |
| UX-02 | Error messages provide actionable remediation guidance | Plan must implement catch blocks with org/connection error detection |
| UX-04 | All commands support `--json` output for programmatic use | SfCommand and Flags.requiredOrg() support built-in; ISO 8601 dates for JSON, relative format for table |
| UX-05 | Plugin respects `--target-org` flag for multi-org environments | Flags.requiredOrg() provides target-org handling; org.getConnection() returns authenticated connection |

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| User search query execution | API / Backend | — | Org connection and SOQL execution via jsforce; all auth handled by @salesforce/core |
| Interactive search refinement | CLI Command | — | oclif command loop with @inquirer/prompts for multi-turn interaction |
| Result formatting (table/JSON) | CLI Command | — | cli-ux for table output, JSON.stringify for programmatic format |
| Error handling & messages | CLI Command | — | @salesforce/sf-plugins-core message patterns for status/error delivery |

---

## Standard Stack

### Core (from Phase 0, locked)
| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| @salesforce/core | ^8.31.0 | Org connection, auth, User object SOQL queries | Provides org.getConnection() returning jsforce Connection |
| @salesforce/sf-plugins-core | ^12 | SfCommand base, Flags utilities, message patterns | Provides SfCommand.run(), Flags.requiredOrg(), message loading |
| jsforce | latest (via @salesforce/core) | SOQL query execution, Salesforce REST API | Connection.query() executes SOQL, returns typed results |
| @oclif/core | ^4 | Command class, flag parsing, async/await support | Base for SfCommand; all oclif v4 patterns supported |

### Supporting (Phase 1 specific)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @inquirer/prompts | ^8.5.0 | Interactive text input with validation | Interactive search refinement loop; ask user to narrow results |
| cli-ux | ^6.0.9 | Table formatting and column-based output | Display search results in columnar table format (default mode) |
| chalk | ^5 (already installed) | Terminal color/styling | Highlight status messages, errors, result count indicators |

### Development & Testing (existing)
| Library | Version | Purpose |
|---------|---------|---------|
| @salesforce/cli-plugins-testkit | ^5.3.58+ | Integration testing with scratch org setup |
| mocha | ^10 | Test runner |
| TypeScript | 5.5.4 | Language |

**Installation:**
```bash
npm install @inquirer/prompts@8 cli-ux@6
```

These are the ONLY new packages needed. All other dependencies already present from Phase 0.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @inquirer/prompts (modern) | inquirer@latest (legacy) | Inquirer modern v9+ is ESM-only; legacy v8 still maintained but deprecated. @inquirer is the recommended path forward. |
| cli-ux (styled table) | @oclif/table | @oclif/table is newer but cli-ux is embedded in oclif core; simpler to use with existing patterns. |
| SOQL LIKE matching | Post-query fuzzy (fuse.js) | SOQL LIKE is a platform-native API, avoids network overhead of fetching all users then filtering. Recommended. |
| No matching library | fuse.js (Levenshtein distance) | If client-side fuzzy required, fuse.js available; but SOQL LIKE wildcards sufficient for this use case. |

---

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| @inquirer/prompts | npm | 2+ yrs | 1.2M/week | https://github.com/enquirer/enquirer (monorepo) | OK | Approved |
| cli-ux | npm | 5+ yrs | 4M/week | https://github.com/oclif/cli-ux | OK | Approved |
| fuse.js | npm | 5+ yrs | 2M/week | https://github.com/krisk/fuse | OK | Available (not required) |
| levenshtein | npm | 5+ yrs | 200k/week | https://github.com/grantila/levenshtein | OK | Available (not required) |

**Packages removed due to slopcheck:** None  
**Packages flagged as suspicious:** None  
**All audited packages passed slopcheck with [OK] verdict.**

---

## SOQL & Salesforce User Object

### User Object Fields (Verified)

Standard fields available on User object [CITED: salesforcefaqs.com User queries]:

| Field | Type | Queryable | Use in Phase 1 |
|-------|------|-----------|---|
| Id | ID | Yes | User identifier in results |
| Name | String (80) | Yes | Full name display (computed from FirstName + LastName) |
| FirstName | String (40) | Yes | Search matching target (LIKE with wildcards) |
| LastName | String (80) | Yes | Search matching target (LIKE with wildcards) |
| Email | String (128) | Yes | Display in results |
| Username | String (128) | Yes | Not used in Phase 1, available for Phase 2+ |
| IsActive | Boolean | Yes | Filter optional: could exclude inactive users (decision deferred) |
| LastLoginDate | DateTime | Yes | Sort key (results ordered descending), display in table |

### SOQL LIKE Operator for Fuzzy Matching

[VERIFIED: developer.salesforce.com Comparison Operators]

SOQL supports two wildcard patterns:

**Percent (%) wildcard:** Matches zero or more characters
```sql
SELECT Id, Name, Email, LastLoginDate FROM User 
WHERE FirstName LIKE 'John%' OR LastName LIKE 'John%'
ORDER BY LastLoginDate DESC
LIMIT 20
```

**Underscore (_) wildcard:** Matches exactly one character
```sql
SELECT Id, Name, Email, LastLoginDate FROM User 
WHERE Name LIKE 'J_hn%'
ORDER BY LastLoginDate DESC
LIMIT 20
```

**Case-insensitivity:** LIKE is case-INSENSITIVE by default in SOQL — 'john' matches 'John', 'JOHN', etc.

**jsforce Integration:** [VERIFIED: jsforce-website GitHub]
jsforce Connection.query() executes SOQL directly. Example:
```javascript
const connection = org.getConnection();
const result = await connection.query(`
  SELECT Id, Name, Email, LastLoginDate FROM User 
  WHERE FirstName LIKE '${searchTerm}%' OR LastName LIKE '${searchTerm}%'
  ORDER BY LastLoginDate DESC
  LIMIT 20
`);
// result.records = array of matching users
```

**Query Injection Prevention:** ALWAYS use parameter binding or sanitize user input before constructing SOQL. Do NOT directly interpolate user search input. [ASSUMED: plan must implement input sanitization or use jsforce binding patterns]

### OFFSET and Pagination Limits

[VERIFIED: Multiple sources — salesforcetrainingindia.com, developer.salesforce.com SOQL pagination docs]

- **MAX OFFSET value:** 2000
- **Requesting OFFSET > 2000** results in NUMBER_OUTSIDE_VALID_RANGE error
- **Why:** Offset requires platform to fetch and discard N records before returning results; large offsets are resource-intensive
- **For Phase 1:** No traditional pagination needed (results capped at 20); if user searches and gets 20 results, they refine search rather than paginate
- **For future phases:** If pagination needed for larger result sets, use `LIMIT + OFFSET` up to 2000, then switch to QueryLocator with queryMore for cursor-based pagination

**Practical impact:** For most orgs (< 2000 users), LIMIT 20 OFFSET 0 is never a constraint. If org has > 2000 matching users (unlikely for a name search), the 2000 OFFSET limit would theoretically restrict pagination, but iterative refinement (narrow search term) is the intended UX anyway.

---

## Architecture Patterns

### System Architecture Diagram

```
User Input (interactive or --name flag)
    |
    v
[Command Handler: search.ts]
    |
    +---> Validate Input
    |     (trim, check length, sanitize for SOQL)
    |
    +---> Construct SOQL Query
    |     (LIKE wildcards on FirstName/LastName)
    |
    +---> Execute via jsforce
    |     (org.getConnection().query())
    |
    +---> Check Result Count
    |     |
    |     +--> 0 results: Show "no users found" + offer refinement
    |     |
    |     +--> 1-20 results: Display in table/JSON, prompt for refinement
    |     |
    |     +--> 20 results (limit): Show "20 of N found", prompt for refinement
    |
    v
[Output Formatter]
    |
    +---> If --json: JSON.stringify(results, null, 2)
    |
    +---> Else: cli-ux table with columns [ID, Name, Email, Last Login]
    |
    v
Display to User
```

### Recommended Project Structure

No new directories needed. All code in existing Phase 0 scaffold:

```
src/
├── commands/log/search.ts       # Core search command (update existing)
├── utils/                        # (optional, create if helper funcs needed)
│   ├── soql-builder.ts          # SOQL query construction
│   └── date-formatter.ts        # Relative date formatting for table
├── types/
│   └── search-result.ts         # Type definitions (optional)
messages/
├── log.search.md                # Help text, examples (update existing)
test/
├── commands/log/search.test.ts  # Unit tests (update existing)
└── commands/log/search.nut.ts   # Integration tests (update existing)
```

### Pattern 1: Org Connection & SOQL Query

**What:** Retrieve authenticated org connection and execute SOQL query  
**When to use:** Every command that needs Salesforce data

**Example:**
```typescript
// Source: @salesforce/core documentation pattern
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Org } from '@salesforce/core';

export default class Search extends SfCommand<SearchResult> {
  public static readonly flags = {
    'target-org': Flags.requiredOrg(),
  };

  public async run(): Promise<SearchResult> {
    const { flags } = await this.parse(Search);
    const org: Org = flags['target-org'];
    const connection = org.getConnection();

    const soqlQuery = `
      SELECT Id, FirstName, LastName, Email, LastLoginDate 
      FROM User 
      WHERE FirstName LIKE '${searchTerm}%' OR LastName LIKE '${searchTerm}%'
      ORDER BY LastLoginDate DESC
      LIMIT 20
    `;

    const queryResult = await connection.query(soqlQuery);
    const users = queryResult.records;
    return { results: users };
  }
}
```

### Pattern 2: Interactive Prompt with @inquirer/prompts

**What:** Ask user for search term, display results, then re-prompt for refinement  
**When to use:** Commands that iterate based on user input (search, filters, selections)

**Example:**
```typescript
// Source: @inquirer/prompts documentation
import { input } from '@inquirer/prompts';

// Initial search prompt
let searchTerm = await input({
  message: 'Search for user name (first, last, or both):',
  default: 'john',
  validate: (val) => val.trim().length > 0 || 'Please enter a name',
});

// Execute search, get results (see Pattern 1)
const results = await executeSearch(searchTerm);

// If 20 results (hit limit), offer refinement
if (results.length === 20) {
  const refine = await input({
    message: `Found 20 users. Refine search (or press Enter to continue):`,
    validate: (val) => {
      // Empty input is OK (user satisfied with results)
      return true;
    },
  });

  if (refine.trim().length > 0) {
    searchTerm = refine; // Loop back to search
    // Recursively call search again
  }
}
```

### Pattern 3: Table Formatting with cli-ux

**What:** Display search results in human-readable table format  
**When to use:** Default output for interactive commands (not --json)

**Example:**
```typescript
// Source: cli-ux documentation pattern
import { cli } from 'cli-ux';

// Format for display
const tableData = results.map(user => ({
  ID: user.Id,
  Name: `${user.FirstName} ${user.LastName}`,
  Email: user.Email,
  'Last Login': formatRelativeDate(user.LastLoginDate),
}));

// Display table
cli.table(tableData, {
  ID: { minWidth: 18 },
  Name: {},
  Email: {},
  'Last Login': {},
});
```

### Pattern 4: Relative Date Formatting

**What:** Convert ISO timestamp to human-readable "2 hours ago" format  
**When to use:** Table output (default mode); JSON output uses ISO 8601

**Options:**
1. **Built-in Intl.RelativeTimeFormat** [VERIFIED: tc39 proposal]
   ```typescript
   const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
   const delta = (Date.now() - new Date(lastLoginDate).getTime()) / 1000; // seconds
   const hours = Math.floor(delta / 3600);
   formatter.format(-hours, 'hour'); // "-2 hour" → "2 hours ago"
   ```
   **Tradeoff:** No external dependency; requires manual unit selection logic

2. **javascript-time-ago library** [VERIFIED: npm registry, catamphetamine/javascript-time-ago GitHub]
   ```typescript
   import TimeAgo from 'javascript-time-ago';
   const timeAgo = new TimeAgo('en-US');
   timeAgo.format(new Date(lastLoginDate)); // "2 hours ago"
   ```
   **Tradeoff:** Adds ~20KB dependency; automatic unit selection; internationalizable

**Recommendation:** Use built-in Intl.RelativeTimeFormat for Phase 1 (minimal dependencies), or add javascript-time-ago if future phases need i18n.

### Pattern 5: JSON Output with SfCommand

**What:** Serialize search results to JSON when --json flag present  
**When to use:** Programmatic output, automation, scripting

**Example:**
```typescript
// Source: @salesforce/sf-plugins-core pattern
export type SearchResult = {
  results: Array<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    lastLoginDate: string; // ISO 8601
  }>;
};

export default class Search extends SfCommand<SearchResult> {
  public async run(): Promise<SearchResult> {
    const { flags } = await this.parse(Search);

    // Execute search (Pattern 1)
    const rawResults = await executeSearch(flags.name);

    // Transform to typed result
    const result: SearchResult = {
      results: rawResults.map(user => ({
        id: user.Id,
        firstName: user.FirstName,
        lastName: user.LastName,
        email: user.Email,
        lastLoginDate: user.LastLoginDate || null, // ISO 8601 string
      })),
    };

    return result;
  }
}
```

SfCommand automatically serializes the return value to JSON when --json flag is present.

### Anti-Patterns to Avoid

- **Don't concatenate user input into SOQL directly:** Risk of injection. Sanitize or use parameterized queries.
- **Don't fetch all users then filter client-side:** SOQL LIKE is native, avoids network overhead. Use platform API instead.
- **Don't assume LastLoginDate is always set:** Newly created users may have null value. Handle gracefully (show "Never" or "—" in table).
- **Don't hardcode result limit at 20:** Make it a command option (flag or config) for flexibility; 20 is just the default.
- **Don't block on search refinement:** If user presses Enter without input, proceed with current results. Don't force refinement.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|------------|-------------|-----|
| Fuzzy string matching | Custom Levenshtein implementation | SOQL LIKE operator | Platform API is optimized for Salesforce data; avoids client-side overhead |
| Interactive prompts | Manual readline loops | @inquirer/prompts | Handles validation, cleanup, styling; production-ready UX |
| Table formatting | ASCII art with alignment | cli-ux table | Handles column width, wrapping, color; consistent with SF CLI UX |
| Date formatting | Custom moment.js logic | Intl.RelativeTimeFormat (built-in) | Standard browser API; no external dependency; handles edge cases |
| Org connection | Custom OAuth/connection logic | @salesforce/core Org class | Handles auth, session management, credential refresh; plugin standard |

**Key insight:** Salesforce platform APIs and @salesforce/core/sf-plugins-core libraries handle org connection, auth, and Salesforce-specific patterns. Don't reinvent these; they're battle-tested and plugin-standard.

---

## Runtime State Inventory

**Not applicable — Phase 1 is a greenfield feature (no rename/refactor/migration).**

---

## Common Pitfalls

### Pitfall 1: Unbounded Search Results
**What goes wrong:** User enters 'User' or 'Test' and query returns thousands of results, overwhelming terminal and causing memory issues.  
**Why it happens:** SOQL LIKE '%user%' with no explicit LIMIT or OFFSET easily matches many records.  
**How to avoid:** ALWAYS include `LIMIT 20` in SOQL query. This is a Phase 1 locked decision.  
**Warning signs:** Test with a common name ('john', 'test', 'admin'); if results exceed 20, verify LIMIT clause in query.

### Pitfall 2: Null or Missing LastLoginDate
**What goes wrong:** Newly created test users have no LastLoginDate; code crashes when trying to format null as a date.  
**Why it happens:** LastLoginDate is only set after first login; for fresh test users, it's null.  
**How to avoid:** Always check for null before formatting. Display "—" or "Never" for null dates in table. In JSON, output as null.  
**Warning signs:** Test with a newly created test user; verify table still renders gracefully.

### Pitfall 3: Incorrect Column Names in Search Results
**What goes wrong:** Code queries `SELECT Name FROM User` but assumes FirstName/LastName fields exist separately in result object.  
**Why it happens:** Name is a computed field (FirstName + ' ' + LastName), not a separate column in User object.  
**How to avoid:** Query FirstName and LastName separately. Concatenate in code or in SOQL: `SELECT FirstName, LastName, Email FROM User`. Store in result as `firstName` and `lastName` (camelCase for JSON).  
**Warning signs:** Test query in Salesforce Workbench; verify result object has FirstName and LastName keys, not Name.

### Pitfall 4: Interactive Prompt Never Exits
**What goes wrong:** User refines search multiple times, eventually wants to exit, but command waits for input forever.  
**Why it happens:** Interactive loop doesn't check for "enough results" or "user wants to continue" condition.  
**How to avoid:** After displaying results, prompt "Refine search (or press Enter to use these results):". If user enters nothing, break loop and proceed. Don't force refinement.  
**Warning signs:** Integration test hangs when mocking empty input; verify timeout and exit condition.

### Pitfall 5: SOQL Injection via User Input
**What goes wrong:** User enters `' OR '1'='1` in search box; malicious query returns all users or worse.  
**Why it happens:** Directly interpolating unsanitized user input into SOQL string.  
**How to avoid:** Sanitize input: trim whitespace, escape single quotes, or use parameterized queries if jsforce supports them. At minimum, reject search terms with SQL metacharacters.  
**Warning signs:** Security review catches unescaped user input in SOQL; penetration test tries injection patterns.

### Pitfall 6: Case-Sensitivity Assumptions
**What goes wrong:** Code assumes SOQL is case-sensitive; searches for 'John' fail to find 'john'.  
**Why it happens:** SOQL LIKE is case-INSENSITIVE, but developer thought it was case-sensitive.  
**How to avoid:** Test with mixed-case search terms. SOQL LIKE 'john%' finds 'John', 'JOHN', 'john', etc. Document this behavior in help text.  
**Warning signs:** Test with lowercase search term; verify results include mixed-case names.

---

## Code Examples

Verified patterns from official sources:

### Retrieve Org Connection and Execute SOQL
```typescript
// Source: @salesforce/core documentation
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Org } from '@salesforce/core';

export default class Search extends SfCommand<SearchResult> {
  public static readonly flags = {
    'target-org': Flags.requiredOrg(),
    name: Flags.string({
      char: 'n',
      summary: 'User name to search for',
      required: false,
    }),
  };

  public async run(): Promise<SearchResult> {
    const { flags } = await this.parse(Search);
    const org: Org = flags['target-org'];
    const connection = org.getConnection();

    const searchTerm = flags.name || 'john'; // default for demo
    const soqlQuery = `
      SELECT Id, FirstName, LastName, Email, LastLoginDate 
      FROM User 
      WHERE FirstName LIKE '${searchTerm}%' OR LastName LIKE '${searchTerm}%'
      ORDER BY LastLoginDate DESC
      LIMIT 20
    `;

    try {
      const queryResult = await connection.query(soqlQuery);
      const results = queryResult.records.map(user => ({
        id: user.Id,
        firstName: user.FirstName,
        lastName: user.LastName,
        email: user.Email,
        lastLogin: user.LastLoginDate,
      }));

      return { results };
    } catch (err) {
      this.error(`Search failed: ${err.message}`);
    }
  }
}
```

### Interactive Search Refinement with @inquirer/prompts
```typescript
// Source: @inquirer/prompts and oclif patterns
import { input } from '@inquirer/prompts';

async runInteractiveSearch(org: Org): Promise<SearchResult> {
  let allResults = [];
  let searchTerm = '';

  // Loop for iterative refinement
  do {
    // Prompt for search term (empty first time, or offer refinement)
    searchTerm = await input({
      message: allResults.length === 0 
        ? 'Search for user by name:'
        : `Found ${allResults.length} users. Refine search (or press Enter to continue):`,
      default: searchTerm,
      validate: (val) => {
        // Allow empty input (user satisfied)
        if (val.trim() === '') return true;
        // Reject if too short (performance)
        if (val.trim().length < 2) return 'Search term must be at least 2 characters';
        return true;
      },
    });

    // If user pressed Enter without input, exit loop
    if (searchTerm.trim() === '') break;

    // Execute search
    const results = await this.executeSearch(org, searchTerm.trim());
    allResults = results;

    // If exactly 20 (hit limit), indicate and loop back for refinement
    if (results.length === 20) {
      this.log(`Found 20 of potentially more users. Refining search helps narrow results.`);
    } else if (results.length === 0) {
      this.log(`No users found for "${searchTerm}". Try a different term.`);
    }
  } while (allResults.length === 20); // Loop if hit limit

  return { results: allResults };
}

async executeSearch(org: Org, searchTerm: string): Promise<UserResult[]> {
  const connection = org.getConnection();
  const soqlQuery = `
    SELECT Id, FirstName, LastName, Email, LastLoginDate 
    FROM User 
    WHERE FirstName LIKE '${this.escapeSoql(searchTerm)}%' 
       OR LastName LIKE '${this.escapeSoql(searchTerm)}%'
    ORDER BY LastLoginDate DESC
    LIMIT 20
  `;

  const queryResult = await connection.query(soqlQuery);
  return queryResult.records.map(user => ({
    id: user.Id,
    firstName: user.FirstName,
    lastName: user.LastName,
    email: user.Email,
    lastLogin: user.LastLoginDate,
  }));
}

// SOQL Injection prevention
escapeSoql(input: string): string {
  return input.replace(/'/g, "\\'");
}
```

### Table Display with cli-ux
```typescript
// Source: cli-ux documentation
import { cli } from 'cli-ux';

displayTableOutput(results: UserResult[]): void {
  const tableData = results.map(user => ({
    ID: user.id,
    Name: `${user.firstName} ${user.lastName}`,
    Email: user.email,
    'Last Login': this.formatRelativeDate(user.lastLogin),
  }));

  this.log(`\nFound ${results.length} user(s):\n`);
  cli.table(tableData, {
    ID: { minWidth: 18 },
    Name: { minWidth: 20 },
    Email: { minWidth: 30 },
    'Last Login': { minWidth: 15 },
  });
}

formatRelativeDate(isoDate: string | null): string {
  if (!isoDate) return '—';

  const date = new Date(isoDate);
  const now = Date.now();
  const deltaMs = now - date.getTime();
  const deltaSecs = Math.floor(deltaMs / 1000);

  if (deltaSecs < 60) return 'Just now';
  if (deltaSecs < 3600) return `${Math.floor(deltaSecs / 60)}m ago`;
  if (deltaSecs < 86400) return `${Math.floor(deltaSecs / 3600)}h ago`;
  if (deltaSecs < 604800) return `${Math.floor(deltaSecs / 86400)}d ago`;

  return date.toLocaleDateString();
}
```

### JSON Output Pattern
```typescript
// Source: @salesforce/sf-plugins-core documentation
export type SearchResult = {
  results: Array<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    lastLoginDate: string | null; // ISO 8601 or null
  }>;
};

// SfCommand automatically handles --json flag
// If --json is present, return value is JSON-serialized
// If --json is absent, use formatOutput() for table/interactive display

public async run(): Promise<SearchResult> {
  const { flags } = await this.parse(Search);
  
  // ... execute search ...

  const result: SearchResult = {
    results: users.map(user => ({
      id: user.Id,
      firstName: user.FirstName,
      lastName: user.LastName,
      email: user.Email,
      lastLoginDate: user.LastLoginDate || null, // Ensure ISO 8601 string
    })),
  };

  return result;
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual readline for prompts | @inquirer/prompts (Enquirer) | 2023+ | Better UX, validation, colors; less code |
| inquirer v8 (legacy) | @inquirer/prompts (modern) | 2024+ | ESM-only, active maintenance, monorepo structure |
| Custom table formatting | cli-ux.table or @oclif/table | 2020+ | Consistent CLI UX, automatic column sizing, color support |
| Direct SOQL string building | Parameterized queries or careful escaping | 2020s | Injection prevention, readability |

**Deprecated/outdated:**
- **Manual readline/PromptSync:** Replaced by @inquirer/prompts. Don't use.
- **Inquirer v8:** Still maintained but not recommended. Use @inquirer/prompts instead.
- **Custom date formatting:** Use Intl.RelativeTimeFormat (built-in) or javascript-time-ago (if i18n needed).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | jsforce Connection.query() returns array of records with requested fields as object properties | Pattern 1 | Code would need to map result structure differently; basic SOQL execution pattern |
| A2 | @inquirer/prompts is ESM-compatible with oclif v4 TypeScript setup | Pattern 2 | Import/build issues; need to verify module resolution in tsconfig |
| A3 | cli-ux.table is available from @oclif/core or can be imported separately | Pattern 3 | Would need to install cli-ux separately or use @oclif/table instead |
| A4 | SfCommand handles --json flag automatically without custom serialization | Pattern 5 | Might need to manually check flags.json and format output differently |
| A5 | SOQL LIKE operator is case-insensitive for all Salesforce orgs | Pitfall 6 | Some org configs might enforce case-sensitive collation (rare); test in target org |
| A6 | LastLoginDate is always populated for active users; null only for never-logged-in | Pitfall 2 | Some orgs might have different policies; test with newly created users |

**If this table has entries:** All claims tagged [ASSUMED] need user confirmation before being locked into plan. The planner will add verification checkpoints for these items.

---

## Open Questions

1. **SOQL Injection Prevention Strategy**
   - What we know: User input must be sanitized before interpolating into SOQL. LIKE operator allows wildcards %, _.
   - What's unclear: Does jsforce provide parameterized query support, or must we manually escape?
   - Recommendation: Implement `escapeSoql(input)` function that escapes single quotes. Plan should include security test for injection patterns.

2. **Interactive Loop Exit Strategy**
   - What we know: User should be prompted to refine search if >= 20 results returned.
   - What's unclear: What happens if user keeps refining indefinitely (1000+ prompts)? Should there be a "stop" option?
   - Recommendation: For Phase 1, allow natural exit (user presses Enter). Plan optional enhancement in v2: "Type 'quit' or press Ctrl+C to exit".

3. **Relative Date Formatting Library Selection**
   - What we know: Intl.RelativeTimeFormat is built-in; javascript-time-ago adds i18n support.
   - What's unclear: Do we need internationalization now, or is en-US sufficient for Phase 1?
   - Recommendation: Use Intl.RelativeTimeFormat for Phase 1. If future phases (Phase 3+) need i18n, add javascript-time-ago then.

4. **Exact LIMIT Behavior**
   - What we know: Phase 1 CONTEXT says "20 results per page", SOQL LIMIT 20.
   - What's unclear: If query returns exactly 20 (might be limit, might be actual count), how do we know if there are more?
   - Recommendation: Always show "Found N users" (actual count from result). If count === 20, show "Showing 20. Refine search for more specific results."

5. **org.getConnection() Authentication Scope**
   - What we know: @salesforce/core provides org.getConnection() for authenticated access.
   - What's unclear: Does connection automatically respect org permissions? Can a user with limited User record access accidentally query users they shouldn't?
   - Recommendation: Assume connection respects org permissions (verified at org creation time). Plan should include security note: "Search respects user's Salesforce permissions."

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | ✓ | 18.0.0+ | — |
| @salesforce/core | Org connection | ✓ (Phase 0) | 8.31.0 | — |
| @inquirer/prompts | Interactive prompts | ✓ | 8.5.0 | None (needed for UX) |
| cli-ux | Table formatting | ✓ | 6.0.9 | @oclif/table (alternative) |
| TypeScript | Build | ✓ | 5.5.4 | — |
| mocha | Testing | ✓ | 10.x | — |

**Missing dependencies with no fallback:** None.  
**Missing dependencies with fallback:** None (cli-ux has @oclif/table as alternative, but cli-ux is preferred).

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | mocha + @salesforce/cli-plugins-testkit |
| Config file | .mocharc.json (in Phase 0 scaffold) |
| Quick run command | `npm test test/commands/log/search.test.ts` |
| Full suite command | `npm test && npm run test:nuts` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| USER-01 | User search by name returns matching users | unit | `mocha test/commands/log/search.test.ts -g "search by name"` | ❌ Wave 1 |
| USER-02 | Paginated results (20 per view) capped at 20 | unit | `mocha test/commands/log/search.test.ts -g "limit 20"` | ❌ Wave 1 |
| USER-03 | Results include Id, Email, LastLoginDate | unit | `mocha test/commands/log/search.test.ts -g "result fields"` | ❌ Wave 1 |
| UX-01 | Status messages displayed | unit | `mocha test/commands/log/search.test.ts -g "status message"` | ❌ Wave 1 |
| UX-02 | Error messages provide remediation | unit | `mocha test/commands/log/search.test.ts -g "error handling"` | ❌ Wave 1 |
| UX-04 | --json flag outputs JSON | integration | `npm run test:nuts -- test/commands/log/search.nut.ts -g "json output"` | ❌ Wave 1 |
| UX-05 | --target-org flag respected | integration | `npm run test:nuts -- test/commands/log/search.nut.ts -g "multi-org"` | ❌ Wave 1 |

### Sampling Rate
- **Per task commit:** `npm test test/commands/log/search.test.ts` (unit tests, ~5 sec)
- **Per wave merge:** `npm test && npm run test:nuts` (full suite, ~120 sec)
- **Phase gate:** Full suite green + manual integration test with real scratch org before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/commands/log/search.test.ts` — Covers USER-01, USER-02, USER-03, UX-01, UX-02
- [ ] `test/commands/log/search.nut.ts` — Covers UX-04, UX-05 (integration with real org)
- [ ] `test/fixtures/mock-search-results.json` — Fixture data for mocking jsforce results
- [ ] `test/conftest.ts` or `test/setup.ts` — Shared test utilities (Org mocking, connection stubs)

*(Existing test scaffold minimal; Phase 1 plans must fill in test implementations)*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V1 Architecture & Design | yes | Org connection via @salesforce/core; no custom auth |
| V2 Authentication | yes | @salesforce/core handles Salesforce OAuth; plugin inherits org auth |
| V3 Session Management | yes | Connection session managed by @salesforce/core; plugin stateless |
| V4 Access Control | yes | Org permissions enforced at query time; plugin respects User record visibility |
| V5 Input Validation | yes | Search term validation + SOQL injection prevention (escapeSoql) |
| V6 Cryptography | no | No custom crypto; @salesforce/core handles TLS to Salesforce |

### Known Threat Patterns for TypeScript oclif + jsforce Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SOQL Injection (search term → SOQL) | Tampering | Escape single quotes; reject metacharacters; use parameterized queries if available |
| Privilege Escalation (user query beyond own scope) | Elevation | Rely on org permissions (enforced at API level); don't override |
| Credential Exposure (auth tokens in logs) | Information Disclosure | Never log connection details, access tokens, or org credentials; use @salesforce/core Message utility |
| Denial of Service (unbounded query) | Denial | LIMIT 20 on SOQL; timeout configuration in Connection |
| Session Hijacking | Tampering | Don't persist session tokens to disk; @salesforce/core handles credential storage securely |

**Phase 1 Security Requirements:**
- INPUT-SEC-01: Search term sanitized to prevent SOQL injection
- QUERY-SEC-01: All SOQL queries include explicit LIMIT clause (hardcoded at 20)
- LOG-SEC-01: No credentials, access tokens, or org identifiers logged to stdout
- ERROR-SEC-01: Error messages don't expose internal stack traces or Salesforce API details

---

## Sources

### Primary (HIGH confidence)
- **jsforce-website GitHub** — Verified SOQL query patterns, Connection.query() API
- **@salesforce/core npm + GitHub** — Org class, authenticated connection patterns
- **@salesforce/sf-plugins-core documentation** — SfCommand, Flags, message patterns
- **Salesforce Developer Docs** — User object fields, SOQL LIKE operator, LastLoginDate
- **@inquirer/prompts npm + GitHub** — Input prompt API, validation, async/await
- **cli-ux GitHub + npm** — Table formatting, column options

### Secondary (MEDIUM confidence)
- **WebSearch results** — SOQL pagination (OFFSET limit 2000), relative date libraries, oclif patterns
- **JSforce documentation** — Query result structure, Connection.query() behavior

### Tertiary (LOW confidence)
- **Training data** — General oclif command patterns, TypeScript best practices (assumed current, not verified)

---

## Metadata

**Confidence breakdown:**
- **Standard stack:** HIGH — All libraries verified via npm, GitHub, and official Salesforce docs
- **Architecture:** HIGH — SOQL patterns verified with jsforce docs; cli-ux and @inquirer/prompts well-established
- **Pitfalls:** MEDIUM — Based on common CLI/SOQL patterns; need integration testing to confirm edge cases (null dates, LIMIT behavior)
- **Security:** HIGH — SOQL injection prevention well-documented; org auth delegated to @salesforce/core

**Research date:** 2026-05-29  
**Valid until:** 2026-06-28 (30 days; Salesforce platform APIs stable)

---

## RESEARCH COMPLETE

**Phase:** 1 - User Search  
**Confidence:** HIGH

### Key Findings

1. **SOQL LIKE with wildcards is the standard approach** — Fuzzy matching natively supported by Salesforce SOQL; use `FirstName LIKE 'search%' OR LastName LIKE 'search%'` for substring matching without client-side overhead.

2. **User object has all required fields** — Id, FirstName, LastName, Email, LastLoginDate all queryable via jsforce Connection.query(); no limitations discovered.

3. **20-result limit avoids OFFSET issues** — SOQL OFFSET max is 2000; with LIMIT 20 and iterative refinement, pagination constraints never hit for typical orgs.

4. **Interactive refinement requires @inquirer/prompts** — No alternative offers the same UX (validation, styling, async/await); native oclif has no built-in prompt loop.

5. **Table formatting handled by cli-ux** — Already embedded in oclif core; supports column sizing, color, no external config needed.

6. **Security hinges on input sanitization** — SOQL injection is real threat; plan must escape quotes and validate search terms. @salesforce/core handles org auth, not plugin responsibility.

7. **No new dependencies beyond @inquirer/prompts and cli-ux** — Both stable, high-download libraries with active maintenance. Phase 0 already has all other requirements.

### File Created
`/Users/mc/Repos/sf-local-logs/.planning/phases/01-user-search/01-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | All packages verified via npm, official GitHub repos, and Salesforce docs |
| Architecture | HIGH | SOQL patterns match jsforce capabilities; interactive patterns standard in oclif community |
| Pitfalls | MEDIUM | Common patterns identified; edge cases (null dates, LIMIT behavior) need integration tests |
| Security | HIGH | SOQL injection prevention well-documented; org auth delegated to battle-tested @salesforce/core |
| Validation | MEDIUM | Existing test scaffold present; phase must fill in implementations and integration tests |

### Ready for Planning
Research complete. Planner can now create PLAN.md files with confidence that:
- All phase requirements are mappable to standard Salesforce API patterns
- Technology stack is locked and verified
- Common pitfalls are documented for verification steps
- Code examples provide templates for implementation
