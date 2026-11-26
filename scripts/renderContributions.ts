#!/usr/bin/env bun
// Render the README's contributions grid and its images from contributions/commits.json.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { buildGrid } from "../src/grid";
import { HISTORY_FILE, localDate, parseHistory } from "../src/history";
import { renderAssets, renderSection, replaceSection } from "../src/render";

const USAGE = `Usage: bun run contributions:render [--check]

Render README.md's contributions grid and the images under contributions/ from
${HISTORY_FILE}, for the year ending on the local date of its asOf. With
--check, change nothing and fail when any rendered file is out of date.
`;

const ROOT = path.resolve(import.meta.dir, "..");

/** Every rendered file by path from the repository root, with its content. */
export function renderFiles(root: string): Map<string, string> {
  const historyFile = path.join(root, HISTORY_FILE);
  const history = parseHistory(readFileSync(historyFile, "utf8"), HISTORY_FILE);
  const grid = buildGrid(history.days, localDate(new Date(history.asOf), history.timeZone));
  const files = renderAssets(grid);
  files.set("README.md", replaceSection(readFileSync(path.join(root, "README.md"), "utf8"), renderSection(grid)));
  return files;
}

function main(args: string[]): number {
  const { values } = parseArgs({ args, options: { check: { type: "boolean" }, help: { type: "boolean", short: "h" } } });
  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  const files = renderFiles(ROOT);
  const stale = [...files].filter(([file, content]) => {
    const target = path.join(ROOT, file);
    return !existsSync(target) || readFileSync(target, "utf8") !== content;
  });
  if (values.check) {
    if (stale.length === 0) return 0;
    console.error(`Out of date; run bun run contributions:render:\n${stale.map(([file]) => `  ${file}`).join("\n")}`);
    return 1;
  }
  for (const [file, content] of stale) {
    mkdirSync(path.dirname(path.join(ROOT, file)), { recursive: true });
    writeFileSync(path.join(ROOT, file), content);
  }
  console.log(stale.length === 0 ? "Contributions grid is up to date." : `Rendered ${stale.map(([file]) => file).join(", ")}.`);
  return 0;
}

if (import.meta.main) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
