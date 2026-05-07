"use client";

import { Mark, mergeAttributes, type RawCommands } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    comment: {
      setComment: (commentId: string) => ReturnType;
      unsetComment: (commentId: string) => ReturnType;
    };
  }
}

export interface CommentMarkAttrs {
  commentId: string;
}

/**
 * Inline mark wrapping the text range a comment is anchored to. The mark
 * persists through Yjs collab — the CRDT keeps the marked range in sync as
 * any user edits, so we don't store positions in the DB once the mark exists.
 *
 * On click in the editor we dispatch a CustomEvent('prdmaker:comment-click',
 * { detail: { commentId } }) on the document. The CommentsRail listens for it
 * to scroll to and highlight the matching thread.
 */
export const CommentMark = Mark.create({
  name: "comment",

  // Allow multiple overlapping comments on the same range — different
  // commentIds get distinct marks even if they wrap the same text.
  excludes: "",
  inclusive: false,

  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).getAttribute("data-comment-id"),
        renderHTML: (attrs) => {
          const id = (attrs as CommentMarkAttrs).commentId;
          return id ? { "data-comment-id": id } : {};
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-comment-id]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { class: "tiptap-comment" }),
      0,
    ];
  },

  addCommands() {
    return {
      setComment:
        (commentId: string) =>
        ({ commands }) => {
          if (!commentId) return false;
          return commands.setMark(this.name, { commentId });
        },
      unsetComment:
        (commentId: string) =>
        ({ tr, state, dispatch }) => {
          if (!commentId) return false;
          // Walk the doc and remove ANY range marked with this commentId.
          let touched = false;
          state.doc.descendants((node, pos) => {
            const mark = node.marks.find(
              (m) => m.type.name === this.name && m.attrs.commentId === commentId,
            );
            if (mark) {
              tr.removeMark(pos, pos + node.nodeSize, mark);
              touched = true;
            }
          });
          if (touched && dispatch) dispatch(tr);
          return touched;
        },
    } as Partial<RawCommands>;
  },
});
