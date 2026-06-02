"use client";

import { Node, mergeAttributes, type RawCommands } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { matchEmbedProvider } from "@/lib/embeds/match";

import { EmbedView } from "./embed-view";

export interface EmbedAttrs {
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

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    embed: {
      /** Insert an embed block. Pass `{ url: "" }` for an empty prompt, or a
       *  pasted URL to resolve. Resolved metadata is filled in by the node
       *  view via /api/embeds/resolve. */
      setEmbed: (attrs: { url: string } & Partial<EmbedAttrs>) => ReturnType;
    };
  }
}

/** Build an attribute spec that round-trips a string through a data-* attr. */
function stringAttr(dataName: string) {
  return {
    default: null as string | null,
    parseHTML: (el: HTMLElement) => el.getAttribute(dataName),
    renderHTML: (attrs: Record<string, unknown>) => {
      const key = dataNameToAttrKey(dataName);
      const value = attrs[key];
      return typeof value === "string" && value ? { [dataName]: value } : {};
    },
  };
}

/** Build an attribute spec that round-trips a number through a data-* attr. */
function numberAttr(dataName: string) {
  return {
    default: null as number | null,
    parseHTML: (el: HTMLElement) => {
      const raw = el.getAttribute(dataName);
      if (raw == null) return null;
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    },
    renderHTML: (attrs: Record<string, unknown>) => {
      const key = dataNameToAttrKey(dataName);
      const value = attrs[key];
      return typeof value === "number" && Number.isFinite(value)
        ? { [dataName]: String(value) }
        : {};
    },
  };
}

/** "data-embed-url" -> "embedUrl" (the attribute key on the node). */
function dataNameToAttrKey(dataName: string): string {
  return dataName
    .replace(/^data-/, "")
    .replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

const EmbedPastePluginKey = new PluginKey("embedPaste");

/**
 * Block-level `embed` node (Step 31). Atomic — its body is a React node view
 * (`EmbedView`) that resolves a URL to a sandboxed iframe or a link card.
 * Pasting a bare, known-provider URL on an empty selection auto-inserts one.
 */
export const Embed = Node.create({
  name: "embed",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,
  isolating: true,

  addOptions() {
    return { HTMLAttributes: {} };
  },

  addAttributes() {
    return {
      url: {
        default: "",
        parseHTML: (el: HTMLElement) => el.getAttribute("data-url") ?? "",
        renderHTML: (attrs: Record<string, unknown>) =>
          typeof attrs.url === "string" && attrs.url ? { "data-url": attrs.url } : {},
      },
      provider: stringAttr("data-provider"),
      kind: stringAttr("data-kind"),
      title: stringAttr("data-title"),
      embedUrl: stringAttr("data-embed-url"),
      thumbnailUrl: stringAttr("data-thumbnail-url"),
      providerLabel: stringAttr("data-provider-label"),
      aspectRatio: numberAttr("data-aspect-ratio"),
      fixedHeight: numberAttr("data-fixed-height"),
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="embed"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    // Serialized form (getHTML / clipboard). The render surfaces don't use
    // this — they read JSON — but we emit a usable link fallback so copying an
    // embed out of the editor still carries the URL.
    const url = typeof node.attrs.url === "string" ? node.attrs.url : "";
    const label =
      (typeof node.attrs.title === "string" && node.attrs.title) || url || "Embed";
    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-type": "embed",
      }),
      [
        "a",
        { href: url || "#", target: "_blank", rel: "noopener noreferrer nofollow" },
        label,
      ],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(EmbedView);
  },

  addCommands() {
    return {
      setEmbed:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    } as Partial<RawCommands>;
  },

  addProseMirrorPlugins() {
    const type = this.type;
    return [
      new Plugin({
        key: EmbedPastePluginKey,
        props: {
          handlePaste: (view, event) => {
            const text = event.clipboardData?.getData("text/plain")?.trim();
            if (!text || /\s/.test(text)) return false;
            if (!/^https?:\/\//i.test(text)) return false;
            // Only auto-embed known providers; arbitrary links stay links.
            if (!matchEmbedProvider(text)) return false;
            // Don't hijack "paste over selected text" — that's link-on-paste.
            if (!view.state.selection.empty) return false;

            const node = type.create({ url: text });
            const tr = view.state.tr.replaceSelectionWith(node);
            view.dispatch(tr.scrollIntoView());
            return true;
          },
        },
      }),
    ];
  },
});
