import type { EmbedData } from "./types";
import { parseUrl } from "./match";

/**
 * Linear has no public oEmbed or anonymous embed — issue content sits behind
 * auth — so we render a preview *card* rather than an iframe. We surface the
 * issue identifier (e.g. "ENG-123") from the URL when present; no network call
 * is made, which also keeps this resolver SSRF-free.
 */
export function resolveLinear(url: string): EmbedData | null {
  const u = parseUrl(url);
  if (!u) return null;
  if (u.host.replace(/^www\./, "").toLowerCase() !== "linear.app") return null;

  let title = "Linear";
  const issue = u.pathname.match(/\/issue\/([A-Z0-9]+-\d+)/i);
  if (issue) {
    title = issue[1].toUpperCase();
  } else if (/\/project\//.test(u.pathname)) {
    title = "Linear project";
  } else if (/\/(team|view)\//.test(u.pathname)) {
    title = "Linear view";
  }

  return {
    url,
    provider: "linear",
    kind: "link",
    title,
    embedUrl: null,
    aspectRatio: null,
    fixedHeight: null,
    thumbnailUrl: null,
    providerLabel: "Linear",
  };
}
