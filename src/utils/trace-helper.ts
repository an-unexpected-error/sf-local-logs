/**
 * Trace helper utility module for Salesforce Tooling API operations.
 *
 * Provides reusable functions for:
 * - Querying org's default DebugLevel
 * - Creating TraceFlag records
 * - Checking for existing active TraceFlags
 * - Retrieving DebugLevel names for display
 */

import { Org } from '@salesforce/core';

/**
 * Query org for its default DebugLevel.
 *
 * Attempts to find the org's default DebugLevel in this order:
 * 1. Query by DeveloperName = 'Debug'
 * 2. Fallback: Query most recently created DebugLevel (ORDER BY CreatedDate DESC)
 * 3. If none found, throw descriptive error
 *
 * @param org - Authenticated Org instance
 * @returns Promise<string> - The ID of the default DebugLevel
 * @throws Error with user-friendly message if no DebugLevel found
 */
export async function getDefaultDebugLevel(org: Org): Promise<string> {
  try {
    const connection = org.getConnection();

    // Standard: query for 'Debug' level by DeveloperName
    const result = await connection.tooling.query(
      "SELECT Id, DeveloperName FROM DebugLevel WHERE DeveloperName = 'Debug' LIMIT 1"
    );

    if (result.records.length > 0) {
      return result.records[0].Id as string;
    }

    // Fallback: get most recently created DebugLevel
    const fallback = await connection.tooling.query(
      'SELECT Id FROM DebugLevel ORDER BY CreatedDate DESC LIMIT 1'
    );

    if (fallback.records.length > 0) {
      return fallback.records[0].Id as string;
    }

    // No DebugLevel found
    throw new Error('Unable to determine debug level. Use --level DEBUG to specify explicitly.');
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    // If it's already our user-friendly message, re-throw it
    if (errorMsg.includes('Unable to determine debug level')) {
      throw error;
    }
    // Otherwise wrap it
    throw new Error(`Failed to determine debug level: ${errorMsg}`);
  }
}

/**
 * Create a TraceFlag record for a user.
 *
 * Creates a new TraceFlag via jsforce.tooling.create() with:
 * - StartTime = now
 * - ExpirationDate = now + 24 hours (Salesforce constraint)
 * - Both times in ISO 8601 format
 *
 * @param org - Authenticated Org instance
 * @param userId - User ID to trace (TracedEntityId)
 * @param debugLevelId - DebugLevel ID to apply
 * @returns Promise object with id, expirationDate, and debugLevel for display
 * @throws Error with meaningful message if creation fails (invalid field, permission, etc.)
 */
export async function createTraceFlag(
  org: Org,
  userId: string,
  debugLevelId: string
): Promise<{ id: string; expirationDate: string; debugLevel: string }> {
  try {
    const connection = org.getConnection();

    // Calculate expiration: NOW + 24 hours
    const startTime = new Date();
    const expirationDate = new Date(startTime.getTime() + 24 * 3600 * 1000);

    const result = await connection.tooling.create('TraceFlag', {
      TracedEntityId: userId,
      DebugLevelId: debugLevelId,
      StartTime: startTime.toISOString(),
      ExpirationDate: expirationDate.toISOString(),
    }) as { id?: string; success?: boolean; errors?: Array<{ message: string }> };

    if (!result.success) {
      // Handle Salesforce API errors
      const error = result.errors?.[0];
      throw new Error(error?.message || 'TraceFlag creation failed');
    }

    return {
      id: result.id || '',
      expirationDate: expirationDate.toISOString(),
      debugLevel: debugLevelId,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    if (errorMsg.includes('INVALID_FIELD')) {
      throw new Error('Invalid user ID provided. Please verify the user exists in this org.');
    }
    if (errorMsg.includes('NOT_AUTHORIZED')) {
      throw new Error(`Permission denied: ${errorMsg}. Contact your Salesforce administrator.`);
    }
    if (errorMsg.includes('DUPLICATE_VALUE')) {
      throw new Error('User already has an active trace flag. Use --overwrite to stop existing trace and create a new one.');
    }

    throw new Error(`TraceFlag creation failed: ${errorMsg}`);
  }
}

/**
 * Check for existing active TraceFlag for a user.
 *
 * Queries Tooling API for an active TraceFlag (ExpirationDate > now).
 * If found and overwrite=false, throws error guiding user to --overwrite flag.
 * If found and overwrite=true, stops the existing trace by setting ExpirationDate to NOW.
 *
 * @param org - Authenticated Org instance
 * @param userId - User ID to check (TracedEntityId)
 * @param overwrite - If true, stop existing trace and return; if false, throw error if found
 * @returns Promise with exists boolean and optional id of stopped trace
 * @throws Error if active trace found and overwrite=false
 */
export async function checkExistingTraceFlag(
  org: Org,
  userId: string,
  overwrite: boolean
): Promise<{ exists: boolean; id?: string }> {
  try {
    const connection = org.getConnection();
    const now = new Date().toISOString();

    // Query for active trace flags (ExpirationDate in future)
    const result = await connection.tooling.query(
      `SELECT Id FROM TraceFlag WHERE TracedEntityId = '${userId}' AND ExpirationDate > ${now} LIMIT 1`
    ) as { records: Array<{ Id: string }> };

    if (result.records.length > 0) {
      const existingTraceId = result.records[0].Id;

      if (!overwrite) {
        throw new Error('User already has an active trace flag. Use --overwrite to stop existing trace and create a new one.');
      }

      // Overwrite: stop the existing trace by setting expiration to NOW
      await connection.tooling.update('TraceFlag', {
        Id: existingTraceId,
        ExpirationDate: now,
      });

      return { exists: true, id: existingTraceId };
    }

    return { exists: false };
  } catch (error) {
    // Re-throw if it's the "active trace exists" error (user should use --overwrite)
    if (error instanceof Error && error.message.includes('User already has an active trace flag')) {
      throw error;
    }

    // Log other errors but don't fail (let trace creation attempt anyway)
    // In production, this would log to a debug logger
    return { exists: false };
  }
}

/**
 * Query DebugLevel by ID to get its DeveloperName for display.
 *
 * Retrieves the human-readable DeveloperName (e.g., "Debug", "Info") for a DebugLevel ID.
 * Used to display the debug level in trace confirmation output.
 *
 * @param org - Authenticated Org instance
 * @param debugLevelId - DebugLevel ID to query
 * @returns Promise<string> - DeveloperName for display (e.g., "Debug")
 * @throws Error if query fails (but returns ID as fallback to not break trace display)
 */
export async function getDebugLevelName(org: Org, debugLevelId: string): Promise<string> {
  try {
    const connection = org.getConnection();

    const result = await connection.tooling.query(
      `SELECT Id, DeveloperName FROM DebugLevel WHERE Id = '${debugLevelId}' LIMIT 1`
    ) as { records: Array<{ DeveloperName: string }> };

    if (result.records.length > 0) {
      return result.records[0].DeveloperName;
    }

    // Fallback to ID if not found
    return debugLevelId;
  } catch (error) {
    // Don't throw - fallback to returning the ID so trace display doesn't break
    // In production, this would log to a debug logger
    return debugLevelId;
  }
}
