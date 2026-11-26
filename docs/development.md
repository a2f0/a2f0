# Development

This repository is the a2f0 GitHub profile: GitHub shows its `README.md` at
<https://github.com/a2f0>, so the README holds only what the profile shows, and
this guide holds everything else.

## Quick start

```sh
mise install
bun install --frozen-lockfile
bun run hooks:install
bun run contributions:render
bun run check
```

`contributions:render` rewrites the README's grid and the images under
`contributions/` from `contributions/commits.json`; `check` runs Biome, the
type checker, the tests, the rendered-grid check, ShellCheck over the hooks,
the binary-file check, and the managed skill and permission checks.

## Contributions grid

The grid copies GitHub's contribution calendar, but each day counts the
original commits in pull requests merged that day across the repositories the
[matrix](https://github.com/a2f0/matrix) workspace manages, before squash
merging collapsed them. Hovering a day shows its count.

| Path | Contents |
| --- | --- |
| `contributions/commits.json` | Daily counts, written only by matrix's `bun run contributions` |
| `contributions/*.svg` | Cell, label, month, and legend images, rendered here |
| `README.md` | The grid between `<!-- contributions:start -->` and `<!-- contributions:end -->`, rendered here |
| `src/history.ts` | Reads and validates the counts |
| `src/grid.ts` | The 53-week calendar, shade levels, month labels, and hover text |
| `src/render.ts` | The images and the README section |
| `scripts/renderContributions.ts` | `bun run contributions:render` and `contributions:check` |

### Updating the counts

Run `bun run contributions` from the matrix workspace. It counts every day that
`commits.json` is missing or counted before the day ended, so a run after a gap
backfills the days in between, then runs this repository's
`contributions:render`. Commit `contributions/` and `README.md` together.
`commits.json` has this shape, one line per day:

```json
{
  "schemaVersion": 1,
  "timeZone": "America/New_York",
  "asOf": "2026-11-26T17:00:00.000Z",
  "days": {
    "2026-11-25": { "commits": 314, "pullRequests": 44 }
  }
}
```

Days are local calendar days in `timeZone`. `asOf` is when the latest count
began; the grid ends on its local date, which keeps rendering a pure function
of the file, so CI can check the committed output. Every counted day stays in
the file, including those older than the grid shows, for views of earlier
years.

### How the grid renders on GitHub

GitHub's Markdown keeps `title` on `<img>` but removes image maps, inline SVG,
scripts, and styles. So each day is its own image whose `title` is the hover
text, written the way GitHub words its own ("12 commits on November 25th.").
The images sit in a `<div>` inside `<sub>`, whose `line-height` GitHub sets to
0, so each row of images is exactly one image tall with no gap between rows,
and the images on a row have no whitespace between them. A one-cell table gives
the bordered box and scrolls sideways on narrow screens.

Each image carries Primer's light and dark colors and chooses with
`prefers-color-scheme`. Chromium and Firefox evaluate that query inside an
image against the page's `color-scheme`, which GitHub sets from the viewer's
theme, so the cells follow the GitHub theme. Safari evaluates it against the
system appearance, so there the cells follow the system when it differs from
the GitHub theme; GitHub's own `<picture>` theming would cover that case at
twice the markup per day. Shades follow the quartiles of the busy days in the
year shown, as GitHub's do.
