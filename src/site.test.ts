import { expect, test } from "bun:test";
import { buildGrid } from "./grid";
import { dailyCommits, type History } from "./history";
import * as pageLogic from "./pageLogic";
import { chosenSummary, commitCount, shadeDays, tooltip, viewFor } from "./pageLogic";
import { pageCounts, renderSite, siteRepositories, siteViews } from "./site";
import { escapeHtml, SITE_URL } from "./web";

// 03:00 UTC on November 26th is still November 25th in New York.
const history: History = {
  schemaVersion: 2,
  timeZone: "America/New_York",
  asOf: "2026-11-26T03:00:00Z",
  days: {
    "2024-12-30": { "a2f0/api": { commits: 1, pullRequests: 1 } },
    "2025-01-15": {},
    "2025-06-02": { "a2f0/api": { commits: 3, pullRequests: 1 }, "a2f0/web": { commits: 4, pullRequests: 1 } },
    "2026-11-25": { "a2f0/docs": { commits: 34, pullRequests: 1 }, "a2f0/web": { commits: 1200, pullRequests: 8 } },
  },
};
const site = renderSite(history);
const page = site.get("index.html")!;

function meta(attribute: "name" | "property", key: string): string | undefined {
  return page.match(new RegExp(`<meta ${attribute}="${key}" content="([^"]*)">`))?.[1];
}

test("the views are the last year, then each calendar year back to the first counted", () => {
  const views = siteViews(history);
  expect(views.map(view => view.id)).toEqual(["last", "2026", "2025", "2024"]);
  expect(views.map(view => view.heading)).toEqual(["1,234 commits in the last year", "1,234 commits in 2026", "7 commits in 2025", "1 commit in 2024"]);
  // 2024 shows only the days from the first count.
  expect(views[3]!.grid.rows.flat().filter(cell => cell)).toHaveLength(2);
});

test("the page carries the metadata search engines and link previews read", () => {
  expect(page.startsWith('<!doctype html>\n<html lang="en">')).toBe(true);
  expect(page).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
  const title = page.match(/<title>([^<]*)<\/title>/)![1]!;
  expect(title.endsWith(" · a2f0")).toBe(true);
  expect(title.length).toBeLessThanOrEqual(60);
  const description = meta("name", "description")!;
  expect(description.length).toBeGreaterThan(50);
  expect(description.length).toBeLessThanOrEqual(160);
  expect(page).toContain(`<link rel="canonical" href="${SITE_URL}">`);
  expect(meta("property", "og:url")).toBe(SITE_URL);
  expect(meta("property", "og:title")).toBe(title);
  expect(meta("property", "og:description")).toBe(description);
  expect(meta("property", "og:type")).toBe("website");
  expect(meta("property", "og:site_name")).toBe("a2f0");
  expect(meta("property", "og:image")).toBe(`${SITE_URL}og-image.png`);
  expect([meta("property", "og:image:width"), meta("property", "og:image:height")]).toEqual(["1200", "630"]);
  expect(meta("property", "og:image:alt")).toBeTruthy();
  expect(meta("name", "twitter:card")).toBe("summary_large_image");
  expect(page.match(/<meta name="theme-color" content="#[0-9a-f]{6}" media="\(prefers-color-scheme: (light|dark)\)">/g)).toHaveLength(2);
  for (const icon of ["favicon.ico", "favicon.svg", "apple-touch-icon.png"]) expect(page).toContain(`href="${icon}"`);
  expect(page).not.toContain("noindex");
});

test("the structured data parses as the WebSite at the canonical address", () => {
  const json = page.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)![1]!;
  expect(json).not.toContain("<");
  expect(JSON.parse(json)).toEqual({
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "a2f0",
    url: SITE_URL,
    description: meta("name", "description"),
  });
});

test("every day of the last year is a link target, labeled with GitHub's hover text", () => {
  const days = buildGrid(dailyCommits(history.days), "2026-11-25").rows.flat();
  expect(days).toHaveLength(7 * 52 + 4);
  for (const cell of days) {
    expect(page).toContain(
      `id="${cell.date}" data-date="${cell.date}" data-level="${cell.level}" aria-label="${escapeHtml(tooltip(cell.date, cell.commits))}"`,
    );
  }
  expect(page).toContain('aria-label="1,234 commits on November 25th."');
});

test("each calendar row is a label cell then one cell per week, the indexing the arrow keys rely on", () => {
  const views = siteViews(history);
  const tables = [...page.matchAll(/<table class="calendar"[^>]*>(.*?)<\/table>/gs)].map(match => match[1]!);
  expect(tables).toHaveLength(views.length);
  tables.forEach((table, index) => {
    const rows = [...table.matchAll(/<tr>(.*?)<\/tr>/gs)].map(match => match[1]!);
    // One month row, then a row per weekday, each a label and then the weeks.
    expect(rows).toHaveLength(8);
    expect(rows[0]!.startsWith('<td class="label">')).toBe(true);
    for (const row of rows.slice(1)) {
      const cells = row.match(/<td[ >]/g)!;
      expect(row.startsWith('<td class="label">')).toBe(true);
      expect(cells.length).toBeLessThanOrEqual(1 + views[index]!.grid.columns);
      expect(cells.length).toBeGreaterThanOrEqual(views[index]!.grid.columns);
    }
  });
});

