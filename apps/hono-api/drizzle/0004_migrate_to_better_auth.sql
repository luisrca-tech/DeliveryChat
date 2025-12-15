-- Migration: Migrate to Better Auth with Organization plugin
-- This migration:
-- 1. Creates Better Auth tables (user, session, account, verification, organization, member, invitation)
-- 2. Migrates from tenants to organization (if tenants table exists)
-- 3. Updates applications table to use organization_id instead of tenant_id

-- Create Better Auth tables
CREATE TABLE IF NOT EXISTS "delivery_chat_user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"email_verified" timestamp,
	"image" varchar(500),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_chat_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "delivery_chat_organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"logo" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"description" text,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"plan" "tenant_plan" DEFAULT 'BASIC' NOT NULL,
	"deleted_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "delivery_chat_session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_chat_session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "delivery_chat_account" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"expires_at" timestamp,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "delivery_chat_verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "delivery_chat_member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'operator' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "delivery_chat_invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'operator' NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_chat_invitation_token_unique" UNIQUE("token")
);
--> statement-breakpoint

-- Migrate data from tenants to organization (if tenants table exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'delivery_chat_tenants'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'delivery_chat_organization'
  ) THEN
    -- Copy data from tenants to organization, converting uuid to text
    INSERT INTO "delivery_chat_organization" (
      "id", "name", "slug", "description", "settings", "plan", 
      "deleted_at", "created_at", "updated_at", "logo", "metadata"
    )
    SELECT 
      id::text as "id",
      "name",
      "slug",
      "description",
      "settings",
      "plan",
      "deleted_at",
      "created_at",
      "updated_at",
      NULL as "logo",
      NULL::jsonb as "metadata"
    FROM "delivery_chat_tenants";
  END IF;
END $$;
--> statement-breakpoint

-- Drop old tables and constraints (only if they exist)
DO $$
BEGIN
  -- Disable RLS if table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'delivery_chat_users') THEN
    ALTER TABLE "delivery_chat_users" DISABLE ROW LEVEL SECURITY;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'delivery_chat_tenants') THEN
    ALTER TABLE "delivery_chat_tenants" DISABLE ROW LEVEL SECURITY;
  END IF;
END $$;
--> statement-breakpoint
DROP TABLE IF EXISTS "delivery_chat_users" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "delivery_chat_tenants" CASCADE;
--> statement-breakpoint

-- Update applications table: migrate from tenant_id to organization_id
DO $$
BEGIN
  -- Only proceed if applications table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'delivery_chat_applications'
  ) THEN
    -- Drop old constraint if it exists
    IF EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'delivery_chat_applications_tenant_id_delivery_chat_tenants_id_fk'
    ) THEN
      ALTER TABLE "delivery_chat_applications" 
        DROP CONSTRAINT "delivery_chat_applications_tenant_id_delivery_chat_tenants_id_fk";
    END IF;
    
    -- Drop old indexes if they exist
    DROP INDEX IF EXISTS "applications_tenant_idx";
    DROP INDEX IF EXISTS "applications_slug_tenant_unique";
    DROP INDEX IF EXISTS "applications_subdomain_tenant_unique";
    
    -- Add organization_id column if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'delivery_chat_applications' 
      AND column_name = 'organization_id'
    ) THEN
      -- Add column as nullable first
      ALTER TABLE "delivery_chat_applications" ADD COLUMN "organization_id" text;
      
      -- Migrate data: convert tenant_id (uuid) to organization_id (text)
      IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'delivery_chat_applications' 
        AND column_name = 'tenant_id'
      ) THEN
        UPDATE "delivery_chat_applications" 
        SET "organization_id" = "tenant_id"::text
        WHERE "organization_id" IS NULL;
        
        -- Make it NOT NULL after migration
        ALTER TABLE "delivery_chat_applications" ALTER COLUMN "organization_id" SET NOT NULL;
        
        -- Drop old tenant_id column
        ALTER TABLE "delivery_chat_applications" DROP COLUMN IF EXISTS "tenant_id";
      END IF;
    END IF;
  END IF;
END $$;
--> statement-breakpoint

-- Add foreign key constraints
ALTER TABLE "delivery_chat_session" ADD CONSTRAINT "delivery_chat_session_user_id_delivery_chat_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."delivery_chat_user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "delivery_chat_account" ADD CONSTRAINT "delivery_chat_account_user_id_delivery_chat_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."delivery_chat_user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "delivery_chat_member" ADD CONSTRAINT "delivery_chat_member_organization_id_delivery_chat_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."delivery_chat_organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "delivery_chat_member" ADD CONSTRAINT "delivery_chat_member_user_id_delivery_chat_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."delivery_chat_user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "delivery_chat_invitation" ADD CONSTRAINT "delivery_chat_invitation_organization_id_delivery_chat_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."delivery_chat_organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

-- Create indexes
CREATE UNIQUE INDEX IF NOT EXISTS "organization_slug_unique" ON "delivery_chat_organization" USING btree ("slug");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organization_slug_idx" ON "delivery_chat_organization" USING btree ("slug");
--> statement-breakpoint
-- Add foreign key and indexes for applications table (only if table exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'delivery_chat_applications'
  ) THEN
    -- Add foreign key constraint if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'delivery_chat_applications_organization_id_delivery_chat_organization_id_fk'
    ) THEN
      ALTER TABLE "delivery_chat_applications" 
        ADD CONSTRAINT "delivery_chat_applications_organization_id_delivery_chat_organization_id_fk" 
        FOREIGN KEY ("organization_id") 
        REFERENCES "public"."delivery_chat_organization"("id") 
        ON DELETE no action ON UPDATE no action;
    END IF;
    
    -- Create indexes if they don't exist
    CREATE INDEX IF NOT EXISTS "applications_organization_idx" 
      ON "delivery_chat_applications" USING btree ("organization_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "applications_slug_organization_unique" 
      ON "delivery_chat_applications" USING btree ("slug","organization_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "applications_subdomain_organization_unique" 
      ON "delivery_chat_applications" USING btree ("subdomain","organization_id");
  END IF;
END $$;
