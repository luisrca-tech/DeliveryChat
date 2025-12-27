CREATE TYPE "public"."status" AS ENUM('PENDING_VERIFICATION', 'EXPIRED', 'ACTIVE', 'DELETED');--> statement-breakpoint
ALTER TABLE "delivery_chat_user" ADD COLUMN "status" "status" DEFAULT 'PENDING_VERIFICATION' NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_chat_user" ADD COLUMN "pending_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "delivery_chat_user" ADD COLUMN "expired_at" timestamp;--> statement-breakpoint
ALTER TABLE "delivery_chat_organization" ADD COLUMN "status" "status" DEFAULT 'PENDING_VERIFICATION' NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_chat_organization" ADD COLUMN "expired_at" timestamp;