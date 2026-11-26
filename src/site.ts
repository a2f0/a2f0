import { buildGrid, buildYear, type Cell, type Grid, MONTHS } from "./grid";
import { dailyCommits, type History, localDate } from "./history";
import * as pageLogic from "./pageLogic";
import { DARK, FONT, LIGHT, type Theme } from "./theme";
import { escapeHtml, SITE_URL } from "./web";

/**
 * The contributions grid as a web page, with GitHub's tooltip: the measured
 * size, colors, and placement above the day. It renders from the history
 * alone, counting every repository, and needs script only for the tooltips,
 * keyboard focus, and the repository toggles below the calendar; the years
 * switch with radio buttons.
 */

const TITLE = "Commits counted before squashing · a2f0";
const DESCRIPTION = "Each day's commits in pull requests merged across the a2f0 matrix repositories, counted before squash merging collapsed them.";
const LEGEND = "Commits in merged pull requests, counted before squashing";
const IMAGE = { path: "og-image.png", width: 1200, height: 630, alt: "The a2f0 mark: a grid of green squares." };
const LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];

export interface View {
  /** `last` for the year that ends today, or the calendar year. */
  id: string;
  /** What the heading counts commits in: "in the last year", "in 2025". */
  period: string;
  heading: string;
  grid: Grid;
  /** The first and last days with a cell, which a `#<date>` link can open. */
  first: string;
  last: string;
}

export interface Repository {
  /** `owner/name`. */
  name: string;
  /** The name shown: without the owner when every repository shares one. */
  label: string;
  /** The repository's commits in each view, by view id. */
  commits: Record<string, number>;
}

function view(id: string, period: string, grid: Grid): View {
  const dates = grid.rows
    .flat()
    .flatMap(cell => (cell ? [cell.date] : []))
    .sort();
  return { id, period, heading: `${pageLogic.commitCount(grid.commits)} ${period}`, grid, first: dates[0]!, last: dates.at(-1)! };
}

function longDate(date: string): string {
  return `${MONTHS[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}, ${date.slice(0, 4)}`;
}

/** The first day the history counted and the last: the local date of its asOf. */
function span(history: History): { oldest: string; today: string } {
  const today = localDate(new Date(history.asOf), history.timeZone);
  return { oldest: Object.keys(history.days).sort()[0] ?? today, today };
}

/** The year ending on the local date of asOf, then each calendar year from that one back to the oldest counted. */
export function siteViews(history: History): View[] {
  const { oldest, today } = span(history);
  const commits = dailyCommits(history.days);
  const views = [view("last", "in the last year", buildGrid(commits, today))];
  for (let year = Number(today.slice(0, 4)); year >= Number(oldest.slice(0, 4)); year--) {
    views.push(view(String(year), `in ${year}`, buildYear(commits, year, today, oldest)));
  }
  return views;
}

/** A repository's commits on the days from `first` through `last`. */
function commitsBetween(history: History, name: string, first: string, last: string): number {
  return Object.entries(history.days).reduce(
    (total, [date, repositories]) => total + (first <= date && date <= last ? (repositories[name]?.commits ?? 0) : 0),
    0,
  );
}

/** Every repository with any counted commits, busiest first and then by name, with its commits in each view. */
export function siteRepositories(history: History, views: View[]): Repository[] {
  const totals = new Map<string, number>();
  for (const repositories of Object.values(history.days)) {
    for (const [name, day] of Object.entries(repositories)) totals.set(name, (totals.get(name) ?? 0) + day.commits);
  }
  const names = [...totals]
    .filter(([, total]) => total > 0)
    .sort(([a, aTotal], [b, bTotal]) => bTotal - aTotal || (a < b ? -1 : 1))
    .map(([name]) => name);
  const owners = new Set(names.map(name => name.split("/")[0]));
  return names.map(name => ({
    name,
    label: owners.size === 1 ? name.split("/")[1]! : name,
    commits: Object.fromEntries(views.map(view => [view.id, commitsBetween(history, name, view.first, view.last)])),
  }));
}

