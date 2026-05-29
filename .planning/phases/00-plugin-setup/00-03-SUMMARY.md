---
phase: 00-plugin-setup
plan: "03"
subsystem: test
tags: [mocha, chai, ts-node, esm, unit-tests, nut, integration-tests, salesforce-cli-testkit]

# Dependency graph
requires:
  - phase: 00-01
    provides: Plugin scaffold with package.json, tsconfig, node_modules installed
  - phase: 00-02
    provides: 5 command stubs in src/commands/log/ for test imports
provides:
  - 5 unit test files (test/commands/log/*.test.ts) compiling and passing with npm test
  - 5 NUT integration test scaffolds (test/commands/log/*.nut.ts) compiling clean
  - ESM-compatible project configuration (type: module, NodeNext tsconfig, ts-node/esm loader)
  - tsconfig.test.json for type-checking test files without emitting output
affects: [00-05, 01-user-search, 02-trace, 03-download, 03-purge, 04-filter]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ESM project: package.json type:module + tsconfig NodeNext + .mocharc.json loader:ts-node/esm"
    - "Unit tests: chai expect, mocha describe/it, direct import from src/ with .js extension"
    - "NUT scaffolds: @salesforce/cli-plugins-testkit execCmd + TestSession.create({ devhubAuthStrategy: 'NONE' })"
    - "tsconfig.test.json extends tsconfig.json with rootDir:. and includes test/**/*.ts"
    - "fileURLToPath(import.meta.url) + dirname() replaces __dirname in ESM command files"

key-files:
  created:
    - test/commands/log/search.test.ts
    - test/commands/log/trace.test.ts
    - test/commands/log/download.test.ts
    - test/commands/log/purge.test.ts
    - test/commands/log/filter.test.ts
    - test/commands/log/search.nut.ts
    - test/commands/log/trace.nut.ts
    - test/commands/log/download.nut.ts
    - test/commands/log/purge.nut.ts
    - test/commands/log/filter.nut.ts
    - tsconfig.test.json
  modified:
    - package.json (add type:module, fix test script from sf-test to nyc mocha)
    - tsconfig.json (module: NodeNext, moduleResolution: NodeNext)
    - .mocharc.json (loader: ts-node/esm replaces require: ts-node/register)
    - src/commands/log/search.ts (ESM __dirname fix)
    - src/commands/log/trace.ts (ESM __dirname fix)
    - src/commands/log/download.ts (ESM __dirname fix)
    - src/commands/log/purge.ts (ESM __dirname fix)
    - src/commands/log/filter.ts (ESM __dirname fix)

key-decisions:
  - "ESM conversion required: @salesforce/sf-plugins-core v12 is ESM-only with top-level await in yoga-wasm-web transitive dependency; commonjs require() fails at runtime"
  - "ts-node/esm loader in .mocharc.json enables ESM TypeScript execution without pre-compilation"
  - "tsconfig.json changed to NodeNext for ESM import resolution; .js extensions required in imports"
  - "tsconfig.test.json (noEmit:true, rootDir:.) allows type-checking both src/ and test/ without changing build output"
  - "NUT execution deferred to Phase 1+: devhubAuthStrategy: 'NONE' means no org needed for Phase 0 scaffold"
  - "test script changed from sf-test (not in dev-scripts v11.0.4 bin/) to nyc mocha (direct invocation)"

patterns-established:
  - "Pattern: test/commands/log/<name>.test.ts imports from src/commands/log/<name>.js (ESM .js extension)"
  - "Pattern: test/commands/log/<name>.nut.ts uses execCmd with --help and devhubAuthStrategy: 'NONE'"
  - "Pattern: ESM __dirname workaround: fileURLToPath(import.meta.url) + dirname()"

requirements-completed: [INSTALL-01, INSTALL-02]

# Metrics
duration: 9min
completed: "2026-05-29"
---

# Phase 0 Plan 03: Test Infrastructure Summary

**10 unit test assertions passing (npm test exits 0), 5 NUT scaffolds compiling clean, with ESM project conversion required for @salesforce/sf-plugins-core v12 compatibility**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-05-29T12:22:08Z
- **Completed:** 2026-05-29T12:31:00Z
- **Tasks:** 2
- **Files modified:** 19 (11 test files + 5 command source files + 3 config files)

## Accomplishments

- Created 5 unit test files (test/commands/log/*.test.ts): each imports its command class and asserts it exists and has a non-empty summary string
- Created 5 NUT integration test scaffolds (test/commands/log/*.nut.ts): each uses execCmd with --help and devhubAuthStrategy: 'NONE'
- Converted project to ESM (package.json type:module, tsconfig NodeNext, mocha loader:ts-node/esm) to fix incompatibility with @salesforce/sf-plugins-core v12
- Fixed __dirname usage in all 5 command files with fileURLToPath(import.meta.url) pattern
- npm test exits 0 with 10 passing assertions (2 per command: class exists, summary non-empty)
- All 10 test files compile without TypeScript errors (verified via tsconfig.test.json)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create unit test scaffolds for all 5 commands** - `623d083` (feat)
2. **Task 2: Create NUT integration test scaffolds for all 5 commands** - `0c0c543` (feat)

## Files Created/Modified

- `test/commands/log/search.test.ts` - Unit tests: Search class defined, summary non-empty
- `test/commands/log/trace.test.ts` - Unit tests: Trace class defined, summary non-empty
- `test/commands/log/download.test.ts` - Unit tests: Download class defined, summary non-empty
- `test/commands/log/purge.test.ts` - Unit tests: Purge class defined, summary non-empty
- `test/commands/log/filter.test.ts` - Unit tests: Filter class defined, summary non-empty
- `test/commands/log/search.nut.ts` - NUT: log search --help exits 0, includes 'Search for Salesforce users'
- `test/commands/log/trace.nut.ts` - NUT: log trace --help exits 0, includes 'Initiate a debug log session'
- `test/commands/log/download.nut.ts` - NUT: log download --help exits 0, includes 'Download Salesforce debug logs'
- `test/commands/log/purge.nut.ts` - NUT: log purge --help exits 0, includes 'Delete Salesforce debug logs'
- `test/commands/log/filter.nut.ts` - NUT: log filter --help exits 0, includes 'Filter downloaded debug logs'
- `tsconfig.test.json` - Extends main tsconfig; includes src/ + test/; noEmit for type-checking only
- `package.json` - Added "type": "module"; changed test script from sf-test to nyc mocha
- `tsconfig.json` - Changed module/moduleResolution to NodeNext for ESM compatibility
- `.mocharc.json` - Changed require:ts-node/register to loader:ts-node/esm for ESM support
- `src/commands/log/search.ts` - ESM __dirname fix: fileURLToPath(import.meta.url)
- `src/commands/log/trace.ts` - ESM __dirname fix: fileURLToPath(import.meta.url)
- `src/commands/log/download.ts` - ESM __dirname fix: fileURLToPath(import.meta.url)
- `src/commands/log/purge.ts` - ESM __dirname fix: fileURLToPath(import.meta.url)
- `src/commands/log/filter.ts` - ESM __dirname fix: fileURLToPath(import.meta.url)

## Decisions Made

- ESM project conversion required — @salesforce/sf-plugins-core v12 uses ESM with top-level await (via yoga-wasm-web transitive dep); commonjs require() throws ERR_REQUIRE_ASYNC_MODULE at test runtime
- NodeNext module resolution requires .js extensions on relative imports in TypeScript source
- ts-node/esm loader handles TypeScript ESM files without pre-compilation step
- sf-test binary (from @salesforce/dev-scripts) is not present in v11.0.4; using nyc mocha directly

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] ESM/CJS incompatibility: @salesforce/sf-plugins-core v12 requires ESM mode**
- **Found during:** Task 1 (Create unit test scaffolds)
- **Issue:** ts-node with commonjs module system threw ERR_REQUIRE_ASYNC_MODULE when requiring @salesforce/sf-plugins-core. Root cause: yoga-wasm-web (transitive dep) has top-level await in its WASM loader; this is incompatible with synchronous require().
- **Fix:** Converted project to ESM: added "type": "module" to package.json, changed tsconfig.json module/moduleResolution to NodeNext, updated .mocharc.json to use ts-node/esm loader, fixed __dirname usage in 5 command files
- **Files modified:** package.json, tsconfig.json, .mocharc.json, src/commands/log/*.ts (all 5)
- **Verification:** npm test exits 0, 10 passing assertions
- **Committed in:** 623d083 (Task 1 commit)

**2. [Rule 3 - Blocking] sf-test not available in @salesforce/dev-scripts v11.0.4**
- **Found during:** Task 1 (First npm test attempt)
- **Issue:** package.json "test" script called sf-test which doesn't exist in node_modules/.bin/. @salesforce/dev-scripts v11.0.4 ships sf-clean, sf-docs, sf-install, sf-prepack but NOT sf-test.
- **Fix:** Changed "test" script from sf-test to nyc mocha (invokes mocha directly with coverage wrapper)
- **Files modified:** package.json
- **Verification:** npm test exits 0
- **Committed in:** 623d083 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 Rule 3 blocking issues)
**Impact on plan:** Both fixes required for tests to run. ESM conversion also improves long-term compatibility with modern Salesforce plugin ecosystem. All downstream plans benefit from the ESM foundation.

## Known Stubs

None in this plan's test files. All test assertions are real and passing.

The command source files modified by this plan contain intentional implementation stubs (e.g., `this.log('User search coming in Phase 1')`), but these were already documented in the Plan 02 summary and are out of scope for this plan.

## User Setup Required

None - unit tests run with `npm test` without any external configuration.
NUT tests require sf plugin to be linked and sf CLI available; deferred to Phase 1.

## Next Phase Readiness

- Test infrastructure complete for Phase 1-4 to add real assertions to .test.ts files
- NUT scaffolds ready for org-connected testing in Phase 1 (change devhubAuthStrategy: 'AUTO')
- ESM project foundation established for all subsequent phases
- Plan 00-05 (integration verification) can now run npm test as part of wave 3 verification

---
*Phase: 00-plugin-setup*
*Completed: 2026-05-29*
