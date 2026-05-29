# sf-local-logs

A Salesforce CLI plugin for efficient management of debug logs for high-volume Salesforce users. Provides local caching, filtering, and analysis of debug logs to improve debugging workflows and reduce org-level log management overhead.

## Problem Statement

High-volume Salesforce users (integration accounts, automated processes, batch jobs) generate many debug logs, creating challenges:
- **Log Management**: Logs quickly hit org limits or become difficult to navigate in the Salesforce UI
- **Search & Analysis**: Finding specific logs or patterns across many logs is time-consuming
- **Local Development**: Developers need local access to logs for offline analysis and integration with other tools
- **Retention**: Org logs have limited retention policies; projects need archival capability

## Core Features (MVP)

- **Enable Debug Logging**: Initiate debug logs for specified users directly from the CLI (no UI required)
- **Local Log Cache**: Pull and store debug logs locally with efficient indexing
- **Fast Search**: Search logs by timestamp, user, class/trigger, log level, or custom patterns
- **Log Export**: Export logs in multiple formats (JSON, CSV) for analysis
- **Batch Operations**: Manage logs in bulk (enable/disable, filter, archive)

## Target Users

- Integration engineers managing high-volume automated processes
- Salesforce platform developers debugging complex multi-org scenarios
- DevOps teams analyzing system behavior through logs
- QA teams investigating test execution logs at scale

## Technical Approach

- **Salesforce CLI Plugin**: Extends `sf` CLI for seamless integration with Salesforce workflows
- **Local Storage**: SQLite or filesystem-based log storage for fast queries
- **Node.js**: Leverages existing Salesforce CLI ecosystem (potentially TypeScript)
- **Incremental Sync**: Fetch only new logs since last sync to minimize API calls

## Success Criteria

- Successfully retrieve and cache logs from Salesforce orgs
- Search 10,000+ logs locally in <1 second
- Support export to at least JSON and CSV formats
- No performance degradation with existing Salesforce CLI tools
