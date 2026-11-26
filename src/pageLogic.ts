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

/** A day's shade: none, then the four quartiles of the view's busy days. */
export type Level = 0 | 1 | 2 | 3 | 4;

/** The English name of a month, 0 for January. */
export function monthName(month: number): string {
  return ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][month]!;
}

/** GitHub's count: "1 commit", "1,234 commits". */
export function commitCount(count: number): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? "commit" : "commits"}`;
}

/** GitHub's hover text: "No commits on November 26th.", "1 commit on ...", "1,234 commits on ...". */
export function tooltip(date: string, commits: number): string {
  const day = Number(date.slice(8, 10));
  const suffix = day % 100 >= 11 && day % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][day % 10] ?? "th");
  const when = `${monthName(Number(date.slice(5, 7)) - 1)} ${day}${suffix}`;
  return commits === 0 ? `No commits on ${when}.` : `${commitCount(commits)} on ${when}.`;
}

/**
 * The upper bounds of levels 1 through 3: the quartiles of the days with any
 * commits, so the shades spread across the view's busy days as GitHub's do.
 */
export function levelBounds(counts: number[]): [number, number, number] {
  const busy = counts.filter(count => count > 0).sort((a, b) => a - b);
  if (busy.length === 0) return [0, 0, 0];
  const quartile = (fraction: number) => busy[Math.ceil(fraction * busy.length) - 1]!;
  return [quartile(0.25), quartile(0.5), quartile(0.75)];
}

export function level(count: number, bounds: [number, number, number]): Level {
  if (count === 0) return 0;
  const index = bounds.findIndex(bound => count <= bound);
  return (index === -1 ? 4 : index + 1) as Level;
}

/** A day's commits in the chosen repositories, from each repository's count in the order of `chosen`; none for a day without counts. */
export function chosenCommits(counts: number[] | undefined, chosen: boolean[]): number {
  return chosen.reduce((total, isChosen, index) => total + (isChosen ? (counts?.[index] ?? 0) : 0), 0);
}

/**
 * One view's days counted in the chosen repositories: each day's commits and
 * shade, shaded among the view's own days, and the view's total.
 */
export function shadeDays(dates: string[], days: Record<string, number[]>, chosen: boolean[]): { commits: number[]; levels: Level[]; total: number } {
  const commits = dates.map(date => chosenCommits(Object.hasOwn(days, date) ? days[date] : undefined, chosen));
  const bounds = levelBounds(commits);
  return { commits, levels: commits.map(count => level(count, bounds)), total: commits.reduce((total, count) => total + count, 0) };
}

/** How many of the repositories count: "All 18 repositories", "3 of 18 repositories", "No repositories", or "1 repository" when it is the only one. */
export function chosenSummary(chosen: boolean[]): string {
  const count = chosen.filter(Boolean).length;
  if (count === 0) return "No repositories";
  if (count < chosen.length) return `${count} of ${chosen.length} repositories`;
  return count === 1 ? "1 repository" : `All ${count} repositories`;
}
