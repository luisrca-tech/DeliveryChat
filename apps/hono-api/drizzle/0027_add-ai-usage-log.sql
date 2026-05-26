CREATE TYPE "public"."ai_action" AS ENUM('generate', 'improve');--> statement-breakpoint
CREATE TYPE "public"."ai_usage_status" AS ENUM('success', 'provider_error', 'timeout', 'empty', 'content_filtered', 'aborted');--> statement-breakpoint
CREATE TABLE "delivery_chat_ai_usage_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"user_id" text NOT NULL,
	"action" "ai_action" NOT NULL,
	"conversation_id" uuid,
	"model" varchar(255) NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"latency_ms" integer,
	"finish_reason" varchar(50),
	"status" "ai_usage_status" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "delivery_chat_tenant_rate_limits" ADD COLUMN "ai_monthly_cap_override" integer;--> statement-breakpoint
ALTER TABLE "delivery_chat_ai_usage_log" ADD CONSTRAINT "delivery_chat_ai_usage_log_tenant_id_delivery_chat_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."delivery_chat_organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_chat_ai_usage_log" ADD CONSTRAINT "delivery_chat_ai_usage_log_user_id_delivery_chat_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."delivery_chat_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_chat_ai_usage_log" ADD CONSTRAINT "delivery_chat_ai_usage_log_conversation_id_delivery_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."delivery_chat_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_usage_log_tenant_created_idx" ON "delivery_chat_ai_usage_log" USING btree ("tenant_id","created_at");