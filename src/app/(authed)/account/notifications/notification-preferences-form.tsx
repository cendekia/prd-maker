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
import { cn } from "@/lib/utils";

import { saveNotificationPreferencesAction, type NotificationPrefs } from "./actions";

const ROWS: { key: keyof NotificationPrefs; label: string; desc: string }[] = [
  { key: "emailMention", label: "Mentions", desc: "When someone @mentions you in a comment." },
  { key: "emailReply", label: "Comment replies", desc: "When someone replies to your comment thread." },
  { key: "emailShare", label: "Page shares", desc: "When a page is shared with you." },
  { key: "emailInvite", label: "Workspace invites", desc: "When you're invited to a workspace." },
];

export function NotificationPreferencesForm({ initial }: { initial: NotificationPrefs }) {
  const [prefs, setPrefs] = useState<NotificationPrefs>(initial);
  const [pending, start] = useTransition();
  const [ok, setOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(key: keyof NotificationPrefs) {
    setPrefs((p) => ({ ...p, [key]: !p[key] }));
    setOk(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Email notifications</CardTitle>
        <CardDescription>
          Choose which notifications also send you an email. In-app
          notifications always appear in your inbox.
        </CardDescription>
      </CardHeader>
      <CardContent className="divide-y">
        {ROWS.map((row) => (
          <div
            key={row.key}
            className="flex items-center justify-between gap-4 py-3 first:pt-0"
          >
            <div className="min-w-0">
              <p className="text-[14px] font-medium text-fg-1">{row.label}</p>
              <p className="text-[12px] text-fg-3">{row.desc}</p>
            </div>
            <Switch
              checked={prefs[row.key]}
              onClick={() => toggle(row.key)}
              label={`Email me about ${row.label.toLowerCase()}`}
            />
          </div>
        ))}
        {error ? <p className="pt-3 text-xs text-destructive">{error}</p> : null}
        {ok ? <p className="pt-3 text-xs text-muted-foreground">Saved.</p> : null}
      </CardContent>
      <CardFooter>
        <Button
          disabled={pending}
          onClick={() => {
            setError(null);
            start(async () => {
              const res = await saveNotificationPreferencesAction(prefs);
              if (!res.ok) setError(res.error ?? "Couldn’t save preferences.");
              else setOk(true);
            });
          }}
        >
          {pending ? "Saving…" : "Save preferences"}
        </Button>
      </CardFooter>
    </Card>
  );
}

function Switch({
  checked,
  onClick,
  label,
}: {
  checked: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-[var(--radius-full)] transition-colors",
        checked ? "bg-brand-500" : "bg-bg-active",
      )}
    >
      <span
        className={cn(
          "inline-block size-4 rounded-[var(--radius-full)] bg-white transition-transform",
          checked ? "translate-x-4" : "translate-x-0.5",
        )}
      />
    </button>
  );
}
