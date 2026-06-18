import { beforeEach, describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";

// Mock the tool layer and usage metering so the loop test is pure (no DB).
const { executeMock, recordUsageMock } = vi.hoisted(() => ({
  executeMock: vi.fn(),
  recordUsageMock: vi.fn(),
}));
vi.mock("@/lib/agent/tools", () => ({
  AGENT_TOOL_DEFINITIONS: [],
  executeAgentTool: executeMock,
}));
vi.mock("@/lib/ai-usage", () => ({ recordUsage: recordUsageMock }));

import { runAgentLoop } from "@/lib/agent/loop";

/**
 * Streaming tool-use loop (Step 54): tool_use → tool_result continuation,
 * the 8-turn cap, and per-model-call metering (managed only). The Anthropic
 * client is a scripted fake; tools and recordUsage are mocked.
 */

interface FakeFinal {
  stop_reason: string;
  content: Array<
    | { type: "text"; text: string }
    | { type: "tool_use"; id: string; name: string; input: unknown }
  >;
  usage: { input_tokens: number; output_tokens: number };
}

function makeClient(script: FakeFinal[]): Anthropic {
  let i = 0;
  return {
    messages: {
      stream() {
        const msg = script[Math.min(i, script.length - 1)];
        i++;
        return {
          on(evt: string, cb: (t: string) => void) {
            if (evt === "text") {
              for (const b of msg.content) {
                if (b.type === "text") cb(b.text);
              }
            }
            return this;
          },
          finalMessage: async () => msg,
        };
      },
    },
  } as unknown as Anthropic;
}

const toolCtx = { workspaceId: "ws1", userId: "u1", role: "OWNER" as const };
const toolMsg: FakeFinal = {
  stop_reason: "tool_use",
  content: [{ type: "tool_use", id: "tu1", name: "list_features", input: {} }],
  usage: { input_tokens: 10, output_tokens: 5 },
};
const doneMsg: FakeFinal = {
  stop_reason: "end_turn",
  content: [{ type: "text", text: "done" }],
  usage: { input_tokens: 8, output_tokens: 4 },
};

const baseOpts = {
  model: "claude-haiku-4-5",
  system: "sys",
  messages: [{ role: "user" as const, content: "hi" }],
  toolCtx,
};

describe("runAgentLoop", () => {
  beforeEach(() => {
    executeMock.mockReset();
    executeMock.mockResolvedValue({ ok: true, content: "[]" });
    recordUsageMock.mockReset();
  });

  it("executes a tool, feeds the result back, and finishes", async () => {
    const result = await runAgentLoop({
      ...baseOpts,
      client: makeClient([toolMsg, doneMsg]),
      byo: false,
    });
    expect(result.turns).toBe(2);
    expect(result.exhausted).toBe(false);
    expect(executeMock).toHaveBeenCalledTimes(1);
    expect(executeMock).toHaveBeenCalledWith(toolCtx, "list_features", {});
    expect(result.text).toContain("done");
    // One recordUsage per model call.
    expect(recordUsageMock).toHaveBeenCalledTimes(2);
  });

  it("stops at the 8-turn cap when the model keeps requesting tools", async () => {
    const result = await runAgentLoop({
      ...baseOpts,
      client: makeClient([toolMsg]), // always tool_use
      byo: false,
    });
    expect(result.turns).toBe(8);
    expect(result.exhausted).toBe(true);
    expect(executeMock).toHaveBeenCalledTimes(8);
    expect(recordUsageMock).toHaveBeenCalledTimes(8);
  });

  it("does not meter BYO requests", async () => {
    const result = await runAgentLoop({
      ...baseOpts,
      client: makeClient([doneMsg]),
      byo: true,
    });
    expect(result.turns).toBe(1);
    expect(recordUsageMock).not.toHaveBeenCalled();
  });
});
