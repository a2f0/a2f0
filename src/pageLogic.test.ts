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

test("the tooltip sits centered 4 pixels above the day, inside the window, or below without room above", () => {
  const day = { left: 500, top: 300, bottom: 310, width: 10 };
  const tip = { width: 180, height: 27.5 };
  expect(embedded.place(day, tip, 1280)).toEqual({ left: 415, top: 268.5 });
  expect(embedded.place({ ...day, left: 20 }, tip, 1280).left).toBe(8);
  expect(embedded.place({ ...day, left: 1270 }, tip, 1280).left).toBe(1280 - 180 - 8);
  expect(embedded.place({ ...day, top: 10, bottom: 20 }, tip, 1280).top).toBe(24);
});
