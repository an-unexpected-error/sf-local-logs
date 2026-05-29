/**
 * SOQL query builder for user search with injection prevention.
 * Provides utilities to construct safe SOQL queries for user searches.
 */

/**
 * Escape single quotes in SOQL input to prevent injection attacks.
 * Replaces single quotes with escaped single quotes (\').
 *
 * @param input - Untrusted user input
 * @returns Escaped input safe for use in SOQL queries
 */
export function escapeSoql(input: string): string {
  return input.replace(/'/g, "\\'");
}

/**
 * Build a SOQL query to search for users by name.
 *
 * Constructs a SOQL query that searches for users matching the provided search term
 * against both FirstName and LastName fields using LIKE wildcards. The LIKE operator
 * in SOQL is case-insensitive by default.
 *
 * Results are limited to 20 records per CONTEXT.md decision, to keep terminal output
 * readable and encourage iterative search refinement rather than traditional pagination.
 * Results are ordered by LastLoginDate descending to show most recently active users first.
 *
 * The search term is escaped to prevent SOQL injection attacks via the escapeSoql() function.
 *
 * @param searchTerm - User-provided search term (first name, last name, or both)
 * @returns SOQL query string ready to execute via jsforce Connection.query()
 *
 * @example
 * const query = buildSearchQuery('john');
 * // Returns: SELECT Id, FirstName, LastName, Email, LastLoginDate FROM User
 * //          WHERE FirstName LIKE '%john%' OR LastName LIKE '%john%'
 * //          ORDER BY LastLoginDate DESC LIMIT 20
 */
export function buildSearchQuery(searchTerm: string): string {
  const escaped = escapeSoql(searchTerm);
  const wildcardTerm = `%${escaped}%`;

  return (
    "SELECT Id, FirstName, LastName, Email, LastLoginDate FROM User " +
    `WHERE FirstName LIKE '${wildcardTerm}' OR LastName LIKE '${wildcardTerm}' ` +
    "ORDER BY LastLoginDate DESC LIMIT 20"
  );
}
