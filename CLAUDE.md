<!-- GSD:project-start source:PROJECT.md -->
## Project

**Salesforce Debug Log CLI Plugin**

A Salesforce SF CLI plugin that enables admins and engineers to efficiently manage and analyze debug logs from the command line. Instead of navigating the browser, users search for users by name, initiate debug sessions, download logs, and filter by keyword to pinpoint relevant debugging information. Designed for high-volume scenarios where storage limits and timestamp-only identification make analysis difficult.

**Core Value:** Enable admins to efficiently locate and analyze debugging information in high-volume debug logs (1000s/minute) without leaving the CLI or the browser-based Salesforce UI.

### Constraints

- **Performance**: Must handle high-volume scenarios (1000s logs/minute) without degradation
- **Storage**: Must respect Salesforce's 1GB debug log limit across all files
- **Tech Stack**: Written in TypeScript, installable via `sf plugin install`
- **UX**: CLI-first experience; clear communication of what's happening at each step
- **Compatibility**: Must work within Salesforce CLI architecture and plugin framework
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

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
## Architecture Diagram: Plugin Execution Flow
## Stack Rationale
### Why oclif v4 + Salesforce Libraries?
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
## Installation & Setup
### Initialize New Plugin
# Generate scaffold (creates plugin-template-sf structure with all dependencies)
# Navigate to plugin directory
# Install dependencies
### Core Dependencies (auto-included by template)
# Runtime
# Dev
### Manual Setup (if starting from scratch)
## Key API Patterns for This Plugin
### Pattern 1: Retrieve Authenticated Org Connection
### Pattern 2: Query Users by Name (SOQL)
### Pattern 3: Enable Debug Log Session (Tooling API)
### Pattern 4: List Debug Logs (Tooling API)
### Pattern 5: Download Log Body (Tooling API GET)
### Pattern 6: Testing a Command
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
## Migration Notes: If Adapting Existing Code
- Replace `@salesforce/sfdx-core` with `@salesforce/core` (same author, modernized API)
- Replace `@salesforce/plugin-base.SfCommand` with `@salesforce/sf-plugins-core.SfCommand` (cleaner patterns, oclif v4)
- Replace `requiredusername` flags with `Flags.requiredOrg()` (new pattern in sf CLI)
- Replace manual `Connection` setup with `org.getConnection()` (auto-authenticated via @salesforce/core)
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
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
