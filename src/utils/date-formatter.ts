/**
 * Date formatting utilities for user-facing output.
 * Provides relative date formatting (e.g., "2 hours ago") for table display,
 * while JSON output uses ISO 8601 dates directly.
 */

/**
 * Format an ISO 8601 date string as a relative date (e.g., "2 hours ago").
 *
 * Uses the built-in Intl.RelativeTimeFormat API (no external dependencies).
 * Handles null dates gracefully by returning "—" (common in UI for missing data).
 * Falls back to locale-specific short date format for dates older than 6 months.
 *
 * Supports units: seconds, minutes, hours, days, weeks, months, and years.
 * The formatter automatically selects the most appropriate unit for readability.
 *
 * @param isoDate - ISO 8601 timestamp string (e.g., "2026-05-29T10:00:00.000Z") or null
 * @returns Human-readable relative date string (e.g., "2 hours ago") or "—" if null
 *
 * @example
 * formatRelativeDate('2026-05-29T10:00:00.000Z') // "2 hours ago"
 * formatRelativeDate(null) // "—"
 * formatRelativeDate('2026-01-15T08:30:00.000Z') // "5/15/2026" (old date fallback)
 */
export function formatRelativeDate(isoDate: string | null): string {
  // Handle null dates (e.g., users who have never logged in)
  if (isoDate === null) {
    return "—";
  }

  try {
    const date = new Date(isoDate);
    const now = new Date();

    // Handle invalid dates
    if (isNaN(date.getTime())) {
      return "—";
    }

    const deltaMs = now.getTime() - date.getTime();
    const deltaSec = Math.floor(deltaMs / 1000);

    // Determine the appropriate unit and value for relative formatting
    let unit: Intl.RelativeTimeFormatUnit = "second";
    let value = deltaSec;

    if (deltaSec < 60) {
      unit = "second";
      value = deltaSec;
    } else if (deltaSec < 3600) {
      unit = "minute";
      value = Math.floor(deltaSec / 60);
    } else if (deltaSec < 86400) {
      unit = "hour";
      value = Math.floor(deltaSec / 3600);
    } else if (deltaSec < 604800) {
      unit = "day";
      value = Math.floor(deltaSec / 86400);
    } else if (deltaSec < 2592000) {
      // 30 days
      unit = "week";
      value = Math.floor(deltaSec / 604800);
    } else if (deltaSec < 15552000) {
      // 180 days
      unit = "month";
      value = Math.floor(deltaSec / 2592000);
    } else {
      // For dates older than 6 months, fall back to locale-specific short date
      return date.toLocaleDateString();
    }

    // Format as negative value (past tense: "X days ago")
    const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
    return formatter.format(-value, unit);
  } catch {
    // If anything goes wrong, return the dash
    return "—";
  }
}
