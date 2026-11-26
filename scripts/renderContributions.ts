#!/usr/bin/env bun
// Render the README's contributions grid and its images from contributions/commits.json.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { buildGrid } from "../src/grid";
import { HISTORY_FILE, localDate, parseHistory } from "../src/history";
import { ASSET_DIR, renderAssets, renderSection, replaceSection } from "../src/render";

const USAGE = `Usage: bun run contributions:render [--check]

Render README.md's contributions grid and the images under contributions/ from
${HISTORY_FILE}, for the year ending on the local date of its asOf, and
remove images under contributions/ that it no longer renders. With --check,
change nothing and fail when any of those files is out of date.
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

/** What rendering would change: files whose content differs, and images it no longer writes. */
export function renderChanges(root: string): { write: [string, string][]; remove: string[] } {
  const files = renderFiles(root);
  const write = [...files].filter(([file, content]) => {
    const target = path.join(root, file);
    return !existsSync(target) || readFileSync(target, "utf8") !== content;
  });
  const assets = path.join(root, ASSET_DIR);
  const images = existsSync(assets) ? readdirSync(assets).filter(name => name.endsWith(".svg")) : [];
  const remove = images.map(name => `${ASSET_DIR}/${name}`).filter(file => !files.has(file));
  return { write, remove };
}

export function main(args: string[], root = ROOT): number {
  const { values } = parseArgs({ args, options: { check: { type: "boolean" }, help: { type: "boolean", short: "h" } } });
  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  const { write, remove } = renderChanges(root);
  const changed = [...write.map(([file]) => file), ...remove];
  if (values.check) {
    if (changed.length === 0) return 0;
    console.error(`Out of date; run bun run contributions:render:\n${changed.map(file => `  ${file}`).join("\n")}`);
    return 1;
  }
  for (const [file, content] of write) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  for (const file of remove) rmSync(path.join(root, file));
  const removed = remove.length === 0 ? "" : `; removed ${remove.join(", ")}`;
  console.log(changed.length === 0 ? "Contributions grid is up to date." : `Rendered ${write.map(([file]) => file).join(", ") || "nothing new"}${removed}.`);
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
