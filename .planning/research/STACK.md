# Technology Stack

**Project:** Salesforce Debug Log CLI Plugin  
**Researched:** 2026-05-29  
**Confidence:** HIGH — All recommendations verified with official Salesforce CLI documentation and current plugin template

---

## Recommended Stack

### Core Framework

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Node.js** | 18.0.0+ | Runtime environment | Official Salesforce CLI requirement. Node 18 LTS provides stable API, widespread tooling support. Salesforce bundles Node.js v24 LTS as of Feb 2026, so target 18+ for backward compatibility. |
| **TypeScript** | 5.5.4+ | Language | Type safety critical for plugin maintainability. All official Salesforce plugins use TS; generates better IDE support and catches API misuse. |
| **oclif** | ^4.23.7 | CLI command framework | Built by Salesforce, powers all official plugins. v4 provides modern command architecture, hook system for lifecycle management, and strong plugin patterns. |

### Plugin Development Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **@salesforce/sf-plugins-core** | ^12 | Plugin-specific utilities | REQUIRED. Provides `SfCommand` base class, `Flags` utilities (requiredOrg, orgApiVersion, etc.), and CLI patterns aligned with Salesforce CLI design. Use for every command that needs org access. |
| **@salesforce/core** | ^8.31.0 | Org connection and auth | REQUIRED. Provides `Org` class for authenticated connections, Salesforce API interaction patterns, credential management, and device login flows. Extend in plugins for org handling. |
| **@oclif/core** | ^4 | oclif core internals | REQUIRED (transitive). Provides command base classes, flag parsing, logging, and plugin composition. |

### Org Interaction & APIs

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **jsforce** | (latest via @salesforce/core) | Salesforce REST/Tooling API client | REQUIRED (via @salesforce/core). Use `org.getConnection()` to get an authenticated JSforce Connection. Provides `.query()` for SOQL, `.tooling.query()` for Tooling API (ApexLog, TraceFlag, DebugLevel objects). |

### Development & Testing

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **@salesforce/cli-plugins-testkit** | ^5.3.58+ | Integration/NUT testing | All plugin tests. Provides `TestSession`, `execCmd`, scratch org setup, and devhub authentication for testing real command execution. Use `.nut.ts` for non-unit tests, `.test.ts` for unit tests. |
| **ts-node** | ^10.9.2 | TypeScript execution | Dev dependency only. Required for running `.ts` files directly (e.g., in test scripts). |
| **@salesforce/dev-scripts** | ^11.0.4+ | Linting/formatting framework | Eslint configuration, prettier setup, test runners aligned with Salesforce standards. Enforces plugin code style. |
| **eslint-plugin-sf-plugin** | ^1.20.33+ | Salesforce-specific linting rules | Catches plugin-specific anti-patterns (improper org access, missing error handling, etc.). |

### Build & Infrastructure

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **npm** or **yarn** | Latest | Package management | Plugin template uses yarn, npm also supported. Choose one (recommend yarn for Salesforce ecosystem consistency). |
| **@oclif/plugin-command-snapshot** | ^5.3.21+ | Command documentation | Snapshots command output/structure for documentation generation and testing. Dev dependency only. |

---

## Architecture Diagram: Plugin Execution Flow

```
User Command (sf local-logs:search)
     ↓
oclif Command Router (@oclif/core)
     ↓
SfCommand (extends @sf-plugins-core/SfCommand)
     ↓
Flag Parsing (Flags.requiredOrg, Flags.string, etc.)
     ↓
Org Connection (org.getConnection() → jsforce Connection)
     ↓
API Calls (query ApexLog, TraceFlag via jsforce)
     ↓
Output Formatting (tables, JSON, filtered results)
     ↓
User Response
```

---

## Stack Rationale

### Why oclif v4 + Salesforce Libraries?

1. **Unified Ecosystem**: All official Salesforce plugins (plugin-org, plugin-apex, etc.) use oclif v4 + @salesforce/sf-plugins-core. Matches conventions, reduces surprises.
2. **Org Management**: @salesforce/core handles auth, credential caching, and devhub/scratch org contexts. Avoid reinventing OAuth flows.
3. **CLI Patterns**: @salesforce/sf-plugins-core provides `requiredOrgFlag`, `orgApiVersion`, `requiredProject` flags that integrate cleanly with `sf`. Commands inherit progress indicators, JSON output, error formatting.
4. **API Access**: jsforce (via @salesforce/core) supports SOQL for User lookups, Tooling API for ApexLog/TraceFlag queries, and session caching.

