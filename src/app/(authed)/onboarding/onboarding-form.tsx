"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { slugify } from "@/lib/slug";

import { createWorkspaceAction } from "./actions";

export function OnboardingForm() {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<"name" | "slug", string>>>({});
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setErrors({});
        startTransition(async () => {
          const result = await createWorkspaceAction({ name, slug });
          if (!result.ok) {
            setErrors(result.fieldErrors ?? {});
          }
        });
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="name">Workspace name</Label>
        <Input
          id="name"
          name="name"
          value={name}
          onChange={(e) => {
            const v = e.target.value;
            setName(v);
            if (!slugTouched) setSlug(slugify(v));
          }}
          required
          maxLength={60}
          placeholder="Acme Co."
        />
        {errors.name ? (
          <p className="text-[12px] text-destructive">{errors.name}</p>
        ) : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="slug">URL slug</Label>
        <div className="flex items-stretch overflow-hidden rounded-[var(--radius-md)] border bg-background shadow-[var(--shadow-xs)] focus-within:border-ring focus-within:shadow-[var(--shadow-focus)]">
          <span className="flex items-center bg-bg-subtle px-3 text-[12px] text-fg-3 border-r">
            prdmaker.app/
          </span>
          <input
            id="slug"
            name="slug"
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value.toLowerCase());
            }}
            required
            pattern="[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?"
            maxLength={40}
            placeholder="acme"
            className="h-9 w-full bg-transparent px-3 text-[13px] text-fg-1 placeholder:text-fg-4 focus:outline-none"
          />
        </div>
        {errors.slug ? (
          <p className="text-[12px] text-destructive">{errors.slug}</p>
        ) : null}
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Creating…" : "Create workspace"}
      </Button>
    </form>
  );
}
