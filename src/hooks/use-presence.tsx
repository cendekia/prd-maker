"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { HocuspocusProvider } from "@hocuspocus/provider";

/**
 * One presence entry per *user* (not per tab — multi-tab users dedupe to one).
 * Mirrors the awareness `user` field set by the editor (Step 12).
 */
export interface PresenceUser {
  userId: string;
  name: string;
  color: string;
  avatarUrl: string | null;
  isSelf: boolean;
}

interface PresenceController {
  /** Called by the editor when its HocuspocusProvider mounts/unmounts. */
  setProvider: (p: HocuspocusProvider | null) => void;
  /** Called by the editor with the local user's id so the hook can mark `isSelf`. */
  setSelfUserId: (id: string | null) => void;
}

interface PresenceContextValue extends PresenceController {
  /** Stable subscribe target for `useSyncExternalStore`. Bumps on every awareness update. */
  subscribe: (cb: () => void) => () => void;
  getSnapshot: () => PresenceUser[];
}

const PresenceContext = createContext<PresenceContextValue | null>(null);

/**
 * Wraps the workspace shell. The editor's CollabEditor registers its
 * HocuspocusProvider here on mount; the TopBar's <PresenceAvatars /> reads
 * from the same context. Solo mode (no provider) yields an empty array.
 */
export function PresenceProvider({ children }: { children: ReactNode }) {
  const providerRef = useRef<HocuspocusProvider | null>(null);
  const selfUserIdRef = useRef<string | null>(null);
  const listenersRef = useRef(new Set<() => void>());
  const cachedRef = useRef<PresenceUser[]>([]);

  const compute = useCallback((): PresenceUser[] => {
    const provider = providerRef.current;
    if (!provider) return [];
    const states = provider.awareness?.getStates();
    if (!states) return [];
    const selfId = selfUserIdRef.current;

    // Awareness keys are clientIDs (per-tab). Dedupe by userId — first-seen wins.
    const seen = new Map<string, PresenceUser>();
    states.forEach((state) => {
      const user = (state as { user?: Record<string, unknown> }).user;
      if (!user) return;
      const userId = typeof user.userId === "string" ? user.userId : null;
      const name = typeof user.name === "string" ? user.name : null;
      const color = typeof user.color === "string" ? user.color : "#888";
      const avatarUrl = typeof user.avatarUrl === "string" ? user.avatarUrl : null;
      if (!userId || !name) return;
      if (seen.has(userId)) return;
      seen.set(userId, {
        userId,
        name,
        color,
        avatarUrl,
        isSelf: userId === selfId,
      });
    });

    // Self first, then alphabetical by name for stability.
    return [...seen.values()].sort((a, b) => {
      if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, []);

  const refresh = useCallback(() => {
    cachedRef.current = compute();
    listenersRef.current.forEach((cb) => cb());
  }, [compute]);

  const subscribe = useCallback((cb: () => void) => {
    listenersRef.current.add(cb);
    return () => {
      listenersRef.current.delete(cb);
    };
  }, []);

  const getSnapshot = useCallback(() => cachedRef.current, []);

  // Bind/unbind awareness listener whenever the provider changes.
  const attachAwareness = useCallback(
    (provider: HocuspocusProvider | null) => {
      if (!provider?.awareness) return () => {};
      const onUpdate = () => refresh();
      provider.awareness.on("update", onUpdate);
      // Initial snapshot on attach.
      refresh();
      return () => {
        provider.awareness?.off("update", onUpdate);
      };
    },
    [refresh],
  );

  const detachRef = useRef<(() => void) | null>(null);

  const setProvider = useCallback(
    (p: HocuspocusProvider | null) => {
      // Tear down the previous provider's listener BEFORE swapping refs so
      // any in-flight update from the old provider doesn't read the new ref.
      detachRef.current?.();
      detachRef.current = null;
      providerRef.current = p;
      if (p) {
        detachRef.current = attachAwareness(p);
      } else {
        cachedRef.current = [];
        listenersRef.current.forEach((cb) => cb());
      }
    },
    [attachAwareness],
  );

  const setSelfUserId = useCallback(
    (id: string | null) => {
      selfUserIdRef.current = id;
      refresh();
    },
    [refresh],
  );

  // Cleanup if the whole context unmounts (workspace navigation, etc.).
  useEffect(() => {
    return () => {
      detachRef.current?.();
      detachRef.current = null;
      providerRef.current = null;
    };
  }, []);

  const value = useMemo<PresenceContextValue>(
    () => ({ setProvider, setSelfUserId, subscribe, getSnapshot }),
    [setProvider, setSelfUserId, subscribe, getSnapshot],
  );

  return (
    <PresenceContext.Provider value={value}>
      {children}
    </PresenceContext.Provider>
  );
}

/** TopBar / avatar consumer. Returns [] when no provider is registered. */
export function usePresence(): PresenceUser[] {
  const ctx = useContext(PresenceContext);
  // useSyncExternalStore must be called unconditionally; supply no-op fallbacks.
  const noop = useNoopStore();
  return useSyncExternalStore(
    ctx?.subscribe ?? noop.subscribe,
    ctx?.getSnapshot ?? noop.getSnapshot,
    ctx?.getSnapshot ?? noop.getSnapshot,
  );
}

/** Editor side — register the active HocuspocusProvider + the local user id. */
export function usePresenceController(): PresenceController {
  const ctx = useContext(PresenceContext);
  const fallback = useMemo<PresenceController>(
    () => ({ setProvider: () => {}, setSelfUserId: () => {} }),
    [],
  );
  return ctx ?? fallback;
}

/* --- internal helpers --------------------------------------------------- */

function useNoopStore() {
  const empty = useRef<PresenceUser[]>([]).current;
  return useMemo(
    () => ({
      subscribe: () => () => {},
      getSnapshot: () => empty,
    }),
    [empty],
  );
}
