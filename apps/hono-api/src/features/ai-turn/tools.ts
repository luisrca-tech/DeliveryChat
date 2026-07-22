import { z } from "zod";
import { executeDataTool } from "../ai-data/index.js";
import { toZod } from "../ai-data/toolSchema.js";
import type { DataToolRow } from "../ai-data/index.js";
import type { AIProviderTool } from "../ai/ai.providerPort.js";
import type { TurnToolset } from "./loadContext.js";

/** Turn-scoped mutable flag the escalate tool writes into. */
export type TurnEscalationContext = {
  escalation: { reason: string } | null;
};

export const ESCALATE_TOOL_NAME = "escalateToHuman";

/** Max chars of tool input/result serialized into a debug log line. */
const LOG_PREVIEW_MAX_CHARS = 500;

function logPreview(value: unknown): string {
  try {
    return JSON.stringify(value).slice(0, LOG_PREVIEW_MAX_CHARS);
  } catch {
    return String(value).slice(0, LOG_PREVIEW_MAX_CHARS);
  }
}

function buildDataTool(
  applicationId: string,
  conversationId: string | undefined,
  source: TurnToolset["source"],
  row: DataToolRow & { description: string },
): AIProviderTool {
  return {
    description: row.description,
    inputSchema: toZod(row.inputSchema),
    execute: async (input: Record<string, unknown>) => {
      // Debug trail for QA/incidents: which tool the model called, with what
      // input, what came back, and how long it took. Previews are truncated
      // and never include data-source headers (the executor never returns them).
      console.debug("[ai-turn] tool:call", {
        conversationId,
        tool: row.name,
        input: logPreview(input ?? {}),
      });
      const startedAt = Date.now();
      const result = await executeDataTool({
        applicationId,
        tool: {
          name: row.name,
          backingType: row.backingType,
          inputSchema: row.inputSchema,
          config: row.config,
        },
        source,
        params: input ?? {},
      });
      console.debug("[ai-turn] tool:result", {
        conversationId,
        tool: row.name,
        ok: result.ok,
        ms: Date.now() - startedAt,
        preview: logPreview(result.ok ? result.data : result.error),
      });
      // Never throw: surface the failure to the model as a structured result so
      // it can follow the grounding rule and escalate.
      if (!result.ok) {
        return { error: result.error };
      }
      return { data: result.data };
    },
  };
}

function buildEscalateTool(
  turnCtx: TurnEscalationContext,
  conversationId: string | undefined,
): AIProviderTool {
  return {
    description:
      "Hand this conversation to a human operator. Call this whenever you cannot answer from the available tools, a tool returns empty/error data, the visitor asks for a human, or the question is out of scope. Provide a short reason.",
    inputSchema: z.object({ reason: z.string() }),
    execute: async (input: Record<string, unknown>) => {
      const reason =
        typeof input?.reason === "string" && input.reason.trim() !== ""
          ? input.reason
          : "escalation requested";
      console.debug("[ai-turn] tool:escalate", { conversationId, reason });
      turnCtx.escalation = { reason };
      return { acknowledged: true };
    },
  };
}

/**
 * Assemble the model-facing tool set for one autonomous turn.
 *
 * `escalateToHuman` is always present. Data tools are included only when their
 * backing is permitted:
 *   - HTTP tools require the org add-on entitlement + application AI enabled
 *     (`httpAllowed`).
 *   - SQL tools share the same org add-on entitlement and additionally require
 *     the per-application `aiDbEnabled` opt-in (`sqlAllowed`).
 */
export function assembleTools(input: {
  applicationId: string;
  /** For log correlation only — optional so callers outside a turn can omit it. */
  conversationId?: string;
  toolset: TurnToolset | null;
  httpAllowed: boolean;
  sqlAllowed: boolean;
  turnCtx: TurnEscalationContext;
}): Record<string, AIProviderTool> {
  const tools: Record<string, AIProviderTool> = {
    [ESCALATE_TOOL_NAME]: buildEscalateTool(input.turnCtx, input.conversationId),
  };

  if (!input.toolset) return tools;

  for (const row of input.toolset.tools) {
    if (row.backingType === "http" && !input.httpAllowed) continue;
    if (row.backingType === "sql" && !input.sqlAllowed) continue;
    tools[row.name] = buildDataTool(
      input.applicationId,
      input.conversationId,
      input.toolset.source,
      row,
    );
  }

  return tools;
}
