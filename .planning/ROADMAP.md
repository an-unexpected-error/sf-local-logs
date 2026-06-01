# Roadmap: Salesforce Debug Log CLI Plugin

**Project:** Salesforce Debug Log CLI Plugin  
**Milestone:** v1.1 Overlapping Trace Flag Handling  
**Mode:** Feature Addition (Progressive Enhancement)  
**Granularity:** Standard  
**Updated:** 2026-06-01

---

## Phases

- [ ] **Phase 5: Core Detection & Batch Expiration** - Detect overlapping trace flags and expire them in a single batch operation
- [ ] **Phase 6: Command Integration & Display** - Wire overlap detection into trace command and display lifecycle information
- [ ] **Phase 7: JSON Output Extension** - Include stopped trace flag details in --json output
- [ ] **Phase 8: Behavior Control & Confirmations** - Add user confirmation flow and --overwrite flag
- [ ] **Phase 9: Storage & Safety** - Add pre-trace storage quota check and failure handling

---

## Phase Details

### Phase 5: Core Detection & Batch Expiration

**Goal:** Detect when trace flags already exist for the target user and automatically expire overlapping ones in a single batch API call.

**Depends on:** Phase 4 (v1.0 complete)

**Requirements:** TRACE-01, TRACE-03, TRACE-08

**Success Criteria** (what must be TRUE):

  1. Plugin detects when one or more trace flags already exist for the target user
  2. Plugin identifies all overlapping trace flags (using datetime range overlap algorithm)
  3. Plugin expires all detected overlapping traces in a single batch API call (not N individual calls)
  4. Plugin handles multiple overlapping trace flags for the same user (3+ traces) without error
  5. Overlap detection query uses server-side SOQL datetime comparison (not client-side filtering)

**Plans:** 3 plans

Plans:
- [ ] 05-01-PLAN.md — Extend TraceResult type + add overlap message strings
- [ ] 05-02-PLAN.md — Implement detectAndExpireOverlappingTraces() with unit tests
- [ ] 05-03-PLAN.md — Wire detection into trace command + integration tests

**UI hint**: no

---

### Phase 6: Command Integration & Display

**Goal:** Integrate overlap detection into the trace command workflow and display clear information about which trace was stopped and when the new one started.

**Depends on:** Phase 5

**Requirements:** TRACE-02, TRACE-05, TRACE-09

**Success Criteria** (what must be TRUE):

  1. Plugin displays existing trace flag details when an overlap is detected (creation date, expiration date)
  2. Plugin reports in standard output which trace flag(s) were stopped and their stop time
  3. Plugin clearly indicates when the new trace flag started (with timestamp)
  4. Lifecycle information flows naturally in terminal output (existing trace → stopped → new trace started)
  5. User can understand the full action sequence from command output without additional queries

**Plans:** TBD

**UI hint**: yes

---

### Phase 7: JSON Output Extension

**Goal:** Include stopped trace flag details in --json output so programmatic consumers can track the full trace lifecycle.

**Depends on:** Phase 6

**Requirements:** TRACE-10

**Success Criteria** (what must be TRUE):

  1. `sf log trace --json` output includes a stoppedTraces array with details of expired trace flags
  2. Each stopped trace entry contains: id, startTime, expirationDate (original), and stopTime (when expired)
  3. JSON schema is backward compatible (new field added to existing output, no removed fields)
  4. Consumers can programmatically determine which traces were cleaned up vs. new trace created

**Plans:** TBD

**UI hint**: no

---

### Phase 8: Behavior Control & Confirmations

**Goal:** Give users control over overlap handling via confirmation prompts and flags, with clear help documentation.

**Depends on:** Phase 7

**Requirements:** TRACE-04, TRACE-11, TRACE-12

**Success Criteria** (what must be TRUE):

  1. Plugin requests user confirmation before expiring an existing trace (if not using --overwrite)
  2. User can skip confirmation with `--overwrite` or `--force` flag
  3. User can review the existing trace details before confirming expiration
  4. Help text (`sf log trace --help`) documents the behavior for existing trace flags and the override flags
  5. Non-interactive environments (scripting) work correctly with --overwrite (no prompt blocks)

**Plans:** TBD

**UI hint**: yes

---

### Phase 9: Storage & Safety

**Goal:** Validate organization storage quota before creating new trace and fail gracefully if insufficient space.

**Depends on:** Phase 8

**Requirements:** TRACE-06, TRACE-07

**Success Criteria** (what must be TRUE):

  1. Plugin checks organization's remaining debug log storage quota before creating new trace
  2. Plugin fails with clear error message if org storage is at or above configured threshold
  3. Plugin provides guidance on how much storage must be freed (e.g., "Need 500MB free, have 200MB")
  4. Quota check happens before expiring old traces (conservatively refuses rather than cleanup then fail)
  5. User can understand storage status from error message and take action (purge logs, contact admin)

**Plans:** TBD

**UI hint**: no

---

## Progress Tracking

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 5. Core Detection & Batch Expiration | 0/3 | Planned | - |
| 6. Command Integration & Display | 0/TBD | Not started | - |
| 7. JSON Output Extension | 0/TBD | Not started | - |
| 8. Behavior Control & Confirmations | 0/TBD | Not started | - |
| 9. Storage & Safety | 0/TBD | Not started | - |

---

## Coverage Validation

**Total v1.1 Requirements:** 12  
**Mapped to Phases:** 12  
**Coverage:** 100% ✓

**Requirement Traceability:**

- Phase 5: TRACE-01, TRACE-03, TRACE-08 (3)
- Phase 6: TRACE-02, TRACE-05, TRACE-09 (3)
- Phase 7: TRACE-10 (1)
- Phase 8: TRACE-04, TRACE-11, TRACE-12 (3)
- Phase 9: TRACE-06, TRACE-07 (2)

---

## Next Steps

1. Review roadmap for alignment with requirements
2. Execute Phase 5: `/gsd-execute-phase 5`