/**
 * Each day's commits in every repository, in the order of the toggles, for
 * the days with any: the counts the page script totals for the chosen ones.
 */
export function pageCounts(history: History, repositories: Repository[]): Record<string, number[]> {
  return Object.fromEntries(
    Object.entries(history.days).flatMap(([date, counts]) => {
      const commits = repositories.map(repository => counts[repository.name]?.commits ?? 0);
      return commits.some(count => count > 0) ? [[date, commits]] : [];
    }),
  );
}

/** Month names over the columns they start, each spanning the columns up to the next. */
function monthHeader(grid: Grid): string {
  const cells: string[] = [];
  let column = 0;
  grid.months.forEach((month, index) => {
    if (month.column > column) cells.push(`<td colspan="${month.column - column}"></td>`);
    const end = grid.months[index + 1]?.column ?? grid.columns;
    cells.push(`<td class="month" colspan="${end - month.column}"><span>${month.name}</span></td>`);
    column = end;
  });
  if (column < grid.columns) cells.push(`<td colspan="${grid.columns - column}"></td>`);
  return cells.join("");
}

/**
 * A day, whose label is its hover text. Only the first view's days carry ids,
 * which `#YYYY-MM-DD` links open. The newest day is the calendar's one Tab stop
 * until the script moves it, as a roving tabindex does.
 */
function day(cell: Cell | null, ids: boolean, newest: string): string {
  if (!cell) return "<td></td>";
  const id = ids ? ` id="${cell.date}"` : "";
  const tabindex = cell.date === newest ? "0" : "-1";
  return `<td class="day"${id} data-date="${cell.date}" data-level="${cell.level}" aria-label="${escapeHtml(pageLogic.tooltip(cell.date, cell.commits))}" tabindex="${tabindex}"></td>`;
}

function calendar(view: View, ids: boolean): string {
  const rows = view.grid.rows.map((cells, weekday) => {
    const label = LABELS[weekday] ? `<span>${LABELS[weekday]}</span>` : "";
    return `<tr><td class="label">${label}</td>${cells.map(cell => day(cell, ids, view.last)).join("")}</tr>`;
  });
  return [
    `<table class="calendar" role="grid" aria-readonly="true" aria-label="${escapeHtml(view.heading)}">`,
    `<thead><tr><td class="label"></td>${monthHeader(view.grid)}</tr></thead>`,
    `<tbody>${rows.join("\n")}</tbody>`,
    "</table>",
  ].join("\n");
}

function graph(view: View, ids: boolean): string {
  const legend = [0, 1, 2, 3, 4].map(level => `<span class="cell" data-level="${level}"></span>`).join("");
  return [
    `<section class="graph graph-${view.id}" data-view="${view.id}" data-first="${view.first}" data-last="${view.last}" data-period="${escapeHtml(view.period)}">`,
    `<h2>${escapeHtml(view.heading)}</h2>`,
    `<div class="box"><div class="scroll">`,
    calendar(view, ids),
    "</div>",
    `<div class="footer"><span>${LEGEND}</span><span class="legend" aria-hidden="true">Less ${legend} More</span></div>`,
    "</div>",
    "</section>",
  ].join("\n");
}

/**
 * The repository toggles below the calendar, each with its commits in the view
 * shown. Only the script can act on them, so they start hidden.
 */
function repositoryPanel(repositories: Repository[], views: View[]): string {
  const toggles = repositories.map((repository, index) => {
    const counts = views.map(view => `<span class="repo-count" data-view="${view.id}">${repository.commits[view.id]!.toLocaleString("en-US")}</span>`);
    return `<label class="repo" title="${escapeHtml(repository.name)}"><input type="checkbox" name="repo" value="${index}" checked><span>${escapeHtml(repository.label)}</span>${counts.join("")}</label>`;
  });
  return [
    '<fieldset class="repos" id="repos" hidden>',
    "<legend>Repositories</legend>",
    `<div class="repos-bar"><span id="repos-summary" aria-live="polite">${pageLogic.chosenSummary(repositories.map(() => true))}</span><button type="button" data-choose="all">All</button><button type="button" data-choose="none">None</button></div>`,
    `<div class="repos-list">\n${toggles.join("\n")}\n</div>`,
    "</fieldset>",
  ].join("\n");
}

