import { pgEnum } from "drizzle-orm/pg-core";

export const keyEnvironmentEnum = pgEnum("key_environment", ["live", "test"]);
