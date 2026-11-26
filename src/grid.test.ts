import { expect, test } from "bun:test";
import { buildGrid, buildRange, buildYear, level, levelBounds, tooltip, WEEKS } from "./grid";
import { addDays, type DayCount } from "./history";

test("the grid ends today and starts on the Sunday 52 weeks before this week's", () => {
  const grid = buildGrid({}, "2026-11-25");
  expect(grid.rows).toHaveLength(7);
  expect(grid.rows[0]![0]!.date).toBe("2025-11-23");
  expect(grid.rows[3]!.at(-1)!.date).toBe("2026-11-25");
  // Days after today in the current week are absent, not blank cells.
  expect(grid.rows.map(row => row.length)).toEqual([WEEKS, WEEKS, WEEKS, WEEKS, WEEKS - 1, WEEKS - 1, WEEKS - 1]);
  // Row-major cells walk each weekday a week at a time.
  expect(grid.rows[1]![1]!.date).toBe(addDays("2025-11-24", 7));
  // It starts on a Sunday and counts from its first day, so no day is blank.
  expect(grid.rows.flat()).not.toContain(null);
});

test("totals count only the days the grid shows", () => {
  const days: Record<string, DayCount> = {
    "2025-11-22": { commits: 100, pullRequests: 10 },
    "2025-11-23": { commits: 3, pullRequests: 1 },
    "2026-11-25": { commits: 4, pullRequests: 2 },
    "2026-11-26": { commits: 50, pullRequests: 5 },
  };
  const grid = buildGrid(days, "2026-11-25");
  expect(grid.commits).toBe(7);
  expect(grid.rows[0]![0]!.commits).toBe(3);
});

test("shades follow the quartiles of the busy days", () => {
  const bounds = levelBounds([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  expect(bounds).toEqual([2, 4, 6]);
  expect([0, 1, 2, 3, 4, 5, 6, 7, 800].map(count => level(count, bounds))).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
  expect(levelBounds([0, 0])).toEqual([0, 0, 0]);
  expect(level(0, [0, 0, 0])).toBe(0);
  // A single busy day is still a shade, not blank.
  expect(level(5, levelBounds([5]))).toBe(1);
});

test("months label runs of at least three weeks by the month of their Sundays", () => {
  // Starts Sunday 2025-11-23: two November weeks are too narrow for a label.
  const grid = buildGrid({}, "2026-11-25");
  expect(grid.months[0]).toEqual({ column: 2, name: "Dec" });
  expect(grid.months.at(-1)).toEqual({ column: 49, name: "Nov" });
  expect(grid.months.map(month => month.name)).toEqual(["Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov"]);
});

test.each([
  ["2026-11-26", 0, "No commits on November 26th."],
  ["2026-01-01", 1, "1 commit on January 1st."],
  ["2026-03-22", 1234, "1,234 commits on March 22nd."],
  ["2026-05-03", 3, "3 commits on May 3rd."],
  ["2026-06-11", 2, "2 commits on June 11th."],
  ["2026-06-12", 2, "2 commits on June 12th."],
  ["2026-06-13", 2, "2 commits on June 13th."],
  ["2026-06-21", 2, "2 commits on June 21st."],
  ["2026-06-30", 2, "2 commits on June 30th."],
])("hover text for %s with %d commits", (date, commits, text) => {
  expect(tooltip(date, commits)).toBe(text);
});

test("a year starts on January 1st, blank before it in its first week, and ends on December 31st", () => {
  // 2025 starts on a Wednesday and ends on a Wednesday.
  const year = buildYear({ "2025-06-02": { commits: 9, pullRequests: 1 } }, 2025, "2026-11-25", "2025-01-01");
  expect(year.columns).toBe(53);
  expect(year.rows.map(row => row[0]?.date ?? null)).toEqual([null, null, null, "2025-01-01", "2025-01-02", "2025-01-03", "2025-01-04"]);
  expect(year.rows[3]!.at(-1)!.date).toBe("2025-12-31");
  expect(year.rows[4]!).toHaveLength(52);
  expect(year.rows.flat().filter(cell => cell)).toHaveLength(365);
  expect(year.commits).toBe(9);
  expect(year.months[0]).toEqual({ column: 0, name: "Jan" });
  expect(year.months.map(month => month.name)).toEqual(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]);
});

test("the current year ends today", () => {
  const year = buildYear({}, 2026, "2026-11-25", "2025-11-21");
  const dates = year.rows.flat().flatMap(cell => (cell ? [cell.date] : []));
  expect(dates.sort().at(-1)).toBe("2026-11-25");
  expect(dates[0]).toBe("2026-01-01");
});

test("days before the history's first count stay blank and add nothing", () => {
  const days: Record<string, DayCount> = {
    "2025-03-04": { commits: 500, pullRequests: 1 },
    "2025-11-21": { commits: 2, pullRequests: 1 },
    "2025-11-22": { commits: 0, pullRequests: 0 },
  };
  const year = buildYear(days, 2025, "2026-11-25", "2025-11-21");
  // The grid keeps the whole year's weeks, so the months stay where they belong.
  expect(year.columns).toBe(53);
  const cells = year.rows.flat().filter(cell => cell);
  expect(cells.map(cell => cell!.date).sort()[0]).toBe("2025-11-21");
  expect(year.commits).toBe(2);
  // Uncounted days inside the history count as none.
  expect(cells.find(cell => cell!.date === "2025-12-01")).toEqual({ date: "2025-12-01", commits: 0, level: 0 });
});

test("each range shades among its own days", () => {
  const days: Record<string, DayCount> = { "2025-12-30": { commits: 1, pullRequests: 1 }, "2026-01-02": { commits: 100, pullRequests: 1 } };
  const december = buildRange(days, "2025-12-28", "2025-12-31");
  expect(december.rows[2]![0]).toEqual({ date: "2025-12-30", commits: 1, level: 1 });
  const both = buildRange(days, "2025-12-28", "2026-01-03");
  expect(both.rows[2]![0]!.level).toBeLessThan(both.rows[5]![0]!.level);
});
