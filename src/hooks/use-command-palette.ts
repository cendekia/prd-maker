"use client";

import { createContext, useContext } from "react";

export interface CommandPaletteApi {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

export const CommandPaletteContext = createContext<CommandPaletteApi | null>(
  null,
);

export function useCommandPalette(): CommandPaletteApi {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) {
    throw new Error("useCommandPalette must be used inside CommandPaletteProvider");
  }
  return ctx;
}
