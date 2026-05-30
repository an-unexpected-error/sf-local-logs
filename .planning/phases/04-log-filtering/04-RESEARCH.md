# Phase 4: Log Filtering - Research

**Researched:** 2026-05-31
**Domain:** Node.js filesystem operations, readline scanning, Salesforce CLI plugin extension patterns
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Log Selection**
- D-01: `sf log filter` command is dropped — Phase 4 functionality is implemented as a `--keyword` flag on `sf log trace`, not a separate command.
- D-02: The `--keyword` flag operates on the most recent trace session. No override flag (`--session`, `--path`) needed in v1. Users who need older sessions access the filesystem directly.

**Keyword Matching**
- D-03: Search only the **first 100 lines** of each log file. This is a deliberate v1 constraint — expandable later.
- D-04: Simple **case-insensitive substring match** — no regex, no glob patterns. `--keyword Account` matches any line containing "account", "Account", "ACCOUNT", etc.
- D-05: One keyword per run. The `--keyword` flag accepts a single string. Multiple-keyword support is v2.

**File Organization (replaces --export)**
- D-06: Matching logs **stay in the session download directory** (`~/.local/share/sf/plugin-logs/{username}/{YYYY-MM-DD-HH-MM}/`).
- D-07: Non-matching logs **move to a `rejected/` subfolder** within the same session directory. No file is deleted — everything is preserved.
- D-08: The `--export` flag from the `filter.ts` stub is removed. File organization replaces file export as the primary v1 output mechanism.

