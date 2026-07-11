import { describe, it, expect } from "vitest";
import { validateParams, orderedParamNames } from "../paramValidator.js";

const schema = {
  type: "object" as const,
  properties: {
    sku: { type: "string" as const },
    quantity: { type: "integer" as const },
    price: { type: "number" as const },
    inStock: { type: "boolean" as const },
  },
  required: ["sku"],
};

describe("validateParams", () => {
  it("accepts params matching the schema", () => {
    const result = validateParams(schema, {
      sku: "ABC",
      quantity: 3,
      price: 9.99,
      inStock: true,
    });
    expect(result.ok).toBe(true);
  });

  it("returns the params unchanged as value on success", () => {
    const params = { sku: "ABC" };
    const result = validateParams(schema, params);
    expect(result).toEqual({ ok: true, value: params });
  });

  it("rejects when a required param is missing", () => {
    const result = validateParams(schema, { quantity: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/sku/);
  });

  it("rejects when a required param is null", () => {
    const result = validateParams(schema, { sku: null });
    expect(result.ok).toBe(false);
  });

  it("rejects a string given for a number field", () => {
    const result = validateParams(schema, { sku: "ABC", price: "cheap" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/price/);
  });

  it("rejects a float given for an integer field", () => {
    const result = validateParams(schema, { sku: "ABC", quantity: 1.5 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/quantity/);
  });

  it("rejects a non-boolean given for a boolean field", () => {
    const result = validateParams(schema, { sku: "ABC", inStock: "yes" });
    expect(result.ok).toBe(false);
  });

  it("ignores optional params that are absent", () => {
    const result = validateParams(schema, { sku: "ABC" });
    expect(result.ok).toBe(true);
  });

  it("ignores unknown params not declared in the schema", () => {
    const result = validateParams(schema, { sku: "ABC", extra: "ignored" });
    expect(result.ok).toBe(true);
  });

  it("treats a null/invalid schema as no constraints", () => {
    expect(validateParams(null, { anything: 1 }).ok).toBe(true);
    expect(validateParams("nope", {}).ok).toBe(true);
  });
});

describe("orderedParamNames", () => {
  it("preserves the schema property order", () => {
    expect(orderedParamNames(schema)).toEqual([
      "sku",
      "quantity",
      "price",
      "inStock",
    ]);
  });

  it("returns an empty list for a schema without properties", () => {
    expect(orderedParamNames({})).toEqual([]);
    expect(orderedParamNames(null)).toEqual([]);
  });
});
