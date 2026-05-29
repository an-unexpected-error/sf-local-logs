# Roadmap: Salesforce Debug Log CLI Plugin

**Project:** Salesforce Debug Log CLI Plugin  
**Version:** 1.0  
**Mode:** MVP (Vertical Slices)  
**Granularity:** Standard  
**Updated:** 2026-05-30

---

## Phases

- [x] **Phase 0: Plugin Setup** - Project scaffolding, framework, and installation capability (✓ 2026-05-29)
- [x] **Phase 1: User Search** - Find Salesforce users by name with paginated results (✓ 2026-05-29)
- [ ] **Phase 2: Debug Sessions** - Initiate debug log tracing for selected users
- [ ] **Phase 3: Log Management** - Download logs and manage storage within 1GB limit
- [ ] **Phase 4: Log Filtering** - Filter, analyze, and export debug log data

---

## Phase Details

### Phase 0: Plugin Setup

**Goal:** Establish the Salesforce CLI plugin framework, ensure installability, and validate environment requirements.

**Depends on:** Nothing (foundation)

**Requirements:** INSTALL-01, INSTALL-02, INSTALL-03

**Success Criteria** (what must be TRUE):
  1. Plugin can be installed via `sf plugin install` command from the repo
  2. Plugin successfully loads and registers all commands with the Salesforce CLI
  3. Plugin verifies Node.js 18.0.0+ at install time and refuses installation on incompatible versions
  4. Plugin works with Salesforce CLI v2.x+ and reports clear errors if CLI version is incompatible

**Plans:** 5 plans (✓ 5/5 complete)

Plans:
- [x] 00-01-PLAN.md — Scaffold plugin (package.json, tsconfig, eslint, mocha, compile, sf plugin link) ✓
- [x] 00-02-PLAN.md — Create 5 command stubs + messages files (sf log namespace) ✓
- [x] 00-03-PLAN.md — Create unit test scaffolds and NUT scaffolds for all 5 commands ✓
- [x] 00-04-PLAN.md — GitHub Actions CI/CD workflows + dev setup script ✓
- [x] 00-05-PLAN.md — Verify installation (full integration check + human checkpoint) ✓

---

### Phase 1: User Search

**Goal:** Enable users to efficiently locate Salesforce users in their org by searching for name (first, last, or both) with clear, paginated results.

**Depends on:** Phase 0

**Requirements:** USER-01, USER-02, USER-03, UX-01, UX-02, UX-04, UX-05

**Success Criteria** (what must be TRUE):
  1. User can run `sf log search --name "John"` and receive a list of matching users ✓
  2. Results are paginated when search returns many users (e.g., 10+ results), with clear "next" and "previous" navigation ✓
  3. Each search result displays user ID, name, email, and last login timestamp ✓
  4. User can output results as JSON via `--json` flag for programmatic use ✓
  5. Status messages explain what's happening ("Searching...", "Found 5 users", etc.) and error messages guide remediation ✓

**Plans:** 1 plan (✓ 1/1 complete)

Plans:
- [x] 01-01-PLAN.md — Implement search command, utilities, tests, and messages (Wave 1: 6 parallel tasks) ✓

**Completed:** 2026-05-29

**UI hint**: yes

---

### Phase 2: Debug Sessions

**Goal:** Enable users to initiate debug log trace flags for selected users directly from the CLI with confirmation of session details.

**Depends on:** Phase 1

**Requirements:** DEBUG-01, DEBUG-02, DEBUG-03, UX-01, UX-02, UX-04, UX-05

**Success Criteria** (what must be TRUE):
  1. User can run `sf log trace --user-id <id>` to initiate a debug session
  2. User can specify debug level via `--level` flag or accept the org's default level
  3. CLI confirms trace flag creation with details: target user, debug level, expiry time (typically 24 hours)
  4. User receives clear error messages if trace flag creation fails (e.g., already active trace flag, user not found)
  5. Command output includes JSON option for programmatic consumption (`--json`)

