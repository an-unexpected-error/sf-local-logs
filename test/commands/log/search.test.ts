import { expect } from "chai";
import { describe, it } from "mocha";
import Search from "../../../src/commands/log/search.js";
import { buildSearchQuery, escapeSoql } from "../../../src/utils/soql-builder.js";
import { formatRelativeDate } from "../../../src/utils/date-formatter.js";

/**
 * Unit tests for search functionality.
 * Tests SOQL construction, date formatting, injection prevention, and error handling.
 * These tests run without a scratch org (pure unit tests with mocked data).
 */

describe("Search Command Class", () => {
  it("should define the Search command class", () => {
    expect(Search).to.exist;
  });

  it("should have summary text from messages", () => {
    expect(Search.summary).to.be.a("string").and.not.equal("");
  });

  it("should have description text from messages", () => {
    expect(Search.description).to.be.a("string").and.not.equal("");
  });

  it("should have examples from messages", () => {
    expect(Search.examples).to.be.an("array").with.length.greaterThan(0);
  });

  it("should have required flags (target-org, api-version, name)", () => {
    const flags = Search.flags;
    expect(flags).to.have.property("target-org");
    expect(flags).to.have.property("api-version");
    expect(flags).to.have.property("name");
  });
});

describe("SOQL Builder - Query Construction", () => {
  // USER-01: Search by name returns matching pattern
  it("should construct SOQL query with LIKE wildcards on FirstName and LastName", () => {
    const query = buildSearchQuery("john");
    expect(query).to.include(
      "SELECT Id, FirstName, LastName, Email, LastLoginDate FROM User"
    );
    expect(query).to.include(
      "WHERE FirstName LIKE '%john%' OR LastName LIKE '%john%'"
    );
    expect(query).to.include("ORDER BY LastLoginDate DESC");
    expect(query).to.include("LIMIT 20");
  });

  // USER-02: Pagination limit enforced at 20
  it("should always include LIMIT 20 in query", () => {
    const query1 = buildSearchQuery("smith");
    const query2 = buildSearchQuery("jones");
    expect(query1).to.include("LIMIT 20");
    expect(query2).to.include("LIMIT 20");
  });

  it("should order results by LastLoginDate descending", () => {
    const query = buildSearchQuery("test");
    expect(query).to.include("ORDER BY LastLoginDate DESC");
  });

  it("should search on both FirstName and LastName fields", () => {
    const query = buildSearchQuery("alex");
    expect(query).to.include("FirstName LIKE");
    expect(query).to.include("LastName LIKE");
    expect(query).to.include("OR");
  });
});

describe("SOQL Builder - Injection Prevention", () => {
  it("should escape single quotes to prevent SOQL injection", () => {
    const malicious = "' OR '1'='1";
    const escaped = escapeSoql(malicious);
    expect(escaped).to.equal("\\' OR \\'1\\'=\\'1");
    // Verify the backslash-quote pattern exists (proper escaping)
    expect(escaped).to.include("\\'");
  });

  it("should handle search terms with apostrophes", () => {
    const query = buildSearchQuery("o'connor");
    expect(query).to.include("o\\'connor");
    // Verify proper escaping was applied
    expect(query).to.include("\\'");
  });

  it("should escape multiple single quotes", () => {
    const malicious = "test'; DROP TABLE users; --";
    const escaped = escapeSoql(malicious);
    expect(escaped).to.equal("test\\'; DROP TABLE users; --");
  });

  it("should build valid query after escaping", () => {
    const term = "test'123";
    const query = buildSearchQuery(term);
    expect(query).to.include("test\\'123");
    expect(query).to.include("LIMIT 20");
  });
});

