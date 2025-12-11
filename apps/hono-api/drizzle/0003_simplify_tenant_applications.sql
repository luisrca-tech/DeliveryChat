-- Drop old tables if they exist (companies/users_companies)
DROP TABLE IF EXISTS "delivery_chat_users_companies" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "delivery_chat_companies" CASCADE;
--> statement-breakpoint

-- Users now belong to tenants (idempotent; skip if table missing)
ALTER TABLE IF EXISTS "delivery_chat_users" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
--> statement-breakpoint
-- Backfill any existing users to the first tenant (assumes at least one tenant exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'delivery_chat_users'
  ) THEN
    UPDATE "delivery_chat_users"
      SET "tenant_id" = sub.id
    FROM (SELECT id FROM "delivery_chat_tenants" LIMIT 1) AS sub
    WHERE "delivery_chat_users"."tenant_id" IS NULL;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE IF EXISTS "delivery_chat_users" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE IF EXISTS "delivery_chat_users" DROP CONSTRAINT IF EXISTS "delivery_chat_users_tenant_id_delivery_chat_tenants_id_fk";
--> statement-breakpoint
ALTER TABLE IF EXISTS "delivery_chat_users"
  ADD CONSTRAINT "delivery_chat_users_tenant_id_delivery_chat_tenants_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."delivery_chat_tenants"("id")
  ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

-- Applications get subdomain per tenant (idempotent)
ALTER TABLE IF EXISTS "delivery_chat_applications" ADD COLUMN IF NOT EXISTS "subdomain" varchar(255);
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'delivery_chat_applications'
  ) THEN
    UPDATE "delivery_chat_applications"
      SET "subdomain" = CONCAT("slug", '.app')
      WHERE "subdomain" IS NULL;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE IF EXISTS "delivery_chat_applications" ALTER COLUMN "subdomain" SET NOT NULL;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'delivery_chat_applications'
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS "applications_subdomain_tenant_unique"
      ON "delivery_chat_applications" USING btree ("subdomain","tenant_id");
  END IF;
END $$;