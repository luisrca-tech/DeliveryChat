CREATE TYPE "public"."plan_status" AS ENUM('active', 'trialing', 'past_due', 'canceled', 'unpaid', 'incomplete', 'paused');--> statement-breakpoint
CREATE TABLE "delivery_chat_processed_events" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "delivery_chat_organization" ADD COLUMN "stripe_customer_id" varchar(255);--> statement-breakpoint
ALTER TABLE "delivery_chat_organization" ADD COLUMN "stripe_subscription_id" varchar(255);--> statement-breakpoint
ALTER TABLE "delivery_chat_organization" ADD COLUMN "plan_status" "plan_status";--> statement-breakpoint
ALTER TABLE "delivery_chat_organization" ADD COLUMN "billing_email" varchar(255);--> statement-breakpoint
ALTER TABLE "delivery_chat_organization" ADD COLUMN "cancel_at_period_end" boolean DEFAULT false;--> statement-breakpoint
CREATE UNIQUE INDEX "organization_stripe_customer_id_unique" ON "delivery_chat_organization" USING btree ("stripe_customer_id");