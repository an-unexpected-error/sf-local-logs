# summary
Filter downloaded debug logs by keyword.

# description
Searches downloaded log files for a keyword (SObject name or Platform Event name).
Displays matching lines with surrounding context. Supports export to file.
Implementation coming in Phase 4.

# examples
- <%= config.bin %> <%= command.id %> --keyword "Account"
- <%= config.bin %> <%= command.id %> --keyword "OrderEvent__e" --export results.txt
