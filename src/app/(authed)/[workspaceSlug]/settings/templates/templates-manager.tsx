"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { deleteTemplateAction, publishTemplateAction } from "./actions";

interface PageOpt {
  id: string;
  title: string;
}
interface TemplateRow {
  id: string;
  name: string;
  description: string | null;
}
interface Props {
  workspaceSlug: string;
  pages: PageOpt[];
  templates: TemplateRow[];
}

export function TemplatesManager({ workspaceSlug, pages, templates }: Props) {
  const [pageId, setPageId] = useState(pages[0]?.id ?? "");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, start] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [delPending, startDelete] = useTransition();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create a template</CardTitle>
          <CardDescription>
            Publish any page as a reusable workspace template. New pages can
            start from it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pages.length === 0 ? (
            <p className="text-[13px] text-fg-3">
              Create a page first, then come back to turn it into a template.
            </p>
          ) : (
            <form
              id="publish-template"
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                setError(null);
                setOk(false);
                start(async () => {
                  const res = await publishTemplateAction(
                    workspaceSlug,
                    pageId,
                    name,
                    description,
                  );
                  if (!res.ok) {
                    setError(
                      res.error ??
                        res.fieldErrors?.name ??
                        res.fieldErrors?.pageId ??
                        "Failed",
                    );
                  } else {
                    setOk(true);
                    setName("");
                    setDescription("");
                  }
                });
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="tpl-page">Base page</Label>
                <select
                  id="tpl-page"
                  value={pageId}
                  onChange={(e) => setPageId(e.target.value)}
                  className="h-9 w-full rounded-[var(--radius-md)] border bg-background px-2 text-[13px] text-fg-1 focus:border-ring focus:outline-none"
                >
                  {pages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title || "Untitled"}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tpl-name">Template name</Label>
                <Input
                  id="tpl-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={80}
                  placeholder="e.g. Sprint planning doc"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tpl-desc">Description (optional)</Label>
                <Input
                  id="tpl-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={160}
                  placeholder="What's this template for?"
                />
              </div>
              {error ? <p className="text-xs text-destructive">{error}</p> : null}
              {ok ? <p className="text-xs text-muted-foreground">Template created.</p> : null}
            </form>
          )}
        </CardContent>
        {pages.length > 0 ? (
          <CardFooter>
            <Button
              type="submit"
              form="publish-template"
              disabled={pending || !pageId || name.trim().length === 0}
            >
              {pending ? "Creating…" : "Create template"}
            </Button>
          </CardFooter>
        ) : null}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Workspace templates</CardTitle>
          <CardDescription>
            Custom templates available to everyone in this workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {templates.length === 0 ? (
            <p className="text-[13px] text-fg-3">No custom templates yet.</p>
          ) : (
            <ul className="divide-y">
              {templates.map((t) => (
                <li
                  key={t.id}
                  className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="text-[14px] font-medium text-fg-1">{t.name}</p>
                    {t.description ? (
                      <p className="text-[12px] text-fg-3">{t.description}</p>
                    ) : null}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    disabled={delPending && deletingId === t.id}
                    onClick={() => {
                      setDeletingId(t.id);
                      startDelete(async () => {
                        const res = await deleteTemplateAction(workspaceSlug, t.id);
                        if (!res.ok) alert(res.error ?? "Failed");
                      });
                    }}
                  >
                    {delPending && deletingId === t.id ? "Deleting…" : "Delete"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