### Why TypeScript 5.5.4+?

- Plugin template specifies 5.5.4. Provides modern syntax (const type parameters, decorator stability), better null safety.
- Type coverage catches `org.getConnection()` API mistakes before runtime.

### Why Node 18+?

- Salesforce CLI officially requires 18.0.0+. Feb 2026 shift to Node 24 LTS is backward compatible.
- Stream APIs (for large log filtering) stable and performant in 18+.

### Excluded: What NOT to Use

| Technology | Why Avoid |
|-----------|-----------|
| **axios** / **fetch** | jsforce Connection already handles Salesforce auth + session management. Don't add HTTP client complexity. |
| **mocha / jest directly** | Use @salesforce/cli-plugins-testkit instead. It wraps test runners and provides TestSession, execCmd fixtures. |
| **Express / Fastify** | Plugin is CLI-only. No server needed. |
| **Prisma / TypeORM** | No database. Salesforce org IS the database. Use jsforce queries. |
| **Custom OAuth logic** | @salesforce/core handles org auth. Use `Flags.requiredOrg` to inject authenticated org into commands. |
| **Commander.js / yargs** | oclif is the standard. Mixing frameworks breaks plugin composition and Salesforce CLI conventions. |

---

## Installation & Setup

### Initialize New Plugin

```bash
sf plugins install @salesforce/plugin-dev

# Generate scaffold (creates plugin-template-sf structure with all dependencies)
sf plugins generate --name local-logs

# Navigate to plugin directory
cd sf-local-logs

# Install dependencies
yarn install
```

### Core Dependencies (auto-included by template)

```bash
# Runtime
npm install --save \
  @oclif/core@^4 \
  @salesforce/core@^8.31.0 \
  @salesforce/sf-plugins-core@^12

# Dev
npm install --save-dev \
  @salesforce/cli-plugins-testkit@^5.3.58 \
  @salesforce/dev-scripts@^11.0.4 \
  eslint-plugin-sf-plugin@^1.20.33 \
  oclif@^4.23.7 \
  ts-node@^10.9.2 \
  typescript@^5.5.4
```

### Manual Setup (if starting from scratch)

```bash
mkdir sf-local-logs
cd sf-local-logs
npm init -y
npm install @oclif/core@^4 @salesforce/core@^8.31.0 @salesforce/sf-plugins-core@^12
npm install -D @salesforce/cli-plugins-testkit@^5.3.58 typescript@^5.5.4 ts-node@^10.9.2
```

---

## Key API Patterns for This Plugin

### Pattern 1: Retrieve Authenticated Org Connection

```typescript
// In your SfCommand-derived class
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Org } from '@salesforce/core';

export class SearchCommand extends SfCommand {
  static flags = {
    'target-org': Flags.requiredOrg(),
  };

  async run(): Promise<void> {
    const org: Org = this.flags['target-org'];
    const connection = org.getConnection();
    // connection is an authenticated jsforce Connection
  }
}
```

### Pattern 2: Query Users by Name (SOQL)

```typescript
// Query User SObject by name (NOT Tooling API)
const users = await connection.query('SELECT Id, Name FROM User WHERE Name LIKE ?', ['%Admin%']);
users.records.forEach(user => {
  console.log(`${user.Name} (${user.Id})`);
});
```

### Pattern 3: Enable Debug Log Session (Tooling API)

```typescript
// Use Tooling API to create TraceFlag + DebugLevel for a user
const debugLevel = await connection.tooling.create('DebugLevel', {
  MasterLabel: 'FullDebug',
  ApexCode: 'DEBUG',
  Workflow: 'DEBUG',
});

const traceFlag = await connection.tooling.create('TraceFlag', {
  TracedEntityId: userId,
  DebugLevelId: debugLevel.id,
  StartTime: new Date().toISOString(),
  ExpirationTime: new Date(Date.now() + 1800000).toISOString(), // 30 min
});
```

### Pattern 4: List Debug Logs (Tooling API)

