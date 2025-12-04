import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { db } from "../db/index.js";
import { companies } from "../db/schema/companies.js";
import {
  createCompanySchema,
  listCompaniesQuerySchema,
} from "./schemas/companies.js";

export const companiesRoute = new Hono()
  // GET /companies - list companies
  .get(
    "/companies",
    zValidator("query", listCompaniesQuerySchema),
    async (c) => {
      try {
        const { limit, offset } = c.req.valid("query");
        const result = await db
          .select()
          .from(companies)
          .limit(limit)
          .offset(offset);
        return c.json({ companies: result, limit, offset });
      } catch (error) {
        console.error("Error fetching companies:", error);
        return c.json(
          {
            error: "Failed to fetch companies",
            message: error instanceof Error ? error.message : "Unknown error",
          },
          500
        );
      }
    }
  )
  // POST /companies - create company
  .post("/companies", zValidator("json", createCompanySchema), async (c) => {
    try {
      const data = c.req.valid("json");
      const [newCompany] = await db
        .insert(companies)
        .values({ ...data, id: crypto.randomUUID() })
        .returning();
      return c.json({ company: newCompany }, 201);
    } catch (error) {
      console.error("Error creating company:", error);
      return c.json(
        {
          error: "Failed to create company",
          message: error instanceof Error ? error.message : "Unknown error",
        },
        500
      );
    }
  });
