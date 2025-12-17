-- Migration: Make application subdomain globally unique and remove slug
-- This migration:
-- 1. Drops per-organization unique indexes for slug/subdomain
-- 2. Drops the applications.slug column
-- 3. Creates a global unique index for applications.subdomain

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'delivery_chat_applications'
  ) THEN
    -- Drop old per-organization indexes if they exist
    DROP INDEX IF EXISTS "applications_slug_organization_unique";
    DROP INDEX IF EXISTS "applications_subdomain_organization_unique";

    -- Drop column if it exists
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'delivery_chat_applications'
      AND column_name = 'slug'
    ) THEN
      ALTER TABLE "delivery_chat_applications" DROP COLUMN "slug";
    END IF;

    -- Create new global unique index
    CREATE UNIQUE INDEX IF NOT EXISTS "applications_subdomain_unique"
      ON "delivery_chat_applications" USING btree ("subdomain");
  END IF;
END $$;