```typescript
// Query ApexLog records for a user
const logs = await connection.tooling.query(
  'SELECT Id, LogUser.Name, Operation, StartTime, LogLength FROM ApexLog ' +
  'WHERE LogUser.Id = ? ORDER BY StartTime DESC LIMIT 100',
  [userId]
);
```

### Pattern 5: Download Log Body (Tooling API GET)

```typescript
// Fetch raw log content (not just metadata)
const logBody = await connection.tooling.retrieve('ApexLog', logId);
// logBody is the raw debug log text (can be 10-100MB)
```

### Pattern 6: Testing a Command

```typescript
// In mycommand.nut.ts
import { TestSession, execCmd } from '@salesforce/cli-plugins-testkit';

describe('local-logs:search', () => {
  let testSession: TestSession;

  beforeAll(async () => {
    testSession = await TestSession.create();
  });

  it('searches for users', async () => {
    const result = await execCmd('local-logs:search --name Admin', { cwd: testSession.dir });
    expect(result.stdout).toContain('Admin');
  });

  afterAll(async () => {
    await testSession.clean();
  });
});
```

---

## Versions: Confidence & Recency

| Library | Latest Verified | Source | Confidence |
|---------|-----------------|--------|-----------|
| @oclif/core | ^4 | plugin-template-sf package.json | HIGH |
| @salesforce/core | ^8.31.0 | plugin-template-sf package.json | HIGH |
| @salesforce/sf-plugins-core | ^12 | plugin-template-sf package.json | HIGH |
| @salesforce/cli-plugins-testkit | ^5.3.58 | plugin-template-sf package.json | HIGH |
| TypeScript | 5.5.4 | plugin-template-sf package.json | HIGH |
| Node.js | 18.0.0+ | Official Salesforce CLI docs | HIGH |
| oclif | ^4.23.7 | plugin-template-sf package.json | HIGH |

All versions pulled directly from [salesforcecli/plugin-template-sf](https://raw.githubusercontent.com/salesforcecli/plugin-template-sf/main/package.json) as of May 2026.

---

## Migration Notes: If Adapting Existing Code

If this is built on earlier SFDX plugins (old `sfdx-core`, `sfdx-plugin-base`):

- Replace `@salesforce/sfdx-core` with `@salesforce/core` (same author, modernized API)
- Replace `@salesforce/plugin-base.SfCommand` with `@salesforce/sf-plugins-core.SfCommand` (cleaner patterns, oclif v4)
- Replace `requiredusername` flags with `Flags.requiredOrg()` (new pattern in sf CLI)
- Replace manual `Connection` setup with `org.getConnection()` (auto-authenticated via @salesforce/core)

See [Salesforce CLI Plugin Developer Guide: Migrate Plugins](https://developer.salesforce.com/docs/platform/salesforce-cli-plugin/guide/migrate-sfdx-sf.html) for detailed migration steps.

---

## Sources

- [Salesforce CLI Plugin Developer Guide - Overview](https://developer.salesforce.com/docs/platform/salesforce-cli-plugin/guide/conceptual-overview.html)
- [Salesforce CLI Plugin Developer Guide - Getting Started](https://developer.salesforce.com/docs/platform/salesforce-cli-plugin/guide/get-started)
- [Salesforce CLI Plugin Developer Guide - Generate a Basic Plugin](https://developer.salesforce.com/docs/platform/salesforce-cli-plugin/guide/gs-generate-plugin.html)
- [salesforcecli/plugin-template-sf (package.json)](https://github.com/salesforcecli/plugin-template-sf)
- [@salesforce/core - npm](https://www.npmjs.com/package/@salesforce/core)
- [@salesforce/sf-plugins-core - npm](https://www.npmjs.com/package/@salesforce/sf-plugins-core)
- [@salesforce/cli-plugins-testkit - npm](https://www.npmjs.com/package/@salesforce/cli-plugins-testkit)
- [JSforce Documentation](https://jsforce.github.io/)
- [Salesforce Tooling API - ApexLog](https://developer.salesforce.com/docs/atlas.en-us.api_tooling.meta/api_tooling/tooling_api_objects_apexlog.htm)
- [Salesforce Tooling API - DebugLevel](https://developer.salesforce.com/docs/atlas.en-us.api_tooling.meta/api_tooling/tooling_api_objects_debuglevel.htm)
- [Salesforce CLI Release Notes](https://github.com/forcedotcom/cli/blob/main/releasenotes/README.md)