function themeVariables(theme: Theme): string {
  const levels = theme.levels.map((color, level) => `--l${level}:${color}`).join(";");
  return `${levels};--cell-border:${theme.border};--canvas:${theme.canvas};--text:${theme.text};--muted:${theme.muted};--line:${theme.line};--accent:${theme.accent};--hover:${theme.hover};--tooltip:${theme.tooltip}`;
}

/** Show the checked view and each repository's commits in it, and mark its entry in the year list. */
function viewRules(views: View[]): string {
  return views
    .map(view => {
      const checked = `#view-${view.id}:checked~.layout`;
      const label = `label[for="view-${view.id}"]`;
      return `${checked} .graph-${view.id}{display:block}${checked} .repo-count[data-view="${view.id}"]{display:block}${checked} ${label}{color:#fff;background:var(--accent)}#view-${view.id}:focus-visible~.layout ${label}{outline:2px solid var(--accent);outline-offset:2px}`;
    })
    .join("\n");
}

function styles(views: View[]): string {
  const levels = [0, 1, 2, 3, 4].map(level => `[data-level="${level}"]{background:var(--l${level})}`).join("");
  return `:root{color-scheme:light dark;${themeVariables(LIGHT)}}
@media (prefers-color-scheme:dark){:root{${themeVariables(DARK)}}}
*{box-sizing:border-box}
body{margin:0;background:var(--canvas);color:var(--text);font:14px/1.5 ${FONT}}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
main{max-width:1012px;margin:0 auto;padding:40px 16px}
header h1{margin:0;font-size:24px;font-weight:600;line-height:1.25}
header p{margin:4px 0 24px;color:var(--muted)}
.view{position:absolute;opacity:0;pointer-events:none}
.layout{display:flex;gap:24px;align-items:flex-start}
.graphs{flex:1;min-width:0}
.graph{display:none}
.graph h2{margin:0 0 8px;font-size:16px;font-weight:400;line-height:24px}
.box{border:1px solid var(--line);border-radius:6px;padding:8px 16px 12px 8px}
.scroll{overflow-x:auto}
.calendar{width:max-content;border-spacing:3px;border-collapse:separate;margin:0 auto;font-size:12px;line-height:18px}
.calendar tbody td:not(.label){width:10px;height:10px}
.calendar td{padding:0}
.calendar .label{position:relative;width:28px;min-width:28px}
.calendar tbody .label span{position:absolute;bottom:-3px;left:0}
.calendar thead td{height:15px}
.calendar .month{position:relative}
.calendar .month span{position:absolute;top:-3px;left:0}
.day,.cell{width:10px;height:10px;border-radius:2px;outline:1px solid var(--cell-border);outline-offset:-1px}
.cell{display:inline-block}
.day:focus-visible{outline:1px solid var(--text);outline-offset:-1px}
${levels}
.footer{display:flex;justify-content:space-between;align-items:center;gap:16px;margin:4px 0 0 34px;font-size:12px;color:var(--muted)}
.legend{display:flex;align-items:center;gap:3px;white-space:nowrap}
.legend .cell{margin:0 1px}
.repos{margin:16px 0 0;padding:0;border:0;min-width:0}
.repos[hidden]{display:none}
.repos legend{float:left;margin:0 12px 8px 0;padding:0;font-size:14px;font-weight:600;line-height:24px}
.repos-bar{display:flex;align-items:center;gap:12px;margin:0 0 8px;font-size:12px;line-height:24px;color:var(--muted)}
.repos-bar span{margin-right:auto}
.repos-bar button{padding:0 8px;border:1px solid var(--line);border-radius:6px;background:none;color:var(--text);font:inherit;cursor:pointer}
.repos-bar button:hover{background:var(--hover)}
.repos-list{clear:both;display:flex;flex-wrap:wrap;gap:8px}
.repo{display:flex;align-items:center;gap:6px;padding:4px 10px 4px 8px;border:1px solid var(--line);border-radius:999px;font-size:12px;line-height:18px;cursor:pointer;user-select:none}
.repo:hover{background:var(--hover)}
.repo input{margin:0;accent-color:var(--accent)}
.repo:has(input:not(:checked)){color:var(--muted)}
.repo-count{display:none;color:var(--muted)}
.repos button:focus-visible,.repo input:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.years{display:flex;flex-direction:column;gap:8px;width:120px;flex:none}
.years label{display:block;padding:8px 16px;border-radius:6px;font-size:12px;line-height:18px;color:var(--muted);cursor:pointer}
.years label:hover{color:var(--text);background:var(--hover)}
${viewRules(views)}
.tooltip{position:absolute;top:0;left:0;z-index:100;max-width:320px;padding:4px 8px;border-radius:6px;background:var(--tooltip);color:#fff;font:12px/1.625 ${FONT};text-align:center;pointer-events:none}
.tooltip[hidden]{display:none}
footer{margin-top:32px;font-size:12px;color:var(--muted)}
@media (max-width:767px){.layout{flex-direction:column;align-items:stretch}.years{flex-direction:row;flex-wrap:wrap;width:auto}.graphs{display:contents}.repos{order:1;margin:0}}`;
}

