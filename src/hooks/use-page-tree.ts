"use client";

import useSWR from "swr";

import type { PageTreeNode } from "@/lib/types";

interface TreeResponse {
  tree: PageTreeNode[];
}

const fetcher = async (url: string): Promise<TreeResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return res.json();
};

export interface CreatePageInput {
  parentId?: string | null;
  title?: string;
  templateId?: string | null;
}

export interface MovePageInput {
  newParentId: string | null;
  beforeId?: string | null;
  afterId?: string | null;
}

export function usePageTree(workspaceId: string, initialTree: PageTreeNode[]) {
  const key = `/api/workspaces/${workspaceId}/pages`;
  const swr = useSWR<TreeResponse>(key, fetcher, {
    fallbackData: { tree: initialTree },
    revalidateOnFocus: false,
  });

  async function createPage(
    input: CreatePageInput = {},
  ): Promise<{ id: string; templateMissing: boolean }> {
    const res = await fetch(key, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? `Create failed: ${res.status}`);
    }
    const data = (await res.json()) as {
      page: { id: string };
      /** True when the picked template vanished and a blank page was created. */
      templateMissing?: boolean;
    };
    await swr.mutate();
    return { id: data.page.id, templateMissing: !!data.templateMissing };
  }

  async function renamePage(pageId: string, title: string): Promise<void> {
    const res = await fetch(`${key}/${pageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? `Rename failed: ${res.status}`);
    }
    await swr.mutate();
  }

  async function archivePage(pageId: string): Promise<void> {
    const res = await fetch(`${key}/${pageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: true }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? `Archive failed: ${res.status}`);
    }
    await swr.mutate();
  }

  async function movePage(pageId: string, input: MovePageInput): Promise<void> {
    const res = await fetch(`${key}/${pageId}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? `Move failed: ${res.status}`);
    }
    await swr.mutate();
  }

  return {
    tree: swr.data?.tree ?? [],
    isLoading: swr.isLoading,
    error: swr.error,
    mutate: swr.mutate,
    createPage,
    renamePage,
    archivePage,
    movePage,
  };
}
