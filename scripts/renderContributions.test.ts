import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { renderFiles } from "./renderContributions";

test("renders every file from the history, ending on the local date of asOf", () => {
  const root = mkdtempSync(path.join(tmpdir(), "contributions-"));
  mkdirSync(path.join(root, "contributions"));
  // 03:00 UTC on November 26th is still November 25th in New York.
  const history = { schemaVersion: 1, timeZone: "America/New_York", asOf: "2026-11-26T03:00:00Z", days: { "2026-11-25": { commits: 2, pullRequests: 1 } } };
  writeFileSync(path.join(root, "contributions", "commits.json"), JSON.stringify(history));
  writeFileSync(path.join(root, "README.md"), "# a2f0\n\n<!-- contributions:start -->\n<!-- contributions:end -->\n");
  const files = renderFiles(root);
  const readme = files.get("README.md")!;
  expect(readme).toContain('title="2 commits on November 25th."');
  // Through Wednesday 2026-11-25: 52 full weeks and four days, not five.
  expect(readme.match(/contributions\/level-\d\.svg/g)).toHaveLength(7 * 52 + 4);
  expect(files.size).toBe(12);
});
