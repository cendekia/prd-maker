"use client";

import { useState } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { Layers, Plus, Trash2 } from "lucide-react";

import { emptyStory, type EpicStory } from "./epic-block";
import { UserStoryView } from "./user-story-view";

export function EpicBlockView({ node, updateAttributes, deleteNode, editor }: NodeViewProps) {
  const editable = editor.isEditable;
  const title = (node.attrs.title as string) ?? "";
  const summary = (node.attrs.summary as string) ?? "";
  const stories = (node.attrs.stories as EpicStory[]) ?? [];

  const [titleDraft, setTitleDraft] = useState(title);
  const [summaryDraft, setSummaryDraft] = useState(summary);

  function setStories(next: EpicStory[]) {
    updateAttributes({ stories: next });
  }
  function updateStory(id: string, patch: Partial<EpicStory>) {
    setStories(stories.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }
  function removeStory(id: string) {
    setStories(stories.filter((s) => s.id !== id));
  }
  function addStory() {
    setStories([...stories, emptyStory()]);
  }
  function moveStory(id: string, dir: -1 | 1) {
    const i = stories.findIndex((s) => s.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= stories.length) return;
    const next = [...stories];
    [next[i], next[j]] = [next[j], next[i]];
    setStories(next);
  }

  return (
    <NodeViewWrapper className="epic-node">
      <div
        className="rounded-[var(--radius-lg)] border border-border bg-bg-subtle p-4"
        contentEditable={false}
      >
        <div className="flex items-center gap-2">
          <Layers className="size-4 text-brand-500" />
          <span className="t-label">Epic</span>
          {editable ? (
            <button
              type="button"
              aria-label="Remove epic block"
              onClick={() => deleteNode()}
              className="ml-auto flex size-6 items-center justify-center rounded-[var(--radius-sm)] text-fg-3 hover:bg-bg-hover hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </button>
          ) : null}
        </div>

        {editable ? (
          <input
            aria-label="Epic title"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => titleDraft !== title && updateAttributes({ title: titleDraft })}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="Epic title"
            className="mt-2 w-full bg-transparent text-[18px] font-semibold tracking-[-0.01em] text-fg-1 placeholder:text-fg-4 focus:outline-none"
          />
        ) : (
          <h3 className="mt-2 text-[18px] font-semibold tracking-[-0.01em] text-fg-1">
            {title || "Untitled epic"}
          </h3>
        )}

        {editable ? (
          <textarea
            aria-label="Epic summary"
            value={summaryDraft}
            onChange={(e) => setSummaryDraft(e.target.value)}
            onBlur={() => summaryDraft !== summary && updateAttributes({ summary: summaryDraft })}
            onKeyDown={(e) => e.stopPropagation()}
            rows={2}
            placeholder="Goal / summary…"
            className="mt-1 w-full resize-none bg-transparent text-[14px] leading-[20px] text-fg-2 placeholder:text-fg-4 focus:outline-none"
          />
        ) : summary ? (
          <p className="mt-1 text-[14px] leading-[20px] text-fg-2">{summary}</p>
        ) : null}

        <div className="mt-3 space-y-2">
          <p className="t-label">User stories ({stories.length})</p>
          {stories.map((s) => (
            <UserStoryView
              key={s.id}
              story={s}
              editable={editable}
              onChange={(patch) => updateStory(s.id, patch)}
              onRemove={() => removeStory(s.id)}
              onMoveUp={() => moveStory(s.id, -1)}
              onMoveDown={() => moveStory(s.id, 1)}
            />
          ))}
          {stories.length === 0 ? (
            <p className="text-[13px] text-fg-3">No stories yet.</p>
          ) : null}
          {editable ? (
            <button
              type="button"
              onClick={addStory}
              className="flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1.5 text-[12px] font-medium text-brand-600 hover:bg-bg-hover"
            >
              <Plus className="size-3.5" />
              Add story
            </button>
          ) : null}
        </div>
      </div>
    </NodeViewWrapper>
  );
}
