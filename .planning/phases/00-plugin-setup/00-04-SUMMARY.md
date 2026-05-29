---
phase: 00-plugin-setup
plan: "04"
subsystem: infra
tags: [github-actions, ci-cd, eslint, typescript, mocha, scratch-org, salesforce-cli]

# Dependency graph
requires:
  - phase: 00-01
    provides: package.json with compile/lint/test scripts this CI wraps
provides:
  - GitHub Actions lint workflow (.github/workflows/lint.yml)
  - GitHub Actions build workflow (.github/workflows/build.yml)
  - GitHub Actions test workflow (.github/workflows/test.yml)
  - Dev scratch org setup script (scripts/setup-devorg.sh)
  - Scratch org definition (config/project-scratch-def.json)
affects: [all-phases]

# Tech tracking
tech-stack:
  added: [github-actions, bash]
  patterns: [npm-ci-for-ci-installs, inline-workflows-not-reusable-actions]

key-files:
  created:
    - .github/workflows/lint.yml
    - .github/workflows/build.yml
    - .github/workflows/test.yml
    - scripts/setup-devorg.sh
    - config/project-scratch-def.json
  modified:
    - package.json

key-decisions:
  - "Use Node.js 22 in CI (matches developer runtime 22.22.3; satisfies engines >=18.0.0)"
  - "Inline GitHub Actions workflows rather than reusable salesforcecli/github-workflows (Assumption A3 mitigation)"
  - "npm ci in CI for reproducible locked installs (T-00-09 tampering mitigation)"
  - "setup-devorg.sh handles missing DevHub gracefully — skips scratch org creation, still links plugin"

patterns-established:
  - "CI workflow pattern: checkout -> setup-node@v4 -> npm ci -> task"
  - "Branch triggers: push to main/release/*, pull_request targeting main"
  - "Dev script pattern: bash scripts/<task>.sh in package.json scripts"

requirements-completed: [INSTALL-01, INSTALL-02, INSTALL-03]

# Metrics
duration: 8min
completed: 2026-05-29
---

# Phase 0 Plan 04: CI/CD Workflows and Dev Setup Summary

**GitHub Actions workflows for lint/build/test on every push/PR, plus scratch org setup script with graceful DevHub detection**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-05-29T12:14:00Z
- **Completed:** 2026-05-29T12:22:49Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- 3 GitHub Actions workflows created: lint (ESLint), build (TypeScript compile + verify lib/), test (compile + mocha)
- All workflows trigger on push to main/release/* and PRs targeting main with Node.js 22 and npm ci
- setup-devorg.sh created with graceful DevHub detection — skips scratch org if no DevHub, always links plugin
- config/project-scratch-def.json created for Developer edition scratch org
- package.json updated with setup-devorg and updated link-local (added --no-verify flag)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create GitHub Actions CI/CD workflows** - `37c9ddb` (feat)
2. **Task 2: Create dev setup script and update package.json** - `19f90f6` (feat)

## Files Created/Modified

- `.github/workflows/lint.yml` - ESLint workflow on push/PR
- `.github/workflows/build.yml` - TypeScript compile + lib/index.js verify on push/PR
- `.github/workflows/test.yml` - Compile then mocha unit tests on push/PR
- `scripts/setup-devorg.sh` - Dev setup: checks DevHub, creates scratch org, compiles, links plugin
- `config/project-scratch-def.json` - Scratch org definition (Developer edition)
- `package.json` - Added setup-devorg script, updated link-local to include --no-verify

## Decisions Made

- Node.js 22 in CI workflows: matches the developer's current runtime (22.22.3); satisfies the engines constraint of >=18.0.0; using latest LTS for CI is standard practice
- Inline workflows: per RESEARCH.md Assumption A3, salesforcecli/github-workflows reusable workflows may not work for private/new repos — inline avoids that risk entirely
- Graceful DevHub detection: setup-devorg.sh warns and skips scratch org creation when no DevHub is found, so new contributors can still link and test --help commands without full org setup

## Deviations from Plan

None - plan executed exactly as written. The link-local script was updated from "sf plugins link ." to "sf plugins link . --no-verify" as specified in the plan's done criteria.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required for CI/CD setup. GitHub Actions will run automatically on push. For local dev, run `npm run setup-devorg` after authorizing a DevHub.

## Next Phase Readiness

- CI/CD gates active: every push/PR now runs lint, build, and test checks
- Dev onboarding script ready: `npm run setup-devorg` for new contributors
- Phase 0 Wave 2 parallel plans can complete; Wave 3 integration verification (Plan 05) can proceed

---
*Phase: 00-plugin-setup*
*Completed: 2026-05-29*
