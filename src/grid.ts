import { addDays, type DayCount, weekday } from "./history";

/** Columns in the grid: the current week and the 52 before it, as on GitHub. */
export const WEEKS = 53;

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export type Level = 0 | 1 | 2 | 3 | 4;

export interface Cell {
  date: string;
  commits: number;
  level: Level;
}

export interface MonthLabel {
  column: number;
  name: string;
}

/** A calendar whose cells are `Day`: `Cell | null` when it can have blank days, `Cell` when it has none. */
export interface Grid<Day extends Cell | null = Cell | null> {
  /**
   * Seven rows, Sunday first; each holds that weekday's cells, oldest first,
   * through the last date. A null cell is a blank day, before the first date
   * or before the first count.
   */
  rows: Day[][];
  /** Weeks, from the week of the first date through the week of the last. */
  columns: number;
  months: MonthLabel[];
  commits: number;
}

/**
 * The upper bounds of levels 1 through 3: the quartiles of the days with any
 * commits, so the shades spread across the year's busy days as GitHub's do.
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

/**
 * Label each run of weeks by the month of its first counted day (its Sunday,
 * after the first week), when the run is at least three weeks, wide enough
 * for the name.
 */
function monthLabels(start: string, first: string, columns: number): MonthLabel[] {
  const months = Array.from({ length: columns }, (_, column) => {
    const sunday = addDays(start, column * 7);
    return Number((sunday < first ? first : sunday).slice(5, 7)) - 1;
  });
  const labels: MonthLabel[] = [];
  for (let column = 0; column < columns; column++) {
    if (column > 0 && months[column] === months[column - 1]) continue;
    let end = column;
    while (end + 1 < columns && months[end + 1] === months[column]) end++;
    if (end - column >= 2) labels.push({ column, name: MONTHS[months[column]!]!.slice(0, 3) });
  }
  return labels;
}

/**
 * The grid of the weeks from `first` through `last`, starting on Sunday,
 * shaded among themselves. Days before `first`, or before `countedFrom`, the
 * first day the history counted, have no cell; any other day the history
 * lacks counts as none.
 */
export function buildRange(days: Record<string, DayCount>, first: string, last: string, countedFrom = first): Grid {
  const start = addDays(first, -weekday(first));
  const shown = countedFrom > first ? countedFrom : first;
  const length = Math.round((Date.parse(last) - Date.parse(start)) / 86_400_000) + 1;
  const dates = Array.from({ length }, (_, index) => addDays(start, index));
  const counts = dates.map(date => (date < shown ? 0 : (days[date]?.commits ?? 0)));
  const bounds = levelBounds(counts);
  const rows: (Cell | null)[][] = Array.from({ length: 7 }, () => []);
  dates.forEach((date, index) => {
    const commits = counts[index]!;
    rows[index % 7]!.push(date < shown ? null : { date, commits, level: level(commits, bounds) });
  });
  const columns = rows[0]!.length;
  return { rows, columns, months: monthLabels(start, first, columns), commits: counts.reduce((total, count) => total + count, 0) };
}

/**
 * The grid that ends with `today`, starting on the Sunday 52 weeks before this
 * week's. It starts on a Sunday and counts from its first day, so no day is
 * blank, and its type says so: every one of its days is a link target, and
 * code that walks them, such as the page's tests, needs no blank-day checks.
 */
export function buildGrid(days: Record<string, DayCount>, today: string): Grid<Cell> {
  const grid = buildRange(days, addDays(today, -weekday(today) - 7 * (WEEKS - 1)), today);
  const rows = grid.rows.map(cells =>
    cells.map(cell => {
      if (!cell) throw new Error("A grid that starts on a Sunday has no blank days.");
      return cell;
    }),
  );
  return { ...grid, rows };
}

/**
 * One calendar year, through `today` when it is the current year, as GitHub
 * shows a year chosen beside its calendar. Days before `countedFrom` stay
 * blank rather than showing counts nobody took.
 */
export function buildYear(days: Record<string, DayCount>, year: number, today: string, countedFrom: string): Grid {
  const last = `${year}-12-31`;
  return buildRange(days, `${year}-01-01`, last < today ? last : today, countedFrom);
}

function ordinal(day: number): string {
  const suffix = day % 100 >= 11 && day % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][day % 10] ?? "th");
  return `${day}${suffix}`;
}

/** GitHub's wording: "No commits on November 26th.", "1 commit on ...", "1,234 commits on ...". */
export function tooltip(date: string, commits: number): string {
  const when = `${MONTHS[Number(date.slice(5, 7)) - 1]} ${ordinal(Number(date.slice(8, 10)))}`;
  if (commits === 0) return `No commits on ${when}.`;
  return `${commits.toLocaleString("en-US")} ${commits === 1 ? "commit" : "commits"} on ${when}.`;
}
