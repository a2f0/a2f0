import { addDays, weekday } from "./history";
import { type Level, level, levelBounds, monthName } from "./pageLogic";

/** Columns in the grid: the current week and the 52 before it, as on GitHub. */
export const WEEKS = 53;

export const MONTHS = Array.from({ length: 12 }, (_, month) => monthName(month));

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
 * shaded among themselves, from each day's commits. Days before `first`, or
 * before `countedFrom`, the first day the history counted, have no cell; any
 * other day `commits` lacks counts as none.
 */
export function buildRange(commits: Record<string, number>, first: string, last: string, countedFrom = first): Grid {
  const start = addDays(first, -weekday(first));
  const shown = countedFrom > first ? countedFrom : first;
  const length = Math.round((Date.parse(last) - Date.parse(start)) / 86_400_000) + 1;
  const dates = Array.from({ length }, (_, index) => addDays(start, index));
  const counts = dates.map(date => (date < shown ? 0 : (commits[date] ?? 0)));
  const bounds = levelBounds(counts);
  const rows: (Cell | null)[][] = Array.from({ length: 7 }, () => []);
  dates.forEach((date, index) => {
    const count = counts[index]!;
    rows[index % 7]!.push(date < shown ? null : { date, commits: count, level: level(count, bounds) });
  });
  const columns = rows[0]!.length;
  return { rows, columns, months: monthLabels(start, first, columns), commits: counts.reduce((total, count) => total + count, 0) };
}

/**
 * The grid that ends with `today`, starting on the Sunday 52 weeks before this
 * week's. It starts on a Sunday and counts from its first day, so no day is
 * blank: its type records that, and the check below would catch a change
 * that broke it.
 */
export function buildGrid(commits: Record<string, number>, today: string): Grid<Cell> {
  const grid = buildRange(commits, addDays(today, -weekday(today) - 7 * (WEEKS - 1)), today);
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
export function buildYear(commits: Record<string, number>, year: number, today: string, countedFrom: string): Grid {
  const last = `${year}-12-31`;
  return buildRange(commits, `${year}-01-01`, last < today ? last : today, countedFrom);
}
