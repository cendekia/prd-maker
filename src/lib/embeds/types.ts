/**
 * Shared types for the embed subsystem (Step 31).
 *
 * An `EmbedData` is the resolved description of a pasted URL. It is produced by
 * `resolveEmbed` (server, via /api/embeds/resolve) and stored verbatim on the
 * `embed` TipTap node's attributes so every render surface — the editor, the
 * public publish page, and the HTML/Markdown/PDF exports — can paint the embed
 * without re-resolving.
 *
 * Security note: we never store or render provider-supplied HTML. For iframe
 * embeds we only keep `embedUrl` (the iframe `src`), which every renderer
 * re-validates against `isAllowedEmbedHost` before emitting an <iframe>. See
 * `match.ts`.
 */

export type EmbedProvider =
  | "youtube"
  | "loom"
  | "figma"
  | "vimeo"
  | "spotify"
  | "soundcloud"
  | "codepen"
  | "linear"
  | "twitter"
  | "generic";

/**
 * How the embed should be presented:
 *  - `video` / `rich` → sandboxed <iframe> built from `embedUrl`
 *  - `link`           → a preview card linking to `url` (no iframe)
 */
export type EmbedKind = "video" | "rich" | "link";

export interface EmbedData {
  /** The canonical URL the user pasted — always preserved for the "open" /
   *  "copy link" affordances and as the link-card fallback target. */
  url: string;
  provider: EmbedProvider;
  kind: EmbedKind;
  /** Best-effort human title. `null` when unknown. */
  title: string | null;
  /** The iframe `src` for `video`/`rich` embeds. `null` for link cards. */
  embedUrl: string | null;
  /** width / height. Drives the responsive box for scaling embeds (video,
   *  Figma, CodePen). `null` when a fixed height is used instead. */
  aspectRatio: number | null;
  /** Fixed iframe height in px for widgets that don't scale (Spotify,
   *  SoundCloud). Takes precedence over `aspectRatio` when set. */
  fixedHeight: number | null;
  /** Optional preview image for link cards / oEmbed thumbnails. */
  thumbnailUrl: string | null;
  /** Short provider label shown on the embed chrome (e.g. "Figma", "Linear",
   *  or a hostname for generic links). */
  providerLabel: string;
}

/** The default 16:9 ratio used when a video provider gives no better hint. */
export const DEFAULT_ASPECT_RATIO = 16 / 9;