/**
 * The page script: DOM wiring around the pure decisions in `pageLogic.ts`,
 * every one of which it embeds by its source. Every pointer, focus, and key
 * listener dispatches one tooltip event, and `render` draws whatever state
 * `nextTooltip` returns. Arrow keys move focus between days, and a link to
 * `#<date>` opens that day. The repository toggles hold the only other
 * choice: each change redraws every view from the boxes as they stand, with
 * `shadeDays`, so the page keeps no copy of the selection.
 */
const SCRIPT = `(() => {
${Object.values(pageLogic)
  .filter(value => typeof value === "function")
  .join("\n")}
  const tip = document.getElementById("tooltip");
  const dayOf = target => (target instanceof Element ? target.closest(".day") : null);
  let state = { kind: "hidden" };
  // A day scrolled out of its calendar's box keeps its state but hides its tooltip until it returns.
  const render = () => {
    if (state.kind === "hidden" || !inside(state.day.getBoundingClientRect(), state.day.closest(".scroll").getBoundingClientRect())) {
      tip.hidden = true;
      return;
    }
    tip.textContent = state.day.getAttribute("aria-label");
    tip.hidden = false;
    const at = place(state.day.getBoundingClientRect(), tip.getBoundingClientRect(), document.documentElement.clientWidth);
    tip.style.transform = "translate(" + (at.left + scrollX) + "px, " + (at.top + scrollY) + "px)";
  };
  const dispatch = event => {
    state = nextTooltip(state, event);
    render();
  };
  // One day per calendar is the Tab stop: the newest, or the last one focused.
  const rove = day => {
    for (const other of day.closest("table").querySelectorAll('.day[tabindex="0"]')) other.tabIndex = -1;
    day.tabIndex = 0;
  };
  document.addEventListener("pointerover", event => {
    const day = dayOf(event.target);
    if (day) dispatch({ type: "enter", day });
  });
  document.addEventListener("pointerout", event => {
    if (dayOf(event.target) && !dayOf(event.relatedTarget)) dispatch({ type: "leave" });
  });
  document.addEventListener("focusin", event => {
    const day = dayOf(event.target);
    if (!day) return;
    // However a day gets focus (keys, a click, a link), it becomes the Tab stop.
    rove(day);
    dispatch({ type: "focus", day });
  });
  document.addEventListener("focusout", event => {
    if (dayOf(event.target)) dispatch({ type: "blur" });
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") return dispatch({ type: "dismiss" });
    const day = dayOf(event.target);
    // rowIndex and cellIndex count the month row and the label column, as rows[] and cells[] do.
    const to = day && step(event.key, day.parentElement.rowIndex, day.cellIndex);
    if (!to) return;
    // An arrow key moves between days only, so at the calendar's edge it does nothing rather than scroll.
    event.preventDefault();
    const next = day.closest("table").rows[to[0]]?.cells[to[1]];
    if (!next || !next.classList.contains("day")) return;
    rove(next);
    next.focus();
  });
  addEventListener("scroll", render, true);
  addEventListener("resize", render);
  // Recount and reshade every view, its heading, and its hover text for the chosen repositories.
  const panel = document.getElementById("repos");
  if (panel) {
    const counts = JSON.parse(document.getElementById("counts").textContent);
    const boxes = [...panel.querySelectorAll('input[name="repo"]')];
    const graphs = [...document.querySelectorAll(".graph")].map(graph => {
      const days = [...graph.querySelectorAll(".day")];
      return { graph, days, dates: days.map(day => day.dataset.date) };
    });
    const recount = () => {
      const chosen = boxes.map(box => box.checked);
      for (const { graph, days, dates } of graphs) {
        const shade = shadeDays(dates, counts, chosen);
        days.forEach((day, index) => {
          day.dataset.level = shade.levels[index];
          day.setAttribute("aria-label", tooltip(dates[index], shade.commits[index]));
        });
        const heading = commitCount(shade.total) + " " + graph.dataset.period;
        graph.querySelector("h2").textContent = heading;
        graph.querySelector(".calendar").setAttribute("aria-label", heading);
      }
      document.getElementById("repos-summary").textContent = chosenSummary(chosen);
      render();
    };
    panel.addEventListener("change", recount);
    for (const button of panel.querySelectorAll("[data-choose]")) {
      button.addEventListener("click", () => {
        for (const box of boxes) box.checked = button.dataset.choose === "all";
        recount();
      });
    }
    // A reload can restore boxes the reader cleared, so draw whatever they hold.
    recount();
    panel.hidden = false;
  }
  // Like GitHub, show the newest weeks first when the calendar is wider than the page.
  const scrollToEnd = () => {
    for (const box of document.querySelectorAll(".scroll")) box.scrollLeft = box.scrollWidth;
  };
  // Choosing a view, by its label or by a link, hides the tooltip and starts at the newest weeks.
  const viewChanged = () => {
    dispatch({ type: "dismiss" });
    scrollToEnd();
  };
  for (const input of document.querySelectorAll(".view")) input.addEventListener("change", viewChanged);
  scrollToEnd();
  const views = [...document.querySelectorAll(".graph")].map(graph => [graph.dataset.view, graph.dataset.first, graph.dataset.last]);
  const open = () => {
    const date = location.hash.slice(1);
    const view = viewFor(date, views);
    const day = view && document.querySelector(".graph-" + view + ' .day[data-date="' + date + '"]');
    if (!day) return;
    const input = document.getElementById("view-" + view);
    if (!input.checked) {
      input.checked = true;
      viewChanged();
    }
    rove(day);
    day.scrollIntoView({ block: "center", inline: "center" });
    day.focus({ preventScroll: true });
  };
  addEventListener("hashchange", open);
  open();
})();`;

