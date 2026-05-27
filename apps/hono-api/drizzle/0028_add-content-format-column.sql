CREATE TYPE "public"."content_format" AS ENUM('plain', 'lexical');--> statement-breakpoint
ALTER TABLE "delivery_chat_messages" ADD COLUMN "content_format" "content_format" DEFAULT 'plain' NOT NULL;