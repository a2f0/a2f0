import { type Cell, type Grid, tooltip, WEEKS } from "./grid";
import { SITE_URL } from "./site";
import { DARK, FONT, LIGHT, type Theme } from "./theme";

/**
 * GitHub Markdown keeps `<img title>` but strips image maps, inline SVG, and
 * styles, so every day is its own image whose title is the hover text. Inside
 * `<sub>`, whose line-height is 0, a `<div>` lays images out in rows exactly
 * one image tall, so the cells tile like GitHub's calendar. Each image carries
 * Primer's light and dark colors and picks one with prefers-color-scheme. The
 * browser draws a title as it likes, so each day also links to that day on the
 * web page, whose tooltips match GitHub's.
 */
export const ASSET_DIR = "contributions";
export const START = "<!-- contributions:start -->";
export const END = "<!-- contributions:end -->";

const CELL = 10;
const PITCH = 13;
const LABEL_WIDTH = 30;
const WIDTH = LABEL_WIDTH + WEEKS * PITCH;
const HEADER_HEIGHT = 18;
const FOOTER_HEIGHT = 30;
const LABELS = ["blank", "mon", "blank", "wed", "blank", "fri", "blank"];

const DARK_MODE = "@media (prefers-color-scheme:dark)";

function svg(width: number, height: number, style: string, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><style>${style}</style>${body}</svg>\n`;
}

function textStyle(): string {
  return `text{font:12px ${FONT};fill:${LIGHT.text}}.muted{fill:${LIGHT.muted}}${DARK_MODE}{text{fill:${DARK.text}}.muted{fill:${DARK.muted}}}`;
}

function square(x: number, y: number, className?: string): string {
  const name = className ? ` class="${className}"` : "";
  return `<rect${name} x="${x + 0.5}" y="${y + 0.5}" width="${CELL - 1}" height="${CELL - 1}" rx="1.5"/>`;
}

function levelRule(selector: string, theme: Theme, level: number): string {
  return `${selector}{fill:${theme.levels[level]};stroke:${theme.border}}`;
}

function cellImage(level: number): string {
  return svg(PITCH, PITCH, `${levelRule("rect", LIGHT, level)}${DARK_MODE}{${levelRule("rect", DARK, level)}}`, square(0, 0));
}

function legendStyle(): string {
  const rules = (theme: Theme) => [0, 1, 2, 3, 4].map(level => levelRule(`.l${level}`, theme, level)).join("");
  return `${textStyle()}${rules(LIGHT)}${DARK_MODE}{${rules(DARK)}}`;
}

function labelImage(label: string): string {
  const text = label === "blank" ? "" : `<text x="0" y="10">${label[0]!.toUpperCase()}${label.slice(1)}</text>`;
  return svg(LABEL_WIDTH, PITCH, textStyle(), text);
}

function monthsImage(grid: Grid): string {
  const labels = grid.months.map(month => `<text x="${LABEL_WIDTH + month.column * PITCH}" y="12">${month.name}</text>`);
  return svg(WIDTH, HEADER_HEIGHT, textStyle(), labels.join(""));
}

function legendImage(): string {
  const right = LABEL_WIDTH + (WEEKS - 1) * PITCH + CELL;
  const first = right - 32 - CELL - 4 * PITCH;
  const squares = [0, 1, 2, 3, 4].map(level => square(first + level * PITCH, 12, `l${level}`)).join("");
  const text = [
    `<text class="muted" x="${LABEL_WIDTH}" y="21">Commits in merged pull requests, counted before squashing</text>`,
    `<text class="muted" x="${first - 5}" y="21" text-anchor="end">Less</text>`,
    `<text class="muted" x="${right}" y="21" text-anchor="end">More</text>`,
  ];
  return svg(WIDTH, FOOTER_HEIGHT, legendStyle(), `${squares}${text.join("")}`);
}

/** Every image the grid uses, by path from the repository root. */
export function renderAssets(grid: Grid): Map<string, string> {
  const assets = new Map<string, string>();
  for (const level of [0, 1, 2, 3, 4]) assets.set(`${ASSET_DIR}/level-${level}.svg`, cellImage(level));
  for (const label of new Set(LABELS)) assets.set(`${ASSET_DIR}/label-${label}.svg`, labelImage(label));
  assets.set(`${ASSET_DIR}/months.svg`, monthsImage(grid));
  assets.set(`${ASSET_DIR}/legend.svg`, legendImage());
  return assets;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function image(file: string, width: number, height: number, text = ""): string {
  const title = text ? ` title="${escapeHtml(text)}"` : "";
  return `<img src="${ASSET_DIR}/${file}" width="${width}" height="${height}" alt="${escapeHtml(text)}"${title}>`;
}

/** A day's image, linking to that day on the web page. */
function day(cell: Cell): string {
  return `<a href="${SITE_URL}#${cell.date}">${image(`level-${cell.level}.svg`, PITCH, PITCH, tooltip(cell.date, cell.commits))}</a>`;
}

function row(cells: (Cell | null)[], weekday: number): string {
  // renderSection refuses a grid with an empty cell.
  return `${image(`label-${LABELS[weekday]}.svg`, LABEL_WIDTH, PITCH)}${cells.map(cell => day(cell!)).join("")}<br>`;
}

/** The README section between the markers. Images on one line have no whitespace between them. */
export function renderSection(grid: Grid): string {
  if (grid.rows.some(cells => cells.includes(null))) throw new Error("The README grid needs a cell for every day.");
  return [
    START,
    `${grid.commits.toLocaleString("en-US")} commits in the last year`,
    "",
    "<table><tr><td><sub><div>",
    `${image("months.svg", WIDTH, HEADER_HEIGHT)}<br>`,
    ...grid.rows.map(row),
    image("legend.svg", WIDTH, FOOTER_HEIGHT),
    "</div></sub></td></tr></table>",
    END,
  ].join("\n");
}

/** `readme` with the section between its markers replaced. */
export function replaceSection(readme: string, section: string): string {
  const start = readme.indexOf(START);
  const end = readme.indexOf(END);
  if (start === -1 || end < start || readme.indexOf(START, start + 1) !== -1 || readme.indexOf(END, end + 1) !== -1) {
    throw new Error(`README.md needs exactly one ${START} followed by one ${END}.`);
  }
  return readme.slice(0, start) + section + readme.slice(end + END.length);
}
