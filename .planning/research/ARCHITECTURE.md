# Architecture Patterns: Salesforce CLI Plugin

**Project:** Salesforce Debug Log CLI Plugin  
**Researched:** 2026-05-29  
**Confidence:** HIGH (based on official Salesforce CLI documentation and oclif framework specs)

## Recommended Architecture

A Salesforce CLI plugin is fundamentally a modular npm package that extends the core `sf` CLI with custom commands. The sf CLI uses **oclif** (an open-source framework maintained by Salesforce) as its foundation, providing lifecycle hooks, flag parsing, and command execution infrastructure.

```
┌─────────────────────────────────────────────────────────────┐
│                    Salesforce CLI (sf)                      │
│                      [oclif Framework]                      │
│  - Plugin Loader & Lifecycle Management                     │
│  - Config/Auth Management (@salesforce/core)               │
│  - CLI Framework & Help System                              │
└──────────────────────┬──────────────────────────────────────┘
                       │
        ┌──────────────┴──────────────┐
        │                             │
┌───────▼──────────────┐    ┌────────▼──────────────┐
│  Core Org Plugin     │    │  Debug Log Plugin     │
│  (Built-in)          │    │  (This Project)       │
│                      │    │                       │
│ - Org Management     │    │ - Search Users       │
│ - Auth Handling      │    │ - Initiate Sessions  │
│ - List Operations    │    │ - Download Logs      │
└──────────────────────┘    │ - Filter/Analyze     │
                            │ - Manage Storage     │
                            └──────────────────────┘
```

### Plugin Directory Structure

```
sf-debug-log-plugin/
├── src/
│   ├── commands/
│   │   └── debug/
│   │       ├── log-search.ts          # Search users & logs
│   │       ├── log-download.ts        # Download logs
│   │       ├── log-filter.ts          # Filter by keyword
│   │       └── log-purge.ts           # Manage storage
│   ├── lib/
│   │   ├── utils/
│   │   │   ├── org-connection.ts      # Org connection management
│   │   │   ├── tooling-api-client.ts  # Tooling API interaction
│   │   │   ├── debug-log-service.ts   # Core log operations
│   │   │   └── storage-manager.ts     # Storage quota handling
│   │   └── models/
│   │       ├── types.ts               # TypeScript interfaces
│   │       └── constants.ts           # Constants
│   └── hooks/
│       └── init.ts                     # Plugin initialization
├── messages/
│   └── debug/
│       ├── log-search.md              # User messages
│       ├── log-download.md
│       └── ... (one per command)
├── test/
│   └── commands/
│       └── debug/ (unit & integration tests)
├── package.json
├── tsconfig.json
├── .eslintrc.cjs
├── .mocharc.json
└── README.md
```

## Component Boundaries

### Layer 1: CLI Commands (User Interface Layer)

**Responsibility:** Parse arguments, validate input, orchestrate workflows, communicate status to user.

| Component | What It Does | Communicates With |
|-----------|-------------|-------------------|
| `log-search.ts` | Prompts for username; queries Salesforce User & ApexLog objects; presents results for selection | `debug-log-service` (log queries), User prompts |
| `log-download.ts` | Initiates debug session via trace flags; polls for new logs; downloads via Tooling API | `org-connection`, `debug-log-service`, `storage-manager` |
| `log-filter.ts` | Accepts local log file + keyword; filters and displays matches | Local file system |
| `log-purge.ts` | Lists local debug logs; prompts for deletion; manages 1GB quota | Local file system, `storage-manager` |

**Pattern:** All commands extend `SfCommand<T>` from `@salesforce/sf-plugins-core`. They use:
- `Flags.requiredOrg()` to get authenticated org context
- `Messages.loadMessages()` to load localized strings from markdown files
- Built-in `this.log()`, `this.warn()`, `this.error()` for output
- `this.spinner`, `this.progress` for long-running operations

### Layer 2: Service & Utility Layer (Business Logic)

**Responsibility:** Implement core domain logic, handle API interactions, abstract complexity.

