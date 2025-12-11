DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tenant_plan') THEN
    CREATE TYPE "tenant_plan" AS ENUM ('BASIC', 'PREMIUM', 'ENTERPRISE');
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "delivery_chat_tenants"
  ADD COLUMN IF NOT EXISTS "plan" "tenant_plan" DEFAULT 'BASIC' NOT NULL;