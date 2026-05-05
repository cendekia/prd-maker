"use client";

import { useState, useTransition } from "react";
import { Role } from "@prisma/client";

import { Button } from "@/components/ui/button";

import {
  changeMemberRoleAction,
  removeMemberAction,
} from "../actions";

interface Member {
  id: string;
  role: Role;
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
}

interface Props {
  workspaceSlug: string;
  member: Member;
  currentUserId: string;
  viewerIsOwner: boolean;
}

export function MemberRow({ workspaceSlug, member, currentUserId, viewerIsOwner }: Props) {
  const [role, setRole] = useState<Role>(member.role);
  const [error, setError] = useState<string | null>(null);
  const [pendingRole, startRole] = useTransition();
  const [pendingRemove, startRemove] = useTransition();

  const isSelf = member.user.id === currentUserId;
  const canChangeRole = viewerIsOwner && !isSelf;
  const canRemove = viewerIsOwner || isSelf;

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar
          name={member.user.name ?? member.user.email}
          src={member.user.image}
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {member.user.name ?? member.user.email}
            {isSelf ? (
              <span className="ml-2 text-xs text-muted-foreground">(you)</span>
            ) : null}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {member.user.email}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <select
          aria-label="Role"
          value={role}
          disabled={!canChangeRole || pendingRole}
          onChange={(e) => {
            const next = e.target.value as Role;
            setError(null);
            setRole(next);
            startRole(async () => {
              const res = await changeMemberRoleAction(
                workspaceSlug,
                member.id,
                next,
              );
              if (!res.ok) {
                setError(res.error ?? "Failed");
                setRole(member.role);
              }
            });
          }}
          className="h-8 rounded-md border bg-transparent px-2 text-xs"
        >
          <option value="OWNER">Owner</option>
          <option value="EDITOR">Editor</option>
          <option value="VIEWER">Viewer</option>
        </select>
        {canRemove ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={pendingRemove}
            onClick={() => {
              if (
                !confirm(
                  isSelf
                    ? "Leave this workspace?"
                    : `Remove ${member.user.name ?? member.user.email}?`,
                )
              )
                return;
              setError(null);
              startRemove(async () => {
                const res = await removeMemberAction(workspaceSlug, member.id);
                if (res && !res.ok) setError(res.error ?? "Failed");
              });
            }}
          >
            {pendingRemove ? "…" : isSelf ? "Leave" : "Remove"}
          </Button>
        ) : null}
      </div>
      {error ? (
        <p className="basis-full text-xs text-destructive">{error}</p>
      ) : null}
    </div>
  );
}

function Avatar({ name, src }: { name: string; src: string | null }) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        className="h-8 w-8 rounded-full bg-muted object-cover"
      />
    );
  }
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
      {initials || "?"}
    </div>
  );
}
