/**
 * The web page script's decisions, as pure functions. The page embeds every
 * function here together, each by its source (`Function.prototype.toString`),
 * so a function may use only its parameters, built-ins, and the other
 * functions here, never another binding of this module. The tests run the
 * embedded copies.
 */

/**
 * What the tooltip shows: nothing, the day under the pointer (remembering the
 * focused day to return to when the pointer leaves), or the focused day.
 */
export type TooltipState<Day> = { kind: "hidden" } | { kind: "hover"; day: Day; focused: Day | null } | { kind: "focus"; day: Day };

/** The pointer entering a day or leaving the days, focus arriving on or leaving a day, or Escape and view changes dismissing it. */
export type TooltipEvent<Day> = { type: "enter"; day: Day } | { type: "leave" } | { type: "focus"; day: Day } | { type: "blur" } | { type: "dismiss" };

/** The focused day a tooltip state remembers, if any. */
export function focusedDay<Day>(state: TooltipState<Day>): Day | null {
  if (state.kind === "focus") return state.day;
  return state.kind === "hover" ? state.focused : null;
}

/** The tooltip's one transition function: the latest pointer or keyboard move wins. */
export function nextTooltip<Day>(state: TooltipState<Day>, event: TooltipEvent<Day>): TooltipState<Day> {
  switch (event.type) {
    case "enter":
      return { kind: "hover", day: event.day, focused: focusedDay(state) };
    case "leave":
      if (state.kind !== "hover") return state;
      return state.focused === null ? { kind: "hidden" } : { kind: "focus", day: state.focused };
    case "focus":
      return { kind: "focus", day: event.day };
    case "blur":
      return state.kind === "hover" ? { kind: "hover", day: state.day, focused: null } : { kind: "hidden" };
    // Escape dismisses until the next move, forgetting the focused day too, so a
    // pointer passing over the days afterwards does not bring its tooltip back.
    case "dismiss":
      return { kind: "hidden" };
  }
}

/**
 * The first view, as `[id, first day, last day]` in page order, whose days
 * include `date`; null for anything else, including a date that does not exist,
 * which `Date` would roll into the next month.
 */
export function viewFor(date: string, views: [string, string, string][]): string | null {
  const time = /^\d{4}-\d{2}-\d{2}$/.test(date) ? Date.parse(`${date}T00:00:00Z`) : Number.NaN;
  if (Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== date) return null;
  for (const [id, first, last] of views) if (first <= date && date <= last) return id;
  return null;
}

/** The `[row, column]` an arrow key moves to from a cell, or null for any other key. */
export function step(key: string, row: number, column: number): [number, number] | null {
  switch (key) {
    case "ArrowLeft":
      return [row, column - 1];
    case "ArrowRight":
      return [row, column + 1];
    case "ArrowUp":
      return [row - 1, column];
    case "ArrowDown":
      return [row + 1, column];
    default:
      return null;
  }
}

/** Whether a day shows at all inside the box that scrolls its calendar sideways. */
export function inside(day: { left: number; right: number }, box: { left: number; right: number }): boolean {
  return day.right > box.left && day.left < box.right;
}

/**
 * Where GitHub puts its tooltip, in viewport pixels: centered 4 pixels above
 * the day, at least 8 pixels inside the window's sides, and below the day
 * when there is no room above.
 */
export function place(
  day: { left: number; top: number; bottom: number; width: number },
  tip: { width: number; height: number },
  viewportWidth: number,
): { left: number; top: number } {
  const left = Math.max(8, Math.min(day.left + day.width / 2 - tip.width / 2, viewportWidth - tip.width - 8));
  const above = day.top - tip.height - 4;
  return { left, top: above >= 0 ? above : day.bottom + 4 };
}
