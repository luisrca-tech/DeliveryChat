CREATE TYPE "key_environment" AS ENUM ('live', 'test');
--> statement-breakpoint
CREATE TABLE "delivery_chat_api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"application_id" uuid NOT NULL,
	"key_hash" varchar(64) NOT NULL,
	"key_prefix" varchar(20) NOT NULL,
	"name" varchar(255),
	"environment" "key_environment" DEFAULT 'live' NOT NULL,
	"last_used_at" timestamp,
	"expires_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_chat_api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
ALTER TABLE "delivery_chat_api_keys" ADD CONSTRAINT "delivery_chat_api_keys_application_id_delivery_chat_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."delivery_chat_applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_keys_key_hash_idx" ON "delivery_chat_api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "api_keys_application_idx" ON "delivery_chat_api_keys" USING btree ("application_id");
