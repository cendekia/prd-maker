"use client";

import { useState, useTransition } from "react";
import { Check, KeyRound, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import { removeAnthropicKeyAction, saveAnthropicKeyAction } from "./actions";

interface Props {
  hasKey: boolean;
  last4: string | null;
  managedAvailable: boolean;
  managedModel: string;
  byoModel: string;
}

export function ApiKeysForm({
  hasKey,
  last4,
  managedAvailable,
  managedModel,
  byoModel,
}: Props) {
  const [value, setValue] = useState("");
  const [replacing, setReplacing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [tested, setTested] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [removing, startRemove] = useTransition();

  const showForm = !hasKey || replacing;

  function reset() {
    setError(null);
    setTested(false);
  }

  async function testConnection() {
    reset();
    if (!value.trim()) {
      setError("Paste a key first.");
      return;
    }
    setTesting(true);
    try {
      const res = await fetch("/api/account/api-keys/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: value.trim() }),
      });
      const data: { ok?: boolean; error?: string } = await res.json();
      if (data.ok) setTested(true);
      else setError(data.error ?? "Couldn't verify the key.");
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setTesting(false);
    }
  }

  function save() {
    reset();
    if (!value.trim()) {
      setError("Paste a key first.");
      return;
    }
    startSave(async () => {
      const res = await saveAnthropicKeyAction(value.trim());
      if (!res.ok) {
        setError(res.error ?? "Couldn't save the key.");
        return;
      }
      setValue("");
      setReplacing(false);
      setTested(false);
    });
  }

  function remove() {
    reset();
    startRemove(async () => {
      await removeAnthropicKeyAction();
      setReplacing(false);
      setValue("");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">AI access</CardTitle>
        <CardDescription>
          {managedAvailable ? (
            <>
              Everyone gets managed AI on us (<code>{managedModel}</code>) with
              no setup, subject to your plan&apos;s monthly limit. Add your own
              Anthropic key to use the stronger <code>{byoModel}</code> and skip
              the managed limit — your key, your bill.
            </>
          ) : (
            <>
              The managed AI tier isn&apos;t configured on this server. Add your
              own Anthropic key to enable AI — it runs on{" "}
              <code>{byoModel}</code> and bills to your account.
            </>
          )}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {hasKey && !replacing ? (
          <div className="flex items-center justify-between gap-4 rounded-[var(--radius-md)] border bg-bg-subtle px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <KeyRound className="size-4 shrink-0 text-fg-3" />
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-fg-1">
                  Personal key ••••&nbsp;{last4 ?? "————"}
                </p>
                <p className="text-[12px] text-fg-3">
                  Active — requests use <code>{byoModel}</code>.
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  reset();
                  setReplacing(true);
                }}
              >
                Replace
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={removing}
                onClick={remove}
                className="text-destructive hover:text-destructive"
              >
                {removing ? "Removing…" : "Remove"}
              </Button>
            </div>
          </div>
        ) : null}

        {showForm ? (
          <div className="space-y-2.5">
            <label
              htmlFor="anthropic-key"
              className="text-[13px] font-medium text-fg-1"
            >
              Anthropic API key
            </label>
            <Input
              id="anthropic-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="sk-ant-…"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                reset();
              }}
            />
            <p className="text-[12px] text-fg-3">
              Get a key from the Anthropic Console. It&apos;s encrypted at rest
              and never shown again after saving.
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button
                variant="outline"
                disabled={testing || saving}
                onClick={testConnection}
              >
                {testing ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Testing…
                  </>
                ) : (
                  "Test connection"
                )}
              </Button>
              <Button disabled={saving || testing} onClick={save}>
                {saving ? "Saving…" : "Save key"}
              </Button>
              {replacing ? (
                <Button
                  variant="ghost"
                  disabled={saving}
                  onClick={() => {
                    setReplacing(false);
                    setValue("");
                    reset();
                  }}
                >
                  Cancel
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        {error ? (
          <p className="text-[12px] text-destructive">{error}</p>
        ) : null}
        {tested && !error ? (
          <p className="flex items-center gap-1.5 text-[12px] text-fg-2">
            <Check className="size-3.5 text-success" />
            Connection verified — click “Save key” to store it.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
