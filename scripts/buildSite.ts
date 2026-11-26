#!/usr/bin/env bun
// Build the contributions web page into dist/site from contributions/commits.json, with --serve to preview it.
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { HISTORY_FILE, parseHistory } from "../src/history";
import { renderSite } from "../src/site";

const USAGE = `Usage: bun run site:build
       bun run site:dev

Build the web page, its 404 page, its sitemap, and the icons agent-tool renders
from assets/brand/logo.svg into dist/site, from ${HISTORY_FILE}. site:dev also
serves the result at http://localhost:4173/.
`;

const ROOT = path.resolve(import.meta.dir, "..");
export const SITE_DIR = path.join("dist", "site");
const PORT = 4173;
/** The agent-tool.json image targets the site serves at its root. */
const IMAGE_TARGETS = ["favicons", "social"];

/** The page files, rendered from the history, by path from the site root. */
export function siteFiles(root: string): Map<string, string> {
  return renderSite(parseHistory(readFileSync(path.join(root, HISTORY_FILE), "utf8"), HISTORY_FILE));
}

/** Write the site afresh into `out`, then the favicons and preview image agent-tool.json declares. */
export function buildSite(root: string, out = path.join(root, SITE_DIR)): string[] {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const files = siteFiles(root);
  for (const [file, content] of files) writeFileSync(path.join(out, file), content);
  const agentTool = path.join(root, "node_modules", ".bin", "agent-tool");
  for (const target of IMAGE_TARGETS) {
    const images = spawnSync(agentTool, ["images", "build", target, "--out", out], { cwd: root, encoding: "utf8" });
    if (images.status !== 0) throw new Error(`agent-tool images build ${target} failed: ${(images.stderr || images.stdout).trim()}`);
  }
  return [...files.keys()];
}

/**
 * The file a request path names inside the site, as GitHub Pages maps it (a
 * trailing slash means its index.html), or null for a path that does not
 * decode or that steps outside the site.
 */
export function sitePath(pathname: string): string | null {
  let name: string;
  try {
    name = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (!name.startsWith("/")) return null;
  const parts = `${name}${name.endsWith("/") ? "index.html" : ""}`.slice(1).split("/");
  return parts.every(part => part !== "" && part !== "." && part !== ".." && !/[\\\0]/.test(part)) ? parts.join("/") : null;
}

function serve(out: string): void {
  const notFound = () => new Response(Bun.file(path.join(out, "404.html")), { status: 404 });
  const server = Bun.serve({
    hostname: "localhost",
    port: PORT,
    async fetch(request) {
      const name = sitePath(new URL(request.url).pathname);
      const file = name === null ? null : Bun.file(path.join(out, name));
      return file && (await file.exists()) ? new Response(file) : notFound();
    },
  });
  console.log(`Serving ${path.relative(ROOT, out)} at http://localhost:${server.port}/`);
}

if (import.meta.main) {
  try {
    const { values } = parseArgs({ args: process.argv.slice(2), options: { serve: { type: "boolean" }, help: { type: "boolean", short: "h" } } });
    if (values.help) {
      console.log(USAGE);
    } else {
      const out = path.join(ROOT, SITE_DIR);
      const files = buildSite(ROOT, out);
      console.log(`Built ${SITE_DIR}: ${files.join(", ")}, and the brand images.`);
      if (values.serve) serve(out);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