| Component | What It Does | Communicates With |
|-----------|-------------|-------------------|
| `debug-log-service.ts` | SOQL queries for ApexLog objects; log body retrieval; session state tracking | `tooling-api-client`, `org-connection` |
| `tooling-api-client.ts` | Wraps Tooling API HTTP calls; auth token management; request/response formatting | Salesforce Tooling API (external) |
| `org-connection.ts` | Manages org authentication context; connection pooling; lifecycle; error handling | `@salesforce/core` (Org/Connection classes) |
| `storage-manager.ts` | Tracks local disk usage; enforces 1GB quota logic; calculates oldest/largest logs | File system |

**Pattern:** Services are instantiated by commands and accept org/connection as constructor parameters. Pure business logic with no CLI output.

### Layer 3: Platform/Framework Layer

**Responsibility:** Provide Salesforce platform access, CLI infrastructure, and lifecycle management.

| Component | What It Does | Communicates With |
|-----------|-------------|-------------------|
| `@salesforce/core` | Authentication (AuthInfo), Org connection management (Org), HTTP connections (Connection) | Salesforce Org |
| `@salesforce/sf-plugins-core` | SfCommand base class, Flags utilities, logger, error handling | oclif core |
| `oclif` framework | CLI argument parsing, command routing, lifecycle hooks, help generation | Node.js process |
| Tooling API | Query ApexLog; retrieve log body; set trace flags; manage debug sessions | Salesforce platform |
| Metadata API (future) | User lookups, bulk operations | Salesforce platform |

## Data Flow

### Command: Search Users → Initiate Debug Session

```
User runs: sf debug log-search --target-org sandbox

1. CLI Input Layer
   ├─ SfCommand parses flags (@salesforce/sf-plugins-core)
   └─ Resolves --target-org to authenticated Org object (@salesforce/core)

2. User Search
   ├─ log-search.ts prompts: "Enter username pattern?"
   ├─ Creates org-connection with Org
   ├─ debug-log-service queries Salesforce:
   │  └─ SOQL: SELECT Id, Username, Name FROM User WHERE Name LIKE '%pattern%'
   ├─ Presents paginated results to user
   └─ User selects one user (e.g., "jane.doe")

3. Trace Flag Creation
   ├─ log-download.ts retrieves selected user's org ID
   ├─ debug-log-service.createTraceFlag(userId):
   │  ├─ SOQL: SELECT Id FROM ApexDebugLevel WHERE DeveloperName = 'BasicDebugLevel'
   │  └─ HTTP POST to Tooling API: /services/data/v60.0/tooling/sobjects/TraceFlag/
   │     Creates TraceFlag record for user (24-hour expiry)
   └─ Confirms session initiated: "Debug logs for jane.doe now active (24h)"

4. Output
   └─ Log to user: Selected user, session timeout, how to download
```

### Command: Download & Filter Logs

```
User runs: sf debug log-download --target-org sandbox

1. Poll for New Logs
   ├─ debug-log-service polls every N seconds:
   │  └─ SOQL: SELECT Id, LogUserId, StartTime, Request FROM ApexLog 
   │          WHERE LogUser.Id = 'selected_user_id' AND StartTime > 'last_check'
   ├─ For each new log:
   │  ├─ storage-manager checks: current_size + incoming_log > 1GB?
   │  ├─ If yes: purge oldest logs (interactive)
   │  └─ If no: proceed to download
   └─ Display: "Found 3 new logs, downloading..."

2. Download Log Body
   ├─ For each ApexLog ID:
   ├─ HTTP GET: /services/data/v60.0/tooling/sobjects/ApexLog/{id}/Body/
   ├─ Save to: ~/.sf/debug-logs/{user}_{timestamp}_{logid}.log
   ├─ tooling-api-client handles:
   │  ├─ Bearer token authorization
   │  ├─ Connection.request() from @salesforce/core
   │  └─ Retry logic on rate limits
   └─ Storage: Update local metadata (size, timestamp)

3. User Selects Filter
   ├─ CLI prompts: "Filter by keyword? (e.g., 'SOQL', 'Callout')"
   ├─ log-filter.ts reads local log file
   ├─ Grep/regex matching on log entries
   └─ Display: Filtered entries in stdout (with line numbers)

4. Output
   ├─ Downloaded logs written to ~/.sf/debug-logs/
   ├─ Filtered results shown in terminal
   └─ JSON output if --json flag used
```

