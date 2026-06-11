import "server-only";

import type Anthropic from "@anthropic-ai/sdk";

import { recordUsage } from "@/lib/ai-usage";
import {
  AGENT_TOOL_DEFINITIONS,
  executeAgentTool,
  type AgentToolContext,
} from "@/lib/agent/tools";

/**
 * Streaming tool-use loop (ai_development_plan.md Step 48).
 *
 * One "run" = up to {@link MAX_TURNS} model calls: stream a reply; when it
 * stops for tool use, execute every requested tool through the Step 47
 * executor (workspace-scoped, suggestion-only writes), feed the results back
 * as `tool_result` blocks, and continue. Managed (non-BYO) usage is metered
 * with `recordUsage` after **every** model call — callers do the up-front
 * `assertWithinQuota` check before starting the run.
 */

/** Hard cap on model calls per run — bounds cost and the route's window. */
const MAX_TURNS = 8;
/** Max output tokens per model call (mirrors the Step 20 chat route). */
const MAX_TOKENS = 4_096;
/** Trace-field truncation so AgentMessage.toolUse rows stay small. */
const TRACE_INPUT_CAP = 500;
const TRACE_RESULT_CAP = 1_000;

/** One executed tool call, persisted on AgentMessage.toolUse (JSON-safe). */
export interface ToolTraceEntry {
  name: string;
  ok: boolean;
  /** JSON-stringified model arguments, truncated. */
  input: string;
  /** Result content or error message, truncated. */
  result: string;
}

export interface AgentToolEventPayload {
  name: string;
  status: "start" | "end";
  ok?: boolean;
}

export interface AgentLoopResult {
  /** Full assistant text across all turns (turn texts joined by blank lines). */
  text: string;
  trace: ToolTraceEntry[];
  /** Model calls made. */
  turns: number;
  /** True when the run hit MAX_TURNS while the model still wanted tools. */
  exhausted: boolean;
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}… [truncated]` : s;
}

export async function runAgentLoop(opts: {
  client: Anthropic;
  model: string;
  system: string;
  /** Prior conversation; the last entry is the user's new message. */
  messages: Anthropic.MessageParam[];
  toolCtx: AgentToolContext;
  /** BYO requests bypass managed metering. */
  byo: boolean;
  onText?: (delta: string) => void;
  onTool?: (event: AgentToolEventPayload) => void;
}): Promise<AgentLoopResult> {
  const convo: Anthropic.MessageParam[] = [...opts.messages];
  const trace: ToolTraceEntry[] = [];
  let fullText = "";
  let turns = 0;

  while (turns < MAX_TURNS) {
    turns++;
    let turnHasText = false;

    const stream = opts.client.messages.stream({
      model: opts.model,
      max_tokens: MAX_TOKENS,
      system: opts.system,
      messages: convo,
      tools: AGENT_TOOL_DEFINITIONS,
    });
    stream.on("text", (delta) => {
      // Separate consecutive turns' prose so the streamed text and the
      // persisted text stay byte-identical.
      if (!turnHasText && fullText.length > 0) {
        fullText += "\n\n";
        opts.onText?.("\n\n");
      }
      turnHasText = true;
      fullText += delta;
      opts.onText?.(delta);
    });

    const final = await stream.finalMessage();
    if (!opts.byo) {
      await recordUsage(opts.toolCtx.workspaceId, {
        inputTokens: final.usage.input_tokens,
        outputTokens: final.usage.output_tokens,
      });
    }

    if (final.stop_reason !== "tool_use") {
      return { text: fullText, trace, turns, exhausted: false };
    }

    // Execute every tool the model requested, then hand the results back.
    convo.push({ role: "assistant", content: final.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of final.content) {
      if (block.type !== "tool_use") continue;
      opts.onTool?.({ name: block.name, status: "start" });
      const res = await executeAgentTool(opts.toolCtx, block.name, block.input);
      opts.onTool?.({ name: block.name, status: "end", ok: res.ok });
      trace.push({
        name: block.name,
        ok: res.ok,
        input: truncate(JSON.stringify(block.input ?? {}), TRACE_INPUT_CAP),
        result: truncate(res.ok ? res.content : res.error, TRACE_RESULT_CAP),
      });
      results.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: res.ok ? res.content : res.error,
        is_error: res.ok ? undefined : true,
      });
    }
    convo.push({ role: "user", content: results });
  }

  // Turn budget spent while the model still wanted tools — close out honestly.
  const notice =
    "\n\n_(Stopped here — reached the tool-step limit for one reply. Ask me to continue if you need more.)_";
  fullText += notice;
  opts.onText?.(notice);
  return { text: fullText, trace, turns, exhausted: true };
}
