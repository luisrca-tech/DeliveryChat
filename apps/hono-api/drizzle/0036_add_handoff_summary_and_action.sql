ALTER TYPE "public"."ai_action" ADD VALUE 'handoff_summary';--> statement-breakpoint
ALTER TABLE "delivery_chat_conversations" ADD COLUMN "handoff_summary" text;