/** The page's address and HTML escaping. */

/** Where GitHub Pages serves this repository: the owner's github.io site, under the repository's name. */
export const SITE_URL = "https://a2f0.github.io/a2f0/";

/** Text made safe for an HTML attribute value or element content. */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
