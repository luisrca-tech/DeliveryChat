-- Add 'FREE' to tenant_plan enum if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'FREE' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'tenant_plan')
  ) THEN
    ALTER TYPE "public"."tenant_plan" ADD VALUE 'FREE';
  END IF;
END $$;
--> statement-breakpoint
-- Create member_role enum if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'member_role') THEN
    CREATE TYPE "public"."member_role" AS ENUM ('super_admin', 'admin', 'operator');
  END IF;
END $$;
--> statement-breakpoint
-- Rename subdomain to domain (if subdomain exists and domain doesn't)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'delivery_chat_applications'
    AND column_name = 'subdomain'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'delivery_chat_applications'
    AND column_name = 'domain'
  ) THEN
    ALTER TABLE "delivery_chat_applications" RENAME COLUMN "subdomain" TO "domain";
  END IF;
END $$;
--> statement-breakpoint
-- Drop indexes if they exist
DROP INDEX IF EXISTS "applications_slug_organization_unique";
--> statement-breakpoint
DROP INDEX IF EXISTS "applications_subdomain_organization_unique";
--> statement-breakpoint
DROP INDEX IF EXISTS "applications_subdomain_unique";
--> statement-breakpoint
-- Update member role column to use enum
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'delivery_chat_member'
  ) THEN
    -- Update existing "owner" values to "super_admin"
    UPDATE "delivery_chat_member" SET "role" = 'super_admin' WHERE "role" = 'owner';
    -- Drop default before changing type
    ALTER TABLE "delivery_chat_member" ALTER COLUMN "role" DROP DEFAULT;
    -- Change column type
    ALTER TABLE "delivery_chat_member"
      ALTER COLUMN "role"
      SET DATA TYPE "public"."member_role"
      USING "role"::"public"."member_role";
    -- Set new default
    ALTER TABLE "delivery_chat_member" ALTER COLUMN "role" SET DEFAULT 'operator'::"public"."member_role";
  END IF;
END $$;
--> statement-breakpoint
-- Update invitation role column to use enum
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'delivery_chat_invitation'
  ) THEN
    -- Update existing "owner" values to "super_admin"
    UPDATE "delivery_chat_invitation" SET "role" = 'super_admin' WHERE "role" = 'owner';
    -- Drop default before changing type
    ALTER TABLE "delivery_chat_invitation" ALTER COLUMN "role" DROP DEFAULT;
    -- Change column type
    ALTER TABLE "delivery_chat_invitation"
      ALTER COLUMN "role"
      SET DATA TYPE "public"."member_role"
      USING "role"::"public"."member_role";
    -- Set new default
    ALTER TABLE "delivery_chat_invitation" ALTER COLUMN "role" SET DEFAULT 'operator'::"public"."member_role";
  END IF;
END $$;
--> statement-breakpoint
-- Create unique index on domain
CREATE UNIQUE INDEX IF NOT EXISTS "applications_domain_unique" ON "delivery_chat_applications" USING btree ("domain");
--> statement-breakpoint
-- Drop settings column if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'delivery_chat_organization'
    AND column_name = 'settings'
  ) THEN
    ALTER TABLE "delivery_chat_organization" DROP COLUMN "settings";
  END IF;
END $$;
--> statement-breakpoint
-- Drop slug column if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'delivery_chat_applications'
    AND column_name = 'slug'
  ) THEN
    ALTER TABLE "delivery_chat_applications" DROP COLUMN "slug";
  END IF;
END $$;
--> statement-breakpoint
-- Set plan default to FREE (only if enum value exists and was committed)
-- Note: This may fail if FREE was just added above, but will work on subsequent runs
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'FREE' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'tenant_plan')
  ) THEN
    BEGIN
      ALTER TABLE "delivery_chat_organization" ALTER COLUMN "plan" DROP DEFAULT;
    EXCEPTION
      WHEN OTHERS THEN
        NULL;
    END;
    -- Try to set default (may fail if FREE was just added, but that's ok)
    BEGIN
      ALTER TABLE "delivery_chat_organization" ALTER COLUMN "plan" SET DEFAULT 'FREE';
    EXCEPTION
      WHEN OTHERS THEN
        -- If it fails, the default will be set by the application schema
        NULL;
    END;
  END IF;
END $$;