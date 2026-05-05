"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SignInFormProps {
  googleEnabled: boolean;
  emailEnabled: boolean;
  callbackUrl?: string;
}

export function SignInForm({ googleEnabled, emailEnabled, callbackUrl }: SignInFormProps) {
  const [submitting, setSubmitting] = useState<"email" | "google" | null>(null);

  return (
    <div className="space-y-4">
      {emailEnabled ? (
        <form
          action="/api/auth/signin/resend"
          method="post"
          className="space-y-3"
          onSubmit={() => setSubmitting("email")}
        >
          <input type="hidden" name="callbackUrl" value={callbackUrl ?? "/"} />
          <CsrfTokenInput />
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@company.com"
            />
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={submitting !== null}
          >
            {submitting === "email" ? "Sending magic link…" : "Send magic link"}
          </Button>
        </form>
      ) : null}

      {emailEnabled && googleEnabled ? (
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">or</span>
          </div>
        </div>
      ) : null}

      {googleEnabled ? (
        <form
          action="/api/auth/signin/google"
          method="post"
          onSubmit={() => setSubmitting("google")}
        >
          <input type="hidden" name="callbackUrl" value={callbackUrl ?? "/"} />
          <CsrfTokenInput />
          <Button
            type="submit"
            variant="outline"
            className="w-full"
            disabled={submitting !== null}
          >
            {submitting === "google" ? "Redirecting…" : "Continue with Google"}
          </Button>
        </form>
      ) : null}

      {!emailEnabled && !googleEnabled ? (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          No sign-in providers configured. Set <code>RESEND_API_KEY</code> for
          magic-link sign-in or <code>GOOGLE_CLIENT_ID</code> /{" "}
          <code>GOOGLE_CLIENT_SECRET</code> for Google in <code>.env.local</code>.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Auth.js requires a CSRF token on sign-in form posts. We render a hidden
 * input that the browser fetches from `/api/auth/csrf` on mount and injects
 * before the form is submittable.
 */
function CsrfTokenInput() {
  return (
    <input
      type="hidden"
      name="csrfToken"
      ref={(node) => {
        if (!node) return;
        fetch("/api/auth/csrf")
          .then((res) => res.json())
          .then((data: { csrfToken?: string }) => {
            if (data.csrfToken) node.value = data.csrfToken;
          })
          .catch(() => {
            /* ignore — server will reject the post and show the error page */
          });
      }}
    />
  );
}