### Command: Purge Logs

```
User runs: sf debug log-purge --target-org sandbox

1. Scan Local Logs
   ├─ storage-manager lists ~/.sf/debug-logs/
   ├─ Calculates total size + metadata per file
   └─ Sorts by: age (oldest first)

2. Interactive Purge (if over 1GB)
   ├─ SfCommand.confirm() prompts:
   │  └─ "Current size: 1.2GB. Delete oldest logs? [Y/n]"
   ├─ If yes:
   │  ├─ Delete files oldest-first until < 1GB
   │  └─ Update local metadata
   └─ If no: exit

3. Output
   └─ Summary: "Freed 250MB. Current size: 950MB."
```

## Component Communication & Dependency Graph

```
Commands (Top Layer)
  ├─ log-search.ts
  ├─ log-download.ts
  ├─ log-filter.ts
  └─ log-purge.ts

Services (Middle Layer)
  ├─ debug-log-service.ts
  │  ├─ Calls: org-connection, tooling-api-client
  │  └─ Used by: log-search, log-download
  ├─ tooling-api-client.ts
  │  ├─ Calls: @salesforce/core Connection
  │  └─ Used by: debug-log-service
  ├─ org-connection.ts
  │  ├─ Calls: @salesforce/core Org, AuthInfo
  │  └─ Used by: commands, debug-log-service, tooling-api-client
  └─ storage-manager.ts
     ├─ Calls: Node.js fs module
     └─ Used by: log-download, log-purge

External Dependencies
  ├─ @salesforce/core (Org, Connection, AuthInfo, ConfigFile)
  ├─ @salesforce/sf-plugins-core (SfCommand, Flags, Messages)
  ├─ oclif (command framework, hooks)
  ├─ Salesforce Tooling API (HTTP via Connection)
  └─ Node.js fs (local storage)
```

## Key Architectural Decisions

### 1. Service Layer for API Abstraction
**Why:** Commands should not directly call Tooling API or SOQL. Services abstract these details, enabling testing and swapping implementations.

**Implementation:**
- `debug-log-service.ts` owns all Salesforce API interactions
- Commands call only service methods
- Services use `org-connection` to get authenticated connections

### 2. Local Storage Management via Service
**Why:** Storage quota is a critical constraint. Centralizing quota logic in `storage-manager` prevents commands from independently making bad decisions.

**Implementation:**
- `storage-manager.ts` tracks disk usage
- `log-download.ts` checks quota *before* downloading
- Purge logic is coordinated, not scattered

### 3. Configuration Persistence
**Why:** User preferences (e.g., default org, debug log directory) should persist across sessions.

**Implementation:**
- Use `@salesforce/core` ConfigFile class
- Store in `~/.sf/config/debug-log-config.json`
- Load on command init (optional hook)

### 4. Modular Command Structure
**Why:** Each command has a single, clear responsibility. This makes testing, documentation, and future enhancements easier.

**Implementation:**
- `log-search.ts`: User → Org lookup
- `log-download.ts`: Download loop + quota enforcement
- `log-filter.ts`: Local post-processing
- `log-purge.ts`: Storage management
- NOT a monolithic "log" command

### 5. Graceful Degradation of Rate Limits
**Why:** Salesforce Tooling API has rate limits. Bulk downloads may exceed them. Plugin should retry intelligently.

**Implementation:**
- `tooling-api-client.ts` wraps Connection.request()
- Implements exponential backoff on 429 (Rate Limit)
- Informs user: "Rate limited. Resuming in 30s..."

## Patterns to Follow

