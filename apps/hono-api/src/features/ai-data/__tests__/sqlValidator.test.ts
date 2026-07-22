import { describe, it, expect } from "vitest";
import { validateSqlQuery, hasLimitClause } from "../sqlValidator.js";

describe("validateSqlQuery", () => {
  it("accepts a simple SELECT", () => {
    expect(validateSqlQuery("SELECT * FROM products WHERE sku = $1")).toEqual({
      ok: true,
    });
  });

  it("accepts a SELECT with a trailing semicolon", () => {
    expect(validateSqlQuery("SELECT id FROM products;").ok).toBe(true);
  });

  it("accepts lowercase select", () => {
    expect(validateSqlQuery("select id from products").ok).toBe(true);
  });

  it("does not reject column names containing keywords (created_at)", () => {
    expect(
      validateSqlQuery("SELECT created_at, updated_at FROM products").ok,
    ).toBe(true);
  });

  it.each([
    ["insert", "INSERT INTO products VALUES (1)"],
    ["update", "UPDATE products SET name = 'x'"],
    ["delete", "DELETE FROM products"],
    ["drop", "DROP TABLE products"],
    ["alter", "ALTER TABLE products ADD COLUMN x int"],
    ["create", "CREATE TABLE t (id int)"],
    ["grant", "GRANT ALL ON products TO bob"],
    ["truncate", "TRUNCATE products"],
    ["copy", "COPY products TO '/tmp/x'"],
  ])("rejects a %s statement", (_label, query) => {
    expect(validateSqlQuery(query).ok).toBe(false);
  });

  it("rejects SELECT ... INTO", () => {
    expect(validateSqlQuery("SELECT * INTO copy_tbl FROM products").ok).toBe(
      false,
    );
  });

  it("rejects multi-statement queries", () => {
    const result = validateSqlQuery("SELECT 1; DROP TABLE products");
    expect(result.ok).toBe(false);
  });

  it("rejects a non-SELECT leading statement", () => {
    expect(validateSqlQuery("WITH x AS (SELECT 1) SELECT * FROM x").ok).toBe(
      false,
    );
  });

  it("rejects comment-smuggled writes (line comment)", () => {
    const result = validateSqlQuery("SELECT 1 -- \n; DELETE FROM products");
    expect(result.ok).toBe(false);
  });

  it("rejects comment-smuggled writes (block comment)", () => {
    const result = validateSqlQuery("SELECT 1 /* hide */; DROP TABLE products");
    expect(result.ok).toBe(false);
  });

  it("rejects an empty query", () => {
    expect(validateSqlQuery("   ").ok).toBe(false);
  });

  it("rejects a query that is only a comment", () => {
    expect(validateSqlQuery("-- just a comment").ok).toBe(false);
  });
});

describe("hasLimitClause", () => {
  it("detects an existing LIMIT", () => {
    expect(hasLimitClause("SELECT * FROM t LIMIT 10")).toBe(true);
  });

  it("returns false when no LIMIT is present", () => {
    expect(hasLimitClause("SELECT * FROM t")).toBe(false);
  });
});
