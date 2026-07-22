CREATE TYPE "public"."data_source_kind" AS ENUM('http', 'sql');--> statement-breakpoint
CREATE TYPE "public"."conversation_handled_by" AS ENUM('ai', 'human');--> statement-breakpoint
CREATE TYPE "public"."message_author_type" AS ENUM('visitor', 'operator', 'ai', 'system');--> statement-breakpoint
CREATE TABLE "delivery_chat_application_data_source" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"kind" "data_source_kind" NOT NULL,
	"config" jsonb NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_chat_application_data_tool" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text NOT NULL,
	"input_schema" jsonb NOT NULL,
	"backing_type" "data_source_kind" NOT NULL,
	"config" jsonb NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"last_tested_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "delivery_chat_organization" ADD COLUMN "ai_addon_active" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_chat_organization" ADD COLUMN "ai_addon_subscription_item_id" varchar(255);--> statement-breakpoint
ALTER TABLE "delivery_chat_applications" ADD COLUMN "ai_db_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_chat_applications" ADD COLUMN "ai_auto_respond" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_chat_conversations" ADD COLUMN "handled_by" "conversation_handled_by" DEFAULT 'human' NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_chat_conversations" ADD COLUMN "escalated_at" timestamp;--> statement-breakpoint
ALTER TABLE "delivery_chat_conversations" ADD COLUMN "escalation_reason" varchar(500);--> statement-breakpoint
ALTER TABLE "delivery_chat_messages" ADD COLUMN "author_type" "message_author_type" DEFAULT 'visitor' NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_chat_application_data_source" ADD CONSTRAINT "delivery_chat_application_data_source_application_id_delivery_chat_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."delivery_chat_applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_chat_application_data_tool" ADD CONSTRAINT "delivery_chat_application_data_tool_application_id_delivery_chat_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."delivery_chat_applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "application_data_source_application_unique" ON "delivery_chat_application_data_source" USING btree ("application_id");--> statement-breakpoint
CREATE UNIQUE INDEX "application_data_tool_application_name_unique" ON "delivery_chat_application_data_tool" USING btree ("application_id","name");--> statement-breakpoint
CREATE INDEX "application_data_tool_application_idx" ON "delivery_chat_application_data_tool" USING btree ("application_id");