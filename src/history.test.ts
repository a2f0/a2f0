import { expect, test } from "bun:test";
import { addDays, localDate, parseHistory, weekday } from "./history";

const valid = { schemaVersion: 1, timeZone: "America/New_York", asOf: "2026-11-26T17:00:00.000Z", days: { "2026-11-25": { commits: 314, pullRequests: 44 } } };

test("dates step across months, years, and leap days, and know their weekday", () => {
  expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
  expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  expect(weekday("2026-11-22")).toBe(0);
  expect(weekday("2026-11-28")).toBe(6);
  expect(() => addDays("2026-02-30", 0)).toThrow("Invalid date");
});

test("local dates follow the history's time zone", () => {
  expect(localDate(new Date("2026-11-26T04:30:00Z"), "America/New_York")).toBe("2026-11-25");
  expect(localDate(new Date("2026-11-26T04:30:00Z"), "UTC")).toBe("2026-11-26");
});

test("parses a valid history", () => {
  expect(parseHistory(JSON.stringify(valid), "commits.json")).toEqual(valid as never);
});

test.each([
  ["{", "is not JSON"],
  ["[]", "it must be a JSON object"],
  [JSON.stringify({ ...valid, schemaVersion: 2 }), "schemaVersion must be 1"],
  [JSON.stringify({ ...valid, timeZone: "Not/A_Zone" }), "timeZone must be an IANA time zone"],
  [JSON.stringify({ ...valid, asOf: "yesterday" }), "asOf must be an ISO 8601 instant"],
  [JSON.stringify({ ...valid, asOf: "Nov 26 2026" }), "asOf must be an ISO 8601 instant"],
  [JSON.stringify({ ...valid, asOf: "2026-02-30T00:00:00Z" }), "asOf must be an ISO 8601 instant"],
  // 03:00 UTC on November 26th is still November 25th in New York.
  [
    JSON.stringify({ ...valid, asOf: "2026-11-26T03:00:00Z", days: { "2026-11-26": { commits: 1, pullRequests: 1 } } }),
    "days.2026-11-26 is after the local date of asOf (2026-11-25)",
  ],
  [JSON.stringify({ ...valid, days: [] }), "days must be an object"],
  [JSON.stringify({ ...valid, days: { "2026-02-30": { commits: 1, pullRequests: 1 } } }), "invalid date '2026-02-30'"],
  [JSON.stringify({ ...valid, days: { "2026-11-25": { commits: -1, pullRequests: 0 } } }), "non-negative integer"],
  [JSON.stringify({ ...valid, days: { "2026-11-25": { commits: 1.5, pullRequests: 0 } } }), "non-negative integer"],
  [JSON.stringify({ ...valid, days: { "2026-11-25": { commits: 1 } } }), "non-negative integer"],
])("rejects an invalid history: %s", (text, message) => {
  expect(() => parseHistory(text, "commits.json")).toThrow(message);
});
