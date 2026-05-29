# sf-local-logs

Salesforce CLI plugin to manage and analyze debug logs from the command line. Search for users by name, initiate debug sessions, download logs, and filter by keyword — without leaving the CLI.

## Installation

### Prerequisites

- **Node.js 18.0.0+** — [nodejs.org](https://nodejs.org/)
- **Salesforce CLI v2.x+** — [Install guide](https://developer.salesforce.com/docs/atlas.en-us.sfdx_setup.meta/sfdx_setup/sfdx_setup_install_cli.htm)

### Install from GitHub

```bash
sf plugin install https://github.com/an-unexpected-error/sf-local-logs
```

### Local Development

```bash
git clone https://github.com/an-unexpected-error/sf-local-logs.git
cd sf-local-logs
npm install
npm run compile
sf plugins link . --no-verify
```

## Requirements

- **INSTALL-01**: Plugin is installable via `sf plugin install <repo>`
- **INSTALL-02**: Plugin works with Salesforce CLI (sf) v2.x+
- **INSTALL-03**: Plugin requires Node.js 18.0.0 or later

## Commands

| Command | Namespace | Description | Phase |
|---------|-----------|-------------|-------|
| Search users | `sf log search` | Search for Salesforce users by name | Phase 1 |
| Trace session | `sf log trace` | Initiate a debug log session for a user | Phase 2 |
| Download logs | `sf log download` | Download debug logs from the org | Phase 3 |
| Purge logs | `sf log purge` | Delete debug logs to free storage quota | Phase 3 |
| Filter logs | `sf log filter` | Filter downloaded logs by keyword | Phase 4 |

All org-connected commands accept `--target-org` to specify the target Salesforce org.

Run `sf log --help` to see all available subcommands.

## Development

### Setup

```bash
# Compile TypeScript
npm run compile

# Link plugin locally for testing
npm run link-local

# Set up a scratch org for integration testing (requires DevHub)
npm run setup-devorg
```

### Testing

```bash
# Run unit tests
npm test

# Run integration tests (requires authenticated DevHub org)
npm run test:nuts
```

### Verify commands are registered

```bash
sf log --help
```

Expected output lists: `search`, `trace`, `download`, `purge`, `filter` as subcommands.

## License

MIT
