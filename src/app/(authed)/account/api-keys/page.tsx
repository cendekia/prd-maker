import { env } from "@/env";
import { AI_MODELS } from "@/lib/config";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/workspace";

import { ApiKeysForm } from "./api-keys-form";

export const metadata = { title: "API keys — Account" };

export default async function AccountApiKeysPage() {
  const user = await requireUser();
  const row = await db.user.findUnique({
    where: { id: user.id },
    select: { anthropicKeyCipher: true, anthropicKeyLast4: true },
  });

  return (
    <ApiKeysForm
      hasKey={!!row?.anthropicKeyCipher}
      last4={row?.anthropicKeyLast4 ?? null}
      managedAvailable={!!env.ANTHROPIC_API_KEY}
      managedModel={AI_MODELS.managed}
      byoModel={AI_MODELS.byo}
    />
  );
}
