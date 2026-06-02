"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import {
  AlertCircle,
  Check,
  Copy,
  ExternalLink,
  Link2,
  Loader2,
  Trash2,
} from "lucide-react";

import { isAllowedEmbedHost } from "@/lib/embeds/match";
import type { EmbedData } from "@/lib/embeds/types";

const IFRAME_ALLOW =
  "accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture";
// Cross-origin embeds need their own origin (allow-same-origin) + scripts to
// run; the sandbox still walls them off from our page/cookies.
const IFRAME_SANDBOX =
  "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-presentation";

interface NodeAttrs {
  url: string;
  provider: string | null;
  kind: string | null;
  title: string | null;
  embedUrl: string | null;
  aspectRatio: number | null;
  fixedHeight: number | null;
  thumbnailUrl: string | null;
  providerLabel: string | null;
}

export function EmbedView(props: NodeViewProps) {
  const { editor, node, updateAttributes, deleteNode, selected } = props;
  const attrs = node.attrs as NodeAttrs;
  const editable = editor.isEditable;

  const url = typeof attrs.url === "string" ? attrs.url : "";
  const provider = attrs.provider ?? null;

  const [inputValue, setInputValue] = useState(url);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const attemptedRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const resolve = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/embeds/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as EmbedData;
      if (!mountedRef.current) return;
      updateAttributes({
        url: data.url,
        provider: data.provider,
        kind: data.kind,
        title: data.title,
        embedUrl: data.embedUrl,
        aspectRatio: data.aspectRatio,
        fixedHeight: data.fixedHeight,
        thumbnailUrl: data.thumbnailUrl,
        providerLabel: data.providerLabel,
      });
    } catch {
      if (mountedRef.current) setError(true);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [url, updateAttributes]);

  // Auto-resolve once when we have a url but no provider yet. Read-only viewers
  // skip this and fall through to the link fallback below.
  useEffect(() => {
    if (!url || provider || !editable) return;
    if (attemptedRef.current) return;
    attemptedRef.current = true;
    void resolve();
  }, [url, provider, editable, resolve]);

  /* ---- Empty: URL input prompt (editable only) -------------------------- */
  if (!url) {
    if (!editable) return <NodeViewWrapper className="embed-node" />;
    return (
      <NodeViewWrapper className="embed-node" data-empty="true">
        <form
          className="embed-input"
          contentEditable={false}
          onSubmit={(e) => {
            e.preventDefault();
            const next = inputValue.trim();
            if (!next) return;
            attemptedRef.current = false;
            updateAttributes({ url: next, provider: null });
          }}
        >
          <Link2 className="size-4 shrink-0 text-fg-3" />
          <input
            autoFocus
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="Paste a YouTube, Loom, Figma, Vimeo, Spotify, or any link…"
            className="embed-input-field"
          />
          <button type="submit" className="embed-input-btn">
            Embed
          </button>
          <button
            type="button"
            className="embed-icon-btn"
            aria-label="Remove"
            onClick={() => deleteNode()}
          >
            <Trash2 className="size-4" />
          </button>
        </form>
      </NodeViewWrapper>
    );
  }

  /* ---- Loading ---------------------------------------------------------- */
  if (loading) {
    return (
      <NodeViewWrapper
        className="embed-node"
        data-selected={selected || undefined}
      >
        <div className="embed-status" contentEditable={false}>
          <Loader2 className="size-4 shrink-0 animate-spin text-fg-3" />
          <span className="truncate text-fg-2">{url}</span>
        </div>
      </NodeViewWrapper>
    );
  }

  /* ---- Error (editable retry) ------------------------------------------ */
  if (error) {
    return (
      <NodeViewWrapper
        className="embed-node"
        data-selected={selected || undefined}
      >
        <div className="embed-card embed-card--error" contentEditable={false}>
          <AlertCircle className="size-4 shrink-0 text-danger-500" />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium text-fg-1">
              Couldn’t load preview
            </div>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="block truncate text-[12px] text-fg-3 hover:underline"
            >
              {url}
            </a>
          </div>
          <button
            type="button"
            className="embed-text-btn"
            onClick={() => void resolve()}
          >
            Retry
          </button>
          <button
            type="button"
            className="embed-icon-btn"
            aria-label="Remove"
            onClick={() => deleteNode()}
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </NodeViewWrapper>
    );
  }

  /* ---- Resolved --------------------------------------------------------- */
  const title = attrs.title || hostnameOf(url) || "Embed";
  const providerLabel = attrs.providerLabel || hostnameOf(url) || "Link";
  const canIframe =
    attrs.kind !== "link" &&
    typeof attrs.embedUrl === "string" &&
    isAllowedEmbedHost(attrs.embedUrl);

  const actions = (
    <div className="embed-bar-actions">
      <CopyButton url={url} />
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="embed-icon-btn"
        aria-label="Open original"
      >
        <ExternalLink className="size-3.5" />
      </a>
      {editable ? (
        <button
          type="button"
          className="embed-icon-btn"
          aria-label="Remove"
          onClick={() => deleteNode()}
        >
          <Trash2 className="size-3.5" />
        </button>
      ) : null}
    </div>
  );

  if (canIframe) {
    const bodyStyle =
      attrs.fixedHeight && attrs.fixedHeight > 0
        ? { height: `${attrs.fixedHeight}px` }
        : { aspectRatio: String(attrs.aspectRatio || 16 / 9) };
    return (
      <NodeViewWrapper
        className="embed-node"
        data-selected={selected || undefined}
      >
        <figure className="embed-frame" contentEditable={false}>
          <figcaption className="embed-bar">
            <span className="embed-bar-label">{providerLabel}</span>
            {actions}
          </figcaption>
          <div className="embed-frame-body" style={bodyStyle}>
            <iframe
              src={attrs.embedUrl as string}
              title={title}
              loading="lazy"
              allow={IFRAME_ALLOW}
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              sandbox={IFRAME_SANDBOX}
            />
          </div>
        </figure>
      </NodeViewWrapper>
    );
  }

  // Link card (Linear, X, generic, or any not-yet-resolved url for viewers).
  return (
    <NodeViewWrapper className="embed-node" data-selected={selected || undefined}>
      <div className="embed-card" contentEditable={false}>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="embed-card-main"
        >
          <span className="embed-card-icon">
            <Link2 className="size-4" />
          </span>
          <span className="embed-card-text">
            <span className="embed-card-title">{title}</span>
            <span className="embed-card-url">{url}</span>
          </span>
          <span className="embed-card-badge">{providerLabel}</span>
        </a>
        {actions}
      </div>
    </NodeViewWrapper>
  );
}

function CopyButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="embed-icon-btn"
      aria-label="Copy link"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard blocked — no-op */
        }
      }}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </button>
  );
}

function hostnameOf(value: string): string {
  try {
    return new URL(value).host.replace(/^www\./, "");
  } catch {
    return "";
  }
}
