import "server-only";

/**
 * Comment bodies are stored as plain text with mention markers inline:
 *   `Hi @[Alice](usr_123), can you review?`
 *
 * The marker syntax is fixed: `@[name](userId)` — name is for display,
 * userId is the authoritative target. The client formats them on insert
 * (see `comment-input.tsx`) and the renderer converts them back to chips
 * (see `comment-thread.tsx`).
 *
 * This lives server-side because the comments API extracts mentions to
 * fan out notifications; the same regex is duplicated client-side for
 * rendering, which is fine — they're tiny and stable.
 */

const MENTION_RE = /@\[([^\]]+)\]\(([^)]+)\)/g;

/** Returns the unique userIds referenced in the body, in document order. */
export function extractMentions(body: string): string[] {
  const ids = new Set<string>();
  for (const m of body.matchAll(MENTION_RE)) {
    if (m[2]) ids.add(m[2]);
  }
  return [...ids];
}
