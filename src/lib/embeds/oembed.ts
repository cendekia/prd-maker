/**
 * The "everything else" resolvers: providers we reach either by constructing
 * the embed URL directly (Vimeo, Spotify, CodePen) or via a real oEmbed fetch
 * to a *whitelisted* endpoint (SoundCloud), plus the secure generic fallback.
 *
 * Security: we never fetch the user-supplied URL/host directly — only known
 * oEmbed endpoints on hosts we control the list of — so there is no SSRF
 * surface. Provider HTML is never rendered; we extract the iframe `src` and
 * hand back only `embedUrl`, which renderers re-validate against the iframe
 * host allowlist.
 */

import { DEFAULT_ASPECT_RATIO, type EmbedData } from "./types";
import { isAllowedEmbedHost, parseUrl } from "./match";

const FETCH_TIMEOUT_MS = 5000;

/* ----------------------------- Vimeo ---------------------------------- */

export function resolveVimeo(url: string): EmbedData | null {
  const u = parseUrl(url);
  if (!u) return null;
  const h = u.host.replace(/^www\./, "").toLowerCase();
  if (h !== "vimeo.com" && h !== "player.vimeo.com") return null;
  const m = u.pathname.match(/(\d{6,})/);
  if (!m) return null;
  const id = m[1];
  const hash = u.searchParams.get("h");
  const embedUrl =
    `https://player.vimeo.com/video/${id}` + (hash ? `?h=${encodeURIComponent(hash)}` : "");
  return {
    url,
    provider: "vimeo",
    kind: "video",
    title: "Vimeo video",
    embedUrl,
    aspectRatio: DEFAULT_ASPECT_RATIO,
    fixedHeight: null,
    thumbnailUrl: null,
    providerLabel: "Vimeo",
  };
}

/* ---------------------------- Spotify --------------------------------- */

export function resolveSpotify(url: string): EmbedData | null {
  const u = parseUrl(url);
  if (!u || u.host.toLowerCase() !== "open.spotify.com") return null;
  const m = u.pathname.match(/^\/(track|album|playlist|artist|show|episode)\/([A-Za-z0-9]+)/);
  if (!m) return null;
  const [, type, id] = m;
  const compact = type === "track" || type === "episode";
  return {
    url,
    provider: "spotify",
    kind: "rich",
    title: "Spotify",
    embedUrl: `https://open.spotify.com/embed/${type}/${id}`,
    aspectRatio: null,
    fixedHeight: compact ? 152 : 352,
    thumbnailUrl: null,
    providerLabel: "Spotify",
  };
}

/* ---------------------------- CodePen --------------------------------- */

export function resolveCodePen(url: string): EmbedData | null {
  const u = parseUrl(url);
  if (!u || u.host.toLowerCase() !== "codepen.io") return null;
  const m = u.pathname.match(/^\/([^/]+)\/(?:pen|details|full|pres)\/([^/?#]+)/);
  if (!m) return null;
  const [, user, hash] = m;
  return {
    url,
    provider: "codepen",
    kind: "rich",
    title: "CodePen",
    embedUrl: `https://codepen.io/${encodeURIComponent(user)}/embed/${encodeURIComponent(
      hash,
    )}?default-tab=result`,
    aspectRatio: 4 / 3,
    fixedHeight: null,
    thumbnailUrl: null,
    providerLabel: "CodePen",
  };
}

/* --------------------------- SoundCloud ------------------------------- */

/** SoundCloud needs oEmbed to turn a track/playlist URL into a player src. */
export async function resolveSoundCloud(url: string): Promise<EmbedData | null> {
  const u = parseUrl(url);
  if (!u || u.host.replace(/^www\./, "").toLowerCase() !== "soundcloud.com") return null;

  const fallback: EmbedData = {
    url,
    provider: "soundcloud",
    kind: "link",
    title: "SoundCloud",
    embedUrl: null,
    aspectRatio: null,
    fixedHeight: null,
    thumbnailUrl: null,
    providerLabel: "SoundCloud",
  };

  const res = await fetchOEmbed(`https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`);
  if (!res) return fallback;

  const src = extractIframeSrc(res.html);
  if (!src || !isAllowedEmbedHost(src)) {
    return { ...fallback, title: stringOr(res.title, "SoundCloud") };
  }
  return {
    ...fallback,
    kind: "rich",
    title: stringOr(res.title, "SoundCloud"),
    embedUrl: src,
    fixedHeight: 166,
    thumbnailUrl: stringOrNull(res.thumbnail_url),
  };
}

/* ----------------------------- X / Twitter ---------------------------- */

export function resolveTwitter(url: string): EmbedData | null {
  const u = parseUrl(url);
  if (!u) return null;
  const h = u.host.replace(/^www\./, "").toLowerCase();
  if (h !== "twitter.com" && h !== "x.com") return null;
  // Twitter's oEmbed returns a <blockquote> that needs widgets.js to render —
  // we deliberately don't execute third-party scripts, so X posts become a
  // link card.
  const author = u.pathname.split("/").filter(Boolean)[0];
  return {
    url,
    provider: "twitter",
    kind: "link",
    title: author ? `Post by @${author}` : "Post on X",
    embedUrl: null,
    aspectRatio: null,
    fixedHeight: null,
    thumbnailUrl: null,
    providerLabel: "X",
  };
}

/* ---------------------------- Generic --------------------------------- */

/** Last-resort link card for any http(s) URL. No network, no iframe. */
export function genericLink(url: string): EmbedData | null {
  const u = parseUrl(url);
  if (!u) return null;
  const label = u.host.replace(/^www\./, "");
  return {
    url,
    provider: "generic",
    kind: "link",
    title: label,
    embedUrl: null,
    aspectRatio: null,
    fixedHeight: null,
    thumbnailUrl: null,
    providerLabel: label,
  };
}

/* ----------------------------- helpers -------------------------------- */

interface OEmbedResponse {
  html?: unknown;
  title?: unknown;
  thumbnail_url?: unknown;
}

async function fetchOEmbed(endpoint: string): Promise<{
  html: string;
  title: unknown;
  thumbnail_url: unknown;
} | null> {
  try {
    const res = await fetch(endpoint, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as OEmbedResponse;
    return {
      html: typeof data.html === "string" ? data.html : "",
      title: data.title,
      thumbnail_url: data.thumbnail_url,
    };
  } catch {
    return null;
  }
}

/** Pull the `src` out of the first <iframe> in an oEmbed HTML blob. */
function extractIframeSrc(html: string): string | null {
  const m = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
  if (!m) return null;
  // oEmbed providers sometimes emit protocol-relative src ("//host/…").
  const raw = m[1].startsWith("//") ? `https:${m[1]}` : m[1];
  return parseUrl(raw)?.toString() ?? null;
}

function stringOr(v: unknown, fallback: string): string {
  return typeof v === "string" && v.trim() ? v : fallback;
}

function stringOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}
