# Phase 4: Log Filtering - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-31
**Phase:** 4-Log Filtering
**Areas discussed:** Log selection, Keyword matching, Export format

---

## Log Selection

### Q1: Default scan target

| Option | Description | Selected |
|--------|-------------|----------|
| Most recent session | Automatically scans latest timestamped folder in storage dir | ✓ |
| Interactive session picker | @inquirer/prompts list of all sessions | |
| All downloaded logs | Scan everything across all users and sessions | |

**User's choice:** Most recent session
**Notes:** Zero-friction default — user ran trace moments ago and wants to filter those logs immediately.

### Q2: Override mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| --session flag with interactive picker | Opens session list when flag provided | |
| --path flag for explicit directory | Accept raw directory path | |
| No override — most recent only | Keep it simple | ✓ |

**User's choice:** No override — most recent only
**Notes:** v1 simplicity. Users who need older sessions use the filesystem directly.

---

## Keyword Matching

### Q1: Matching strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Case-insensitive substring | Simple grep-style matching | |
| Case-insensitive + basic glob | Wildcard support for object families | |
| Full regex | Maximum power | |
| Other (freeform) | — | ✓ |

**User's choice:** "For now we need a simple search that only searches the first 100 lines of every log for a string, we can expand on this at a later date"
**Notes:** Significant v1 constraint — first 100 lines only. Deliberate decision to keep it simple and expandable. Case sensitivity not explicitly stated; defaulting to case-insensitive.

### Q2: Multiple keywords

| Option | Description | Selected |
|--------|-------------|----------|
| One keyword per run | Single --keyword flag, single string | ✓ |
| Multiple --keyword flags (OR logic) | Match any of N keywords | |

**User's choice:** One keyword per run

---

## Export Format (pivoted: became File Organization then Architecture)

### Q1: File contents for --export

| Option | Description | Selected |
|--------|-------------|----------|
| Matching lines only, plain text | grep-compatible output | |
| Matching lines with metadata header | Header block + matches | |
| JSON with structured matches | Array of {file, line, content} | |
| Other (freeform) | — | ✓ |

**User's choice:** "We do not need an --export flag, all the log for the session should be downloaded, logs that match the filter should stay in the download directory, other logs that didn't match the filter should go in a `rejected` folder within the same session download directory"
**Notes:** Complete pivot — file-level organization replaces content export. --export flag dropped. `rejected/` subfolder is the v1 mechanism for distinguishing matched vs. non-matched logs.

### Q2: Download vs. already-downloaded

| Option | Description | Selected |
|--------|-------------|----------|
| sf log filter is an alternative download path | Either trace or filter can download | |
| sf log filter downloads fresh | Always fetches from org | |
| sf log filter only reorganizes already-downloaded | Requires Phase 3 download first | |

**User's choice (via follow-up pivot):** Downloads + filters in one command

### Q3: Architecture — separate command vs. flag on trace

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, --keyword flag added to sf log trace | Filtering built into trace | ✓ |
| Separate sf log filter command, different behavior | Keep filter command, different UX | |

**User's choice:** Yes — `sf log trace --keyword "Account"` is the Phase 4 interface. `sf log filter` command is dropped.

### Q4: Terminal output

| Option | Description | Selected |
|--------|-------------|----------|
| Summary at the end | After completion: "X matched, Y rejected" | ✓ |
| Per-file status during download | Verbose: match/reject per file | |
| You decide | Claude picks | |

**User's choice:** Summary at the end

---

## Claude's Discretion

- Case sensitivity defaulted to case-insensitive (user did not respond to plain-text follow-up before selecting "Next area")

## Deferred Ideas

- Full-file scan (v1 constraint: first 100 lines only)
- Multiple keywords
- Regex pattern support
- `--export` to file (FILTER-03 replaced by rejected/ organization for v1)
- `sf log filter` as standalone command (stub exists; not used in v1)
- Interactive session picker
- Per-file verbose status during scan
