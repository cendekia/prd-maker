"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";

import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "system", label: "System", Icon: Monitor },
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
] as const;

interface Props {
  className?: string;
  /** "compact" = icon-only segmented control; "full" = labeled segments. */
  variant?: "compact" | "full";
}

export function ThemeToggle({ className, variant = "compact" }: Props) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // next-themes is hydration-safe only after mount: render a placeholder of
  // the same dimensions on the server to avoid mismatch.
  useEffect(() => setMounted(true), []);

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn(
        "inline-flex items-center gap-px rounded-[var(--radius-md)] border bg-bg-subtle p-0.5",
        className,
      )}
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = mounted && theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            onClick={() => setTheme(value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1 text-[12px] font-medium transition-colors",
              active
                ? "bg-background text-fg-1 shadow-[var(--shadow-xs)]"
                : "text-fg-3 hover:text-fg-1",
            )}
          >
            <Icon className="size-3.5" />
            {variant === "full" ? <span>{label}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
