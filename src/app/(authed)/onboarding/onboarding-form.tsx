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
          <p className="text-xs text-destructive">{errors.name}</p>
        ) : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="slug">URL slug</Label>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">prdmaker.app/</span>
          <Input
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
          />
        </div>
        {errors.slug ? (
          <p className="text-xs text-destructive">{errors.slug}</p>
        ) : null}
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Creating…" : "Create workspace"}
      </Button>
    </form>
  );
}