**Plans:** 4 plans (1/4 complete)

Plans:
- [x] 02-01-PLAN.md — Install cli-progress, define TraceResult type, create trace-helper utilities (Wave 1: 3 tasks) ✓
- [x] 02-02-PLAN.md — Implement core trace command, help text, unit tests (Wave 2: 3 tasks) ✓
- [x] 02-03-PLAN.md — Implement watch mode monitoring, progress bar, SIGINT handling, watch mode tests (Wave 3: 4 tasks) ✓
- [x] 02-04-PLAN.md — Integrate interactive search, comprehensive unit tests, integration tests (Wave 4: 4 tasks + human verification) ✓

**UI hint**: yes

---

### Phase 3: Log Management

**Goal:** Enable users to download debug logs as they are created and manage storage by purging old/unnecessary logs while respecting Salesforce's 1GB organization limit.

**Depends on:** Phase 2

**Requirements:** DOWNLOAD-01, DOWNLOAD-02, DOWNLOAD-03, DOWNLOAD-04, DOWNLOAD-05, PURGE-01, PURGE-02, PURGE-03, UX-01, UX-02, UX-03, UX-04, UX-05

**Success Criteria** (what must be TRUE):
  1. User can run `sf log download --user-id <id>` and logs are saved to a local directory with progress updates (count, size, ETA)
  2. Plugin streams large log files (10-100MB) without consuming excessive memory
  3. Plugin checks org's remaining storage quota and warns user if download would exceed the 1GB limit
  4. Plugin refuses download if insufficient quota exists, with clear guidance on how much storage must be freed
  5. User can run `sf log purge` to interactively select and delete logs with confirmation before deletion
  6. After deletion, plugin confirms storage freed (e.g., "Freed 250MB")

**Plans:** TBD

---

### Phase 4: Log Filtering

**Goal:** Enable users to filter downloaded logs by keyword (SObject or Platform Event names) and export filtered results for further analysis.

**Depends on:** Phase 3

**Requirements:** FILTER-01, FILTER-02, FILTER-03, UX-01, UX-02, UX-04

**Success Criteria** (what must be TRUE):
  1. User can run `sf log filter --keyword "Account"` to search downloaded logs and see matching entries with line numbers
  2. Matching log entries are visually distinguished (highlighted or marked) in the output
  3. User can run `sf log filter --keyword "Platform_Event" --export results.txt` to save filtered results to a file
  4. Filtered output includes context around matches (surrounding lines) to aid debugging
  5. User can combine filtering with `--json` for programmatic export

**Plans:** TBD

**UI hint**: yes

---

## Progress Tracking

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 0. Plugin Setup | 5/5 | Complete | 2026-05-29 |
| 1. User Search | 1/1 | Complete | 2026-05-29 |
| 2. Debug Sessions | 4/4 | Complete | 2026-05-30 |
| 3. Log Management | 0/N | Not started | — |
| 4. Log Filtering | 0/N | Not started | — |

---

## Coverage Validation

**Total v1 Requirements:** 26  
**Mapped to Phases:** 26  
**Coverage:** 100% ✓

**Requirement Traceability:**
- Phase 0: INSTALL-01, INSTALL-02, INSTALL-03 (3)
- Phase 1: USER-01, USER-02, USER-03, UX-01, UX-02, UX-04, UX-05 (7)
- Phase 2: DEBUG-01, DEBUG-02, DEBUG-03, UX-01, UX-02, UX-04, UX-05 (7)
- Phase 3: DOWNLOAD-01 through DOWNLOAD-05, PURGE-01, PURGE-02, PURGE-03, UX-01, UX-02, UX-03, UX-04, UX-05 (15)
- Phase 4: FILTER-01, FILTER-02, FILTER-03, UX-01, UX-02, UX-04 (6)

**Note:** UX requirements (UX-01 through UX-05) appear in all phases because they are cross-cutting concerns that apply throughout the plugin implementation.

---

## Next Steps

1. Execute Phase 2: `/gsd-execute-phase 2`
