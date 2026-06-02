import { DEFAULT_ASPECT_RATIO, type EmbedData } from "./types";
import { parseUrl } from "./match";

/** Loom share ids are 32 hex chars: loom.com/share/<id> (or /embed/<id>). */
function parseLoomId(value: string): string | null {
  const u = parseUrl(value);
  if (!u) return null;
  if (u.host.replace(/^www\./, "").toLowerCase() !== "loom.com") return null;
  const m = u.pathname.match(/^\/(?:share|embed|v)\/([a-f0-9]{16,})/i);
  return m ? m[1] : null;
}

/** Resolve a Loom share link to its `/embed/<id>` iframe. */
export function resolveLoom(url: string): EmbedData | null {
  const id = parseLoomId(url);
  if (!id) return null;
  return {
    url,
    provider: "loom",
    kind: "video",
    title: "Loom video",
    embedUrl: `https://www.loom.com/embed/${id}`,
    aspectRatio: DEFAULT_ASPECT_RATIO,
    fixedHeight: null,
    thumbnailUrl: null,
    providerLabel: "Loom",
  };
}
