"use client";

import { useMemo } from "react";

import { diffDocs, type DiffLine } from "@/lib/diff";
import { cn } from "@/lib/utils";

interface Props {
  /** The selected historical snapshot's JSON. */
  leftJson: unknown;
  /** The current document JSON. */
  rightJson: unknown;
  leftLabel: string;
  rightLabel: string;
}

export function DiffView({ leftJson, rightJson, leftLabel, rightLabel }: Props) {
  const { left, right } = useMemo(
    () => diffDocs(leftJson, rightJson),
    [leftJson, rightJson],
  );

  const noChanges =
    left.every((l) => l.op === "equal") && right.every((r) => r.op === "equal");

  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-2 border-b text-[11px] font-medium uppercase tracking-wide text-fg-3">
        <div className="border-r px-3 py-2">{leftLabel}</div>
        <div className="px-3 py-2">{rightLabel}</div>
      </div>
      {noChanges ? (
        <div className="flex flex-1 items-center justify-center px-6 py-12 text-[12px] text-fg-3">
          No textual differences between these versions.
        </div>
      ) : (
        <div className="grid flex-1 grid-cols-2 overflow-auto">
          <DiffColumn lines={left} side="left" />
          <DiffColumn lines={right} side="right" />
        </div>
      )}
    </div>
  );
}

function DiffColumn({
  lines,
  side,
}: {
  lines: DiffLine[];
  side: "left" | "right";
}) {
  return (
    <div
      className={cn(
        "min-h-full font-mono text-[12px] leading-[20px]",
        side === "left" && "border-r",
      )}
    >
      {lines.map((line, i) => (
        <div
          key={`${side}-${i}`}
          className={cn(
            "whitespace-pre-wrap break-words px-3",
            line.op === "delete" &&
              "bg-[oklch(0.577_0.245_27.325_/_0.12)] text-destructive",
            line.op === "insert" &&
              "bg-[oklch(0.62_0.17_145_/_0.14)] text-[oklch(0.42_0.17_145)]",
            line.op === "equal" && "text-fg-2",
            line.text === "" && "min-h-[20px]",
          )}
        >
          {line.text || " "}
        </div>
      ))}
    </div>
  );
}
