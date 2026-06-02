/**
 * Synchronous, dependency-free URL matching for embeds.
 *
 * Split out from the resolvers so the editor's paste handler can decide
 * "is this a known-embeddable URL?" on the client without pulling the whole
 * resolver graph (or any network code) into the client bundle.
 *
 * Nothing here performs I/O. The actual resolution (which may fetch oEmbed
 * endpoints) lives in the per-provider modules and runs only on the server.
 */

import type { EmbedProvider } from "./types";

/** Parse a URL, returning null instead of throwing on malformed input. */
export function parseUrl(value: string): URL | null {
  try {
    const u = new URL(value.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u;
  } catch {
    return null;
  }
}

/** Host comparison that ignores a leading `www.`. */
function host(u: URL): string {
  return u.host.replace(/^www\./, "").toLowerCase();
}

/**
 * Identify which provider a URL belongs to, or `null` if it matches none of
 * the providers we auto-embed on paste. A `null` result means "treat as a
 * normal link" — only an explicit `/embed` insert turns it into a link card.
 */
export function matchEmbedProvider(value: string): EmbedProvider | null {
  const u = parseUrl(value);
  if (!u) return null;
  const h = host(u);

  if (h === "youtube.com" || h === "youtu.be" || h === "m.youtube.com" || h === "music.youtube.com") {
    return "youtube";
  }
  if (h === "loom.com") return "loom";
  if (h === "figma.com") return "figma";
  if (h === "vimeo.com" || h === "player.vimeo.com") return "vimeo";
  if (h === "open.spotify.com") return "spotify";
  if (h === "soundcloud.com") return "soundcloud";
  if (h === "codepen.io") return "codepen";
  if (h === "linear.app") return "linear";
  if (h === "twitter.com" || h === "x.com") return "twitter";
  return null;
}

/**
 * Hosts we permit as an <iframe> `src`. Every render surface re-checks
 * `embedUrl` against this set before emitting an iframe, so a tampered or
 * malicious `contentJson` can never point our iframe at an arbitrary origin —
 * it degrades to a plain link instead.
 */
const ALLOWED_IFRAME_HOSTS = new Set([
  "www.youtube.com",
  "youtube.com",
  "www.youtube-nocookie.com",
  "youtube-nocookie.com",
  "www.loom.com",
  "loom.com",
  "www.figma.com",
  "figma.com",
  "embed.figma.com",
  "player.vimeo.com",
  "open.spotify.com",
  "w.soundcloud.com",
  "codepen.io",
]);

/** True only for an https URL whose host is in the iframe allowlist. */
export function isAllowedEmbedHost(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const u = parseUrl(value);
  if (!u || u.protocol !== "https:") return false;
  return ALLOWED_IFRAME_HOSTS.has(u.host.toLowerCase());
}

/** Validate an external http(s) link target (for link cards / "open" links). */
export function isHttpUrl(value: unknown): boolean {
  return typeof value === "string" && parseUrl(value) !== null;
}