**Terminal Output**
- D-09: After download and filtering complete, show a **summary**: `"X logs matched "<keyword>", Y moved to rejected/. Logs saved to ~/.local/.../session/"`.
- D-10: No per-file status during scanning — summary only (consistent with Phase 3's progress-first-then-result pattern).

### Claude's Discretion
None specified.

### Deferred Ideas (OUT OF SCOPE)
- Full-file scan (v2)
- Multiple keywords with AND/OR logic (v2)
- Regex pattern support (v2)
- Export to file (`--export results.txt`) (v2)
- `sf log filter` as standalone command (v2)
- Interactive session picker (v2)
- Per-file status during scan (v2)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FILTER-01 | User can filter downloaded logs by keyword (SObject or Platform Event name) | D-03/D-04 scanning pattern verified: `readline.createInterface` + `line.toLowerCase().includes(kw.toLowerCase())` — full flow tested |
| FILTER-02 | Filtered results are displayed with matching log entries highlighted | Summary message per D-09/D-10; note ROADMAP says "highlighted" but CONTEXT.md overrides to summary-only; planner must resolve |
| FILTER-03 | User can export filtered results to a file | D-08 replaces file export with `rejected/` folder organization; CONTEXT.md locks this — planner uses `fs.rename` approach |
| UX-01 | CLI displays status messages clearly explaining what's happening at each step | Existing messages pattern in `messages/log.trace.md`; new keyword/filter messages extend same file |
| UX-02 | Error messages provide actionable remediation guidance | Pattern established: if 0 matches, say so and note all logs are in `rejected/`; matches Phase 1/2/3 error style |
| UX-04 | All commands support `--json` output for programmatic use | `TraceWithDownloadResult` type extended with `filterResult` field; `SfCommand` handles `--json` automatically |
</phase_requirements>

---

## Summary

Phase 4 is a focused extension of the existing `sf log trace` command. No new packages are required — all functionality is implemented using Node.js built-in APIs (`fs/promises`, `readline/promises`) that are already available at Node 18+. The filtering logic is a pure file-system post-processing step that runs after the download loop in `trace.ts` completes.

The core pattern is: if `--keyword` is provided, iterate over `.json` log files in the session directory, scan the first 100 lines of each with `readline.createInterface`, apply a case-insensitive substring match, and move non-matching files to `{sessionDir}/rejected/` using `fs.rename`. This entire flow was verified end-to-end with a Node.js simulation. The ANSI highlighting that ROADMAP.md references is superseded by CONTEXT.md D-10 (summary-only); the planner must reconcile FILTER-02's "highlighted" wording against the locked D-10 decision.

The only cleanup work in this phase is hollowing out `src/commands/log/filter.ts` (the stub command, which is no longer needed) while preserving the file to avoid breaking the NUT test that checks `sf log filter --help`.

**Primary recommendation:** Implement filtering as a new private method `filterDownloadedLogs(sessionDir, keyword)` in `trace.ts`, called after `initiateDownloadAfterTrace` completes. Extend `TraceWithDownloadResult` with a `filterResult` property for `--json` output. Add new message keys to `messages/log.trace.md` for keyword-related status. Update `messages/log.filter.md` to reflect the stub status. Update existing tests in `test/commands/log/filter.test.ts` accordingly.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Keyword flag parsing | CLI Command (`trace.ts`) | — | Flag declared in `Trace.flags`; parsed by oclif/SfCommand |
| Scanning log files for keyword | CLI Utility (`filter-helper.ts`) | — | Pure filesystem logic; belongs in utils layer, not in command class |
| Moving files to `rejected/` | CLI Utility (`filter-helper.ts`) | — | `fs.rename` operation, same utility as scanning |
| Creating `rejected/` subfolder | CLI Utility (`filter-helper.ts`) | Storage Manager | `mkdir({recursive:true})` using same pattern as `storage-manager.ts` |
| Summary message output | CLI Command (`trace.ts`) | — | Calls `this.log()` after filter utility returns results |
| JSON output of filter result | CLI Command (`trace.ts`) | — | `TraceWithDownloadResult` extended; SfCommand serializes automatically |
| Removing `sf log filter` stub | CLI Command (`filter.ts`) | Messages (`log.filter.md`) | Hollow out command body; keep file to avoid NUT breakage |

---

## Standard Stack

### Core — No New Dependencies

All Phase 4 functionality uses built-in Node.js APIs and already-installed packages. No `npm install` step is required.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:readline` | built-in (Node 18+) | Line-by-line scanning of log files | Standard Node.js API; `createInterface` + async iteration handles first-N-lines efficiently without loading entire file |
| `node:fs/promises` | built-in (Node 18+) | `rename()` for moving files, `mkdir()` for `rejected/`, `readdir()` for listing session files | Already used in `storage-manager.ts`; consistent with existing patterns |
| `node:path` | built-in | `join()` for constructing `rejected/` path | Already used throughout codebase; path safety pattern established |
| `chalk` | ^5.6.2 (installed) | Optional: terminal output emphasis in summary line | Already in `package.json` dependencies; available if planner chooses to use it for the summary message display |

[VERIFIED: codebase] All above packages confirmed present via `package.json` and `node_modules` inspection.

### Supporting — Already Installed
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `sinon` | 17.0.2 (transitive) | Mocking `fs/promises` in unit tests | Available as transitive dependency; already used in `trace.test.ts` |
| `@salesforce/sf-plugins-core` | ^12 | `Flags.string()` for `--keyword` flag declaration | Same pattern as all existing flags |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `node:readline` createInterface | `fs.readFile` then split | readline scans line-by-line without loading whole file into memory; important for 10-100MB log files |
| `node:readline` createInterface | `readline/promises` module | Both work; `readline/promises` is slightly cleaner async API but `createInterface` + `for await` also works cleanly and is more widely documented |
| `fs.rename` | `fs.copyFile` + `fs.unlink` | `rename` is atomic within same filesystem (session dir to rejected/ subfolder); copyFile+unlink is not atomic and wastes I/O |

**Installation:** No new packages. All tools are built-in or already installed.

---

## Package Legitimacy Audit

> Phase 4 installs **zero new packages**. All functionality is implemented with Node.js built-ins (`node:readline`, `node:fs/promises`, `node:path`) and packages already present in `package.json`. This section is provided for completeness.

| Package | Registry | Status | Disposition |
|---------|----------|--------|-------------|
| `node:readline` | Node.js built-in | Built-in | Approved — no install |
| `node:fs/promises` | Node.js built-in | Built-in | Approved — no install |
| `node:path` | Node.js built-in | Built-in | Approved — no install |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```
sf log trace --keyword "Account" --target-org my-org
        │
        ├─► [Existing] Parse flags (target-org, user-id, level, no-watch, overwrite)
        │
        ├─► [Existing] Interactive user search or --user-id bypass
        │
        ├─► [Existing] Create TraceFlag via Tooling API
        │
        ├─► [Existing] initiateDownloadAfterTrace()
        │       └─► Downloads logs to {sessionDir}/*.json
        │
        ├─► [NEW] if (keyword) filterDownloadedLogs(sessionDir, keyword)
        │       ├─► readdir(sessionDir) → find *.json (exclude metadata.json)
        │       ├─► for each logFile:
        │       │     ├─► readline scan first 100 lines
        │       │     ├─► case-insensitive includes(keyword)?
        │       │     │     YES → file stays in sessionDir (match)
        │       │     │     NO  → fs.rename → sessionDir/rejected/logFile
        │       ├─► returns { matched: number, rejected: number, sessionDir }
        │
        ├─► [NEW] this.log(summary message)  ← D-09 format
        │     "X log(s) matched "keyword", Y moved to rejected/. Logs saved to {path}"
        │
        └─► return TraceWithDownloadResult (extended with filterResult for --json)
```

### Recommended Project Structure

```
src/
├── commands/log/
│   ├── trace.ts          # EXTEND: add --keyword flag + call filterDownloadedLogs()
│   └── filter.ts         # HOLLOW OUT: remove stub body, keep class for NUT compat
├── utils/
│   ├── filter-helper.ts  # NEW: filterDownloadedLogs(), scanFirstNLines()
│   ├── storage-manager.ts # NO CHANGE: already provides getStorageBaseDirectory()
│   └── download-helper.ts # NO CHANGE: download flow unchanged
└── types/
    └── download.ts       # EXTEND: add FilterResult interface

messages/
├── log.trace.md          # EXTEND: add keyword flag summary + filter summary messages
└── log.filter.md         # UPDATE: update stub description to reflect Phase 4 decision

test/commands/log/
├── filter.test.ts        # UPDATE: replace stub assertions, add keyword/filter tests
└── filter.nut.ts         # NO CHANGE: `sf log filter --help` still works (stub kept)
test/utils/
└── filter-helper.test.ts # NEW: unit tests for scanFirstNLines() and filterDownloadedLogs()
```

### Pattern 1: Readline First-N-Lines Scan

**What:** Read first N lines of a file without loading the whole file into memory.
**When to use:** Scanning log files that can be 10-100MB; avoids memory issues.

```typescript
// Source: Node.js docs https://nodejs.org/api/readline.html — verified by Bash execution
import { createInterface } from 'node:readline';
import { createReadStream } from 'node:fs';

async function scanFirstNLines(
  filePath: string,
  maxLines: number,
  keyword: string
): Promise<boolean> {
  const kwLower = keyword.toLowerCase();
  let lineCount = 0;
  
  const rl = createInterface({
    input: createReadStream(filePath),
    crlfDelay: Infinity,  // handles \r\n line endings on Windows
  });
  
  for await (const line of rl) {
    if (line.toLowerCase().includes(kwLower)) {
      rl.close();
      return true;
    }
    lineCount++;
    if (lineCount >= maxLines) {
      rl.close();
      break;
    }
  }
  
  return false;
}
```

[VERIFIED: Bash execution] Full flow tested with multiple log files; readline closes cleanly when `maxLines` is reached.

### Pattern 2: Move File to `rejected/` Subfolder

**What:** Atomically move a file to a `rejected/` subdirectory within the same filesystem.
**When to use:** For each non-matching log file after scanning.

```typescript
// Source: Node.js docs — verified by Bash execution
import { mkdir, rename, readdir } from 'node:fs/promises';
import { join } from 'node:path';

async function filterDownloadedLogs(
  sessionDir: string,
  keyword: string
): Promise<{ matched: number; rejected: number; sessionDir: string }> {
  // Create rejected/ subfolder upfront (idempotent via recursive)
  const rejectedDir = join(sessionDir, 'rejected');
  await mkdir(rejectedDir, { recursive: true });
  
  // List only log files (exclude metadata.json and the rejected/ subdir)
  const entries = await readdir(sessionDir);
  const logFiles = entries.filter(
    (f) => f.endsWith('.json') && f !== 'metadata.json'
  );
  
  let matched = 0;
  let rejected = 0;
  
  for (const logFile of logFiles) {
    const filePath = join(sessionDir, logFile);
    const isMatch = await scanFirstNLines(filePath, 100, keyword);
    
    if (isMatch) {
      matched++;
    } else {
      rejected++;
      await rename(filePath, join(rejectedDir, logFile));
    }
  }
  
  return { matched, rejected, sessionDir };
}
```

[VERIFIED: Bash execution] `rename()` correctly moves files; `readdir()` returns only files, not the `rejected/` directory entry when filtering for `.json`.

### Pattern 3: Extend TraceWithDownloadResult for --json

**What:** Add filter result to the existing JSON output type.
**When to use:** When `--keyword` flag is provided; attach result to existing return type.

```typescript
// Source: existing pattern in trace.ts
export type FilterResult = {
  keyword: string;
  matched: number;
  rejected: number;
  sessionDir: string;
};

type TraceWithDownloadResult = TraceResult & {
  downloadResults?: DownloadResult[];
  downloadSessionDir?: string;
  filterResult?: FilterResult;  // NEW: undefined when --keyword not used
};
```

### Pattern 4: Keyword Flag Declaration

**What:** Add optional `--keyword` flag to Trace command following existing flag pattern.
**When to use:** Trace command flags block.

```typescript
// Source: existing pattern in trace.ts + sf-plugins-core docs
'keyword': Flags.string({
  char: 'k',
  summary: messages.getMessage('flagKeyword'),
  required: false,
}),
```

### Pattern 5: Summary Message After Filtering

**What:** Log the D-09 summary message after filtering completes.
**When to use:** In `run()`, after `filterDownloadedLogs()` returns.

```typescript
// Format from CONTEXT.md D-09 and D-10
this.log(
  messages.getMessage('filterSummary', [
    filterResult.matched,
    keyword,
    filterResult.rejected,
    filterResult.sessionDir,
  ])
);
// Message template: '%d log(s) matched "%s", %d moved to rejected/. Logs saved to %s'
```

### Anti-Patterns to Avoid

- **Reading full file into memory:** Never use `fs.readFile(filePath)` then split on newlines for 10-100MB log files. Use `readline.createInterface` for streaming line-by-line access.
- **String concatenation for paths:** Never `sessionDir + '/rejected/' + logFile`. Always `path.join(sessionDir, 'rejected', logFile)`.
- **Not closing readline on early exit:** Always call `rl.close()` when breaking out of the `for await` loop before exhausting all lines. Readline holds a file handle open.
- **Using copyFile+unlink instead of rename:** `rename()` is atomic within the same filesystem mount. `copyFile` + `unlink` is two operations and wastes I/O for large files.
- **Deleting non-matching files:** D-07 explicitly requires preservation. Never `unlink()` — always `rename()` to `rejected/`.
- **Making `--keyword` required:** Flag must be optional (`required: false`). `sf log trace` without `--keyword` is the normal flow; filtering is additive.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Line-by-line file scanning | Custom chunk buffering with `createReadStream` | `readline.createInterface` + `for await` | readline handles line endings (CRLF/LF), backpressure, and cleanup automatically |
| Path construction | String concatenation | `path.join()` | Cross-platform; prevents path traversal; consistent with existing codebase |
| Directory creation | Manual check-then-create | `fs.mkdir({ recursive: true })` | Atomic; handles race conditions; idempotent if `rejected/` already exists |
| Case-insensitive match | Regex with `i` flag | `str.toLowerCase().includes(kw.toLowerCase())` | Simpler, faster, no regex injection risk, exactly what D-04 specifies |
| Flag declaration | Custom arg parsing | `Flags.string()` from `@salesforce/sf-plugins-core` | Consistent with all other flags; oclif handles parsing, help text, and JSON output |

**Key insight:** This phase is deliberately thin. Every pattern it needs already exists in the codebase (`storage-manager.ts` for mkdir, `download-helper.ts` for file I/O patterns) or in Node.js built-ins. The planner should resist adding complexity.

---

## Common Pitfalls

### Pitfall 1: Readline Handle Not Closed on Early Exit
**What goes wrong:** If the `for await` loop `break`s before exhausting all lines (at maxLines=100), the readline interface keeps the file descriptor open.
**Why it happens:** `for await` doesn't auto-close the interface on `break`.
**How to avoid:** Always call `rl.close()` before `break`ing out of the scan loop and before `return true`.
**Warning signs:** File descriptor leak warnings; process hangs after filtering many logs.

### Pitfall 2: `readdir` Returns Subdirectory Names
**What goes wrong:** `readdir(sessionDir)` returns `['rejected', '07aFX00000aaaaa.json', 'metadata.json']`. If the filter doesn't exclude `'rejected'`, the code tries to `createReadStream('rejected')` which fails (it's a directory).
**Why it happens:** `readdir` returns both files and directories.
**How to avoid:** Filter to `f.endsWith('.json') && f !== 'metadata.json'`. The `rejected/` directory doesn't end in `.json` so it's naturally excluded.
**Warning signs:** `EISDIR` error during readline scan.

### Pitfall 3: `rename()` Across Filesystems Fails
**What goes wrong:** `fs.rename()` throws `EXDEV: cross-device link not permitted` if source and destination are on different filesystem mounts.
**Why it happens:** `rename` is a filesystem-level operation; it can't move across mount points.
**How to avoid:** Since `rejected/` is a subdirectory of `sessionDir`, both are always on the same filesystem. This pitfall cannot occur in this design.
**Warning signs:** If v2 ever adds a custom export path, this pitfall becomes real.

### Pitfall 4: Empty Session Directory (No Downloads Yet)
**What goes wrong:** `filterDownloadedLogs()` called when `downloadResults` is empty (no logs generated yet). `logFiles` array is empty; filtering loop runs 0 times.
**Why it happens:** High-volume scenario — logs haven't appeared yet when trace starts.
**How to avoid:** Guard: if `downloadResults.length === 0`, skip filtering. Show message "No logs to filter — no downloads completed." Don't call `filterDownloadedLogs` at all.
**Warning signs:** Summary shows "0 matched, 0 rejected" with no useful guidance.

### Pitfall 5: `sessionDir` Undefined When Filtering
**What goes wrong:** In `trace.ts`, `sessionDir` is derived from `downloadResults`; if all downloads fail, `sessionDir` is `undefined`. Calling `filterDownloadedLogs(undefined, keyword)` crashes.
**Why it happens:** Current `trace.ts` logic only sets `sessionDir` when a successful download exists.
**How to avoid:** Guard: `if (keyword && sessionDir)` before calling `filterDownloadedLogs`. If downloads all failed, log a warning and skip filtering.

### Pitfall 6: REQUIREMENTS.md vs CONTEXT.md Mismatch on FILTER-02 and FILTER-03
**What goes wrong:** REQUIREMENTS.md says "Filtered results are displayed with matching log entries highlighted" (FILTER-02) and "User can export filtered results to a file" (FILTER-03). CONTEXT.md D-08/D-10 override these to summary-only + rejected-folder organization. Building the original REQUIREMENTS.md behavior would contradict locked decisions.
**Why it happens:** Phase context updated the requirements but REQUIREMENTS.md wasn't amended.
**How to avoid:** Planner should treat CONTEXT.md D-08/D-10 as the authoritative spec for this phase. FILTER-02 is satisfied by the summary message; FILTER-03 is satisfied by the `rejected/` folder.

---

## Code Examples

### Verified Filter Flow (complete simulation — Bash verified)

```typescript
// Source: Bash execution test — 2026-05-31
// Verified: 3 log files, 2 matched "Account", 1 moved to rejected/
// Session dir files after: ['07aFX00000aaaaa.json', '07aFX00000ccccc.json', 'metadata.json']
// rejected/ files: ['07aFX00000bbbbb.json']

// Summary message: '2 log(s) matched "Account", 1 moved to rejected/. Logs saved to /tmp/...'
```

### Extending TraceWithDownloadResult Safely

```typescript
// In trace.ts — after filter step
if (keyword && sessionDir) {
  try {
    const filterResult = await filterDownloadedLogs(sessionDir, keyword);
    this.log(messages.getMessage('filterSummary', [
      filterResult.matched,
      keyword,
      filterResult.rejected,
      filterResult.sessionDir,
    ]));
    result.filterResult = filterResult;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    this.warn(`Filtering failed: ${errorMsg}. All logs remain in ${sessionDir}`);
  }
}
```

### Messages to Add in `log.trace.md`

```markdown
# flagKeyword
Filter downloaded logs by keyword. Matching logs stay in the session directory; non-matching logs move to rejected/.

# filterSummary
%d log(s) matched "%s", %d moved to rejected/. Logs saved to %s

# filterSkippedNoDownloads
No logs downloaded — skipping keyword filter.

# filterError
Keyword filtering failed: %s. All logs remain in %s
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `sf log filter` standalone command (Phase 0 stub) | `sf log trace --keyword` flag (Phase 4 decision) | CONTEXT.md 2026-05-31 | filter.ts stub must be hollowed out; NUT test updated |
| Export to file (FILTER-03 original) | Move to `rejected/` subfolder (D-07/D-08) | CONTEXT.md 2026-05-31 | No file export; fs.rename replaces write-to-file |
| Per-file highlighting in output (FILTER-02 original) | Summary-only output (D-10) | CONTEXT.md 2026-05-31 | Simpler output; chalk not required for highlighting |

**Deprecated/outdated:**
- `filter.ts` stub body (`this.log('Log filtering coming in Phase 4')`): Replace with stub that either errors gracefully or does nothing; keep class definition to avoid NUT breakage.
- `messages/log.filter.md` examples showing `--export` flag: Update to reflect that export is removed.
- `filter.test.ts` import of `Filter` command and stub assertions: Update to test the hollowed-out state.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `sinon` is available as a transitive dependency and can be imported in tests | Standard Stack | Test scaffolding would need to add sinon explicitly to `devDependencies` |
| A2 | Existing `filter.nut.ts` test checks `sf log filter --help` output text that will still be valid after hollowing out `filter.ts` | Architecture Patterns | NUT test would fail; `filter.nut.ts` would need updating too |

**Risk mitigation for A2:** The NUT currently checks for "Filter downloaded debug logs" text in help output. That text comes from `messages/log.filter.md # summary`. As long as the summary line is preserved during the hollow-out, the NUT passes. Planner must note this in the task that modifies `filter.ts`.

---

## Open Questions

1. **FILTER-02 interpretation: summary vs. highlighting**
   - What we know: ROADMAP.md says "matching log entries visually distinguished", CONTEXT.md D-10 says "summary only"
   - What's unclear: Does "summary only" satisfy FILTER-02, or does the planner need to add chalk-highlighted file names in the summary output?
   - Recommendation: D-10 wins (CONTEXT.md is the authoritative override). The summary message itself constitutes the "visual distinction" — it identifies which logs matched. Planner should not add per-line highlighting.

2. **`filter.ts` disposal: hollow out or delete**
   - What we know: D-01 drops the `sf log filter` command; `filter.nut.ts` still tests `sf log filter --help`
   - What's unclear: Should `filter.ts` be a full empty stub or contain a deprecation notice?
   - Recommendation: Keep the class but replace `run()` body with a message like "Use `sf log trace --keyword` for log filtering." This preserves NUT compatibility and guides users who still try the old command.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `node:readline` | `scanFirstNLines()` | ✓ | Node.js built-in (v22.22.3 found) | — |
| `node:fs/promises` | `filterDownloadedLogs()` | ✓ | Node.js built-in | — |
| `node:path` | path construction | ✓ | Node.js built-in | — |
| `chalk` ^5.6.2 | optional summary styling | ✓ | 5.6.2 installed | Skip chalk, use plain text |
| `sinon` 17.0.2 | unit test mocking | ✓ | 17.0.2 (transitive) | Add to devDependencies explicitly |
| `mocha` + `ts-node` | test runner | ✓ | mocha ^10, ts-node ^10.9.2 | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | mocha ^10 + chai ^4 + ts-node/esm |
| Config file | `.mocharc.cjs` (spec: `test/**/*.test.ts`, timeout: 10000) |
| Quick run command | `npm test` |
| Full suite command | `npm test` (261 tests, ~8s) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FILTER-01 | `scanFirstNLines()` returns true when keyword in first 100 lines | unit | `npm test` | ❌ Wave 0: `test/utils/filter-helper.test.ts` |
| FILTER-01 | `scanFirstNLines()` returns false when keyword absent | unit | `npm test` | ❌ Wave 0 |
| FILTER-01 | `filterDownloadedLogs()` moves non-matching files to `rejected/` | unit | `npm test` | ❌ Wave 0 |
| FILTER-01 | `--keyword` flag parsed and passed to filter flow | unit | `npm test` | ❌ Wave 0: extend `test/commands/log/trace.test.ts` |
| FILTER-02 | Summary message includes matched count and keyword | unit | `npm test` | ❌ Wave 0 |
| FILTER-02 | Summary message includes rejected count and session path | unit | `npm test` | ❌ Wave 0 |
| FILTER-03 | Non-matching files exist in `rejected/` subfolder (not deleted) | unit | `npm test` | ❌ Wave 0 |
| UX-01 | `filterSummary` message key present in `log.trace.md` | unit | `npm test` | ❌ Wave 0 |
| UX-02 | Zero-matches case logs actionable message (all in `rejected/`) | unit | `npm test` | ❌ Wave 0 |
| UX-04 | `--json` output includes `filterResult` when `--keyword` used | unit | `npm test` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test` (full suite, 261 tests + new filter tests, ~10s)
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/utils/filter-helper.test.ts` — covers FILTER-01, FILTER-03 (unit tests for `scanFirstNLines` and `filterDownloadedLogs`)
- [ ] `src/utils/filter-helper.ts` — new utility (must exist before test can import it)
- [ ] Extend `test/commands/log/trace.test.ts` — add `--keyword` flag assertions (covers FILTER-01, FILTER-02, UX-04)
- [ ] Update `test/commands/log/filter.test.ts` — replace stub-checking assertions with hollowed-out state assertions

---

## Security Domain

> `security_enforcement: true` in `.planning/config.json`; `security_asvs_level: 1`.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | Filtering operates on files already downloaded by authenticated session; no new access control needed |
| V5 Input Validation | yes | Keyword is user-supplied string; must not be injected into regex or eval; `str.toLowerCase().includes(kw.toLowerCase())` is injection-safe |
| V6 Cryptography | no | — |

### Known Threat Patterns for Node.js Filesystem + User Input

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal via keyword | Tampering | Keyword is not used in path construction — only in `includes()` check. No risk. |
| Regex injection (if regex were used) | Tampering | D-04 explicitly bans regex; `includes()` is injection-safe |
| EISDIR / symlink attack via session dir | Tampering | `sessionDir` is derived internally from `createSessionDirectory()` which uses `path.join()` + sanitized inputs; user cannot inject a custom path in v1 |
| Excessive memory from large log files | DoS | `readline.createInterface` streams line-by-line; never buffers full file; mitigated by design |

**Security verdict:** Phase 4 introduces no new attack surface. The keyword string is only used in a `String.prototype.includes()` call, which cannot cause path traversal, code injection, or regex injection. File operations operate on paths constructed by the existing sanitized `storage-manager.ts` functions.

---

## Sources

### Primary (HIGH confidence)
- Node.js readline documentation — `createInterface`, async iteration pattern, `crlfDelay: Infinity` — [VERIFIED: Bash execution]
- Node.js fs/promises — `rename()`, `mkdir()`, `readdir()` — [VERIFIED: Bash execution]
- `src/commands/log/trace.ts` — existing command structure, flag patterns, `TraceWithDownloadResult` type — [VERIFIED: codebase]
- `src/utils/storage-manager.ts` — `path.join()` pattern, `mkdir({recursive:true})` pattern — [VERIFIED: codebase]
- `.mocharc.cjs`, `package.json` — test framework and scripts — [VERIFIED: codebase]
- `.planning/phases/04-log-filtering/04-CONTEXT.md` — all locked decisions D-01 through D-10 — [VERIFIED: codebase]

### Secondary (MEDIUM confidence)
- `chalk` v5.6.2 import verified in Bash; ANSI output confirmed at `level: 3` — [VERIFIED: Bash execution]
- `sinon` 17.0.2 available as transitive dep — [VERIFIED: Bash execution]

### Tertiary (LOW confidence)
- None.

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — all tools are Node.js built-ins or already installed; verified with Bash
- Architecture: HIGH — full filter flow simulated end-to-end in Bash; patterns match existing codebase conventions
- Pitfalls: HIGH — derived from direct code inspection and Bash execution tests, not training data assumptions
- Test Map: HIGH — existing test infrastructure confirmed working (261 tests passing); gaps explicitly identified

**Research date:** 2026-05-31
**Valid until:** 2026-07-01 (stable Node.js built-ins; no fast-moving dependencies)
