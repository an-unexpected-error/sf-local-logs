# Requirements: Salesforce Debug Log CLI Plugin

**Defined:** 2026-05-29
**Core Value:** Enable admins to efficiently locate and analyze debugging information in high-volume debug logs (1000s/minute) without leaving the CLI.

## v1 Requirements

### User Management

- [ ] **USER-01**: User can search for a Salesforce user by name (first, last, or both)
- [ ] **USER-02**: User receives paginated results when search returns multiple users
- [ ] **USER-03**: User can view user details in search results (ID, email, last login)

### Debug Session

- [ ] **DEBUG-01**: User can initiate a debug log session for a selected user from CLI
- [ ] **DEBUG-02**: User can specify or accept default debug logging level
- [ ] **DEBUG-03**: CLI confirms session initiation with trace flag details (expiry time, debug level)

### Log Download

- [ ] **DOWNLOAD-01**: User can download debug logs as they are created
- [ ] **DOWNLOAD-02**: Plugin displays progress (count, size, ETA) while downloading
- [ ] **DOWNLOAD-03**: Plugin respects organization's 1GB debug log storage limit
- [ ] **DOWNLOAD-04**: Plugin warns user if download would exceed remaining storage quota
- [ ] **DOWNLOAD-05**: Plugin uses streaming I/O to handle 10-100MB log files without memory issues

### Log Filtering

- [ ] **FILTER-01**: User can filter downloaded logs by keyword (SObject or Platform Event name)
- [ ] **FILTER-02**: Filtered results are displayed with matching log entries highlighted
- [ ] **FILTER-03**: User can export filtered results to a file

### Log Management

- [ ] **PURGE-01**: User can delete debug log files to free storage quota
- [ ] **PURGE-02**: User receives confirmation before deleting logs
- [ ] **PURGE-03**: Plugin displays storage freed after deletion

### User Experience

- [ ] **UX-01**: CLI displays status messages clearly explaining what's happening at each step
- [ ] **UX-02**: Error messages provide actionable remediation guidance
- [ ] **UX-03**: Plugin handles rate limiting gracefully with exponential backoff
- [ ] **UX-04**: All commands support `--json` output for programmatic use
- [ ] **UX-05**: Plugin respects `--target-org` flag for multi-org environments

### Installation & Compatibility

- [ ] **INSTALL-01**: Plugin is installable via `sf plugin install <repo>`
- [ ] **INSTALL-02**: Plugin works with Salesforce CLI (sf) v2.x+
- [ ] **INSTALL-03**: Plugin requires Node.js 18.0.0 or later

## v2 Requirements

Deferred to future release. Not in current roadmap.

### Advanced Filtering

- **FILTER-V2-01**: Intelligent filtering by SObject/Platform Event entry points
- **FILTER-V2-02**: Regex pattern support for complex filtering
- **FILTER-V2-03**: Save filter presets for reuse

### Debug Level Control

- **DEBUG-V2-01**: Custom debug level configuration from CLI
- **DEBUG-V2-02**: Profile-based debug levels (Admin, Developer, Integration)
- **DEBUG-V2-03**: Debug level persistence across sessions

### Bulk Operations

- **BULK-V2-01**: Download logs for multiple users in one command
- **BULK-V2-02**: Batch log deletion with criteria (age, size, keywords)

### Log Export & Reporting

- **EXPORT-V2-01**: Export filtered logs to CSV/JSON format
- **EXPORT-V2-02**: Generate summary report of log volume/types

### Trace Flag Management

- **TRACE-V2-01**: Auto-renewal of trace flags before expiry
- **TRACE-V2-02**: View active trace flags and their expiry times
- **TRACE-V2-03**: Bulk trace flag management (enable/disable/delete)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Real-time streaming UI | Out of scope for CLI tool; use browser/IDE tools for visualization |
| Multi-org aggregation | Single-org focus for v1; multi-org support adds complexity, can be v2 |
| Report generation | v1 focuses on filtering and discovery; reporting is v2+ |
| Salesforce UI integration | CLI-first tool; no browser plugin or org UI required |
| Log archival/S3 export | Storage management deferred to v2 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| USER-01 | Phase 1 | Pending |
| USER-02 | Phase 1 | Pending |
| USER-03 | Phase 1 | Pending |
| DEBUG-01 | Phase 2 | Pending |
| DEBUG-02 | Phase 2 | Pending |
| DEBUG-03 | Phase 2 | Pending |
| DOWNLOAD-01 | Phase 3 | Pending |
| DOWNLOAD-02 | Phase 3 | Pending |
| DOWNLOAD-03 | Phase 3 | Pending |
| DOWNLOAD-04 | Phase 3 | Pending |
| DOWNLOAD-05 | Phase 3 | Pending |
| FILTER-01 | Phase 4 | Pending |
| FILTER-02 | Phase 4 | Pending |
| FILTER-03 | Phase 4 | Pending |
| PURGE-01 | Phase 3 | Pending |
| PURGE-02 | Phase 3 | Pending |
| PURGE-03 | Phase 3 | Pending |
| UX-01 | All | Pending |
| UX-02 | All | Pending |
| UX-03 | All | Pending |
| UX-04 | All | Pending |
| UX-05 | All | Pending |
| INSTALL-01 | Phase 0 | Pending |
| INSTALL-02 | Phase 0 | Pending |
| INSTALL-03 | Phase 0 | Pending |

**Coverage:**
- v1 requirements: 26 total
- Mapped to phases: 26
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-29*
*Last updated: 2026-05-29 after research synthesis*
