-- Migration: Add partial unique indexes for email and slug
-- This migration:
-- 1. Drops full unique constraints/indexes on email and slug
-- 2. Creates partial unique indexes that only enforce uniqueness for ACTIVE and PENDING_VERIFICATION statuses
-- This allows DELETED and EXPIRED records to reuse emails/slugs

DO $$
BEGIN
  -- Drop existing unique constraint/index on user email
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'delivery_chat_user_email_unique'
  ) THEN
    ALTER TABLE "delivery_chat_user" DROP CONSTRAINT "delivery_chat_user_email_unique";
  END IF;

  -- Drop existing unique index on organization slug if it exists
  DROP INDEX IF EXISTS "organization_slug_unique";

  -- Create partial unique index for user email
  -- Only enforces uniqueness for ACTIVE and PENDING_VERIFICATION statuses
  CREATE UNIQUE INDEX IF NOT EXISTS "users_email_unique_active"
    ON "delivery_chat_user"("email")
    WHERE "status" IN ('ACTIVE', 'PENDING_VERIFICATION');

  -- Create partial unique index for organization slug
  -- Only enforces uniqueness for ACTIVE and PENDING_VERIFICATION statuses
  CREATE UNIQUE INDEX IF NOT EXISTS "organization_slug_unique_active"
    ON "delivery_chat_organization"("slug")
    WHERE "status" IN ('ACTIVE', 'PENDING_VERIFICATION');
END $$;

