import { describe, expect, it } from "vitest";
import type { ParamRow } from "../components/ParamSchemaBuilder";
import type { DataTool, ToolInputSchema } from "../types/dataTools.types";
import {
  buildDataToolBody,
  canEnableTool,
  canSaveDataTool,
  coerceParam,
  coerceParams,
  NAME_REGEX,
  planDataToolSave,
} from "./dataToolForm";

const schema: ToolInputSchema = {
  type: "object",
  properties: { category: { type: "string" } },
  required: ["category"],
};

const validHttpInputs = {
  effectiveKind: "http" as const,
  name: "searchProducts",
  description: "Searches the product catalog",
  config: "/products?category={category}",
  resolvedSchema: schema,
};

describe("NAME_REGEX", () => {
  it("accepts a leading letter followed by letters, digits, underscores", () => {
    expect(NAME_REGEX.test("searchProducts")).toBe(true);
    expect(NAME_REGEX.test("a")).toBe(true);
    expect(NAME_REGEX.test("get_user_2")).toBe(true);
  });

  it("rejects names not starting with a letter or with invalid characters", () => {
    expect(NAME_REGEX.test("")).toBe(false);
    expect(NAME_REGEX.test("1name")).toBe(false);
    expect(NAME_REGEX.test("_name")).toBe(false);
    expect(NAME_REGEX.test("has-dash")).toBe(false);
    expect(NAME_REGEX.test("has space")).toBe(false);
  });
});

describe("coerceParam", () => {
  const row = (type: ParamRow["type"]): ParamRow => ({
    name: "p",
    type,
    required: false,
  });

  it("coerces booleans strictly ('true' → true, anything else → false)", () => {
    expect(coerceParam(row("boolean"), "true")).toBe(true);
    expect(coerceParam(row("boolean"), "false")).toBe(false);
    expect(coerceParam(row("boolean"), "TRUE")).toBe(false);
    expect(coerceParam(row("boolean"), "")).toBe(false);
  });

  it("parses numbers and integers", () => {
    expect(coerceParam(row("number"), "42")).toBe(42);
    expect(coerceParam(row("number"), "3.14")).toBe(3.14);
    expect(coerceParam(row("integer"), "7")).toBe(7);
  });

  it("falls back to the raw string when a number fails to parse", () => {
    expect(coerceParam(row("number"), "abc")).toBe("abc");
    expect(coerceParam(row("integer"), "abc")).toBe("abc");
  });

  it("passes strings through untouched", () => {
    expect(coerceParam(row("string"), "42")).toBe("42");
    expect(coerceParam(row("string"), "hello")).toBe("hello");
  });
});

describe("coerceParams", () => {
  it("builds a coerced param map keyed by row name, defaulting missing values", () => {
    const rows: ParamRow[] = [
      { name: "category", type: "string", required: true },
      { name: "limit", type: "integer", required: false },
      { name: "inStock", type: "boolean", required: false },
    ];
    expect(
      coerceParams(rows, { category: "books", limit: "5", inStock: "true" }),
    ).toEqual({ category: "books", limit: 5, inStock: true });
  });

  it("defaults a missing value to an empty string before coercion", () => {
    const rows: ParamRow[] = [{ name: "category", type: "string", required: true }];
    expect(coerceParams(rows, {})).toEqual({ category: "" });
  });
});

describe("canSaveDataTool", () => {
  it("returns true for a fully valid form", () => {
    expect(canSaveDataTool(validHttpInputs)).toBe(true);
  });

  it("returns false without an effective kind", () => {
    expect(canSaveDataTool({ ...validHttpInputs, effectiveKind: null })).toBe(false);
  });

  it("returns false for an invalid name", () => {
    expect(canSaveDataTool({ ...validHttpInputs, name: "1bad" })).toBe(false);
  });

  it("enforces the 10-character description boundary", () => {
    expect(canSaveDataTool({ ...validHttpInputs, description: "123456789" })).toBe(
      false,
    );
    expect(canSaveDataTool({ ...validHttpInputs, description: "1234567890" })).toBe(
      true,
    );
  });

  it("returns false for a blank config", () => {
    expect(canSaveDataTool({ ...validHttpInputs, config: "   " })).toBe(false);
  });

  it("returns false when the schema did not resolve", () => {
    expect(canSaveDataTool({ ...validHttpInputs, resolvedSchema: null })).toBe(false);
  });
});