/** JSON safe inside a script element. */
function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function head(views: View[]): string {
  const structured = scriptJson({ "@context": "https://schema.org", "@type": "WebSite", name: "a2f0", url: SITE_URL, description: DESCRIPTION });
  return [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(TITLE)}</title>`,
    `<meta name="description" content="${escapeHtml(DESCRIPTION)}">`,
    `<link rel="canonical" href="${SITE_URL}">`,
    `<meta name="theme-color" content="${LIGHT.canvas}" media="(prefers-color-scheme: light)">`,
    `<meta name="theme-color" content="${DARK.canvas}" media="(prefers-color-scheme: dark)">`,
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="a2f0">',
    `<meta property="og:title" content="${escapeHtml(TITLE)}">`,
    `<meta property="og:description" content="${escapeHtml(DESCRIPTION)}">`,
    `<meta property="og:url" content="${SITE_URL}">`,
    `<meta property="og:image" content="${SITE_URL}${IMAGE.path}">`,
    `<meta property="og:image:width" content="${IMAGE.width}">`,
    `<meta property="og:image:height" content="${IMAGE.height}">`,
    `<meta property="og:image:alt" content="${escapeHtml(IMAGE.alt)}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    '<link rel="icon" href="favicon.ico" sizes="any">',
    '<link rel="icon" href="favicon.svg" type="image/svg+xml">',
    '<link rel="apple-touch-icon" href="apple-touch-icon.png">',
    `<script type="application/ld+json">${structured}</script>`,
    `<style>\n${styles(views)}\n</style>`,
  ].join("\n");
}

