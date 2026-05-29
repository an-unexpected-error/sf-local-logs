---
phase: 00-plugin-setup
plan: "01"
subsystem: infra
tags: [oclif, typescript, salesforce-cli, plugin, npm, eslint, mocha]

# Dependency graph
requires: []
provides:
  - Compilable Salesforce CLI plugin skeleton (package.json, tsconfig.json)
  - npm dependency tree with all runtime and dev dependencies installed
  - TypeScript compilation producing lib/ output directory
  - Plugin registered in local sf CLI via sf plugins link
  - ESLint, Mocha, nyc, prettier configs established
affects: [00-02, 00-03, 00-04, 00-05, all-subsequent-phases]

# Tech tracking
tech-stack:
  added:
    - "@salesforce/core ^8.31.0"
    - "@salesforce/sf-plugins-core ^12"
    - "@oclif/core ^4"
    - "chalk ^5"
    - "@salesforce/dev-scripts ^11.0.4"
    - "typescript 5.5.4"
    - "eslint-plugin-sf-plugin ^1.20.33"
    - "@salesforce/cli-plugins-testkit ^5.3.58"
    - "mocha ^10 + nyc ^15"
  patterns:
    - "npm run compile (tsc -p tsconfig.json) as the build command"
    - "src/ to lib/ TypeScript compilation with commonjs module output"
    - "prepare script calls npm run compile (not sf-build) for plugin link compatibility"
    - "sf plugins link . used for local development registration"

key-files:
  created:
    - package.json
    - tsconfig.json
    - .eslintrc.cjs
    - .mocharc.json
    - .nycrc
    - .prettierrc.json
    - .gitignore
    - src/index.ts
    - package-lock.json
  modified:
    - .gitignore (replaced Salesforce org gitignore with plugin-specific one)

key-decisions:
  - "prepare script uses npm run compile instead of sf-build — sf-build not on PATH when sf plugins link uses bundled npm"
  - "link-local script removes --no-verify flag — removed in sf CLI 2.61.8"
  - "npm install --ignore-scripts required on first install to avoid prepare script failure before node_modules exists"
  - "Plugin name sf-local-logs matches repo directory name"

patterns-established:
  - "TypeScript ES2022 target, commonjs module, strict mode throughout project"
  - "src/ contains TypeScript source; lib/ contains compiled output (gitignored)"
  - "Plugin entry point: src/index.ts exports run from @oclif/core"

requirements-completed: [INSTALL-01, INSTALL-02, INSTALL-03]

# Metrics
duration: 4min
completed: "2026-05-29"
---

# Phase 0 Plan 01: Plugin Scaffold Summary

**Salesforce CLI plugin skeleton with TypeScript compilation, oclif config, and local plugin linking via sf plugins link**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-05-29T12:16:11Z
- **Completed:** 2026-05-29T12:19:47Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments
- package.json with correct oclif config (bin: sf, commands: ./lib/commands), engines.node >=18.0.0, and all required runtime + dev dependencies
- TypeScript + ESLint + Mocha + nyc + Prettier configs written; src/index.ts plugin entry point created
- npm install completes, `npm run compile` exits 0 producing lib/index.js, plugin registered via `sf plugins link .`

## Task Commits

Each task was committed atomically:

1. **Task 1: Write package.json** - `69e35eb` (feat)
2. **Task 2: TypeScript config, ESLint, Mocha, tooling files** - `23fdd4f` (feat)
3. **Task 3: Install dependencies and verify compilation** - `27c3cc1` (feat)

## Files Created/Modified
- `package.json` - Plugin metadata, oclif config, engines constraint, all dependencies
- `tsconfig.json` - TypeScript compiler config targeting lib/ output
- `.eslintrc.cjs` - ESLint with salesforce-typescript + sf-plugin/recommended
- `.mocharc.json` - Mocha test config with ts-node loader
- `.nycrc` - Code coverage config (lcov/text, 50% thresholds)
- `.prettierrc.json` - Prettier formatting config
- `.gitignore` - Plugin-specific ignores (node_modules, lib, oclif.manifest.json)
- `src/index.ts` - Plugin entry point: `export { run } from '@oclif/core'`
- `package-lock.json` - Locked dependency tree

## Decisions Made
- `prepare` script changed to `npm run compile` (not `sf-build`) because `@salesforce/dev-scripts` binary `sf-build` is not on PATH when `sf plugins link` uses the bundled npm executable
- `link-local` script updated to remove `--no-verify` flag (removed from sf CLI 2.61.8)
- Used `npm install --ignore-scripts` to bootstrap before any lifecycle scripts can run

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed prepare script: sf-build not on PATH during sf plugins link**
- **Found during:** Task 3 (Install dependencies and verify compilation)
- **Issue:** Plan specified `"prepare": "sf-build"` but `sf-build` (from `@salesforce/dev-scripts`) is a local node_modules binary. When `sf plugins link` runs npm install via its bundled npm, it invokes a subprocess where `node_modules/.bin` is not on PATH, causing `sh: sf-build: command not found` and exit code 127.
- **Fix:** Changed `prepare` to `"npm run compile"` which invokes `tsc -p tsconfig.json` directly. npm's `run-script` always resolves `node_modules/.bin` binaries correctly.
- **Files modified:** `package.json`
- **Verification:** `sf plugins link /Users/mc/Repos/sf-local-logs` exits 0; `sf plugins` shows `sf-local-logs 0.0.1 (link)`
- **Committed in:** `27c3cc1` (Task 3 commit)

**2. [Rule 1 - Bug] Fixed link-local script: --no-verify flag removed in sf CLI 2.61.8**
- **Found during:** Task 3 (Install dependencies and verify compilation)
- **Issue:** Plan specified `"link-local": "sf plugins link . --no-verify"` but `--no-verify` is not a valid flag in sf CLI 2.61.8, causing `Error: Nonexistent flag: --no-verify`.
- **Fix:** Updated `link-local` to `"sf plugins link ."` without the flag.
- **Files modified:** `package.json`
- **Verification:** Script runs without error in manual test.
- **Committed in:** `27c3cc1` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (2 Rule 1 bugs)
**Impact on plan:** Both fixes necessary for plugin linking to succeed. No scope creep. Core scaffold goal achieved.

## Issues Encountered
- `npm install` (with lifecycle scripts) fails on first run because `prepare: sf-build` runs before `@salesforce/dev-scripts` is in node_modules. Resolved by using `--ignore-scripts` on first install.

## User Setup Required
None - no external service configuration required. Plugin is linked locally via `sf plugins link`.

## Next Phase Readiness
- Plugin scaffold complete and compilable
- `lib/index.js` exists; plugin registered in local sf CLI
- Plans 00-02, 00-03, 00-04 (Wave 2) can now proceed in parallel: command stubs, test infrastructure, CI/CD
- No blockers identified

---
*Phase: 00-plugin-setup*
*Completed: 2026-05-29*
