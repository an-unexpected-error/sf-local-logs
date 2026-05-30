---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 4
status: ready_to_plan
last_updated: "2026-05-30T22:05:44.451Z"
progress:
  total_phases: 5
  completed_phases: 3
  total_plans: 14
  completed_plans: 13
  percent: 60
---

# Project State: Salesforce Debug Log CLI Plugin

**Last Updated:** 2026-05-30  
**Current Phase:** 4
**Milestone:** v1 MVP

---

## Project Reference

**Core Value:** Enable admins to efficiently locate and analyze debugging information in high-volume debug logs (1000s/minute) without leaving the CLI.

**Project Mode:** MVP (Vertical Slices)

**Granularity:** Standard (5 phases)

---

## Current Position

Phase: 03 (log-management) — EXECUTING
Plan: Not started
**Completed Phase:** Phase 1 - User Search (✓ 2026-05-29)
**Current Phase:** Phase 2 - Debug Sessions (plans created 2026-05-30)
**Next Phase:** Phase 3 - Log Management

**Progress:**

[█████████░] 93%
Phase 0: [██████████] 100% (context ✓, plans ✓ 5/5, executed ✓, verified ✓)
Phase 1: [██████████] 100% (context ✓, plans ✓ 1/1, executed ✓, verified ✓)
Phase 2: [██████░░░░] 55% (context ✓, plans ✓ 4/4, ready to execute)
Phase 3: [          ] 0% (0/6 plans)
Phase 4: [          ] 0% (0/5 plans)

