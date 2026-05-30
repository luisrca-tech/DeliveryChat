CREATE TYPE "public"."summary_status" AS ENUM('none', 'pending', 'ready', 'failed');--> statement-breakpoint
ALTER TABLE "delivery_chat_application_ai_context" ADD COLUMN "summary_status" "summary_status" DEFAULT 'none' NOT NULL;--> statement-breakpoint
UPDATE "delivery_chat_application_ai_context"
SET "summary_status" = 'ready'
WHERE "status" = 'completed' AND "context_summary" IS NOT NULL;--> statement-breakpoint
UPDATE "delivery_chat_application_ai_context"
SET "summary_status" = 'pending'
WHERE "status" = 'completed' AND "context_summary" IS NULL;