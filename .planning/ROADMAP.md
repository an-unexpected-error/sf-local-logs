# Roadmap: Salesforce Debug Log CLI Plugin

**Project:** Salesforce Debug Log CLI Plugin  
**Version:** 1.0  
**Mode:** MVP (Vertical Slices)  
**Granularity:** Standard  
**Updated:** 2026-05-31

---

## Phases

- [x] **Phase 0: Plugin Setup** - Project scaffolding, framework, and installation capability (✓ 2026-05-29)
- [x] **Phase 1: User Search** - Find Salesforce users by name with paginated results (✓ 2026-05-29)
- [x] **Phase 2: Debug Sessions** - Initiate debug log tracing for selected users (✓ 2026-05-30)
- [x] **Phase 3: Log Management** - Download logs and manage storage within 1GB limit (completed 2026-05-30)
- [ ] **Phase 4: Log Filtering** - Filter downloaded logs by keyword via sf log trace --keyword

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

**Plans:** 4 plans (✓ 4/4 complete)

Plans:

- [x] 02-01-PLAN.md — Install cli-progress, define TraceResult type, create trace-helper utilities (Wave 1: 3 tasks) ✓
- [x] 02-02-PLAN.md — Implement core trace command, help text, unit tests (Wave 2: 3 tasks) ✓
- [x] 02-03-PLAN.md — Implement watch mode monitoring, progress bar, SIGINT handling, watch mode tests (Wave 3: 4 tasks) ✓
- [x] 02-04-PLAN.md — Integrate interactive search, comprehensive unit tests, integration tests (Wave 4: 4 tasks + human verification) ✓

**Completed:** 2026-05-30

**UI hint**: yes

---

### Phase 3: Log Management

**Goal:** Enable users to download debug logs as they are created and manage storage by purging old/unnecessary logs while respecting Salesforce's 1GB organization limit.

**Depends on:** Phase 2

**Requirements:** DOWNLOAD-01, DOWNLOAD-02, DOWNLOAD-03, DOWNLOAD-04, DOWNLOAD-05, PURGE-01, PURGE-02, PURGE-03, UX-01, UX-02, UX-03, UX-04, UX-05

**Success Criteria** (what must be TRUE):

  1. User can run `sf log trace` and logs are automatically downloaded as they are created with progress updates (count, size, ETA)
  2. Plugin streams large log files (10-100MB) without consuming excessive memory
  3. Plugin checks org's remaining storage quota and warns user if download would exceed the 1GB limit
  4. Plugin refuses download if insufficient quota exists, with clear guidance on how much storage must be freed
  5. User can run `sf log purge` with confirmation before deletion of all org logs
  6. After deletion, plugin confirms storage freed (e.g., "Freed 250MB")

**Plans:** 4/4 plans complete

Plans:

- [x] 03-01-PLAN.md — Create types, download/storage/quota utilities, messages (Wave 1: 5 parallel tasks)
- [x] 03-02-PLAN.md — Extend trace command with automatic download integration (Wave 2: 3 tasks)
- [x] 03-03-PLAN.md — Implement purge command, comprehensive unit tests (Wave 3: 8 tasks)
- [x] 03-04-PLAN.md — Integration tests (NUT) and phase verification checkpoint (Wave 4: human verification)

**UI hint**: yes

---

### Phase 4: Log Filtering

**Goal:** Enable users to filter downloaded logs by keyword (SObject or Platform Event names) via a --keyword flag on sf log trace. Non-matching logs move to a rejected/ subfolder; a summary shows match counts. (Note: sf log filter standalone command is not used — all filtering runs through sf log trace --keyword per D-01.)

**Depends on:** Phase 3

**Requirements:** FILTER-01, FILTER-02, FILTER-03, UX-01, UX-02, UX-04

**Success Criteria** (what must be TRUE):

  1. User can run `sf log trace --keyword "Account"` to download logs and filter them by keyword in one step
  2. After filtering, the terminal shows: "N log(s) matched "Account", M moved to rejected/. Logs saved to <path>"
  3. Non-matching logs are preserved in rejected/ subfolder (not deleted) — FILTER-03 via folder organization
  4. Matching logs remain in the session directory for immediate access
  5. sf log trace --keyword --json output includes filterResult field with matched, rejected, keyword, sessionDir
  6. sf log filter --help still works (stub preserved for NUT compatibility)

**Plans:** 4 plans
Plans:
**Wave 1**

- [ ] 04-01-PLAN.md — Test stubs: filter-helper.test.ts, keyword flag tests in trace.test.ts, updated filter.test.ts (Wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 04-02-PLAN.md — filter-helper.ts utility, FilterResult type, messages (Wave 2, parallel with 04-04)
- [ ] 04-04-PLAN.md — Hollow out filter.ts stub, update messages/log.filter.md (Wave 2, parallel with 04-02)

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 04-03-PLAN.md — trace.ts keyword flag integration and filterDownloadedLogs wiring (Wave 3)

**UI hint**: yes

---

## Progress Tracking

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 0. Plugin Setup | 5/5 | Complete | 2026-05-29 |
| 1. User Search | 1/1 | Complete | 2026-05-29 |
| 2. Debug Sessions | 4/4 | Complete | 2026-05-30 |
| 3. Log Management | 4/4 | Complete    | 2026-05-30 |
| 4. Log Filtering | 0/4 | Not started | — |

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

1. Execute Phase 4: `/gsd-execute-phase 4`
