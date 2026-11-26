import { expect, test } from "bun:test";
import type { TooltipEvent, TooltipState } from "./pageLogic";
import * as logic from "./pageLogic";

// The page embeds every function pageLogic.ts exports, by its source, so the tests run those
// copies: a function that leaned on anything else would fail here as it would in the page.
const functions = Object.values(logic).filter(value => typeof value === "function");
const embedded = new Function(`${functions.join("\n")}\nreturn { ${functions.map(fn => fn.name).join(", ")} };`)() as typeof logic;

type State = TooltipState<string>;
type Event = TooltipEvent<string>;

function run(events: Event[], from: State = { kind: "hidden" }): State {
  return events.reduce<State>((state, event) => embedded.nextTooltip(state, event), from);
}

test("the tooltip follows the pointer, and leaving hides it", () => {
  expect(run([{ type: "enter", day: "a" }])).toEqual({ kind: "hover", day: "a", focused: null });
  expect(
    run([
      { type: "enter", day: "a" },
      { type: "enter", day: "b" },
    ]),
  ).toEqual({ kind: "hover", day: "b", focused: null });
  expect(run([{ type: "enter", day: "a" }, { type: "leave" }])).toEqual({ kind: "hidden" });
});

test("leaving a hovered day returns the tooltip to the focused day", () => {
  const states = [{ type: "focus", day: "f" }, { type: "enter", day: "a" }, { type: "leave" }] satisfies Event[];
  expect(run(states.slice(0, 2))).toEqual({ kind: "hover", day: "a", focused: "f" });
  expect(run(states)).toEqual({ kind: "focus", day: "f" });
});

test("moving focus shows the newly focused day, even under a resting pointer", () => {
  const hovering = run([{ type: "enter", day: "a" }]);
  // An arrow key blurs one day, then focuses the next.
  expect(run([{ type: "focus", day: "b" }, { type: "blur" }, { type: "focus", day: "c" }], hovering)).toEqual({ kind: "focus", day: "c" });
  // A pointer leaving after focus moved leaves the focused day's tooltip up.
  expect(run([{ type: "focus", day: "b" }, { type: "leave" }], hovering)).toEqual({ kind: "focus", day: "b" });
});

test("a click or tap focuses its day, so the tooltip stays there after the pointer leaves", () => {
  // Touch has no hover, so a tapped day keeps its count up until another move.
  expect(run([{ type: "enter", day: "a" }, { type: "focus", day: "a" }, { type: "leave" }])).toEqual({ kind: "focus", day: "a" });
});

test("losing focus keeps the hovered day's tooltip and forgets the focused one", () => {
  const state = run([{ type: "focus", day: "f" }, { type: "enter", day: "a" }, { type: "blur" }]);
  expect(state).toEqual({ kind: "hover", day: "a", focused: null });
  expect(run([{ type: "leave" }], state)).toEqual({ kind: "hidden" });
  expect(run([{ type: "focus", day: "f" }, { type: "blur" }])).toEqual({ kind: "hidden" });
});

test("Escape or a view change dismisses the tooltip, hovered or focused", () => {
  expect(run([{ type: "enter", day: "a" }, { type: "dismiss" }])).toEqual({ kind: "hidden" });
  expect(run([{ type: "focus", day: "f" }, { type: "dismiss" }])).toEqual({ kind: "hidden" });
  // Leaving after a dismissal keeps it hidden.
  expect(run([{ type: "focus", day: "f" }, { type: "enter", day: "a" }, { type: "dismiss" }, { type: "leave" }])).toEqual({ kind: "hidden" });
});

test("a link opens the first view holding its day, and nothing for blank or unknown days", () => {
  const views: [string, string, string][] = [
    ["last", "2025-11-23", "2026-11-25"],
    ["2026", "2026-01-01", "2026-11-25"],
    ["2025", "2025-11-21", "2025-12-31"],
  ];
  expect(embedded.viewFor("2026-09-09", views)).toBe("last");
  expect(embedded.viewFor("2025-11-23", views)).toBe("last");
  expect(embedded.viewFor("2025-11-22", views)).toBe("2025");
  expect(embedded.viewFor("2025-11-21", views)).toBe("2025");
  // Before the first count, after today, and anything that is not a date.
  // Dates that do not exist, which Date would roll into the next month, open nothing either.
  for (const hash of [
    "2025-11-20",
    "2025-01-01",
    "2026-11-26",
    "",
    "2026-9-9",
    "%E0%A4%A",
    "2026-09-09x",
    "2026-02-30",
    "2025-11-31",
    "2025-06-00",
    "2026-13-01",
  ]) {
    expect(embedded.viewFor(hash, views)).toBeNull();
  }
});

