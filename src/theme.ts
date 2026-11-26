/**
 * Primer's colors from @primer/primitives' light and dark themes: the five
 * contribution shades, the cell border, and the page's text, border, accent,
 * and tooltip colors.
 */
export interface Theme {
  levels: [string, string, string, string, string];
  border: string;
  canvas: string;
  text: string;
  muted: string;
  line: string;
  accent: string;
  hover: string;
  tooltip: string;
}

export const LIGHT: Theme = {
  levels: ["#eff2f5", "#aceebb", "#4ac26b", "#2da44e", "#116329"],
  border: "#1f23280d",
  canvas: "#ffffff",
  text: "#1f2328",
  muted: "#59636e",
  line: "#d1d9e0",
  accent: "#0969da",
  hover: "#818b981a",
  tooltip: "#25292e",
};

export const DARK: Theme = {
  levels: ["#151b23", "#033a16", "#196c2e", "#2ea043", "#56d364"],
  border: "#0104090d",
  canvas: "#0d1117",
  text: "#f0f6fc",
  muted: "#9198a1",
  line: "#3d444d",
  accent: "#1f6feb",
  hover: "#656c7633",
  tooltip: "#3d444d",
};

/** GitHub's system font stack, which it uses after its own Mona Sans web font. */
export const FONT = `-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans",Helvetica,Arial,sans-serif`;
