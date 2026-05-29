CREATE TYPE "public"."ai_context_status" AS ENUM('in_progress', 'completed');--> statement-breakpoint
ALTER TYPE "public"."ai_action" ADD VALUE 'interview';--> statement-breakpoint
CREATE TABLE "delivery_chat_application_ai_context" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"status" "ai_context_status" DEFAULT 'in_progress' NOT NULL,
	"interview_log" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"current_turn" integer DEFAULT 0 NOT NULL,
	"context_summary" text,
	"completed_by" text,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "current_turn_check" CHECK ("delivery_chat_application_ai_context"."current_turn" >= 0 AND "delivery_chat_application_ai_context"."current_turn" <= 15)
);
--> statement-breakpoint
ALTER TABLE "delivery_chat_applications" ADD COLUMN "ai_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_chat_application_ai_context" ADD CONSTRAINT "delivery_chat_application_ai_context_application_id_delivery_chat_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."delivery_chat_applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_chat_application_ai_context" ADD CONSTRAINT "delivery_chat_application_ai_context_completed_by_delivery_chat_user_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."delivery_chat_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "application_ai_context_application_unique" ON "delivery_chat_application_ai_context" USING btree ("application_id");