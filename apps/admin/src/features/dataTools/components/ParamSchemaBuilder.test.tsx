import { describe, expect, it } from "vitest";
import { paramRowsToSchema, schemaToParamRows } from "./ParamSchemaBuilder";

describe("paramRowsToSchema", () => {
  it("builds a flat JSON Schema from param rows", () => {
    const schema = paramRowsToSchema([
      { name: "category", type: "string", required: true },
      { name: "limit", type: "integer", required: false },
    ]);

    expect(schema).toEqual({
      type: "object",
      properties: {
        category: { type: "string" },
        limit: { type: "integer" },
      },
      required: ["category"],
    });
  });

  it("omits `required` entirely when no param is required", () => {
    const schema = paramRowsToSchema([
      { name: "category", type: "string", required: false },
    ]);

    expect(schema.required).toBeUndefined();
  });

  it("skips rows with a blank name", () => {
    const schema = paramRowsToSchema([
      { name: "", type: "string", required: true },
      { name: "category", type: "string", required: false },
    ]);

    expect(Object.keys(schema.properties)).toEqual(["category"]);
  });

  it("returns an empty schema for no rows", () => {
    const schema = paramRowsToSchema([]);
    expect(schema).toEqual({ type: "object", properties: {} });
  });
});

describe("schemaToParamRows", () => {
  it("converts a JSON Schema back into param rows, marking required fields", () => {
    const rows = schemaToParamRows({
      type: "object",
      properties: {
        category: { type: "string" },
        limit: { type: "integer" },
      },
      required: ["category"],
    });

    expect(rows).toEqual([
      { name: "category", type: "string", required: true },
      { name: "limit", type: "integer", required: false },
    ]);
  });

  it("returns an empty array for an empty schema", () => {
    expect(schemaToParamRows({ properties: {} })).toEqual([]);
  });

  it("round-trips through paramRowsToSchema", () => {
    const original = [
      { name: "productId", type: "string" as const, required: true },
      { name: "inStock", type: "boolean" as const, required: false },
    ];
    const roundTripped = schemaToParamRows(paramRowsToSchema(original));
    expect(roundTripped).toEqual(original);
  });
});
