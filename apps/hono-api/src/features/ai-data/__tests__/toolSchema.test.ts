import { describe, it, expect } from "vitest";
import {
  validateParams,
  orderedParamNames,
  toZod,
  toolInputSchema,
} from "../toolSchema.js";

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

describe("toZod", () => {
  it("maps each scalar type to its Zod primitive", () => {
    const zod = toZod(schema);
    expect(
      zod.safeParse({ sku: "ABC", quantity: 3, price: 9.99, inStock: true })
        .success,
    ).toBe(true);
    // integer must be a whole number
    expect(zod.safeParse({ sku: "ABC", quantity: 1.5 }).success).toBe(false);
    // number field rejects strings
    expect(zod.safeParse({ sku: "ABC", price: "cheap" }).success).toBe(false);
    // boolean field rejects strings
    expect(zod.safeParse({ sku: "ABC", inStock: "yes" }).success).toBe(false);
  });

  it("makes non-required properties optional", () => {
    const zod = toZod(schema);
    expect(zod.safeParse({ sku: "ABC" }).success).toBe(true);
    // required `sku` missing
    expect(zod.safeParse({ quantity: 1 }).success).toBe(false);
  });

  it("treats a null/invalid schema as an empty object", () => {
    expect(toZod(null).safeParse({}).success).toBe(true);
    expect(toZod("nope").safeParse({}).success).toBe(true);
  });
});

describe("toolInputSchema (save-time validator)", () => {
  it("accepts a flat scalar schema", () => {
    const result = toolInputSchema.safeParse({
      properties: { sku: { type: "string" } },
      required: ["sku"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a nested (non-scalar) property type", () => {
    const result = toolInputSchema.safeParse({
      properties: { obj: { type: "object" } },
    });
    expect(result.success).toBe(false);
  });

  it("rejects `required` referencing an unknown property with the exact message", () => {
    const result = toolInputSchema.safeParse({
      properties: { sku: { type: "string" } },
      required: ["missing"],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        'required references unknown property "missing"',
      );
    }
  });
});

/**
 * Cross-reader invariant: the three readers of a stored schema must agree on the
 * set/order of properties. This is the guarantee the SQL executor relies on when
 * it maps `orderedParamNames` positionally to `$1..$n`. Before this module the
 * concept was re-encoded per reader with nothing enforcing agreement.
 */
describe("cross-reader property agreement", () => {
  it("toZod keys, validateParams-accepted keys, and orderedParamNames all agree in insertion order", () => {
    const multi = {
      type: "object" as const,
      properties: {
        alpha: { type: "string" as const },
        bravo: { type: "integer" as const },
        charlie: { type: "number" as const },
        delta: { type: "boolean" as const },
      },
      required: ["alpha", "bravo"],
    };

    const order = orderedParamNames(multi);
    expect(order).toEqual(["alpha", "bravo", "charlie", "delta"]);

    // toZod exposes exactly the same keys, in the same declared order.
    const zodShape = (toZod(multi) as unknown as {
      shape: Record<string, unknown>;
    }).shape;
    expect(Object.keys(zodShape)).toEqual(order);

    // A fully-populated params object is accepted, and validateParams echoes it
    // back so callers can map positionally in `orderedParamNames` order.
    const params = { alpha: "a", bravo: 2, charlie: 3.5, delta: true };
    const validated = validateParams(multi, params);
    expect(validated.ok).toBe(true);
    if (validated.ok) {
      expect(Object.keys(validated.value)).toEqual(order);
    }

    // Positional mapping the SQL executor performs stays aligned with the schema.
    const positional = order.map((name) => params[name as keyof typeof params]);
    expect(positional).toEqual(["a", 2, 3.5, true]);
  });
});
