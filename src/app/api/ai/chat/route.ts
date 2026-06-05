import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { AiUnavailableError, resolveAiClient } from "@/lib/ai";
import { buildPageSystemPrompt } from "@/lib/ai-context";
import { buildGuidedSystemPrompt, isGuidedStage } from "@/lib/ai-prompts";
import {
  AiQuotaExceededError,
  assertWithinQuota,
  getQuotaStatus,
  recordUsage,
} from "@/lib/ai-usage";
import { db } from "@/lib/db";
import { getPageAccess } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/** Max output tokens per turn — bounds latency and managed-quota burn. */
const MAX_TOKENS = 4096;
/** Trailing conversation turns sent back as context. */
const MAX_HISTORY = 20;

/**
 * GET — the current user's saved thread for a page, plus their managed-quota
 * status and whether they're on a personal (BYO) key. Used when the panel opens.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const pageId = new URL(req.url).searchParams.get("pageId");
  if (!pageId) {
    return NextResponse.json({ error: "pageId is required" }, { status: 400 });
  }

  const access = await getPageAccess(pageId, userId);
  if (!access) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [thread, quota, user] = await Promise.all([
    db.aiThread.findUnique({
      where: { pageId_userId: { pageId, userId } },
      select: {
        messages: {
          orderBy: { createdAt: "asc" },
          select: { id: true, role: true, content: true },
        },
      },
    }),
    getQuotaStatus(access.workspaceId),
    db.user.findUnique({
      where: { id: userId },
      select: { anthropicKeyCipher: true },
    }),
  ]);

  return NextResponse.json({
    messages: thread?.messages ?? [],
    byo: !!user?.anthropicKeyCipher,
    quota: {
      plan: quota.plan,
      cap: quota.cap,
      used: quota.used,
      remaining: quota.remaining,
    },
  });
}

/**
 * POST — send a message and stream the reply over SSE.
 * Resolve client → quota check (managed only) → stream → persist + record usage.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  let body: { pageId?: unknown; message?: unknown; stage?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body */
  }
  const pageId = typeof body.pageId === "string" ? body.pageId : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const stage = isGuidedStage(body.stage) ? body.stage : null;
  if (!pageId || !message) {
    return NextResponse.json(
      { error: "bad_request", message: "pageId and message are required." },
      { status: 400 },
    );
  }

  const access = await getPageAccess(pageId, userId);
  if (!access) {
    return NextResponse.json(
      { error: "forbidden", message: "You don't have access to this page." },
      { status: 403 },
    );
  }
  const { workspaceId } = access;

  // Resolve the client: BYO key + Sonnet, or managed server key + Haiku.
  let resolved;
  try {
    resolved = await resolveAiClient({ workspaceId, userId });
  } catch (err) {
    if (err instanceof AiUnavailableError) {
      return NextResponse.json(
        { error: "ai_unavailable", message: err.message },
        { status: 503 },
      );
    }
    throw err;
  }
  const { client, model, byo } = resolved;

  // Managed requests are quota-gated; BYO bypasses the managed cap.
  if (!byo) {
    try {
      await assertWithinQuota(workspaceId);
    } catch (err) {
      if (err instanceof AiQuotaExceededError) {
        return NextResponse.json(
          { error: "quota_exceeded", plan: err.plan, cap: err.cap, used: err.used },
          { status: 402 },
        );
      }
      throw err;
    }
  }

  const [page, thread] = await Promise.all([
    db.page.findUnique({
      where: { id: pageId },
      select: { title: true, contentText: true },
    }),
    db.aiThread.upsert({
      where: { pageId_userId: { pageId, userId } },
      create: { pageId, userId },
      update: {},
      select: {
        id: true,
        messages: {
          orderBy: { createdAt: "asc" },
          select: { role: true, content: true },
        },
      },
    }),
  ]);

  // Persist the user's turn before streaming so it survives a failed reply.
  await db.aiMessage.create({
    data: { threadId: thread.id, role: "user", content: message },
  });

  const history = thread.messages.slice(-MAX_HISTORY);
  const messages = [
    ...history.map((m) => ({
      role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: m.content,
    })),
    { role: "user" as const, content: message },
  ];
  const pageCtx = {
    title: page?.title ?? "Untitled",
    text: page?.contentText ?? "",
  };
  const system = stage
    ? buildGuidedSystemPrompt(stage, pageCtx)
    : buildPageSystemPrompt(pageCtx);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      let full = "";
      try {
        const s = client.messages.stream({
          model,
          max_tokens: MAX_TOKENS,
          system,
          messages,
        });
        s.on("text", (delta) => {
          full += delta;
          send({ type: "delta", text: delta });
        });
        const finalMessage = await s.finalMessage();

        await db.aiMessage.create({
          data: { threadId: thread.id, role: "assistant", content: full },
        });
        await db.aiThread.update({
          where: { id: thread.id },
          data: { updatedAt: new Date() },
        });
        if (!byo) {
          await recordUsage(workspaceId, {
            inputTokens: finalMessage.usage.input_tokens,
            outputTokens: finalMessage.usage.output_tokens,
          });
        }
        send({ type: "done" });
      } catch (err) {
        // Persist whatever streamed so the conversation isn't lost.
        if (full) {
          await db.aiMessage
            .create({
              data: { threadId: thread.id, role: "assistant", content: full },
            })
            .catch(() => {});
        }
        send({
          type: "error",
          message:
            err instanceof Error ? err.message : "The AI request failed.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable proxy buffering (nginx) so tokens stream as they arrive.
      "X-Accel-Buffering": "no",
    },
  });
}
