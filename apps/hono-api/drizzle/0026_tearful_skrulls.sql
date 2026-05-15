CREATE TABLE "delivery_chat_visitor_identities" (
	"id" text PRIMARY KEY NOT NULL,
	"anonymous_user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"external_id" varchar(255),
	"email" varchar(255),
	"name" varchar(255),
	"metadata" jsonb,
	"hmac_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "delivery_chat_organization" ADD COLUMN "identity_verification_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_chat_organization" ADD COLUMN "identity_verification_secret" varchar(64);--> statement-breakpoint
ALTER TABLE "delivery_chat_visitor_identities" ADD CONSTRAINT "delivery_chat_visitor_identities_anonymous_user_id_delivery_chat_user_id_fk" FOREIGN KEY ("anonymous_user_id") REFERENCES "public"."delivery_chat_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_chat_visitor_identities" ADD CONSTRAINT "delivery_chat_visitor_identities_organization_id_delivery_chat_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."delivery_chat_organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "visitor_identities_user_org_unique" ON "delivery_chat_visitor_identities" USING btree ("anonymous_user_id","organization_id");