### Pattern 1: Flag-Based Org Resolution
**What:** Always use `Flags.requiredOrg()` or `Flags.optionalOrg()` to let CLI resolve org.

**When:** Whenever you need org access.

**Example:**
```typescript
// In log-search.ts
export class LogSearchCommand extends SfCommand<SearchResult> {
  static flags = {
    'target-org': Flags.requiredOrg(),
    // ... other flags
  };

  async run(): Promise<SearchResult> {
    const org = await this.flags['target-org'];
    const connection = org.getConnection();
    // ...
  }
}
```

**Why:** This gives users flexibility (--target-org, --target-org-alias, env var, config default). Don't hardcode.

### Pattern 2: Service Instantiation in Commands
**What:** Commands create service instances passing org/connection as dependencies.

**When:** Commands need to call business logic.

**Example:**
```typescript
// In log-download.ts
const org = await this.flags['target-org'];
const debugService = new DebugLogService(org);
const storageManager = new StorageManager();

const logs = await debugService.downloadNewLogs(userId);
await storageManager.enforceQuota(logs);
```

**Why:** Dependency injection makes services testable and decoupled from CLI framework.

### Pattern 3: Error Messages in Markdown
**What:** Load error/warning messages from `.messages/debug/` markdown files, not hardcoded in code.

**When:** Any user-facing message (error, warning, success).

**Example:**
```typescript
// In messages/debug/log-download.md
# errorNotEnoughSpace
Not enough local storage to download log {logId}. 
Current: {currentSize}MB, Required: {requiredSize}MB.
Run 'sf debug log-purge' to free space.

# warningQuotaNearing
Debug log quota at {percentUsed}%. 
Only {remainingMB}MB remaining before purge.
```

**Why:** Centralized messages enable localization, testing, and consistent UX.

### Pattern 4: Long-Running Operations with Progress
**What:** Use `this.spinner()` for determinate operations (upload, download), `this.progress()` for polling loops.

**When:** Operations exceed ~500ms.

**Example:**
```typescript
// Download with progress
const spinner = this.spinner();
spinner.start('Downloading logs...');
for (const log of logs) {
  const body = await connection.request(`/tooling/sobjects/ApexLog/${log.id}/Body/`);
  spinner.status = `Downloaded ${++count}/${logs.length}`;
}
spinner.stop('Downloaded successfully');

// Polling with progress
const progress = this.progress({ total: 100 });
while (!allLogsRetrieved) {
  const newLogs = await debugService.pollLogs();
  progress.update(newLogs.length);
  await new Promise(resolve => setTimeout(resolve, 5000));
}
```

**Why:** Provides feedback to user that the CLI hasn't frozen.

### Pattern 5: JSON Output for Scripting
**What:** When `--json` flag is used, output JSON. Respect the standard SfCommand result handling.

**When:** Any command that returns structured data.

**Example:**
```typescript
async run(): Promise<DownloadResult> {
  // ... logic ...
  return {
    success: true,
    downloaded: logs.length,
    errors: [],
    filePath: '/path/to/logs',
  };
  // SfCommand automatically handles --json serialization
}
```

**Why:** Enables automation/scripting. Standard across Salesforce CLI.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Direct Salesforce API Calls in Commands
**What:** Making Tooling API calls directly from command code.
**Why bad:** Commands become untestable, hard to mock API responses, logic is scattered.
**Instead:** Create service classes (DebugLogService, OrgConnection) and call from there.

### Anti-Pattern 2: Hardcoded File Paths
**What:** Storing logs in fixed location like `/tmp/sf-logs/` or user's home.
**Why bad:** Breaks on different OSes, doesn't respect user preferences, conflicts with other tools.
**Instead:** Use `@salesforce/core` ConfigFile to let user configure log directory, fall back to XDG standards.

### Anti-Pattern 3: Global State / Module-Level Variables
**What:** Storing org connection or config in module-level variables.
**Why bad:** Interferes with testing, breaks in concurrent execution, causes memory leaks.
**Instead:** Pass dependencies to constructors, use instance variables.

