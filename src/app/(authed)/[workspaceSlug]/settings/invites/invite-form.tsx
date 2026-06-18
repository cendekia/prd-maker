"use client";

import { useState, useTransition } from "react";
import { Role } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ASSIGNABLE_ROLES, ROLE_LABELS } from "@/lib/roles";

import { createInviteAction } from "../actions";

export function InviteForm({ workspaceSlug }: { workspaceSlug: string }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>(Role.EDITOR);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        startTransition(async () => {
          const res = await createInviteAction(workspaceSlug, email, role);
          if (!res.ok) {
            setError(res.error ?? res.fieldErrors?.email ?? "Failed");
          } else {
            setSuccess(`Invite sent to ${email}.`);
            setEmail("");
          }
        });
      }}
    >
      <div className="flex-1 space-y-1.5">
        <Label htmlFor="invite-email">Email</Label>
        <Input
          id="invite-email"
          type="email"
          required
          placeholder="teammate@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="invite-role">Role</Label>
        <select
          id="invite-role"
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          className="h-9 rounded-md border bg-transparent px-2 text-sm"
        >
          {ASSIGNABLE_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send invite"}
      </Button>
      {error ? (
        <p className="basis-full text-xs text-destructive">{error}</p>
      ) : null}
      {success ? (
        <p className="basis-full text-xs text-muted-foreground">{success}</p>
      ) : null}
    </form>
  );
}
