"use client";

import { Node, mergeAttributes, type RawCommands } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { FileText } from "lucide-react";

export interface PageLinkAttrs {
  pageId: string;
  title: string;
  workspaceSlug: string;
}

export interface PageLinkOptions {
  /** Workspace slug used to build the chip's href. Set when the editor is
   *  instantiated for a known workspace. */
  workspaceSlug: string;
  HTMLAttributes: Record<string, unknown>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pageLink: {
      insertPageLink: (attrs: { pageId: string; title: string }) => ReturnType;
    };
  }
}

export const PageLink = Node.create<PageLinkOptions>({
  name: "pageLink",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return {
      workspaceSlug: "",
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      pageId: { default: null },
      title: { default: "Untitled" },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'a[data-type="page-link"]',
        getAttrs: (el) => ({
          pageId: (el as HTMLElement).getAttribute("data-page-id"),
          title: (el as HTMLElement).getAttribute("data-title") ?? "Untitled",
        }),
      },
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    const slug = this.options.workspaceSlug;
    return [
      "a",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-type": "page-link",
        "data-page-id": node.attrs.pageId,
        "data-title": node.attrs.title,
        href: slug ? `/${slug}/p/${node.attrs.pageId}` : "#",
        class: "page-link-chip",
      }),
      `[[${node.attrs.title}]]`,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(PageLinkChip);
  },

  addCommands() {
    return {
      insertPageLink:
        (attrs) =>
        ({ chain }) => {
          return chain()
            .insertContent({
              type: this.name,
              attrs,
            })
            .insertContent(" ")
            .run();
        },
    } as Partial<RawCommands>;
  },
});

function PageLinkChip(props: NodeViewProps) {
  const { pageId, title } = props.node.attrs as PageLinkAttrs;
  const slug = (props.extension.options as PageLinkOptions).workspaceSlug;
  const href = slug ? `/${slug}/p/${pageId}` : "#";

  function onClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (props.editor.isEditable) {
      e.preventDefault();
      // Inside the editor, only navigate on Cmd/Ctrl-click — otherwise we'd
      // fight with text selection and caret positioning.
      if (e.metaKey || e.ctrlKey) {
        window.location.href = href;
      }
    }
  }

  return (
    <NodeViewWrapper as="span" className="page-link-chip-wrapper">
      <a
        href={href}
        onClick={onClick}
        className="page-link-chip"
        contentEditable={false}
      >
        <FileText className="size-3" />
        <span>{title || "Untitled"}</span>
      </a>
    </NodeViewWrapper>
  );
}