test("each calendar's one Tab stop is its newest day", () => {
  const views = siteViews(history);
  const tables = [...page.matchAll(/<table class="calendar"[^>]*>(.*?)<\/table>/gs)].map(match => match[1]!);
  tables.forEach((table, index) => {
    const stops = [...table.matchAll(/data-date="([^"]+)"[^>]* tabindex="0"/g)].map(match => match[1]);
    expect(stops).toEqual([views[index]!.last]);
    expect(table.match(/class="day"/g)!.length).toBe(table.match(/tabindex="-?[01]"/g)!.length);
  });
  // The last year ends on a Wednesday, so its newest day is not the last in document order.
  expect(views[0]!.last).toBe("2026-11-25");
});

test("only the last year's days carry ids, so each id is unique", () => {
  const ids = [...page.matchAll(/ id="(\d{4}-\d{2}-\d{2})"/g)].map(match => match[1]);
  expect(ids).toHaveLength(7 * 52 + 4);
  expect(new Set(ids).size).toBe(ids.length);
  // The same days appear again, without ids, in the calendar years.
  expect(page.match(/data-date="2026-11-25"/g)).toHaveLength(2);
});

test("each view has a radio button, the last year checked, and a label in the list beside the calendar", () => {
  expect(page.match(/<input type="radio" class="view" name="view" id="view-[^"]+"( checked)?>/g)).toHaveLength(4);
  expect(page).toContain('<input type="radio" class="view" name="view" id="view-last" checked>');
  // The pointer can return to the last year after choosing a calendar year.
  expect(page.match(/<label for="view-[^"]+">[^<]+<\/label>/g)).toEqual([
    '<label for="view-last">Last year</label>',
    '<label for="view-2026">2026</label>',
    '<label for="view-2025">2025</label>',
    '<label for="view-2024">2024</label>',
  ]);
  for (const id of ["last", "2026", "2025", "2024"]) {
    expect(page).toContain(`#view-${id}:checked~.layout .graph-${id}{display:block}`);
    expect(page).toContain(`#view-${id}:checked~.layout label[for="view-${id}"]{color:#fff;background:var(--accent)}`);
  }
});

test("the page's script parses and embeds the tested decisions", () => {
  const scripts = [...page.matchAll(/<script>\n(.*?)\n<\/script>/gs)].map(match => match[1]!);
  expect(scripts).toHaveLength(1);
  expect(() => new Function(scripts[0]!)).not.toThrow();
  // Every function pageLogic.ts exports, which the tests evaluate as one set.
  const decisions = Object.values(pageLogic).filter(value => typeof value === "function");
  expect(decisions.length).toBeGreaterThanOrEqual(5);
  for (const decision of decisions) expect(scripts[0]).toContain(String(decision));
});