test("arrow keys step one row or column, and other keys do not move", () => {
  expect(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].map(key => embedded.step(key, 3, 10))).toEqual([
    [3, 9],
    [3, 11],
    [2, 10],
    [4, 10],
  ]);
  for (const key of ["Enter", "Tab", "a", "toString", "constructor"]) expect(embedded.step(key, 3, 10)).toBeNull();
});

test("a day shows inside its calendar's box only while some of it is within the box", () => {
  const box = { left: 100, right: 500 };
  expect(embedded.inside({ left: 200, right: 210 }, box)).toBe(true);
  expect(embedded.inside({ left: 95, right: 105 }, box)).toBe(true);
  expect(embedded.inside({ left: 90, right: 100 }, box)).toBe(false);
  expect(embedded.inside({ left: 500, right: 510 }, box)).toBe(false);
});

test("the tooltip sits centered 4 pixels above the day, inside the window, or below without room above", () => {
  const day = { left: 500, top: 300, bottom: 310, width: 10 };
  const tip = { width: 180, height: 27.5 };
  expect(embedded.place(day, tip, 1280)).toEqual({ left: 415, top: 268.5 });
  expect(embedded.place({ ...day, left: 20 }, tip, 1280).left).toBe(8);
  expect(embedded.place({ ...day, left: 1270 }, tip, 1280).left).toBe(1280 - 180 - 8);
  expect(embedded.place({ ...day, top: 10, bottom: 20 }, tip, 1280).top).toBe(24);
});

test("shades follow the quartiles of the busy days", () => {
  const bounds = embedded.levelBounds([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  expect(bounds).toEqual([2, 4, 6]);
  expect([0, 1, 2, 3, 4, 5, 6, 7, 800].map(count => embedded.level(count, bounds))).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
  expect(embedded.levelBounds([0, 0])).toEqual([0, 0, 0]);
  expect(embedded.level(0, [0, 0, 0])).toBe(0);
  // A single busy day is still a shade, not blank.
  expect(embedded.level(5, embedded.levelBounds([5]))).toBe(1);
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
  ["2026-12-31", 2, "2 commits on December 31st."],
])("hover text for %s with %d commits", (date, commits, text) => {
  expect(embedded.tooltip(date, commits)).toBe(text);
});

test("counts read as GitHub writes them", () => {
  expect([0, 1, 2, 1234].map(count => embedded.commitCount(count))).toEqual(["0 commits", "1 commit", "2 commits", "1,234 commits"]);
});

test("a day counts the commits of the chosen repositories only", () => {
  expect(embedded.chosenCommits([3, 5, 7], [true, true, true])).toBe(15);
  expect(embedded.chosenCommits([3, 5, 7], [false, true, true])).toBe(12);
  expect(embedded.chosenCommits([3, 5, 7], [false, false, false])).toBe(0);
  // A day the page holds no counts for had no merges.
  expect(embedded.chosenCommits(undefined, [true, true, true])).toBe(0);
});

test("a view reshades among its own days for the chosen repositories", () => {
  const days = { "2026-11-23": [1, 0], "2026-11-24": [2, 9], "2026-11-25": [0, 4] };
  const dates = ["2026-11-22", "2026-11-23", "2026-11-24", "2026-11-25"];
  expect(embedded.shadeDays(dates, days, [true, true])).toEqual({ commits: [0, 1, 11, 4], levels: [0, 1, 3, 2], total: 16 });
  // Without the second repository, the first's 2 commits on the 24th take the shade 11 commits had.
  expect(embedded.shadeDays(dates, days, [true, false])).toEqual({ commits: [0, 1, 2, 0], levels: [0, 1, 3, 0], total: 3 });
  expect(embedded.shadeDays(dates, days, [false, false])).toEqual({ commits: [0, 0, 0, 0], levels: [0, 0, 0, 0], total: 0 });
  // Only the page's own dates count, never an inherited property.
  expect(embedded.shadeDays(["constructor", "toString"], days, [true, true]).total).toBe(0);
});

test("the summary says how many repositories count", () => {
  expect(embedded.chosenSummary([true, true, true])).toBe("All 3 repositories");
  expect(embedded.chosenSummary([true, false, true])).toBe("2 of 3 repositories");
  expect(embedded.chosenSummary([false, false, false])).toBe("No repositories");
  expect(embedded.chosenSummary([true, false])).toBe("1 of 2 repositories");
  // A lone repository is neither "All 1" nor plural.
  expect(embedded.chosenSummary([true])).toBe("1 repository");
  expect(embedded.chosenSummary([false])).toBe("No repositories");
});
