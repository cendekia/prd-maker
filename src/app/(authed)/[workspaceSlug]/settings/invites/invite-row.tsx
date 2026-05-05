"use client";

import { useState, useTransition } from "react";
import { Role } from "@prisma/client";

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

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{invite.email}</p>
        <p className="truncate text-xs text-muted-foreground">
          {invite.role.toLowerCase()} · expires {expiresStr}
        </p>
      </div>
      <div className="flex items-center gap-2">
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
        <p className="basis-full text-xs text-destructive">{error}</p>
      ) : null}
    </div>
  );
}
