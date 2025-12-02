import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { db } from "../db/index";
import { users } from "../db/schema/users";
import { createUserSchema, listUsersQuerySchema } from "./schemas/users";

export const usersRoute = new Hono()
  // GET /users - list users
  .get("/users", zValidator("query", listUsersQuerySchema), async (c) => {
    try {
      const { limit, offset } = c.req.valid("query");
      const result = await db.select().from(users).limit(limit).offset(offset);
      return c.json({ users: result, limit, offset });
    } catch (error) {
      console.error("Error fetching users:", error);
      return c.json(
        {
          error: "Failed to fetch users",
          message: error instanceof Error ? error.message : "Unknown error",
        },
        500
      );
    }
  })
  // POST /users - create user
  .post("/users", zValidator("json", createUserSchema), async (c) => {
    try {
      const data = c.req.valid("json");
      const [newUser] = await db
        .insert(users)
        .values({ ...data, id: crypto.randomUUID() })
        .returning();
      return c.json({ user: newUser }, 201);
    } catch (error) {
      console.error("Error creating user:", error);
      return c.json(
        {
          error: "Failed to create user",
          message: error instanceof Error ? error.message : "Unknown error",
        },
        500
      );
    }
  });
