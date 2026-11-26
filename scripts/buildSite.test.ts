import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildSite, sitePath } from "./buildSite";

const ROOT = path.resolve(import.meta.dir, "..");
const outs: string[] = [];
afterEach(() => {
  for (const out of outs.splice(0)) rmSync(out, { recursive: true, force: true });
});

function tempDir(): string {
  const out = mkdtempSync(path.join(tmpdir(), "site-"));
  outs.push(out);
  return out;
}

/** A PNG's width, height, and IHDR color type (2 is RGB, 6 is RGB with alpha). */
function png(file: string): [number, number, number] {
  const bytes = readFileSync(file);
  expect(bytes.subarray(1, 4).toString()).toBe("PNG");
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20), bytes[25]!];
}

test("builds the pages and every icon the head links, replacing what the folder held", () => {
  const out = tempDir();
  writeFileSync(path.join(out, "stale.html"), "old");
  expect(buildSite(ROOT, out)).toEqual(["index.html", "404.html", "sitemap.xml"]);
  expect(readdirSync(out).sort()).toEqual(
    ["404.html", "apple-touch-icon.png", "favicon.ico", "favicon.svg", "index.html", "og-image.png", "sitemap.xml"].sort(),
  );
  const page = readFileSync(path.join(out, "index.html"), "utf8");
  for (const [, file] of page.matchAll(/<link rel="(?:icon|apple-touch-icon)" href="([^"]+)"/g)) expect(readdirSync(out)).toContain(file!);
  // Both are opaque, without an alpha channel, as link previews and iOS want.
  expect(png(path.join(out, "og-image.png"))).toEqual([1200, 630, 2]);
  expect(png(path.join(out, "apple-touch-icon.png"))).toEqual([180, 180, 2]);
  // An ICO directory lists each image's size, where 0 means 256.
  const ico = readFileSync(path.join(out, "favicon.ico"));
  const count = ico.readUInt16LE(4);
  expect(Array.from({ length: count }, (_, index) => ico[6 + index * 16]).sort((a, b) => a! - b!)).toEqual([16, 32, 48]);
  expect(readFileSync(path.join(out, "favicon.svg"), "utf8")).toContain("<svg");
});

test("site:dev maps request paths into the site and refuses any that leave it", () => {
  expect(sitePath("/")).toBe("index.html");
  expect(sitePath("/favicon.ico")).toBe("favicon.ico");
  expect(sitePath("/a/")).toBe("a/index.html");
  expect(sitePath("/og%2Dimage.png")).toBe("og-image.png");
  for (const pathname of ["/%2e%2e/package.json", "/a/../../x", "/./index.html", "//etc/passwd", "/a%5c..%5cb", "/a%00", "/%E0%A4%A", "index.html"]) {
    expect(sitePath(pathname)).toBeNull();
  }
});

test("a build whose image tool cannot start says why", () => {
  // A root without node_modules has no agent-tool to run.
  const root = tempDir();
  const project = path.resolve(import.meta.dir, "..");
  for (const file of ["contributions/commits.json", "agent-tool.json"]) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), readFileSync(path.join(project, file)));
  }
  expect(() => buildSite(root, path.join(root, "dist", "site"))).toThrow(/agent-tool images build favicons failed: .*ENOENT/);
});