### Anti-Pattern 4: Ignoring Rate Limits Silently
**What:** If API returns 429, just fail or retry naively.
**Why bad:** Frustrates users, burns through rate limits faster, degrades UX.
**Instead:** Implement exponential backoff, inform user with progress message.

### Anti-Pattern 5: Mixing Concerns in Long Commands
**What:** One command trying to search, download, filter, and purge all at once.
**Why bad:** Command becomes complex, hard to test, bad UX (user can't choose individual steps).
**Instead:** Separate into four focused commands (as recommended).

## Scalability Considerations

### At 100 Users
| Concern | Approach |
|---------|----------|
| Org Connection | One per command, short-lived. No pooling needed. |
| Storage (1GB limit) | Assume ~10 active debug sessions. Enforce quota per-command. |
| Tooling API Calls | ~100 SOQL queries + body downloads. Rate limit buffer. |
| Local Disk I/O | Single-threaded download. Sequential, no parallelism. |

### At 10K Users (Single Org)
| Concern | Approach |
|---------|----------|
| Org Connection | Consider connection pooling if multiple commands run in parallel. Share Connection object across commands. |
| Storage | 1GB quota enforced strictly. Oldest-first purge strategy. Monitor free disk on user's machine. |
| Tooling API Calls | Rate limiting becomes real concern. Implement queue + backoff. May need to batch queries. |
| Local Disk I/O | If user has thousands of logs, file listing becomes slow. Add indexing/caching of metadata. |

### At 1M Users (Multiple Orgs)
| Concern | Approach |
| Out of Scope for v1 | Plugin targets single org only. Multi-org support deferred to v2. |

## Build Order & Dependencies

**Phase 1: Foundation**
1. Set up plugin scaffold + project structure
2. Create `org-connection.ts` (minimal Org access)
3. Create `debug-log-service.ts` (SOQL query capability)
4. Create `tooling-api-client.ts` (HTTP wrapper)

**Phase 2: Core Commands**
1. `log-search.ts` (depends on Phase 1)
2. `log-download.ts` (depends on Phase 1 + storage-manager.ts)
3. `storage-manager.ts` (depends on Node.js fs only)

**Phase 3: Utilities**
1. `log-filter.ts` (local post-processing, no Salesforce deps)
2. `log-purge.ts` (depends on storage-manager.ts)

**Phase 4: Polish**
1. Error handling & messages
2. Integration tests
3. Documentation & examples

---

## Sources

- [Overview of Salesforce CLI Plugins | Salesforce CLI Plugin Developer Guide](https://developer.salesforce.com/docs/platform/salesforce-cli-plugin/guide/conceptual-overview.html)
- [Common Coding Patterns | Code Your Plugin | Salesforce CLI Plugin Developer Guide](https://developer.salesforce.com/docs/platform/salesforce-cli-plugin/guide/common-coding-patterns.html)
- [Hooks | oclif: The Open CLI Framework](https://oclif.io/docs/hooks/)
- [ApexLog | Tooling API | Salesforce Developers](https://developer.salesforce.com/docs/atlas.en-us.api_tooling.meta/api_tooling/tooling_api_objects_apexlog.htm)
- [Building a Salesforce CLI Plug-In | Salesforce Developers Blog](https://developer.salesforce.com/blogs/2023/01/building-a-salesforce-cli-plug-in)
- [GitHub - salesforcecli/plugin-org: Commands to interact with Salesforce orgs](https://github.com/salesforcecli/plugin-org)
- [GitHub - salesforcecli/plugin-deploy-retrieve](https://github.com/salesforcecli/plugin-deploy-retrieve)
- [@salesforce/sf-plugins-core - npm](https://www.npmjs.com/package/@salesforce/sf-plugins-core)
- [@salesforce/sf-plugins-core Documentation](https://salesforcecli.github.io/sf-plugins-core/)
- [Authorization | Salesforce DX Developer Guide | Salesforce Developers](https://developer.salesforce.com/docs/atlas.en-us.sfdx_dev.meta/sfdx_dev/sfdx_dev_auth.htm)
