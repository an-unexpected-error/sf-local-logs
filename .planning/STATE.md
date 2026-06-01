---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Overlapping Trace Flag Handling
current_phase: Planning
status: executing
last_updated: "2026-06-01T12:48:09.686Z"
last_activity: 2026-06-01
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 3
  completed_plans: 0
  percent: 0
---

# Project State: Salesforce Debug Log CLI Plugin

**Last Updated:** 2026-06-01  
**Current Milestone:** v1.1 Overlapping Trace Flag Handling  
**Current Phase:** Planning  

---

## Project Reference

**Core Value:** Enable admins to efficiently locate and analyze debugging information in high-volume debug logs (1000s/minute) without leaving the CLI.

**Project Mode:** Feature Addition (Progressive Enhancement of v1.0)

**Granularity:** Standard (5 phases)

**Version:** v1.1 Overlapping Trace Flag Handling

---

## Current Position

**Milestone:** v1.1 Overlapping Trace Flag Handling  
**Phase:** 5 (planning stage)  
**Plan:** —  
**Status:** Ready to execute
**Last activity:** 2026-06-01

**Progress:** 0/5 phases complete

## Performance Metrics

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| v1.1 Requirements Mapped | 12 | 12 | ✓ Complete |
| Phase Coverage | 100% | 100% | ✓ Complete |
| Phase Dependencies | Clear | Clear | ✓ Validated |

---

## Roadmap Summary

**Feature addition: Automatic overlapping trace flag handling with 5 progressive phases:**

1. **Phase 5:** Core detection & batch expiration (detection logic, overlap algorithm, batch update API)
2. **Phase 6:** Command integration & display (lifecycle reporting in standard output)
3. **Phase 7:** JSON output extension (stopped trace details in programmatic output)
4. **Phase 8:** Behavior control & confirmations (user confirmation prompts, --overwrite flag)
5. **Phase 9:** Storage & safety (pre-trace quota check, graceful failure)

Each phase adds one capability layer, with earlier phases blocking later ones.

---

## Key Decisions

| Decision | Rationale | Impact |
|----------|-----------|--------|
| 5-phase structure for v1.1 | Clear dependencies: detection → display → JSON → control → safety | Sequential execution order enforced |
| Batch expiration in Phase 5 | jsforce multi-record CRUD avoids N+1 queries | Better performance, especially for 3+ overlapping traces |
| Confirmation before expiry (Phase 8) | Safety-first: user approval required before modifying existing traces | Prevents accidental cleanup; --overwrite override for scripting |
| Pre-trace quota check (Phase 9) | Conservative approach: verify space before any cleanup logic | Avoid false optimism if quota check fails after expiry |

---

## Accumulated Context

### Architecture Decisions (v1.1)

- **Detection:** SOQL query with datetime range overlap: `StartTime < newEnd AND ExpirationDate > newStart`
- **Expiration:** jsforce `connection.tooling.update()` with array of {Id, ExpirationDate} records (automatic SObject Collection API routing)
- **Overlap Algorithm:** Canonical set theory: `start1 < end2 AND start2 < end1` (native JavaScript Date, no new dependencies)
- **Message Display:** Extend existing Salesforce CLI messages pattern (trace.json file updates)
- **User Confirmation:** Interactive prompt via `Flags` pattern (reuse Phase 2 approach)

### Technical Constraints (v1.1)

- **No new dependencies:** jsforce + native Date sufficient; no date-fns, dayjs, or moment needed
- **Backward compatibility:** Single-trace scenario (v1.0 common case) unaffected
- **Timezone handling:** Salesforce timestamps always UTC; no conversion needed
- **Batch limits:** Salesforce SObject Collection API batch limit 200/call; typical overlap is 1-5 traces (no recursion needed)

### v1.1 Scope

- Overlapping trace flag detection and automatic expiration
- User confirmation before expiration (with override flag)
- Display of stopped trace details and lifecycle
- Storage quota check before creating new trace
- JSON output extension for programmatic consumers

### Out of v1.1

- v2 features: trace renewal, bulk management, trace listing
- Custom debug levels (v2)
- Multi-org bulk operations (v2)

---

## Blockers & Open Questions

**None at roadmap stage.** Ready to proceed to Phase 5 planning.

---

## Session Notes

### Roadmap Phase (2026-06-01)

- v1.1 roadmap created: 5 phases, 12 requirements
- All v1.1 requirements successfully mapped (100% coverage)
- Phases derived from requirement dependencies, not arbitrary structure
- Success criteria defined for each phase (2-5 observable behaviors)
- Research synthesis completed: zero new dependencies, minimal code changes
- Traceability table updated with phase mappings
- Ready for Phase 5 planning

---

## Next Actions

- [ ] Plan Phase 5: Core Detection & Batch Expiration
- [ ] Implement Phase 5 (overlap detection logic + batch expiry)
- [ ] Plan Phase 6: Command Integration & Display
- [ ] Execute phases in order (5 → 6 → 7 → 8 → 9)
- [ ] Verify v1.1 requirements completion

## Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260531-u75 | Fix TraceFlag creation: Remove read-only StartTime field | 2026-05-31 | 76dd3b7 | [260531-u75-fix-traceflag-creation-error-1-no-such-c/](.planning/quick/260531-u75-fix-traceflag-creation-error-1-no-such-c/) |
| 260601-tq5 | Fix error: LogType is required when creating trace flag | 2026-06-01 | 205e5be | [260601-tq5-fix-error-logtype-is-required-when-creat/](.planning/quick/260601-tq5-fix-error-logtype-is-required-when-creat/) |

## Decisions

- [Phase 5-9]: Overlapping trace detection drives architecture; batch expiration + confirmation + quota check follow
- [Phase 5-9]: No new dependencies needed; jsforce + native Date sufficient for all detection/expiration logic
- [Phase 8]: Confirmation is default; --overwrite flag skips for scripting/automation
- [Phase 9]: Quota check is conservative; refuse if any risk of exceeding limit
