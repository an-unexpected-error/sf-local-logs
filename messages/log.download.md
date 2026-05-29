# summary
Download Salesforce debug logs to local disk.

# description
Downloads ApexLog records from the target org. Uses streaming I/O for large files.
Respects the org's 1GB storage quota. Implementation coming in Phase 3.

# examples
- <%= config.bin %> <%= command.id %> --target-org my-org
