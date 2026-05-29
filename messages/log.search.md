# summary
Search for Salesforce users by name.

# description
Finds users in the target org by first name, last name, or both. Returns paginated results
with user details. Implementation coming in Phase 1.

# examples
- <%= config.bin %> <%= command.id %> --query "John Doe" --target-org my-org
- <%= config.bin %> <%= command.id %> --query "Smith" --target-org my-org --json
