---
phase: 4
slug: log-filtering
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-31
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | mocha ^10 + chai ^4 + ts-node/esm |
| **Config file** | `.mocharc.cjs` (spec: `test/**/*.test.ts`, timeout: 10000) |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test` (261 existing tests + Phase 4 additions, ~8s) |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 0 | FILTER-01 | — | N/A | unit | `npm test` | ❌ W0: `test/utils/filter-helper.test.ts` | ⬜ pending |
| 04-01-02 | 01 | 0 | FILTER-01 | — | N/A | unit | `npm test` | ❌ W0 | ⬜ pending |
| 04-01-03 | 01 | 0 | FILTER-01 | — | N/A | unit | `npm test` | ❌ W0 | ⬜ pending |
| 04-01-04 | 01 | 0 | FILTER-01 | — | N/A | unit | `npm test` | ❌ W0: extend `test/commands/log/trace.test.ts` | ⬜ pending |
| 04-02-01 | 02 | 1 | FILTER-02 | — | N/A | unit | `npm test` | ❌ W0 | ⬜ pending |
| 04-02-02 | 02 | 1 | FILTER-02 | — | N/A | unit | `npm test` | ❌ W0 | ⬜ pending |
| 04-03-01 | 03 | 1 | FILTER-03 | — | N/A | unit | `npm test` | ❌ W0 | ⬜ pending |
| 04-04-01 | 04 | 1 | UX-01 | — | N/A | unit | `npm test` | ❌ W0 | ⬜ pending |
| 04-04-02 | 04 | 1 | UX-02 | — | N/A | unit | `npm test` | ❌ W0 | ⬜ pending |
| 04-04-03 | 04 | 1 | UX-04 | — | N/A | unit | `npm test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/utils/filter-helper.test.ts` — stubs for FILTER-01, FILTER-02, FILTER-03 (scanFirstNLines, filterDownloadedLogs)
- [ ] `test/commands/log/trace.test.ts` — extend with `--keyword` flag tests (FILTER-01)
- [ ] No new framework install needed — mocha + chai already present

*Existing infrastructure covers all phase requirements — only new test files need to be added.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| End-to-end `sf log trace --keyword Account` | UX-01, UX-04 | Requires live Salesforce org | Run with authenticated org; verify summary displays correctly |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