describe("SOQL Builder - Edge Cases", () => {
  it("should build valid query for empty string", () => {
    const query = buildSearchQuery("");
    expect(query).to.include("LIKE '%%'");
    expect(query).to.include("LIMIT 20");
  });

  it("should build valid query for single character", () => {
    const query = buildSearchQuery("a");
    expect(query).to.include("LIKE '%a%'");
  });

  it("should handle whitespace in search term", () => {
    const query = buildSearchQuery("john smith");
    expect(query).to.include("LIKE '%john smith%'");
  });

  it("should be case-preserving in output (LIKE handles case-insensitivity)", () => {
    const query1 = buildSearchQuery("John");
    const query2 = buildSearchQuery("john");
    // Both should produce valid SOQL (LIKE is case-insensitive in Salesforce)
    expect(query1).to.include("LIKE '%John%'");
    expect(query2).to.include("LIKE '%john%'");
  });
});

describe("Date Formatter - Basic Formatting", () => {
  // USER-03: Handle null LastLoginDate gracefully
  it("should return '—' for null dates (never-logged-in users)", () => {
    const result = formatRelativeDate(null);
    expect(result).to.equal("—");
  });

  it("should return '—' for invalid date strings", () => {
    const result = formatRelativeDate("invalid-date");
    expect(result).to.equal("—");
  });

  it("should handle empty string as date", () => {
    const result = formatRelativeDate("");
    expect(result).to.equal("—");
  });

  it("should handle edge case dates gracefully", () => {
    const results = [
      formatRelativeDate("not a date"),
      formatRelativeDate("2026-13-45"), // Invalid month/day
      formatRelativeDate("abc123"),
    ];
    results.forEach((result) => {
      expect(result).to.equal("—");
    });
  });
});

describe("Date Formatter - Relative Time Units", () => {
  it("should format recent dates in seconds ago", () => {
    const now = new Date();
    const tenSecondsAgo = new Date(now.getTime() - 10000);
    const result = formatRelativeDate(tenSecondsAgo.toISOString());
    expect(result).to.include("ago");
  });

  it("should format minutes ago", () => {
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const result = formatRelativeDate(fiveMinutesAgo.toISOString());
    expect(result).to.include("ago");
    expect(result).to.include("minute");
  });

  it("should format hours ago", () => {
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const result = formatRelativeDate(twoHoursAgo.toISOString());
    expect(result).to.include("ago");
    expect(result).to.include("hour");
  });

  it("should format days ago", () => {
    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const result = formatRelativeDate(threeDaysAgo.toISOString());
    expect(result).to.include("ago");
    expect(result).to.include("day");
  });

  it("should format weeks ago", () => {
    const now = new Date();
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const result = formatRelativeDate(twoWeeksAgo.toISOString());
    expect(result).to.include("ago");
  });

  it("should format months ago", () => {
    const now = new Date();
    const twoMonthsAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000); // ~2 months
    const result = formatRelativeDate(twoMonthsAgo.toISOString());
    expect(result).to.include("ago");
  });

  it("should fall back to locale date for old dates (> 6 months)", () => {
    const eightMonthsAgo = new Date();
    eightMonthsAgo.setMonth(eightMonthsAgo.getMonth() - 8);
    const result = formatRelativeDate(eightMonthsAgo.toISOString());
    // Should be locale-specific short date, not relative
    expect(result).to.not.include("ago");
    // Should look like a date (contains slash or dash)
    expect(result).to.match(/\d+[\/-]\d+[\/-]\d+/);
  });
});

describe("Date Formatter - Edge Cases", () => {
  it("should handle ISO 8601 format with milliseconds", () => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const isoWithMs = oneHourAgo.toISOString(); // includes .000Z
    const result = formatRelativeDate(isoWithMs);
    expect(result).to.include("ago");
  });

  it("should handle dates with timezone offsets", () => {
    const result = formatRelativeDate("2026-05-29T10:00:00-05:00");
    expect(result).to.not.equal("—");
  });

  it("should handle very recent dates (now)", () => {
    const now = new Date();
    const result = formatRelativeDate(now.toISOString());
    expect(result).to.exist;
  });
});
