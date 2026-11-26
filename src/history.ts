/**
 * The contributions history: original (pre-squash) commits and merged pull
 * requests per local calendar day across the matrix. The matrix workspace's
 * `bun run contributions` writes it; this repository only renders it.
 */
export const HISTORY_FILE = "contributions/commits.json";

export interface DayCount {
  commits: number;
  pullRequests: number;
}

export interface History {
  schemaVersion: 1;
  /** The IANA time zone whose calendar days the counts use. */
  timeZone: string;
  /** When the latest count began; the grid ends on its local date. */
  asOf: string;
  days: Record<string, DayCount>;
}

const DAY_MS = 86_400_000;

/** A UTC instant as `Date.toISOString` writes it, with optional fractional seconds. */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

function isDate(date: string): boolean {
  const epoch = Date.parse(`${date}T00:00:00.000Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(epoch) && new Date(epoch).toISOString().slice(0, 10) === date;
}

function dateEpoch(date: string): number {
  if (!isDate(date)) throw new Error(`Invalid date '${date}'; use YYYY-MM-DD.`);
  return Date.parse(`${date}T00:00:00.000Z`);
}

/** The YYYY-MM-DD date `days` calendar days after `date` (negative for before). */
export function addDays(date: string, days: number): string {
  return new Date(dateEpoch(date) + days * DAY_MS).toISOString().slice(0, 10);
}

/** 0 for Sunday through 6 for Saturday. */
export function weekday(date: string): number {
  return new Date(dateEpoch(date)).getUTCDay();
}

/** The local calendar date of `instant` in `timeZone`. */
export function localDate(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instant);
  return ["year", "month", "day"].map(type => parts.find(part => part.type === type)?.value).join("-");
}

function isCount(value: unknown): value is DayCount {
  if (typeof value !== "object" || value === null) return false;
  const { commits, pullRequests } = value as Record<string, unknown>;
  return [commits, pullRequests].every(field => Number.isSafeInteger(field) && (field as number) >= 0);
}

function invalidDay(days: object): string | undefined {
  for (const [date, count] of Object.entries(days)) {
    if (!isDate(date)) return `days has an invalid date '${date}'`;
    if (!isCount(count)) return `days.${date} needs non-negative integer commits and pullRequests`;
  }
  return undefined;
}

function invalidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return false;
  } catch {
    return true;
  }
}

function invalidHistory(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return "it must be a JSON object";
  const { schemaVersion, timeZone, asOf, days } = value as Record<string, unknown>;
  if (schemaVersion !== 1) return "schemaVersion must be 1";
  if (typeof timeZone !== "string" || invalidTimeZone(timeZone)) return "timeZone must be an IANA time zone";
  if (typeof asOf !== "string" || !ISO_INSTANT.test(asOf) || Number.isNaN(Date.parse(asOf))) return "asOf must be an ISO 8601 instant";
  if (typeof days !== "object" || days === null || Array.isArray(days)) return "days must be an object";
  return invalidDay(days);
}

export function parseHistory(text: string, file: string): History {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(`${file} is not JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const problem = invalidHistory(value);
  if (problem) throw new Error(`${file}: ${problem}.`);
  return value as History;
}
