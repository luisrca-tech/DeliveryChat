ALTER TABLE "delivery_chat_conversations" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "delivery_chat_conversations" ALTER COLUMN "status" SET DEFAULT 'pending'::text;--> statement-breakpoint
DROP TYPE "public"."conversation_status";--> statement-breakpoint
CREATE TYPE "public"."conversation_status" AS ENUM('pending', 'active', 'closed');--> statement-breakpoint
ALTER TABLE "delivery_chat_conversations" ALTER COLUMN "status" SET DEFAULT 'pending'::"public"."conversation_status";--> statement-breakpoint
ALTER TABLE "delivery_chat_conversations" ALTER COLUMN "status" SET DATA TYPE "public"."conversation_status" USING "status"::"public"."conversation_status";--> statement-breakpoint
ALTER TABLE "delivery_chat_conversations" ADD COLUMN "assigned_to" text;--> statement-breakpoint
ALTER TABLE "delivery_chat_conversations" ADD CONSTRAINT "delivery_chat_conversations_assigned_to_delivery_chat_user_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."delivery_chat_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversations_assigned_to_idx" ON "delivery_chat_conversations" USING btree ("assigned_to");