# Phase 4: Log Filtering - Context

**Gathered:** 2026-05-31
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a `--keyword` flag to `sf log trace` that downloads all logs for the most recent session, scans the first 100 lines of each log for the keyword (case-insensitive substring match), keeps matching logs in the session directory, and moves non-matching logs to a `rejected/` subfolder. Terminal output shows a summary at the end. The standalone `sf log filter` command stub is not needed — all Phase 4 functionality is folded into `sf log trace`.

</domain>

<decisions>
## Implementation Decisions

### Log Selection

- **D-01:** `sf log filter` command is dropped — Phase 4 functionality is implemented as a `--keyword` flag on `sf log trace`, not a separate command.
- **D-02:** The `--keyword` flag operates on the most recent trace session. No override flag (`--session`, `--path`) needed in v1. Users who need older sessions access the filesystem directly.

### Keyword Matching

- **D-03:** Search only the **first 100 lines** of each log file. This is a deliberate v1 constraint — expandable later.
- **D-04:** Simple **case-insensitive substring match** — no regex, no glob patterns. `--keyword Account` matches any line containing "account", "Account", "ACCOUNT", etc.
- **D-05:** One keyword per run. The `--keyword` flag accepts a single string. Multiple-keyword support is v2.

### File Organization (replaces --export)

- **D-06:** Matching logs **stay in the session download directory** (`~/.local/share/sf/plugin-logs/{username}/{YYYY-MM-DD-HH-MM}/`).
- **D-07:** Non-matching logs **move to a `rejected/` subfolder** within the same session directory. No file is deleted — everything is preserved.
- **D-08:** The `--export` flag from the `filter.ts` stub is removed. File organization replaces file export as the primary v1 output mechanism.

### Terminal Output

- **D-09:** After download and filtering complete, show a **summary**:
  `"X logs matched \"<keyword>\", Y moved to rejected/. Logs saved to ~/.local/.../session/"`.
- **D-10:** No per-file status during scanning — summary only (consistent with Phase 3's progress-first-then-result pattern).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Phase Goals
- `.planning/ROADMAP.md` — Phase 4 goal, success criteria (note: command name changed from `sf log filter` to `sf log trace --keyword`)
- `.planning/REQUIREMENTS.md` — FILTER-01, FILTER-02, FILTER-03 requirement definitions (note: FILTER-03 export behavior replaced by `rejected/` folder organization per D-06/D-07)

### Phase Context & Integration
- `.planning/phases/03-log-management/03-CONTEXT.md` — Download integration decisions; `sf log trace` extension patterns; session directory structure (D-08 from Phase 3)
- `.planning/phases/02-debug-sessions/02-CONTEXT.md` — Trace command patterns, watch mode, `--target-org` flag, JSON output structure

### Codebase — Files to Read and Extend
- `src/commands/log/trace.ts` — **Primary file to extend** with `--keyword` flag and filtering logic
- `src/utils/storage-manager.ts` — Session directory management; use `getBaseStorageDir()` and related helpers for `rejected/` subfolder creation
- `src/utils/download-helper.ts` — Download helper; reuse for downloading all logs in session
- `src/types/download.ts` — `ApexLogRecord`, `DownloadResult`, `DownloadProgress`, `DownloadSessionMetadata` types
- `src/commands/log/filter.ts` — **Stub to remove or hollow out** (command is no longer needed)
- `messages/log.filter.md` — Messages file for filter stub (remove or deprecate)

### Technology & Patterns
- `CLAUDE.md` — Tech stack rationale, jsforce patterns, `--json` output requirements
- Node.js `fs/promises` — `rename()` for moving files to `rejected/` subfolder, `readline` or manual read for first-100-lines scan

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`src/utils/storage-manager.ts`** — `getSessionDir()` and path construction utilities; extend to create `rejected/` subfolder within an existing session directory
- **`src/utils/download-helper.ts`** — Already handles ApexLog download with streaming; reuse to download all logs before filtering
- **`src/types/download.ts`** — `ApexLogRecord` type provides `Id`, `LogUserId`, `StartTime`, `LogLength`; `DownloadResult` has `filePath` needed for the move operation
- **`src/commands/log/trace.ts`** — Add `--keyword` flag alongside existing `--target-org`, `--no-watch`, `--overwrite` flags; filtering runs after download loop completes

### Established Patterns
- **Flag parsing:** `Flags.string({ char: 'k', summary: '...', required: false })` — same pattern as existing flags; `--keyword` is optional (trace works without it)
- **JSON output:** Phase 1/2/3 pattern: structured result type returned from `run()`, `--json` flag automatically serializes it
- **Error messages:** Actionable guidance per UX-02 — if no logs match, say so clearly and note that all logs are in `rejected/`
- **Progress display:** Phase 3 shows time elapsed, ETA, file count during download; filtering summary appended after download completes

### Integration Points
- **Trace command flow:** Current: create trace flag → watch mode + download in parallel. Phase 4 adds: after download completes, if `--keyword` is set, scan files and move non-matches to `rejected/`
- **Session metadata:** `DownloadSessionMetadata` written to `metadata.json` in session dir; consider recording `keyword` used for filtering in this metadata file
- **`rejected/` folder:** Created as `{sessionDir}/rejected/` using `path.join(sessionDir, 'rejected')` and `fs.mkdir()` with `recursive: true`

</code_context>

<specifics>
## Specific Ideas

- The `rejected/` folder name is explicitly what the user wants — do not rename it to `filtered-out/` or `excluded/`.
- First 100 lines per file is a deliberate constraint — do not expand to full-file scan in v1 even if performance allows.
- Case-insensitive substring match: use `line.toLowerCase().includes(keyword.toLowerCase())` or equivalent — no regex.
- Summary message format: `"X logs matched "<keyword>", Y moved to rejected/. Logs saved to <session_path>"`

</specifics>

<deferred>
## Deferred Ideas

- **Full-file scan** (v2) — User explicitly called out first 100 lines as v1 constraint; full-file scanning is the natural v2 upgrade.
- **Multiple keywords** (`--keyword` used multiple times with AND/OR logic) — v2.
- **Regex pattern support** — v2.
- **Export to file** (`--export results.txt`) — The original FILTER-03 requirement was replaced by `rejected/` folder organization for v1. Structured export is v2.
- **`sf log filter` as standalone command** — The stub exists but is unused in v1. Could be revived in v2 as a post-download analysis tool.
- **Interactive session picker** — Let user choose which session to filter. v2.
- **Per-file status during scan** — Verbose progress mode showing match/reject per file. v2.

</deferred>

---

*Phase: 4-Log Filtering*
*Context gathered: 2026-05-31*