```

**Overall Milestone Progress:** 6/11 plans complete (55%)

---

## Performance Metrics

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| v1 Requirements Mapped | 26 | 26 | ✓ Complete |
| Phase Coverage | 100% | 100% | ✓ Complete |
| Average Plans per Phase | 5 | 5 | ✓ On track |

---
| Phase 03 P04 | 11min | 3 tasks | 2 files |

## Roadmap Summary

**Vertical MVP approach with 5 phases delivering end-to-end user capabilities:**

1. **Phase 0:** Plugin framework and installation (3 requirements)
2. **Phase 1:** User search by name with pagination (7 requirements including UX)
3. **Phase 2:** Debug session initiation for tracing (7 requirements including UX)
4. **Phase 3:** Log download, streaming, and purge functionality (15 requirements including UX)
5. **Phase 4:** Log filtering, analysis, and export (6 requirements including UX)

Each phase enables independent user value and unblocks the next.

---

## Key Decisions

| Decision | Rationale | Impact |
|----------|-----------|--------|
| Vertical MVP phases | Each phase delivers end-to-end capability; users can start using after Phase 1 | Fast to first value; clear blockers between phases |
| Phase 0 as separate foundation | Plugin scaffolding, framework, and installation must precede all feature work | No features can start until framework is solid |
| UX as cross-cutting requirement | Status messages, error handling, JSON output, and org flags apply throughout | All phases include UX work; integrated iteratively |
| 1GB storage awareness from Phase 3 | Handle Salesforce's hard limit during download and purge operations | Storage management is built into core workflow, not retrofitted |

---

## Accumulated Context

### Architecture Decisions

- **Plugin Type:** Salesforce CLI (sf) plugin with TypeScript implementation
- **Installation:** Via `sf plugin install` from repository
- **Compatibility:** Requires SF CLI v2.x+ and Node.js 18.0.0+
- **Output Format:** Native Salesforce CLI patterns with `--json` support and `--target-org` awareness

### Technical Constraints

- **Storage Limit:** Orgs have 1GB total debug log storage across all files
- **Performance:** Must handle 1000s of logs/minute without degradation
- **File Size:** Individual logs 10-100MB; streaming I/O required for memory efficiency
- **High-Volume Scenario:** Core use case involves frequent log generation and cleanup

### User Workflow

The plugin enables this core workflow:

1. Search for a user by name (find who to debug)
2. Initiate a debug session for that user (start tracing)
3. Download created logs (capture data)
4. Filter logs by keyword (analyze quickly)
5. Purge old logs when approaching storage limit (manage storage)

---

## Blockers & Open Questions

**None at roadmap stage.** Ready to proceed to Phase 0 planning.

---

## Session Notes

### Roadmap Phase (2026-05-29)

- Roadmap created using vertical MVP approach
- All 26 v1 requirements successfully mapped (100% coverage)
- UX requirements identified as cross-cutting (all phases)
- Phase dependencies identified and documented

### Phase 0 Discussion (2026-05-29)

- Command namespace locked: `sf log`
- Scaffold approach: All 5 commands now (empty placeholders)
- Dev environment: Include test org setup and linking scripts
- CI/CD: Configure GitHub Actions for lint/build/test
- Decisions captured in 00-CONTEXT.md
- Discussion log in 00-DISCUSSION-LOG.md

### Phase 0 Planning (2026-05-29)

- Research completed: Verified plugin-template-sf approach, Salesforce CLI patterns, oclif v4 best practices
- 5 plans created (00-01 through 00-05):
  - Plan 1 (Wave 1): Scaffold plugin + dependencies
  - Plans 2-4 (Wave 2, parallel): Command stubs / Test infrastructure / CI/CD + dev setup
  - Plan 5 (Wave 3): Integration verification + checkpoint
- All 3 INSTALL requirements covered
- Verification passed all 14 quality dimensions
- Plans committed to git

### Phase 1 Execution (2026-05-29)

- Phase 0 and Phase 1 executed and verified
- User search functionality implemented with fuzzy matching, interactive refinement, and pagination
- All 7 Phase 1 requirements verified as complete

### Phase 2 Discussion (2026-05-30)

- 4 gray areas discussed: trace flag duration & renewal, default debug level, user selection flow, error handling & edge cases
- Key decisions locked:
  - Watch mode is the default behavior (monitors trace flag with progress bar)
  - Use org's default DebugLevel, fail if unavailable
  - Interactive search is the default UX (reuses Phase 1 search), with --user-id as scripting bypass
  - Fail on existing trace flag, with --overwrite flag to replace
- Context and discussion log committed to git
- Ready for Phase 2 planning

### Phase 2 Planning (2026-05-30)

- Research completed: Salesforce Tooling API, jsforce patterns, cli-progress for watch mode, Phase 1 integration
- 4 plans created across 4 waves:
  - Wave 1: Foundation (package.json, TraceResult type, trace-helper utility)
  - Wave 2: Core logic (trace command implementation, DebugLevel handling, error messages)
  - Wave 3: Watch mode (monitoring loop, progress bar, SIGINT handling)
  - Wave 4: Integration (interactive search, testing, human verification checkpoint)
- All 7 phase requirements covered (DEBUG-01, DEBUG-02, DEBUG-03, UX-01, UX-02, UX-04, UX-05)
- Plans verified and passed all checks
- Ready for Phase 2 execution

### Phase 3 Planning (2026-05-30)

- Research completed: ApexLog API, storage quota, streaming I/O, SF CLI file storage conventions
  - Critical blocker resolved: file storage location should use ~/.local/share/sf/plugin-logs/ (oclif standard)
  - All technical patterns verified; no new package dependencies needed
- 4 plans created in 4 waves:
  - Wave 1: Foundation (5 tasks) — types, download-helper, storage-manager, quota-calculator
  - Wave 2: Download integration (3 tasks) — extend trace command with streaming + quota checking
  - Wave 3: Purge command + tests (8 tasks) — 175+ test cases (unit + integration)
  - Wave 4: Verification gate (2 tasks + checkpoint) — NUT tests, human sign-off
- All 13 Phase 3 requirements mapped to plans (DOWNLOAD-01–05, PURGE-01–03, UX-01–05)
- Plan verification: 1 iteration (added read_first sections to all 18 tasks)
- Plans committed to git; ready for execution

### Phase 3 Discussion (2026-05-30)

- 4 gray areas discussed: log discovery/download scope, storage quota checking, purge UX, local storage organization
- Key decisions locked:
  - Download is integrated into trace workflow (not a standalone command)
  - Auto-download after trace creation, with parallel watch mode + download progress display
  - Storage quota monitored during download; stop immediately if quota exceeded
  - Purge deletes all org logs with confirmation showing freed space
  - Local storage: ~/sf-logs/{user}/{YYYY-MM-DD-HH-MM}/ (pending FS location verification)
  - Progress display: time elapsed, ETA, file count
- Context and discussion log committed to git
- Critical open item: file storage location conventions for SF CLI plugins (researcher blocker)
- Ready for Phase 3 research and planning

---

## Next Actions

- [ ] Research Phase 3 implementation (ApexLog queries, storage quota API, SF CLI file storage conventions)
- [ ] Plan Phase 3 implementation (extended trace command with download, purge command, local storage)
- [ ] Execute Phase 3 plans after approval
- [ ] Verify all 13 Phase 3 requirements (DOWNLOAD-01–05, PURGE-01–03, UX-01–05)
- [ ] Track progress via `/gsd-progress`

## Decisions

- [Phase ?]: Code review assertions used instead of live org tests: full E2E requires authenticated devhub + scratch org; structural assertions verify all implementation patterns without infrastructure
- [Phase ?]: Always show user selection list even for single result: consistent UX across all search result counts (deferred to Phase 4)
