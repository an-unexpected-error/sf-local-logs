/**
 * Result type for trace flag creation and monitoring.
 *
 * This type is used by the trace command for both table output and --json serialization.
 * SfCommand<TraceResult> automatically serializes this via --json flag.
 */
export type TraceResult = {
  traceFlag: {
    id: string;              // TraceFlag record ID from Salesforce
    userId: string;          // User ID being traced (TracedEntityId)
    userName: string;        // User first + last name for display
    userEmail: string;       // User email for display
    debugLevel: string;      // DebugLevel ID or DeveloperName (implementation choice)
    expirationDate: string;  // ISO 8601 timestamp (e.g., "2026-05-31T14:30:00.000Z")
  };
};
