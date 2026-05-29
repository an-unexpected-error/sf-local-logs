# summary

Search for Salesforce users by name with fuzzy matching and paginated results.

# description

Find users in your org by first name, last name, or both. Results are limited to 20 per view and sorted by most recent login. You can refine your search interactively to narrow results, or output as JSON for programmatic use. Supports multi-org environments via --target-org flag.

# examples

- <%= config.bin %> <%= command.id %> --name "John" --target-org my-org
- <%= config.bin %> <%= command.id %> --name "Smith" --target-org my-org --json

# promptSearchTerm

Search for user name (first, last, or both):

# statusSearching

Searching for users...

# statusFound

Found %s user(s):

# messageNoUsersFound

No users found for '%s'. Try refining your search or use a broader term. Tip: search by first or last name alone (e.g., 'john' or 'smith').

# messageRefinePrompt

Found %s users. Refine search (or press Enter to continue):

# errorMinLength

Search term must be at least 2 characters.

# errorOrgConnectionFailed

Unable to connect to org %s. Verify you have permission and the org is active. Run 'sf org list' to see available orgs, or use --target-org to specify a different org.

# errorSearchTimedOut

Search timed out. Salesforce org may be busy. Try again in a moment.

# errorQueryFailed

Search query failed. Please try a different search term.
