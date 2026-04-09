DROP INDEX "conversations_org_type_idx";--> statement-breakpoint
ALTER TABLE "delivery_chat_conversations" DROP COLUMN "type";--> statement-breakpoint
DROP TYPE "public"."conversation_type";