# summary
Filter downloaded debug logs by keyword.

# description
Filtering is now integrated into the trace workflow. Use `sf log trace --keyword <keyword>` to filter downloaded logs by keyword. Matching logs remain in the session directory; non-matching logs move to rejected/.

# examples
- <%= config.bin %> log trace --keyword "Account" --target-org my-org