describe("buildDataToolBody", () => {
  it("builds an HTTP GET payload, trimming fields", () => {
    expect(
      buildDataToolBody({
        ...validHttpInputs,
        name: "  searchProducts  ",
        description: "  Searches the product catalog  ",
        config: "  /products  ",
      }),
    ).toEqual({
      name: "searchProducts",
      description: "Searches the product catalog",
      inputSchema: schema,
      backingType: "http",
      config: { method: "GET", urlTemplate: "/products" },
    });
  });

  it("builds a SQL payload", () => {
    expect(
      buildDataToolBody({
        ...validHttpInputs,
        effectiveKind: "sql",
        config: "SELECT name FROM products",
      }),
    ).toEqual({
      name: "searchProducts",
      description: "Searches the product catalog",
      inputSchema: schema,
      backingType: "sql",
      config: { query: "SELECT name FROM products" },
    });
  });

  it("returns null when a precondition is unmet", () => {
    expect(buildDataToolBody({ ...validHttpInputs, description: "short" })).toBeNull();
    expect(buildDataToolBody({ ...validHttpInputs, resolvedSchema: null })).toBeNull();
    expect(buildDataToolBody({ ...validHttpInputs, effectiveKind: null })).toBeNull();
  });

  it("strips line breaks pasted into an HTTP URL template", () => {
    // URLs are single-line; the config textarea accepts pasted newlines.
    expect(
      buildDataToolBody({
        ...validHttpInputs,
        config: "/products?category={category}\n&sort={sort}\r\n",
      })?.config,
    ).toEqual({
      method: "GET",
      urlTemplate: "/products?category={category}&sort={sort}",
    });
  });

  it("keeps line breaks in SQL queries", () => {
    expect(
      buildDataToolBody({
        ...validHttpInputs,
        effectiveKind: "sql",
        config: "SELECT name\nFROM products",
      })?.config,
    ).toEqual({ query: "SELECT name\nFROM products" });
  });
});

describe("planDataToolSave", () => {
  const testedDisabled = {
    lastTestedAt: "2025-01-01T00:00:00Z",
    enabled: false,
  } as DataTool;
  const testedEnabled = { ...testedDisabled, enabled: true } as DataTool;

  it("creates the tool for a new (unsaved) form", () => {
    expect(
      planDataToolSave({ savedTool: null, fieldsDirty: true, enabled: false }),
    ).toEqual({ saveFields: true, applyStatus: false, blockedEnable: false });
  });

  it("applies a status-only enable without re-saving fields", () => {
    expect(
      planDataToolSave({ savedTool: testedDisabled, fieldsDirty: false, enabled: true }),
    ).toEqual({ saveFields: false, applyStatus: true, blockedEnable: false });
  });

  it("applies a status-only disable without re-saving fields", () => {
    expect(
      planDataToolSave({ savedTool: testedEnabled, fieldsDirty: false, enabled: false }),
    ).toEqual({ saveFields: false, applyStatus: true, blockedEnable: false });
  });

  it("does nothing when neither fields nor status changed", () => {
    expect(
      planDataToolSave({ savedTool: testedEnabled, fieldsDirty: false, enabled: true }),
    ).toEqual({ saveFields: false, applyStatus: false, blockedEnable: false });
  });

  it("blocks a pending enable when a field edit resets the test gate", () => {
    // Saving fields resets enabled/lastTestedAt server-side, so a wanted
    // enable cannot be applied in the same save — it needs a fresh test.
    expect(
      planDataToolSave({ savedTool: testedEnabled, fieldsDirty: true, enabled: true }),
    ).toEqual({ saveFields: true, applyStatus: false, blockedEnable: true });
  });

  it("blocks enabling an untested tool", () => {
    expect(
      planDataToolSave({
        savedTool: { lastTestedAt: null, enabled: false } as DataTool,
        fieldsDirty: false,
        enabled: true,
      }),
    ).toEqual({ saveFields: false, applyStatus: false, blockedEnable: true });
  });
});

describe("canEnableTool", () => {
  it("returns false for a null tool or a tool that was never tested", () => {
    expect(canEnableTool(null)).toBe(false);
    expect(canEnableTool({ lastTestedAt: null } as DataTool)).toBe(false);
  });

  it("returns true once the tool has been tested", () => {
    expect(
      canEnableTool({ lastTestedAt: "2025-01-01T00:00:00Z" } as DataTool),
    ).toBe(true);
  });
});
