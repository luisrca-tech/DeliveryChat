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

function buildDataTool(
  applicationId: string,
  source: TurnToolset["source"],
  row: DataToolRow & { description: string },
): AIProviderTool {
  return {
    description: row.description,
    inputSchema: toZod(row.inputSchema),
    execute: async (input: Record<string, unknown>) => {
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
      // Never throw: surface the failure to the model as a structured result so
      // it can follow the grounding rule and escalate.
      if (!result.ok) {
        return { error: result.error };
      }
      return { data: result.data };
    },
  };
}

function buildEscalateTool(turnCtx: TurnEscalationContext): AIProviderTool {
  return {
    description:
      "Hand this conversation to a human operator. Call this whenever you cannot answer from the available tools, a tool returns empty/error data, the visitor asks for a human, or the question is out of scope. Provide a short reason.",
    inputSchema: z.object({ reason: z.string() }),
    execute: async (input: Record<string, unknown>) => {
      const reason =
        typeof input?.reason === "string" && input.reason.trim() !== ""
          ? input.reason
          : "escalation requested";
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
  toolset: TurnToolset | null;
  httpAllowed: boolean;
  sqlAllowed: boolean;
  turnCtx: TurnEscalationContext;
}): Record<string, AIProviderTool> {
  const tools: Record<string, AIProviderTool> = {
    [ESCALATE_TOOL_NAME]: buildEscalateTool(input.turnCtx),
  };

  if (!input.toolset) return tools;

  for (const row of input.toolset.tools) {
    if (row.backingType === "http" && !input.httpAllowed) continue;
    if (row.backingType === "sql" && !input.sqlAllowed) continue;
    tools[row.name] = buildDataTool(
      input.applicationId,
      input.toolset.source,
      row,
    );
  }

  return tools;
}
