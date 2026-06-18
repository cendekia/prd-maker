"use client";

import { useState, useTransition } from "react";
import { Role } from "@prisma/client";

import { Avatar, presenceColorFor } from "@/components/ui/avatar";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ASSIGNABLE_ROLES, ROLE_LABELS } from "@/lib/roles";

import { changeMemberRoleAction, removeMemberAction } from "../actions";

const ROLE_BADGE_VARIANT: Record<Role, BadgeProps["variant"]> = {
  OWNER: "solid",
  DEV_LEAD: "accentSubtle",
  EDITOR: "muted",
  VIEWER: "subtle",
};

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
  const presence = presenceColorFor(member.user.id);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border bg-card px-3 py-2.5 shadow-[var(--shadow-xs)]">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar
          name={member.user.name ?? member.user.email}
          src={member.user.image}
          presenceColor={presence}
          size="lg"
        />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-fg-1">
            {member.user.name ?? member.user.email}
            {isSelf ? (
              <span className="ml-2 text-[11px] font-normal text-fg-3">
                (you)
              </span>
            ) : null}
          </p>
          <p className="truncate text-[12px] text-fg-3">{member.user.email}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {canChangeRole ? (
          <select
            aria-label="Role"
            value={role}
            disabled={pendingRole}
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
            className="h-7 rounded-[var(--radius-sm)] border bg-background px-2 text-[12px] text-fg-1 shadow-[var(--shadow-xs)] focus:border-ring focus:outline-none focus-visible:shadow-[var(--shadow-focus)]"
          >
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        ) : (
          <Badge variant={ROLE_BADGE_VARIANT[role]}>{ROLE_LABELS[role]}</Badge>
        )}
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
                if (!res.ok) setError(res.error ?? "Failed");
              });
            }}
          >
            {pendingRemove ? "…" : isSelf ? "Leave" : "Remove"}
          </Button>
        ) : null}
      </div>
      {error ? (
        <p className="basis-full text-[12px] text-destructive">{error}</p>
      ) : null}
    </div>
  );
}
