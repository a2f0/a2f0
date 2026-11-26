import { afterEach, expect, spyOn, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { main, renderFiles } from "./renderContributions";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** A repository root with one counted day and an empty grid section. */
function profile(): string {
  const root = mkdtempSync(path.join(tmpdir(), "contributions-"));
  roots.push(root);
  mkdirSync(path.join(root, "contributions"));
  // 03:00 UTC on November 26th is still November 25th in New York.
  const history = { schemaVersion: 1, timeZone: "America/New_York", asOf: "2026-11-26T03:00:00Z", days: { "2026-11-25": { commits: 2, pullRequests: 1 } } };
  writeFileSync(path.join(root, "contributions", "commits.json"), JSON.stringify(history));
  writeFileSync(path.join(root, "README.md"), "# a2f0\n\n<!-- contributions:start -->\n<!-- contributions:end -->\n");
  return root;
}

test("renders every file from the history, ending on the local date of asOf", () => {
  const files = renderFiles(profile());
  const readme = files.get("README.md")!;
  expect(readme).toContain('title="2 commits on November 25th."');
  // Through Wednesday 2026-11-25: 52 full weeks and four days, not five.
  expect(readme.match(/contributions\/level-\d\.svg/g)).toHaveLength(7 * 52 + 4);
  expect(files.size).toBe(12);
});

test("--check fails on a missing, changed, or no longer rendered file, and rendering repairs each", () => {
  const root = profile();
  const errors = spyOn(console, "error").mockImplementation(() => {});
  const logs = spyOn(console, "log").mockImplementation(() => {});
  try {
    expect(main(["--check"], root)).toBe(1);
    expect(errors.mock.calls.at(-1)?.[0]).toContain("contributions/level-0.svg");
    expect(main([], root)).toBe(0);
    expect(main(["--check"], root)).toBe(0);

    writeFileSync(path.join(root, "contributions", "level-2.svg"), "<svg/>");
    writeFileSync(path.join(root, "contributions", "level-9.svg"), "<svg/>");
    expect(main(["--check"], root)).toBe(1);
    expect(errors.mock.calls.at(-1)?.[0]).toContain("  contributions/level-2.svg\n  contributions/level-9.svg");
    expect(main([], root)).toBe(0);
    expect(logs.mock.calls.at(-1)?.[0]).toBe("Rendered contributions/level-2.svg; removed contributions/level-9.svg.");
    expect(existsSync(path.join(root, "contributions", "level-9.svg"))).toBe(false);
    expect(readFileSync(path.join(root, "contributions", "commits.json"), "utf8")).toContain("2026-11-25");
    expect(main(["--check"], root)).toBe(0);
  } finally {
    errors.mockRestore();
    logs.mockRestore();
  }
});
