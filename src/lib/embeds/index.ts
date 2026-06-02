/**
 * Embed resolution entry point (Step 31).
 *
 * `resolveEmbed` is the single function the /api/embeds/resolve route calls. It
 * walks the providers in priority order and returns an `EmbedData`, always
 * falling back to a generic link card for any valid http(s) URL so the editor
 * never gets a dead "unresolvable" state.
 *
 * The synchronous `matchEmbedProvider` (re-exported from ./match) is what the
 * client paste handler uses to decide whether a pasted URL should auto-embed.
 */

import { resolveYouTube } from "./youtube";
import { resolveLoom } from "./loom";
import { resolveFigma } from "./figma";
import { resolveLinear } from "./linear";
import {
  genericLink,
  resolveCodePen,
  resolveSoundCloud,
  resolveSpotify,
  resolveTwitter,
  resolveVimeo,
} from "./oembed";
import { parseUrl } from "./match";
import type { EmbedData } from "./types";

export { matchEmbedProvider, isAllowedEmbedHost } from "./match";
export type { EmbedData, EmbedProvider, EmbedKind } from "./types";

export async function resolveEmbed(url: string): Promise<EmbedData | null> {
  if (!parseUrl(url)) return null;

  // Synchronous, pure resolvers first (no network).
  const sync =
    resolveYouTube(url) ??
    resolveLoom(url) ??
    resolveFigma(url) ??
    resolveVimeo(url) ??
    resolveSpotify(url) ??
    resolveCodePen(url) ??
    resolveLinear(url) ??
    resolveTwitter(url);
  if (sync) return sync;

  // SoundCloud needs an oEmbed round-trip; it returns a link-card fallback on
  // failure, so this never throws.
  const soundcloud = await resolveSoundCloud(url);
  if (soundcloud) return soundcloud;

  return genericLink(url);
}
