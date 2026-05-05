/** Pure slug helpers — safe to import from client components. */

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

export const RESERVED_SLUGS = new Set([
  "sign-in",
  "verify-request",
  "error",
  "onboarding",
  "invite",
  "api",
  "p",
  "account",
  "settings",
  "_next",
  "static",
  "public",
  "favicon.ico",
  "pricing",
  "privacy",
  "terms",
  "about",
  "blog",
  "docs",
]);

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug) && !RESERVED_SLUGS.has(slug);
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}
