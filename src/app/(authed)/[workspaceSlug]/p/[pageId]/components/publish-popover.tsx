"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Check, Copy, ExternalLink, Globe } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { slugify } from "@/lib/slug";

import { publishPageAction, unpublishPageAction } from "../actions";

interface Props {
  pageId: string;
  pageTitle: string;
  /** Server-rendered initial state — kept in sync via server actions. */
  initialIsPublished: boolean;
  initialPublicSlug: string | null;
  /** Base URL for the public surface (e.g. https://app.example.com). */
  publicBaseUrl: string;
  /** Whether the current viewer can publish (EDITOR+). */
  canPublish: boolean;
}

export function PublishPopover({
  pageId,
  pageTitle,
  initialIsPublished,
  initialPublicSlug,
  publicBaseUrl,
  canPublish,
}: Props) {
  const [open, setOpen] = useState(false);
  const [isPublished, setIsPublished] = useState(initialIsPublished);
  const [slug, setSlug] = useState(
    initialPublicSlug ?? slugify(pageTitle) ?? "",
  );
  const [slugDraft, setSlugDraft] = useState(slug);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const containerRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Reset the copied tick after a moment.
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(id);
  }, [copied]);

  const url = isPublished && slug ? `${publicBaseUrl}/p/${slug}` : "";

  const handlePublish = useCallback(() => {
    setError(null);
    startTransition(async () => {
      const result = await publishPageAction({ pageId, slug: slugDraft });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setIsPublished(true);
      setSlug(result.publicSlug);
      setSlugDraft(result.publicSlug);
    });
  }, [pageId, slugDraft]);

  const handleUnpublish = useCallback(() => {
    setError(null);
    startTransition(async () => {
      const result = await unpublishPageAction(pageId);
      if ("ok" in result && result.ok) {
        setIsPublished(false);
      } else if ("error" in result) {
        setError(result.error);
      }
    });
  }, [pageId]);

  const handleCopy = useCallback(async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setError("Couldn't copy to clipboard.");
    }
  }, [url]);

  return (
    <div ref={containerRef} className="relative">
      <Button
        variant={isPublished ? "outline" : "default"}
        size="sm"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Globe className="size-3.5" />
        {isPublished ? "Published" : "Publish"}
      </Button>

      {open ? (
        <div
          role="dialog"
          aria-label="Publish settings"
          className="absolute right-0 top-full z-50 mt-2 w-[360px] rounded-[var(--radius-md)] border bg-background p-4 shadow-[var(--shadow-lg)]"
        >
          <div className="mb-3 flex items-start gap-2">
            <Globe className="mt-0.5 size-4 text-fg-3" />
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-fg-1">
                Publish to the web
              </div>
              <div className="text-[12px] text-fg-3">
                Anyone with the link can read this page.
              </div>
            </div>
          </div>

          {isPublished ? (
            <div className="mb-3">
              <Label className="text-[11px]">Public link</Label>
              <div className="mt-1 flex items-stretch gap-1.5">
                <Input
                  readOnly
                  value={url}
                  onFocus={(e) => e.currentTarget.select()}
                  className="font-mono text-[12px]"
                />
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={handleCopy}
                  aria-label="Copy link"
                  className="h-9 w-9"
                >
                  {copied ? <Check /> : <Copy />}
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  asChild
                  aria-label="Open in new tab"
                  className="h-9 w-9"
                >
                  <a href={url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink />
                  </a>
                </Button>
              </div>
            </div>
          ) : null}

          <div className="mb-3">
            <Label htmlFor="public-slug" className="text-[11px]">
              Custom slug
            </Label>
            <Input
              id="public-slug"
              value={slugDraft}
              onChange={(e) => setSlugDraft(slugify(e.target.value))}
              placeholder="my-page"
              disabled={!canPublish || pending}
              className="mt-1 font-mono text-[12px]"
            />
            <div className="mt-1 text-[11px] text-fg-3">
              {publicBaseUrl}/p/<span className="font-mono">{slugDraft || "…"}</span>
            </div>
          </div>

          {error ? (
            <div className="mb-3 rounded-[var(--radius-sm)] bg-[oklch(0.577_0.245_27.325_/_0.10)] px-2 py-1.5 text-[12px] text-destructive">
              {error}
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-2">
            {!canPublish ? (
              <div className="text-[11px] text-fg-3">
                Editor role required to publish.
              </div>
            ) : isPublished ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleUnpublish}
                  disabled={pending}
                >
                  Unpublish
                </Button>
                <Button
                  size="sm"
                  onClick={handlePublish}
                  disabled={pending || slugDraft === slug}
                >
                  {pending ? "Saving…" : "Update slug"}
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                onClick={handlePublish}
                disabled={pending || !slugDraft}
                className={cn(!slugDraft && "opacity-60")}
              >
                {pending ? "Publishing…" : "Publish to web"}
              </Button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
