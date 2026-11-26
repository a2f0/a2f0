import { expect, test } from "bun:test";
import { buildGrid, buildYear } from "./grid";
import { END, renderAssets, renderSection, replaceSection, START } from "./render";

const grid = buildGrid({ "2026-11-24": { commits: 12, pullRequests: 2 }, "2026-11-25": { commits: 1, pullRequests: 1 } }, "2026-11-25");

test("the section is one image per day, titled with the hover text and linked to that day on the web page, between the markers", () => {
  const section = renderSection(grid);
  expect(section.startsWith(`${START}\n13 commits in the last year\n`)).toBe(true);
  expect(section.endsWith(END)).toBe(true);
  const cells = section.match(/<img src="contributions\/level-\d\.svg"[^>]*>/g) ?? [];
  expect(cells).toHaveLength(grid.rows.flat().length);
  expect(section).toContain(
    '<a href="https://a2f0.github.io/a2f0/#2026-11-24"><img src="contributions/level-3.svg" width="13" height="13" alt="12 commits on November 24th." title="12 commits on November 24th."></a>',
  );
  expect(section.match(/<a href="https:\/\/a2f0\.github\.io\/a2f0\/#\d{4}-\d{2}-\d{2}">/g)).toHaveLength(cells.length);
  expect(section).toContain('title="1 commit on November 25th."');
});

test("the section uses only markup GitHub keeps, with no whitespace between a row's images", () => {
  const section = renderSection(grid);
  const tags = new Set([...section.matchAll(/<\/?([a-z]+)/g)].map(match => match[1]));
  expect([...tags].sort()).toEqual(["a", "br", "div", "img", "sub", "table", "td", "tr"]);
  expect(section).not.toContain("style=");
  expect(section).toContain("<table><tr><td><sub><div>");
  // No blank line, which would end GitHub's HTML block, and no space between images.
  const html = section.slice(section.indexOf("<table>"));
  expect(html).not.toContain("\n\n");
  expect(html).not.toMatch(/<img[^>]*>\s+<(img|a)/);
  expect(html).not.toMatch(/<\/a>\s+<(img|a)/);
  expect(html.split("\n").filter(line => line.includes("level-"))).toHaveLength(7);
});

test("the section refuses a grid with blank days, which would break the rows' alignment", () => {
  // 2026 starts on a Thursday, so its first week has blank days.
  expect(() => renderSection(buildYear({}, 2026, "2026-11-25", "2026-01-01"))).toThrow("needs a cell for every day");
});

test("every image carries both themes and the labels it shows", () => {
  const assets = renderAssets(grid);
  expect([...assets.keys()].sort()).toEqual(
    [
      ...["blank", "fri", "mon", "wed"].map(label => `contributions/label-${label}.svg`),
      "contributions/legend.svg",
      ...[0, 1, 2, 3, 4].map(level => `contributions/level-${level}.svg`),
      "contributions/months.svg",
    ].sort(),
  );
  expect(assets.get("contributions/level-4.svg")).toContain("fill:#116329");
  expect(assets.get("contributions/level-4.svg")).toContain("@media (prefers-color-scheme:dark){rect{fill:#56d364");
  expect(assets.get("contributions/label-mon.svg")).toContain(">Mon</text>");
  expect(assets.get("contributions/months.svg")).toContain(`<text x="${30 + 2 * 13}" y="12">Dec</text>`);
  expect(assets.get("contributions/legend.svg")).toContain(">Less</text>");
});

test("replaces only the section between the markers", () => {
  const readme = `# a2f0\n\nIntro\n\n${START}\nold\n${END}\n\nOutro\n`;
  expect(replaceSection(readme, `${START}\nnew\n${END}`)).toBe(`# a2f0\n\nIntro\n\n${START}\nnew\n${END}\n\nOutro\n`);
  for (const broken of ["# a2f0\n", `${START}\n`, `${END}\n${START}\n`, `${START}\n${END}\n${START}\n${END}\n`]) {
    expect(() => replaceSection(broken, "x")).toThrow("exactly one");
  }
});
