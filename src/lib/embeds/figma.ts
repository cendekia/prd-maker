import type { EmbedData } from "./types";
import { parseUrl } from "./match";

/** A Figma URL we can embed: figma.com/{file,design,proto,board,slides}/<key>/… */
function isFigmaUrl(value: string): boolean {
  const u = parseUrl(value);
  if (!u) return false;
  if (u.host.replace(/^www\./, "").toLowerCase() !== "figma.com") return false;
  return /^\/(file|design|proto|board|slides)\//.test(u.pathname);
}

/**
 * Figma's embed takes the *original* file URL as a query param rather than a
 * transformed path. The wrapping origin (`www.figma.com/embed`) is in the
 * iframe allowlist; the inner `url` is URL-encoded so it can't break out.
 */
export function resolveFigma(url: string): EmbedData | null {
  if (!isFigmaUrl(url)) return null;
  return {
    url,
    provider: "figma",
    kind: "rich",
    title: "Figma",
    embedUrl: `https://www.figma.com/embed?embed_host=prdmaker&url=${encodeURIComponent(url)}`,
    aspectRatio: 4 / 3,
    fixedHeight: null,
    thumbnailUrl: null,
    providerLabel: "Figma",
  };
}
