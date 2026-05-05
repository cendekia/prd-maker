import * as React from "react";

import { cn } from "@/lib/utils";

type Size = "xs" | "sm" | "md" | "lg" | "xl";

const SIZE_PX: Record<Size, number> = {
  xs: 20,
  sm: 24,
  md: 28,
  lg: 32,
  xl: 40,
};

const TEXT_PX: Record<Size, number> = {
  xs: 9,
  sm: 10,
  md: 11,
  lg: 12,
  xl: 14,
};

interface AvatarProps {
  name: string;
  src?: string | null;
  size?: Size;
  presenceColor?: string;
  className?: string;
}

export function Avatar({
  name,
  src,
  size = "lg",
  presenceColor,
  className,
}: AvatarProps) {
  const px = SIZE_PX[size];
  const fontSize = TEXT_PX[size];
  const initials = getInitials(name);

  const ringStyle: React.CSSProperties = presenceColor
    ? {
        boxShadow: `0 0 0 2px var(--background)`,
        borderColor: presenceColor,
        borderWidth: 2,
      }
    : {
        boxShadow: `0 0 0 1px var(--border)`,
      };

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        width={px}
        height={px}
        className={cn("rounded-full object-cover bg-bg-muted", className)}
        style={{ ...ringStyle, borderStyle: "solid" }}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex items-center justify-center rounded-full bg-gradient-to-br from-neutral-200 to-neutral-300 font-semibold text-fg-2",
        className,
      )}
      style={{
        width: px,
        height: px,
        fontSize,
        ...ringStyle,
        borderStyle: presenceColor ? "solid" : undefined,
        background:
          "linear-gradient(135deg, var(--neutral-200), var(--neutral-300))",
      }}
    >
      {initials}
    </span>
  );
}

interface AvatarStackProps {
  members: Array<{ name: string; src?: string | null; presenceColor?: string }>;
  size?: Size;
  max?: number;
  className?: string;
}

export function AvatarStack({
  members,
  size = "md",
  max = 4,
  className,
}: AvatarStackProps) {
  const visible = members.slice(0, max);
  const overflow = members.length - visible.length;
  const offset = -8;

  return (
    <div className={cn("flex items-center", className)}>
      {visible.map((m, i) => (
        <div key={i} style={{ marginLeft: i === 0 ? 0 : offset, zIndex: 100 - i }}>
          <Avatar
            name={m.name}
            src={m.src}
            size={size}
            presenceColor={m.presenceColor}
          />
        </div>
      ))}
      {overflow > 0 ? (
        <span className="ml-1.5 text-xs font-medium text-fg-3">
          +{overflow}
        </span>
      ) : null}
    </div>
  );
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Round-robin presence color from the design system's 6-color set. */
export function presenceColorFor(seed: string): string {
  const colors = [
    "var(--presence-1)",
    "var(--presence-2)",
    "var(--presence-3)",
    "var(--presence-4)",
    "var(--presence-5)",
    "var(--presence-6)",
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return colors[Math.abs(hash) % colors.length];
}
