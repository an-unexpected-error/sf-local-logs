#!/usr/bin/env bash
set -e

echo "=== sf-local-logs: Dev Environment Setup ==="
echo ""

# Check sf CLI is available
if ! command -v sf &> /dev/null; then
  echo "ERROR: Salesforce CLI (sf) not found. Install from:"
  echo "  https://developer.salesforce.com/tools/salesforcecli"
  exit 1
fi

SF_VERSION=$(sf --version 2>/dev/null | head -1)
echo "SF CLI: $SF_VERSION"
echo "Node.js: $(node --version)"
echo ""

# Check for DevHub authentication
echo "Checking DevHub authentication..."
if ! sf org list --json 2>/dev/null | grep -q "devHub"; then
  echo "WARNING: No DevHub found in authenticated orgs."
  echo "To authorize a DevHub:"
  echo "  sf org login web --set-default-dev-hub --alias DevHub"
  echo ""
  echo "Skipping scratch org creation. Plugin will still link for --help testing."
else
  echo "DevHub found. Creating scratch org..."
  sf org create scratch \
    --definition-file config/project-scratch-def.json \
    --alias sf-local-logs-dev \
    --set-default \
    --duration-days 30 \
    2>/dev/null || echo "Scratch org creation failed or already exists."
  echo "Scratch org ready: sf-local-logs-dev"
fi

echo ""
echo "Compiling plugin..."
npm run compile

echo ""
echo "Linking plugin to local sf CLI..."
sf plugins link . --no-verify

echo ""
echo "=== Setup complete ==="
echo "Verify with: sf log --help"
echo ""
