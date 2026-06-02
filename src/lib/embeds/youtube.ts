import { DEFAULT_ASPECT_RATIO, type EmbedData } from "./types";
import { parseUrl } from "./match";

/**
 * Extract an 11-ish char video id from any of YouTube's URL shapes:
 *   youtu.be/<id>
 *   youtube.com/watch?v=<id>
 *   youtube.com/{embed,shorts,live,v}/<id>
 */
export function parseYouTubeId(value: string): string | null {
  const u = parseUrl(value);
  if (!u) return null;
  const h = u.host.replace(/^www\./, "").toLowerCase();

  if (h === "youtu.be") {
    const id = u.pathname.slice(1).split("/")[0];
    return id || null;
  }
  if (h === "youtube.com" || h === "m.youtube.com" || h === "music.youtube.com") {
    const v = u.searchParams.get("v");
    if (v) return v;
    const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/);
    if (m) return m[1];
  }
  return null;
}

/** Resolve a YouTube URL to a privacy-enhanced (`youtube-nocookie`) embed. */
export function resolveYouTube(url: string): EmbedData | null {
  const id = parseYouTubeId(url);
  if (!id) return null;
  return {
    url,
    provider: "youtube",
    kind: "video",
    title: "YouTube video",
    embedUrl: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`,
    aspectRatio: DEFAULT_ASPECT_RATIO,
    fixedHeight: null,
    thumbnailUrl: `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`,
    providerLabel: "YouTube",
  };
}
