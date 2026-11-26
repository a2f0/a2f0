# Development

This repository is the a2f0 GitHub profile repository, and it serves a
contributions grid as a web page. GitHub would show a root `README.md` at
<https://github.com/a2f0>, and the profile stays at GitHub's default, so the
repository has no README and this guide holds what one would. This repo is
available on the web at <https://a2f0.github.io/a2f0/>.

## Quick start

```sh
mise install
bun install --frozen-lockfile
bun run hooks:install
bun run check
bun run site:dev   # http://localhost:4173/
```

`check` runs Biome, the type checker, the tests, the site build, ShellCheck
over the hooks, the binary-file check, and the managed skill and permission
checks. `site:dev` builds the web page into `dist/site` and serves it;
`site:build` only builds it.

## Contributions grid

The grid copies GitHub's contribution calendar, but each day counts the
original commits in pull requests merged that day across the repositories the
[matrix](https://github.com/a2f0/matrix) workspace manages, before squash
merging collapsed them.

| Path | Contents |
| --- | --- |
| `contributions/commits.json` | Daily counts, written only by matrix's `bun run contributions` |
| `src/history.ts` | Reads and validates the counts |
| `src/grid.ts` | The 53-week calendar, calendar years, shade levels, month labels, and hover text |
| `src/theme.ts` | Primer's light and dark colors |
| `src/web.ts` | The page's address and HTML escaping |
| `src/pageLogic.ts` | The page script's decisions: the tooltip's state machine, link routing, arrow keys, and placement |
| `src/site.ts` | The web page, its 404 page, and its sitemap |
| `scripts/buildSite.ts` | `bun run site:build` and `site:dev`, into the ignored `dist/site` |
| `assets/brand/logo.svg` | The mark agent-tool renders into the site's icons and preview image |

### Updating the counts

Run `bun run contributions` from the matrix workspace. It counts every day that
`commits.json` is missing or counted before the day ended, so a run after a gap
backfills the days in between, and it writes only that file; it no longer runs
a script here. Ship the file as a pull request with the `ship-pr` skill;
merging it deploys the page. `commits.json` has this shape, one line per day:

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
began; the last year ends on its local date, which keeps the page a pure
function of the file. Every counted day stays in the file, including those
older than a year, for views of earlier years. Shades follow the quartiles of
the busy days in the view shown, as GitHub's do.

## Web page

The page draws the grid from `commits.json` with GitHub's tooltip as GitHub
draws it: 12px white text on `#25292e` (`#3d444d` in the dark theme), 4px 8px
of padding, a 6px radius, centered 4px above the day, and kept inside the
window.

- **Views.** The page opens on the year ending on `asOf`'s local date, like
  GitHub's profile calendar. The list beside it offers that year and each
  calendar year since the first counted day. Radio buttons switch years, so
  only the tooltips and keyboard need script. A calendar year keeps all its
  weeks, and days before the first count stay blank rather than showing zero.
  The last year counts a missing day as none; the counter's first run counts
  all 53 weeks, so none is missing in practice.
- **Links.** `#YYYY-MM-DD` opens that day, in the last year when it falls there
  and otherwise in its calendar year, and shows its tooltip. Only the last
  year's days carry those ids, so each is unique. A blank day, a date that
  does not exist, or any other hash opens nothing.
- **Keyboard.** Tab reaches the calendar, the arrow keys move between days, and
  Escape hides the tooltip wherever focus is.
- **Script.** Every pointer, focus, and key listener dispatches one event to
  the tooltip's transition function, `nextTooltip`, and the page draws the
  state it returns. That function, the link routing, the arrow-key steps, and
  the placement are pure functions in `src/pageLogic.ts`; the page embeds them
  by their source, and the tests run those embedded copies.
- **Narrow screens.** The calendar scrolls inside its box and starts at the
  newest week, as GitHub's does.

### Deploying

CI's `Site` job builds the page and uploads it as a Pages artifact on every
run, so a pull request proves what its merge would publish; the `CI gate`
requires it. On a push to `main`, the `Main tip` job checks after the gate
that the commit is still `main`'s tip, and only then does the `Deploy` job
publish that artifact with `actions/deploy-pages`, checking the tip again
inside the `pages` queue first. When `main` has moved on,
the newer commit's run deploys once it passes, and until then the page stays
at the last deployed commit. Superseded runs stop at `Main tip`, before the
`github-pages` environment, unless `main` moves while their deploy waits in
the queue. Pages is set to build from
GitHub Actions (`build_type: workflow`), and the deploy uses the
`github-pages` environment.

The icons (`favicon.svg`, a 16, 32, and 48 pixel `favicon.ico`, and an opaque
180 pixel `apple-touch-icon.png`) and the 1200×630 `og-image.png` link preview
are rendered from `assets/brand/logo.svg` by `agent-tool images build`, as
`agent-tool.json`'s `images` section declares, during every build; none is
committed.

### Hosting limits

The page is a project site under `a2f0.github.io`, whose root belongs to a
user site repository that does not exist. So the host has no `robots.txt` or
root `/favicon.ico` this repository can serve. Browsers use the icons the page
links instead. Search engines find `sitemap.xml` only when it is submitted to
them, because no `robots.txt` names it. Every other path under `/a2f0/` gets
the noindex `404.html`. The page itself carries a canonical URL, a description,
Open Graph and Twitter card tags, `WebSite` structured data, and a
`theme-color` for each theme.
