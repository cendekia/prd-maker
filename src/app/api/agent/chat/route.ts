import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { AiUnavailableError, resolveAiClient } from "@/lib/ai";
import {
  AiQuotaExceededError,
  assertWithinQuota,
  getQuotaStatus,
} from "@/lib/ai-usage";
import { getApiContext, isResponse, jsonError } from "@/lib/api";
import {
  buildAgentSystemPrompt,
  buildWorkspaceContext,
} from "@/lib/agent/context";
import { runAgentLoop } from "@/lib/agent/loop";
import { db } from "@/lib/db";
import { assertWorkspaceAgent, PlanGateError } from "@/lib/plan-gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/**
 * An agent run is up to 8 sequential model calls plus tool executions, so it
 * needs the same raised window as the Step 20 chat route. 60s is the Vercel
 * Hobby ceiling; Pro/Enterprise can raise this further.
 */
export const maxDuration = 60;

/** Trailing conversation turns sent back as context (text only — tool traces
 * are persisted for display but not replayed into the model context). */
const MAX_HISTORY = 20;

/**
 * GET — the current user's workspace agent thread (with tool traces), plus
 * managed-quota status and BYO flag. Used when the panel opens in workspace
 * scope. `workspaceId` comes as a query param.
 */
export async function GET(req: Request) {
  const workspaceId = new URL(req.url).searchParams.get("workspaceId");
  if (!workspaceId) {
    return NextResponse.json(
      { error: "workspaceId is required" },
      { status: 400 },
    );
  }
  const ctx = await getApiContext(workspaceId);
  if (isResponse(ctx)) return ctx;

  const [thread, quota, user] = await Promise.all([
    db.agentThread.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: ctx.workspace.id,
          userId: ctx.user.id,
        },
      },
      select: {
        messages: {
          orderBy: { createdAt: "asc" },
          select: { id: true, role: true, content: true, toolUse: true },
        },
      },
    }),
    getQuotaStatus(ctx.workspace.id),
    db.user.findUnique({
      where: { id: ctx.user.id },
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
 * POST — send a message to the workspace agent and stream the run over SSE.
 * Mirrors /api/ai/chat's event protocol ({delta|done|error}) extended with
 * {type:"tool", name, status:"start"|"end", ok} events while tools execute.
 */
export async function POST(req: Request) {
  let body: { workspaceId?: unknown; message?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body */
  }
  const workspaceId =
    typeof body.workspaceId === "string" ? body.workspaceId : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!workspaceId || !message) {
    return jsonError("workspaceId and message are required.");
  }

  const ctx = await getApiContext(workspaceId);
  if (isResponse(ctx)) return ctx;

  try {
    await assertWorkspaceAgent(ctx.workspace.id);
  } catch (err) {
    if (err instanceof PlanGateError) {
      return NextResponse.json(
        { error: "agent_unavailable", message: err.message },
        { status: 403 },
      );
    }
    throw err;
  }

  // Resolve the client: BYO key + Sonnet, or managed server key + Haiku.
  let resolved;
  try {
    resolved = await resolveAiClient({
      workspaceId: ctx.workspace.id,
      userId: ctx.user.id,
    });
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

  // Managed requests are quota-gated up front; the loop meters every call.
  if (!byo) {
    try {
      await assertWithinQuota(ctx.workspace.id);
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

  const thread = await db.agentThread.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: ctx.workspace.id,
        userId: ctx.user.id,
      },
    },
    create: { workspaceId: ctx.workspace.id, userId: ctx.user.id },
    update: {},
    select: {
      id: true,
      messages: {
        orderBy: { createdAt: "asc" },
        select: { role: true, content: true },
      },
    },
  });

  // Persist the user's turn before streaming so it survives a failed run.
  await db.agentMessage.create({
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

  // Ground the run in the live application map before the stream opens.
  const context = await buildWorkspaceContext(ctx.workspace.id);
  const system = buildAgentSystemPrompt({
    workspaceName: ctx.workspace.name,
    context,
  });
  const toolCtx = {
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    role: ctx.member.role,
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      let streamedText = "";
      try {
        const result = await runAgentLoop({
          client,
          model,
          system,
          messages,
          toolCtx,
          byo,
          onText: (delta) => {
            streamedText += delta;
            send({ type: "delta", text: delta });
          },
          onTool: (e) =>
            send({ type: "tool", name: e.name, status: e.status, ok: e.ok }),
        });

        await db.agentMessage.create({
          data: {
            threadId: thread.id,
            role: "assistant",
            content: result.text,
            toolUse:
              result.trace.length > 0
                ? (result.trace as unknown as Prisma.InputJsonValue)
                : undefined,
          },
        });
        await db.agentThread.update({
          where: { id: thread.id },
          data: { updatedAt: new Date() },
        });
        send({ type: "done" });
      } catch (err) {
        // Persist whatever streamed so the conversation isn't lost.
        if (streamedText) {
          await db.agentMessage
            .create({
              data: {
                threadId: thread.id,
                role: "assistant",
                content: streamedText,
              },
            })
            .catch(() => {});
        }
        send({
          type: "error",
          message:
            err instanceof Error ? err.message : "The agent request failed.",
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