function page(history: History): string {
  const views = siteViews(history);
  const repositories = siteRepositories(history, views);
  const { oldest, today } = span(history);
  const inputs = views.map(view => `<input type="radio" class="view" name="view" id="view-${view.id}"${view.id === "last" ? " checked" : ""}>`);
  const years = views.map(view => `<label for="view-${view.id}">${view.id === "last" ? "Last year" : view.id}</label>`);
  return `<!doctype html>
<html lang="en">
<head>
${head(views)}
</head>
<body>
<main>
<header>
<h1>a2f0</h1>
<p>Commits in pull requests merged across the repositories that the <a href="https://github.com/a2f0/matrix">matrix</a> workspace manages, counted before squash merging collapsed them, from ${longDate(oldest)} through ${longDate(today)}. Hover over or focus a day to see its count, and choose repositories below the calendar to count only theirs.</p>
</header>
${inputs.join("\n")}
<div class="layout">
<div class="graphs">
${views.map((view, index) => graph(view, index === 0)).join("\n")}
${repositories.length > 0 ? repositoryPanel(repositories, views) : ""}
</div>
<nav class="years" aria-label="Year">
${years.join("\n")}
</nav>
</div>
<footer><a href="https://github.com/a2f0">github.com/a2f0</a></footer>
</main>
<div class="tooltip" id="tooltip" role="tooltip" hidden></div>
<script type="application/json" id="counts">${scriptJson(pageCounts(history, repositories))}</script>
<script>
${SCRIPT}
</script>
</body>
</html>
`;
}

/** GitHub Pages serves this for any missing path under the site, so its links are absolute. */
function notFound(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Page not found · a2f0</title>
<link rel="icon" href="${SITE_URL}favicon.ico" sizes="any">
<link rel="icon" href="${SITE_URL}favicon.svg" type="image/svg+xml">
<style>:root{color-scheme:light dark;${themeVariables(LIGHT)}}@media (prefers-color-scheme:dark){:root{${themeVariables(DARK)}}}body{margin:0;background:var(--canvas);color:var(--text);font:14px/1.5 ${FONT}}main{max-width:1012px;margin:0 auto;padding:40px 16px}a{color:var(--accent)}h1{font-size:24px;font-weight:600}</style>
</head>
<body>
<main>
<h1>Page not found</h1>
<p>There is nothing at this address. The contributions grid is at <a href="${SITE_URL}">${SITE_URL}</a>.</p>
</main>
</body>
</html>
`;
}

function sitemap(history: History): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>${SITE_URL}</loc><lastmod>${history.asOf}</lastmod></url>
</urlset>
`;
}

/** Every file of the site except the images agent-tool renders, by path from the site root. */
export function renderSite(history: History): Map<string, string> {
  return new Map([
    ["index.html", page(history)],
    ["404.html", notFound()],
    ["sitemap.xml", sitemap(history)],
  ]);
}
