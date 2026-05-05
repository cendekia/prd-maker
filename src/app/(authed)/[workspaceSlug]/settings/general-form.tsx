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

import {
  changeSlugAction,
  deleteWorkspaceAction,
  renameWorkspaceAction,
} from "./actions";

interface Props {
  workspaceSlug: string;
  initialName: string;
  initialSlug: string;
  isOwner: boolean;
}

export function GeneralForm({ workspaceSlug, initialName, initialSlug, isOwner }: Props) {
  const [name, setName] = useState(initialName);
  const [slug, setSlug] = useState(initialSlug);
  const [confirmName, setConfirmName] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [renameOk, setRenameOk] = useState(false);
  const [renamePending, startRename] = useTransition();
  const [slugPending, startSlug] = useTransition();
  const [deletePending, startDelete] = useTransition();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Workspace name</CardTitle>
          <CardDescription>The name displayed to your team.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            id="rename-form"
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              setRenameError(null);
              setRenameOk(false);
              startRename(async () => {
                const res = await renameWorkspaceAction(workspaceSlug, name);
                if (!res.ok) setRenameError(res.error ?? res.fieldErrors?.name ?? "Failed");
                else setRenameOk(true);
              });
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="ws-name">Name</Label>
              <Input
                id="ws-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!isOwner}
                maxLength={60}
              />
            </div>
            {renameError ? (
              <p className="text-xs text-destructive">{renameError}</p>
            ) : null}
            {renameOk ? (
              <p className="text-xs text-muted-foreground">Saved.</p>
            ) : null}
          </form>
        </CardContent>
        <CardFooter>
          <Button
            type="submit"
            form="rename-form"
            disabled={!isOwner || renamePending || name === initialName}
          >
            {renamePending ? "Saving…" : "Save name"}
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">URL slug</CardTitle>
          <CardDescription>
            Changing the slug updates the URL of every page in this workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            id="slug-form"
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              setSlugError(null);
              startSlug(async () => {
                const res = await changeSlugAction(workspaceSlug, slug);
                if (res && !res.ok) setSlugError(res.error ?? res.fieldErrors?.slug ?? "Failed");
              });
            }}
          >
            <div className="flex items-stretch overflow-hidden rounded-[var(--radius-md)] border bg-background shadow-[var(--shadow-xs)] focus-within:border-ring focus-within:shadow-[var(--shadow-focus)]">
              <span className="flex items-center bg-bg-subtle px-3 text-[12px] text-fg-3 border-r">
                prdmaker.app/
              </span>
              <input
                id="ws-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase())}
                disabled={!isOwner}
                maxLength={40}
                pattern="[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?"
                className="h-9 w-full bg-transparent px-3 text-[13px] text-fg-1 placeholder:text-fg-4 focus:outline-none disabled:opacity-50"
              />
            </div>
            {slugError ? (
              <p className="text-[12px] text-destructive">{slugError}</p>
            ) : null}
          </form>
        </CardContent>
        <CardFooter>
          <Button
            type="submit"
            form="slug-form"
            variant="outline"
            disabled={!isOwner || slugPending || slug === initialSlug}
          >
            {slugPending ? "Updating…" : "Change slug"}
          </Button>
        </CardFooter>
      </Card>

      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-base text-destructive">Danger zone</CardTitle>
          <CardDescription>
            Deleting the workspace permanently removes all pages, comments, and
            members. This cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            id="delete-form"
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              setDeleteError(null);
              startDelete(async () => {
                const res = await deleteWorkspaceAction(workspaceSlug, confirmName);
                if (res && !res.ok)
                  setDeleteError(res.error ?? res.fieldErrors?.confirm ?? "Failed");
              });
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="confirm-name">
                Type <span className="font-mono">{initialName}</span> to confirm
              </Label>
              <Input
                id="confirm-name"
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                disabled={!isOwner}
              />
            </div>
            {deleteError ? (
              <p className="text-xs text-destructive">{deleteError}</p>
            ) : null}
          </form>
        </CardContent>
        <CardFooter>
          <Button
            type="submit"
            form="delete-form"
            variant="destructive"
            disabled={!isOwner || deletePending || confirmName !== initialName}
          >
            {deletePending ? "Deleting…" : "Delete workspace"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
