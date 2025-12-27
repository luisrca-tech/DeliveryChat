-- Create tenant_plan enum type if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tenant_plan') THEN
    CREATE TYPE "public"."tenant_plan" AS ENUM('BASIC', 'PREMIUM', 'ENTERPRISE');
  END IF;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "delivery_chat_users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"password" varchar(255) NOT NULL,
	CONSTRAINT "delivery_chat_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "delivery_chat_tenants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"description" text,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"plan" "tenant_plan" DEFAULT 'BASIC' NOT NULL,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "delivery_chat_applications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"subdomain" varchar(255) NOT NULL,
	"description" text,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ 
BEGIN
  -- Only add constraint if table exists, column exists, and constraint doesn't exist
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'delivery_chat_users'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'delivery_chat_users' AND column_name = 'tenant_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'delivery_chat_users_tenant_id_delivery_chat_tenants_id_fk'
  ) THEN
    ALTER TABLE "delivery_chat_users" ADD CONSTRAINT "delivery_chat_users_tenant_id_delivery_chat_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."delivery_chat_tenants"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ 
BEGIN
  -- Only add constraint if table exists, column exists, and constraint doesn't exist
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'delivery_chat_applications'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'delivery_chat_applications' AND column_name = 'tenant_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'delivery_chat_applications_tenant_id_delivery_chat_tenants_id_fk'
  ) THEN
    ALTER TABLE "delivery_chat_applications" ADD CONSTRAINT "delivery_chat_applications_tenant_id_delivery_chat_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."delivery_chat_tenants"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'delivery_chat_tenants') 
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'delivery_chat_tenants' AND column_name = 'slug')
     AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'tenants_slug_unique') THEN
    CREATE UNIQUE INDEX "tenants_slug_unique" ON "delivery_chat_tenants" USING btree ("slug");
  END IF;
END $$;
--> statement-breakpoint
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'delivery_chat_tenants') 
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'delivery_chat_tenants' AND column_name = 'slug')
     AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'tenants_slug_idx') THEN
    CREATE INDEX "tenants_slug_idx" ON "delivery_chat_tenants" USING btree ("slug");
  END IF;
END $$;
--> statement-breakpoint
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'delivery_chat_applications') 
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'delivery_chat_applications' AND column_name = 'tenant_id')
     AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'applications_tenant_idx') THEN
    CREATE INDEX "applications_tenant_idx" ON "delivery_chat_applications" USING btree ("tenant_id");
  END IF;
END $$;
--> statement-breakpoint
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'delivery_chat_applications') 
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'delivery_chat_applications' AND column_name = 'slug')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'delivery_chat_applications' AND column_name = 'tenant_id')
     AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'applications_slug_tenant_unique') THEN
    CREATE UNIQUE INDEX "applications_slug_tenant_unique" ON "delivery_chat_applications" USING btree ("slug","tenant_id");
  END IF;
END $$;
--> statement-breakpoint
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'delivery_chat_applications') 
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'delivery_chat_applications' AND column_name = 'subdomain')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'delivery_chat_applications' AND column_name = 'tenant_id')
     AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'applications_subdomain_tenant_unique') THEN
    CREATE UNIQUE INDEX "applications_subdomain_tenant_unique" ON "delivery_chat_applications" USING btree ("subdomain","tenant_id");
  END IF;
END $$;