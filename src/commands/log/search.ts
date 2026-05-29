import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { SfCommand, Flags } from "@salesforce/sf-plugins-core";
import { Messages, Org } from "@salesforce/core";
import { cli } from "cli-ux";
import { input } from "@inquirer/prompts";
import { buildSearchQuery } from "../../utils/soql-builder.js";
import { formatRelativeDate } from "../../utils/date-formatter.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

Messages.importMessagesDirectory(__dirname);
const messages = Messages.loadMessages("sf-local-logs", "log.search");

/**
 * Represents a single user from a search result.
 */
interface User {
  Id: string;
  FirstName: string;
  LastName: string;
  Email: string;
  LastLoginDate: string | null;
}

/**
 * Represents the final search result returned by the command.
 * When --json flag is used, this is serialized to JSON by SfCommand.
 * Otherwise, results are displayed as a table.
 */
export type SearchResult = {
  results: Array<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    lastLoginDate: string | null;
  }>;
};

/**
 * Search for Salesforce users by name.
 *
 * Implements USER-01, USER-02, USER-03 (search, pagination, result fields),
 * UX-01, UX-02 (status messages, error handling), and
 * UX-04, UX-05 (JSON output, multi-org support via --target-org).
 */
export default class Search extends SfCommand<SearchResult> {
  public static readonly summary = messages.getMessage("summary");
  public static readonly description = messages.getMessage("description");
  public static readonly examples = messages.getMessages("examples");

  public static readonly flags = {
    "target-org": Flags.requiredOrg(),
    "api-version": Flags.orgApiVersion(),
    name: Flags.string({
      char: "n",
      summary: "User name to search for",
      required: false,
    }),
  };

  /**
   * Main entry point for the search command.
   * Orchestrates the search flow: validation → SOQL execution → formatting → output.
   */
  public async run(): Promise<SearchResult> {
    const { flags } = await this.parse(Search);

    // Get search term from flag or interactive prompt
    let searchTerm = flags.name?.trim() || "";

    if (!searchTerm) {
      // Prompt user for search term if not provided via flag
      searchTerm = await input({
        message: messages.getMessage("promptSearchTerm"),
        validate: (val: string) => {
          const trimmed = val.trim();
          return trimmed.length >= 2 || messages.getMessage("errorMinLength");
        },
      });
    }

    // Execute the search
    const results = await this.executeSearch(flags["target-org"], searchTerm);

    // If JSON output requested, return structured result (SfCommand handles serialization)
    if (flags.json) {
      return {
        results: results.map((user) => ({
          id: user.Id,
          firstName: user.FirstName,
          lastName: user.LastName,
          email: user.Email,
          lastLoginDate: user.LastLoginDate,
        })),
      };
    }

    // Otherwise, display results in interactive table mode
    await this.displayAndRefine(flags["target-org"], results, searchTerm);

    // Return empty results (we've already displayed in interactive mode)
    // For non-JSON output, SfCommand doesn't serialize the return value
    return { results: [] };
  }

  /**
   * Execute a SOQL search for users matching the given term.
   * Handles org connection, query execution, and error cases.
   *
   * @param org - The authenticated Salesforce org
   * @param searchTerm - User search term (first name, last name, or both)
   * @returns Array of matching users
   * @throws Error with actionable message if search fails
   */
  private async executeSearch(org: Org, searchTerm: string): Promise<User[]> {
    try {
      this.log(messages.getMessage("statusSearching"));

      const connection = org.getConnection();
      const query = buildSearchQuery(searchTerm);

      const queryResult = await connection.query<User>(query);
      return (queryResult.records as User[]) || [];
    } catch (error) {
      // Determine the type of error and provide actionable guidance
      const errorMsg = error instanceof Error ? error.message : String(error);

      if (
        errorMsg.includes("INVALID_LOGIN") ||
        errorMsg.includes("INVALID_FIELD") ||
        errorMsg.includes("NOT_AUTHORIZED")
      ) {
        throw new Error(
          messages.getMessage("errorOrgConnectionFailed", [org.getOrgId()])
        );
      }

      if (errorMsg.includes("REQUEST_TIMEOUT") || errorMsg.includes("ENOTFOUND")) {
        throw new Error(messages.getMessage("errorSearchTimedOut"));
      }

      // Generic query error
      throw new Error(messages.getMessage("errorQueryFailed"));
    }
  }

  /**
   * Display search results in table format and prompt for search refinement.
   * Implements interactive loop: if 20 results returned (limit), offer to refine.
   * User can press Enter to exit or type new search term to refine.
   *
   * @param org - The authenticated org
   * @param results - Initial search results
   * @param searchTerm - Current search term (for display in prompts)
   */
  private async displayAndRefine(
    org: Org,
    results: User[],
    searchTerm: string
  ): Promise<void> {
    let currentResults = results;
    let currentTerm = searchTerm;

    while (true) {
      if (currentResults.length === 0) {
        // No results found
        this.log(
          messages.getMessage("messageNoUsersFound", [currentTerm])
        );

        // Prompt to try again
        const retryTerm = await input({
          message: messages.getMessage("promptSearchTerm"),
          validate: (val: string) => {
            const trimmed = val.trim();
            return trimmed.length >= 2 || messages.getMessage("errorMinLength");
          },
        });

        currentTerm = retryTerm;
        currentResults = await this.executeSearch(org, currentTerm);
      } else {
        // Found results - display table
        this.log(
          messages.getMessage("statusFound", [String(currentResults.length)])
        );

        const tableData = currentResults.map((user) => ({
          ID: user.Id,
          Name: `${user.FirstName} ${user.LastName}`,
          Email: user.Email,
          "Last Login": formatRelativeDate(user.LastLoginDate),
        }));

        cli.table(tableData, {
          ID: { minWidth: 18 },
          Name: {},
          Email: {},
          "Last Login": {},
        });

        // If we hit the limit (20), offer refinement
        if (currentResults.length === 20) {
          const refine = await input({
            message: messages.getMessage("messageRefinePrompt", [
              String(currentResults.length),
            ]),
            validate: () => true, // Accept empty input (user satisfied)
          });

          if (refine.trim().length === 0) {
            // User pressed Enter without input - exit refinement loop
            break;
          }

          // User entered new search term - refine
          currentTerm = refine;
          currentResults = await this.executeSearch(org, currentTerm);
        } else {
          // Found < 20 results - exit loop
          break;
        }
      }
    }
  }
}
