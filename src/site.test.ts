import { expect, test } from "bun:test";
import { buildGrid } from "./grid";
import type { History } from "./history";
import { renderSection } from "./render";
import { renderSite, SITE_URL, siteViews } from "./site";

// 03:00 UTC on November 26th is still November 25th in New York.
const history: History = {
  schemaVersion: 1,
  timeZone: "America/New_York",
  asOf: "2026-11-26T03:00:00Z",
  days: {
    "2024-12-30": { commits: 1, pullRequests: 1 },
    "2025-06-02": { commits: 7, pullRequests: 2 },
    "2026-11-25": { commits: 1234, pullRequests: 9 },
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

test("every day the README links to has a target on the page, labeled with the README's hover text", () => {
  const readme = renderSection(buildGrid(history.days, "2026-11-25"));
  const links = [...readme.matchAll(/<a href="([^"#]*)#([^"]+)"><img [^>]* title="([^"]*)">/g)];
  expect(links).toHaveLength(7 * 52 + 4);
  for (const [, url, date, title] of links) {
    expect(url).toBe(SITE_URL);
    expect(page).toContain(`id="${date}" data-date="${date}" data-level="`);
    expect(page).toMatch(new RegExp(`id="${date}" data-date="${date}" data-level="\\d" aria-label="${title!.replace(/\./g, "\\.")}"`));
  }
  expect(page).toContain('aria-label="1,234 commits on November 25th."');
});

test("only the last year's days carry ids, so each id is unique", () => {
  const ids = [...page.matchAll(/ id="(\d{4}-\d{2}-\d{2})"/g)].map(match => match[1]);
  expect(ids).toHaveLength(7 * 52 + 4);
  expect(new Set(ids).size).toBe(ids.length);
  // The same days appear again, without ids, in the calendar years.
  expect(page.match(/data-date="2026-11-25"/g)).toHaveLength(2);
});

test("each view has a radio button, the last year checked, and each year a label beside the calendar", () => {
  expect(page.match(/<input type="radio" class="view" name="view" id="view-[^"]+"( checked)?>/g)).toHaveLength(4);
  expect(page).toContain('<input type="radio" class="view" name="view" id="view-last" checked>');
  expect(page.match(/<label for="view-\d{4}">\d{4}<\/label>/g)).toEqual([
    '<label for="view-2026">2026</label>',
    '<label for="view-2025">2025</label>',
    '<label for="view-2024">2024</label>',
  ]);
  // The last year marks the current year, as GitHub does.
  expect(page).toContain('#view-last:checked~.layout label[for="view-2026"]{color:#fff;background:var(--accent)}');
  for (const id of ["last", "2026", "2025", "2024"]) expect(page).toContain(`#view-${id}:checked~.layout .graph-${id}{display:block}`);
});

test("the page's script parses", () => {
  const scripts = [...page.matchAll(/<script>\n(.*?)\n<\/script>/gs)].map(match => match[1]!);
  expect(scripts).toHaveLength(1);
  expect(() => new Function(scripts[0]!)).not.toThrow();
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
