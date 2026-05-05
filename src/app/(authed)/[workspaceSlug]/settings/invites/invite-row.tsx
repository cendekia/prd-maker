"use client";

import { useState, useTransition } from "react";
import { Role } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { revokeInviteAction } from "../actions";

interface Invite {
  id: string;
  email: string;
  role: Role;
  acceptUrl: string;
  expiresAt: string;
}

export function InviteRow({
  workspaceSlug,
  invite,
  canRevoke,
}: {
  workspaceSlug: string;
  invite: Invite;
  canRevoke: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const expiresStr = new Date(invite.expiresAt).toLocaleDateString();
  const roleLabel = invite.role[0] + invite.role.slice(1).toLowerCase();

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border bg-card px-3 py-2.5 shadow-[var(--shadow-xs)]">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-fg-1">
          {invite.email}
        </p>
        <p className="mt-0.5 flex items-center gap-2 text-[12px] text-fg-3">
          <Badge
            variant={invite.role === Role.OWNER ? "solid" : "muted"}
            className="text-[10px]"
          >
            {roleLabel}
          </Badge>
          <span>expires {expiresStr}</span>
        </p>
      </div>
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            navigator.clipboard.writeText(invite.acceptUrl).then(
              () => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              },
              () => setError("Could not copy"),
            );
          }}
        >
          {copied ? "Copied" : "Copy link"}
        </Button>
        {canRevoke ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const res = await revokeInviteAction(workspaceSlug, invite.id);
                if (!res.ok) setError(res.error ?? "Failed");
              });
            }}
          >
            {pending ? "…" : "Revoke"}
          </Button>
        ) : null}
      </div>
      {error ? (
        <p className="basis-full text-[12px] text-destructive">{error}</p>
      ) : null}
    </div>
  );
}
