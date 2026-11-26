import { expect, test } from "bun:test";
import { addDays, dailyCommits, localDate, parseHistory, weekday } from "./history";

const valid = {
  schemaVersion: 2,
  timeZone: "America/New_York",
  asOf: "2026-11-26T17:00:00.000Z",
  days: {
    "2026-11-24": {},
    "2026-11-25": { "a2f0/matrix": { commits: 14, pullRequests: 4 }, "a2f0/tearleads": { commits: 300, pullRequests: 40 } },
  },
};

function withDay(day: unknown) {
  return JSON.stringify({ ...valid, days: { "2026-11-25": day } });
}

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

test("a day's commits total every repository's, and a day without merges has none", () => {
  expect(dailyCommits(valid.days)).toEqual({ "2026-11-24": 0, "2026-11-25": 314 });
});

test.each([
  ["{", "is not JSON"],
  ["[]", "it must be a JSON object"],
  // A version 1 history kept only each day's totals.
  [JSON.stringify({ ...valid, schemaVersion: 1, days: { "2026-11-25": { commits: 314, pullRequests: 44 } } }), "schemaVersion must be 2"],
  [JSON.stringify({ ...valid, schemaVersion: 3 }), "schemaVersion must be 2"],
  [JSON.stringify({ ...valid, timeZone: "Not/A_Zone" }), "timeZone must be an IANA time zone"],
  [JSON.stringify({ ...valid, asOf: "yesterday" }), "asOf must be an ISO 8601 instant"],
  [JSON.stringify({ ...valid, asOf: "Nov 26 2026" }), "asOf must be an ISO 8601 instant"],
  [JSON.stringify({ ...valid, asOf: "2026-02-30T00:00:00Z" }), "asOf must be an ISO 8601 instant"],
  // 03:00 UTC on November 26th is still November 25th in New York.
  [JSON.stringify({ ...valid, asOf: "2026-11-26T03:00:00Z", days: { "2026-11-26": {} } }), "days.2026-11-26 is after the local date of asOf (2026-11-25)"],
  [JSON.stringify({ ...valid, days: [] }), "days must be an object"],
  [JSON.stringify({ ...valid, days: { "2026-02-30": {} } }), "invalid date '2026-02-30'"],
  [withDay([]), "days.2026-11-25 must be an object of repositories"],
  [withDay(null), "days.2026-11-25 must be an object of repositories"],
  [withDay({ commits: 1, pullRequests: 1 }), "days.2026-11-25 has an invalid repository 'commits'; use owner/name"],
  [withDay({ "a2f0/web/extra": { commits: 1, pullRequests: 1 } }), "invalid repository 'a2f0/web/extra'"],
  [withDay({ "a2f0/web": { commits: -1, pullRequests: 0 } }), 'days.2026-11-25["a2f0/web"] needs non-negative integer'],
  [withDay({ "a2f0/web": { commits: 1.5, pullRequests: 0 } }), "non-negative integer"],
  [withDay({ "a2f0/web": { commits: 1 } }), "non-negative integer"],
])("rejects an invalid history: %s", (text, message) => {
  expect(() => parseHistory(text, "commits.json")).toThrow(message);
});
