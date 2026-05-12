"use client";

import { useEffect, useRef, useState } from "react";
import { Download, FileCode2, FileDown, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";

interface Props {
  pageId: string;
  /**
   * Optional accessor to the editor's live JSON. In collab mode `Page.contentJson`
   * only refreshes when the auto-snapshot fires (every ~5min), so without this
   * a freshly-pasted image won't appear in the exported file. We POST the live
   * doc to /content before triggering the download.
   */
  getContentJson?: () => unknown;
}

const FORMATS = [
  {
    id: "md" as const,
    label: "Markdown",
    sublabel: ".md",
    Icon: FileText,
  },
  {
    id: "html" as const,
    label: "HTML",
    sublabel: ".html",
    Icon: FileCode2,
  },
  {
    id: "pdf" as const,
    label: "PDF",
    sublabel: ".pdf",
    Icon: FileDown,
  },
];

export function ExportMenu({ pageId, getContentJson }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

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

  async function download(format: "md" | "html" | "pdf") {
    setBusy(format);
    try {
      await flushContent(pageId, getContentJson?.());
      const res = await fetch(`/api/pages/${pageId}/export/${format}`);
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const filename =
        parseFilename(res.headers.get("Content-Disposition")) ??
        `page.${format}`;
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setOpen(false);
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="gap-1.5"
      >
        <Download className="size-3.5" />
        Export
      </Button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-[220px] overflow-hidden rounded-[var(--radius-md)] border bg-background p-1 shadow-[var(--shadow-lg)]"
        >
          {FORMATS.map(({ id, label, sublabel, Icon }) => (
            <button
              key={id}
              role="menuitem"
              type="button"
              disabled={busy !== null}
              onClick={() => download(id)}
              className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-[12px] hover:bg-bg-hover disabled:opacity-50"
            >
              <Icon className="size-3.5 text-fg-3" />
              <span className="font-medium text-fg-1">{label}</span>
              <span className="ml-auto text-[11px] text-fg-3">
                {busy === id ? "…" : sublabel}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function parseFilename(header: string | null): string | null {
  if (!header) return null;
  const match = header.match(/filename="([^"]+)"/);
  return match ? match[1] : null;
}

/**
 * Push the editor's live JSON to the server so the export/publish reads the
 * freshest content. Best-effort: a failure here (viewer role, network blip)
 * shouldn't block the download — the server will fall back to whatever the
 * last snapshot left in `Page.contentJson`.
 */
async function flushContent(pageId: string, contentJson: unknown) {
  if (!contentJson) return;
  try {
    await fetch(`/api/pages/${pageId}/content`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentJson }),
    });
  } catch {
    // Ignore — fall back to the last persisted snapshot.
  }
}
