CREATE TYPE "public"."conversation_type" AS ENUM('support', 'internal');--> statement-breakpoint
CREATE TYPE "public"."conversation_status" AS ENUM('active', 'closed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."message_type" AS ENUM('text', 'system');--> statement-breakpoint
CREATE TYPE "public"."participant_role" AS ENUM('visitor', 'operator', 'admin');--> statement-breakpoint
CREATE TABLE "delivery_chat_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"application_id" uuid,
	"type" "conversation_type" NOT NULL,
	"status" "conversation_status" DEFAULT 'active' NOT NULL,
	"subject" varchar(500),
	"closed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_id" text NOT NULL,
	"type" "message_type" DEFAULT 'text' NOT NULL,
	"content" text NOT NULL,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_chat_conversation_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" "participant_role" NOT NULL,
	"last_read_message_id" uuid,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"left_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "delivery_chat_user" ADD COLUMN "is_anonymous" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_chat_conversations" ADD CONSTRAINT "delivery_chat_conversations_organization_id_delivery_chat_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."delivery_chat_organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_chat_conversations" ADD CONSTRAINT "delivery_chat_conversations_application_id_delivery_chat_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."delivery_chat_applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_chat_messages" ADD CONSTRAINT "delivery_chat_messages_conversation_id_delivery_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."delivery_chat_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_chat_messages" ADD CONSTRAINT "delivery_chat_messages_sender_id_delivery_chat_user_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."delivery_chat_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_chat_conversation_participants" ADD CONSTRAINT "delivery_chat_conversation_participants_conversation_id_delivery_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."delivery_chat_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_chat_conversation_participants" ADD CONSTRAINT "delivery_chat_conversation_participants_user_id_delivery_chat_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."delivery_chat_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_chat_conversation_participants" ADD CONSTRAINT "delivery_chat_conversation_participants_last_read_message_id_delivery_chat_messages_id_fk" FOREIGN KEY ("last_read_message_id") REFERENCES "public"."delivery_chat_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversations_organization_idx" ON "delivery_chat_conversations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "conversations_application_idx" ON "delivery_chat_conversations" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "conversations_org_status_idx" ON "delivery_chat_conversations" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "conversations_org_type_idx" ON "delivery_chat_conversations" USING btree ("organization_id","type");--> statement-breakpoint
CREATE INDEX "messages_conversation_idx" ON "delivery_chat_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "messages_conversation_created_idx" ON "delivery_chat_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_sender_idx" ON "delivery_chat_messages" USING btree ("sender_id");--> statement-breakpoint
CREATE INDEX "participants_conversation_idx" ON "delivery_chat_conversation_participants" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "participants_user_idx" ON "delivery_chat_conversation_participants" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "participants_unique" ON "delivery_chat_conversation_participants" USING btree ("conversation_id","user_id");