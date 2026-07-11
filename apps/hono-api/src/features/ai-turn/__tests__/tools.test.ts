import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../ai-data/index.js", () => ({
  executeDataTool: vi.fn(),
}));

const { executeDataTool } = await import("../../ai-data/index.js");
const mockExecuteDataTool = executeDataTool as ReturnType<typeof vi.fn>;

const { assembleTools, ESCALATE_TOOL_NAME } = await import("../tools.js");
import type { TurnToolset } from "../loadContext.js";
import type { TurnEscalationContext } from "../tools.js";

function httpTool(name: string) {
  return {
    id: `${name}-id`,
    name,
    description: `desc ${name}`,
    backingType: "http" as const,
    inputSchema: {
      type: "object" as const,
      properties: { sku: { type: "string" as const } },
      required: ["sku"],
    },
    config: { method: "GET" as const, urlTemplate: "https://x/{sku}" },
  };
}

function sqlTool(name: string) {
  return {
    id: `${name}-id`,
    name,
    description: `desc ${name}`,
    backingType: "sql" as const,
    inputSchema: { type: "object" as const, properties: {}, required: [] },
    config: { query: "SELECT 1" },
  };
}

function toolset(tools: TurnToolset["tools"]): TurnToolset {
  return {
    source: { kind: "http", config: { baseUrl: "https://x", allowedHost: "x" } },
    tools,
  };
}

beforeEach(() => vi.resetAllMocks());

describe("assembleTools", () => {
  it("always includes escalateToHuman, even with no toolset", () => {
    const turnCtx: TurnEscalationContext = { escalation: null };
    const tools = assembleTools({
      applicationId: "app-1",
      toolset: null,
      httpAllowed: true,
      sqlAllowed: true,
      turnCtx,
    });
    expect(Object.keys(tools)).toEqual([ESCALATE_TOOL_NAME]);
  });

  it("escalateToHuman records the reason in the turn context", async () => {
    const turnCtx: TurnEscalationContext = { escalation: null };
    const tools = assembleTools({
      applicationId: "app-1",
      toolset: null,
      httpAllowed: true,
      sqlAllowed: true,
      turnCtx,
    });
    const res = await tools[ESCALATE_TOOL_NAME]!.execute({ reason: "no data" });
    expect(res).toEqual({ acknowledged: true });
    expect(turnCtx.escalation).toEqual({ reason: "no data" });
  });

  it("includes HTTP tools only when httpAllowed", () => {
    const turnCtx: TurnEscalationContext = { escalation: null };
    const allowed = assembleTools({
      applicationId: "app-1",
      toolset: toolset([httpTool("checkStock")]),
      httpAllowed: true,
      sqlAllowed: false,
      turnCtx,
    });
    expect(Object.keys(allowed).sort()).toEqual(
      [ESCALATE_TOOL_NAME, "checkStock"].sort(),
    );

    const denied = assembleTools({
      applicationId: "app-1",
      toolset: toolset([httpTool("checkStock")]),
      httpAllowed: false,
      sqlAllowed: false,
      turnCtx,
    });
    expect(Object.keys(denied)).toEqual([ESCALATE_TOOL_NAME]);
  });

  it("includes SQL tools only when sqlAllowed", () => {
    const turnCtx: TurnEscalationContext = { escalation: null };
    const denied = assembleTools({
      applicationId: "app-1",
      toolset: toolset([sqlTool("lookupOrder")]),
      httpAllowed: true,
      sqlAllowed: false,
      turnCtx,
    });
    expect(Object.keys(denied)).toEqual([ESCALATE_TOOL_NAME]);

    const allowed = assembleTools({
      applicationId: "app-1",
      toolset: toolset([sqlTool("lookupOrder")]),
      httpAllowed: true,
      sqlAllowed: true,
      turnCtx,
    });
    expect(Object.keys(allowed).sort()).toEqual(
      [ESCALATE_TOOL_NAME, "lookupOrder"].sort(),
    );
  });

  it("data tool execute returns { data } on success", async () => {
    mockExecuteDataTool.mockResolvedValue({ ok: true, data: [{ sku: "A" }] });
    const turnCtx: TurnEscalationContext = { escalation: null };
    const tools = assembleTools({
      applicationId: "app-1",
      toolset: toolset([httpTool("checkStock")]),
      httpAllowed: true,
      sqlAllowed: false,
      turnCtx,
    });
    const res = await tools.checkStock!.execute({ sku: "A" });
    expect(res).toEqual({ data: [{ sku: "A" }] });
    expect(mockExecuteDataTool).toHaveBeenCalledWith(
      expect.objectContaining({ applicationId: "app-1", params: { sku: "A" } }),
    );
  });

  it("data tool execute returns { error } instead of throwing on failure", async () => {
    mockExecuteDataTool.mockResolvedValue({
      ok: false,
      kind: "execution",
      error: "upstream 500",
    });
    const turnCtx: TurnEscalationContext = { escalation: null };
    const tools = assembleTools({
      applicationId: "app-1",
      toolset: toolset([httpTool("checkStock")]),
      httpAllowed: true,
      sqlAllowed: false,
      turnCtx,
    });
    const res = await tools.checkStock!.execute({ sku: "A" });
    expect(res).toEqual({ error: "upstream 500" });
  });
});
