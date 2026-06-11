"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SyncStatus {
  queued: number;
  running: number;
  lastFinishedAt: string | null;
  lastError: string | null;
}

/** Drain rounds: each POST drains a deadline-bounded batch server-side, so a
 * few rounds finish any workspace without relying on the cron (dev has none). */
const ROUND_GAP_MS = 1_000;
const MAX_ROUNDS = 6;

/**
 * "Sync from PRDs" (Step 49): enqueues a workspace scan, lets the route's
 * in-request drain do the bulk of the work, then polls until the queue is
 * empty and refreshes the surface so new suggestions appear.
 */
export function SyncButton({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const pollsRef = useRef(0);

  const fetchStatus = useCallback(async (): Promise<SyncStatus | null> => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/agent/sync`);
      if (!res.ok) return null;
      return ((await res.json()) as { status: SyncStatus }).status;
    } catch {
      return null;
    }
  }, [workspaceId]);

  // Surface a stuck/failed backlog from a previous session on mount.
  useEffect(() => {
    let alive = true;
    void fetchStatus().then((s) => {
      if (!alive || !s) return;
      if (s.queued + s.running > 0) setNote(`${s.queued + s.running} queued`);
      else if (s.lastError) setNote("Last sync had errors");
    });
    return () => {
      alive = false;
    };
  }, [fetchStatus]);

  async function sync() {
    setSyncing(true);
    setNote(null);
    try {
      let status: SyncStatus | null = null;
      pollsRef.current = 0;
      // Each POST enqueues (deduped) and drains a server-side batch; repeat
      // until the queue is empty so dev — which has no cron — still finishes.
      do {
        if (pollsRef.current > 0) {
          setNote(`${status!.queued + status!.running} queued…`);
          await new Promise((r) => setTimeout(r, ROUND_GAP_MS));
        }
        pollsRef.current++;
        const res = await fetch(`/api/workspaces/${workspaceId}/agent/sync`, {
          method: "POST",
        });
        const data: { status?: SyncStatus; error?: string } = await res
          .json()
          .catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Sync failed.");
        status = data.status ?? null;
      } while (
        status &&
        status.queued + status.running > 0 &&
        pollsRef.current < MAX_ROUNDS
      );

      if (status && status.queued + status.running > 0) {
        setNote("Still syncing in the background…");
      } else {
        setNote(status?.lastError ? "Synced with errors" : "Synced");
      }
      router.refresh();
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {note ? <span className="text-[11px] text-fg-4">{note}</span> : null}
      <Button
        variant="outline"
        size="sm"
        onClick={sync}
        disabled={syncing}
        title="Scan all PRDs and suggest features & links"
      >
        <RefreshCw className={cn(syncing && "animate-spin")} />
        {syncing ? "Syncing…" : "Sync from PRDs"}
      </Button>
    </div>
  );
}
