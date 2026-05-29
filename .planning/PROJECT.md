# Salesforce Debug Log CLI Plugin

## What This Is

A Salesforce SF CLI plugin that enables admins and engineers to efficiently manage and analyze debug logs from the command line. Instead of navigating the browser, users search for users by name, initiate debug sessions, download logs, and filter by keyword to pinpoint relevant debugging information. Designed for high-volume scenarios where storage limits and timestamp-only identification make analysis difficult.

## Core Value

Enable admins to efficiently locate and analyze debugging information in high-volume debug logs (1000s/minute) without leaving the CLI or the browser-based Salesforce UI.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] User can search for a Salesforce user by name (not just user ID)
- [ ] User can initiate a debug log session from CLI for a selected user
- [ ] User can download debug logs as they are created
- [ ] User can filter downloaded logs by keyword (SObject or Platform Event entry points)
- [ ] User can purge/manage debug log files to stay within 1GB storage limit
- [ ] Plugin is installable via `sf plugin install`
- [ ] CLI UI clearly communicates status, progress, and available actions
- [ ] Plugin handles high-volume scenarios (1000s logs/minute) without performance degradation

### Out of Scope

- Debug level selection (v2) — v1 uses default/existing org settings
- Report generation and export (v2) — v1 provides filtered log access only
- Real-time log streaming UI (v2) — v1 downloads complete logs then filters
- Multi-org support (v2) — v1 targets single org context

## Context

**Salesforce Debug Log Ecosystem:**
- Salesforce limits debug log storage to 1GB total across all logs
- Individual debug files can be 10-100MB each, creating storage pressure
- Debug logs identified only by timestamp, making manual analysis difficult
- Current workflow requires browser login and manual file management

**User Frustrations:**
- High-volume users generate 1000s of logs per minute, filling storage quota quickly
- Identifying which log contains the relevant debugging information is time-consuming
- Context switching between CLI and browser is disruptive
- Manual purging of logs is tedious and error-prone

**Technical Environment:**
- Salesforce CLI (sf) with plugin ecosystem
- Plugin consumers: Salesforce Admins and Engineers with CLI access
- Org size: targets orgs with potentially 1000+ users

## Constraints

- **Performance**: Must handle high-volume scenarios (1000s logs/minute) without degradation
- **Storage**: Must respect Salesforce's 1GB debug log limit across all files
- **Tech Stack**: Written in TypeScript, installable via `sf plugin install`
- **UX**: CLI-first experience; clear communication of what's happening at each step
- **Compatibility**: Must work within Salesforce CLI architecture and plugin framework

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| TypeScript implementation | Type safety for maintainability; aligns with modern SF CLI plugins | ✓ Good |
| Core workflow (search → initiate → download → filter) for v1 | Focuses on highest-value pain point; defers nice-to-haves to v2 | — Pending |
| Keyword filtering by SObject/Platform Event | Targets most common debugging use case; entry point identification is key to analysis | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-29 after initialization*