test("each view names the days a link can open, and every day of the last year opens there", () => {
  const views = [...page.matchAll(/<section class="graph graph-[^"]+" data-view="([^"]+)" data-first="([^"]+)" data-last="([^"]+)" data-period="[^"]+">/g)].map(
    ([, id, first, last]) => [id!, first!, last!] as [string, string, string],
  );
  expect(views).toEqual([
    ["last", "2025-11-23", "2026-11-25"],
    ["2026", "2026-01-01", "2026-11-25"],
    ["2025", "2025-01-01", "2025-12-31"],
    ["2024", "2024-12-30", "2024-12-31"],
  ]);
  for (const cell of buildGrid(dailyCommits(history.days), "2026-11-25").rows.flat()) expect(viewFor(cell.date, views)).toBe("last");
  // An older day opens its calendar year.
  expect(viewFor("2024-12-30", views)).toBe("2024");
});

/** Each calendar's days in page order, with their shades and hover text, and the heading of its view. */
function calendars(html: string) {
  return [...html.matchAll(/<section class="graph [^"]+" data-view="([^"]+)"[^>]* data-period="([^"]+)">\n<h2>([^<]+)<\/h2>(.*?)<\/section>/gs)].map(
    ([, id, period, heading, body]) => ({
      id: id!,
      period: period!,
      heading: heading!,
      days: [...body!.matchAll(/data-date="([^"]+)" data-level="(\d)" aria-label="([^"]+)"/g)].map(([, date, level, label]) => ({
        date: date!,
        level: Number(level),
        label: label!,
      })),
    }),
  );
}

function toggles(html: string) {
  return [
    ...html.matchAll(/<label class="repo" title="([^"]+)"><input type="checkbox" name="repo" value="(\d+)" checked><span>([^<]+)<\/span>(.*?)<\/label>/g),
  ].map(([, name, value, label, counts]) => ({
    name,
    value,
    label,
    counts: Object.fromEntries([...counts!.matchAll(/<span class="repo-count" data-view="([^"]+)">([^<]+)<\/span>/g)].map(([, view, count]) => [view, count])),
  }));
}

test("the repository toggles below the calendar list each repository with commits, busiest first, all checked", () => {
  expect(page).toContain('<fieldset class="repos" id="repos" hidden>');
  // Below the calendars, inside the column they share, so the view's radio buttons reach it.
  expect(page.indexOf('<fieldset class="repos"')).toBeGreaterThan(page.lastIndexOf('<section class="graph'));
  expect(page.indexOf('<fieldset class="repos"')).toBeLessThan(page.indexOf('<nav class="years"'));
  expect(toggles(page)).toEqual([
    { name: "a2f0/web", value: "0", label: "web", counts: { last: "1,200", "2026": "1,200", "2025": "4", "2024": "0" } },
    { name: "a2f0/docs", value: "1", label: "docs", counts: { last: "34", "2026": "34", "2025": "0", "2024": "0" } },
    { name: "a2f0/api", value: "2", label: "api", counts: { last: "0", "2026": "0", "2025": "3", "2024": "1" } },
  ]);
  expect(page).toContain('<span id="repos-summary" aria-live="polite">All 3 repositories</span>');
  expect(page).toContain('<button type="button" data-choose="all">All</button><button type="button" data-choose="none">None</button>');
  for (const id of ["last", "2026", "2025", "2024"]) expect(page).toContain(`#view-${id}:checked~.layout .repo-count[data-view="${id}"]{display:block}`);
});

test("the counts the page carries reproduce every view, and total any choice of repositories", () => {
  const counts = JSON.parse(page.match(/<script type="application\/json" id="counts">(.*?)<\/script>/s)![1]!);
  // Only days with commits, each repository's in the order of the toggles.
  expect(counts).toEqual({ "2024-12-30": [0, 0, 1], "2025-06-02": [4, 0, 3], "2026-11-25": [1200, 34, 0] });
  const views = calendars(page);
  expect(views.map(view => view.id)).toEqual(["last", "2026", "2025", "2024"]);
  for (const view of views) {
    const dates = view.days.map(day => day.date);
    // Every repository chosen draws what the page was built with.
    const all = shadeDays(dates, counts, [true, true, true]);
    expect(all.levels).toEqual(view.days.map(day => day.level) as never);
    expect(dates.map((date, index) => escapeHtml(tooltip(date, all.commits[index]!)))).toEqual(view.days.map(day => day.label));
    expect(`${commitCount(all.total)} ${view.period}`).toBe(view.heading);
    // One repository alone totals what its toggle shows.
    toggles(page).forEach((toggle, index) => {
      const alone = [false, false, false];
      alone[index] = true;
      expect(shadeDays(dates, counts, alone).total.toLocaleString("en-US")).toBe(toggle.counts[view.id]!);
    });
  }
  expect(chosenSummary([true, false, true])).toBe("2 of 3 repositories");
});

test("repositories keep their owners when they have several, and one without commits is left out", () => {
  const mixed: History = {
    ...history,
    days: {
      "2026-11-24": { "a2f0/web": { commits: 2, pullRequests: 1 }, "other/web": { commits: 2, pullRequests: 1 }, "a2f0/idle": { commits: 0, pullRequests: 0 } },
    },
  };
  const repositories = siteRepositories(mixed, siteViews(mixed));
  // Ties sort by name.
  expect(repositories.map(repository => [repository.name, repository.label])).toEqual([
    ["a2f0/web", "a2f0/web"],
    ["other/web", "other/web"],
  ]);
  expect(pageCounts(mixed, repositories)).toEqual({ "2026-11-24": [2, 2] });
});

test("a history without commits has no toggles, and its script still parses", () => {
  const quiet = renderSite({ ...history, days: { "2026-11-25": {} } }).get("index.html")!;
  expect(quiet).not.toContain('class="repos"');
  expect(quiet).toContain('<script type="application/json" id="counts">{}</script>');
  expect(quiet).toContain("<h2>0 commits in the last year</h2>");
  const script = quiet.match(/<script>\n(.*?)\n<\/script>/s)![1]!;
  expect(() => new Function(script)).not.toThrow();
});

test("the 404 page stays out of search results and links back with absolute addresses", () => {
  const notFound = site.get("404.html")!;
  expect(notFound).toContain('<meta name="robots" content="noindex">');
  expect(notFound).toContain(`<a href="${SITE_URL}">`);
  expect(notFound).toContain(`href="${SITE_URL}favicon.svg"`);
  expect(notFound).not.toMatch(/href="(?!https:)/);
});

test("the sitemap lists the page, last changed when the counts were taken", () => {
  expect(site.get("sitemap.xml")).toContain(`<url><loc>${SITE_URL}</loc><lastmod>2026-11-26T03:00:00Z</lastmod></url>`);
  expect([...site.keys()].sort()).toEqual(["404.html", "index.html", "sitemap.xml"]);
});
