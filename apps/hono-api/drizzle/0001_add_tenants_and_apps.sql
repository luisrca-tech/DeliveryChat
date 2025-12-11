CREATE TABLE "delivery_chat_tenants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"description" text,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_chat_applications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"description" text,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "delivery_chat_companies" ADD COLUMN "tenant_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_chat_companies" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "delivery_chat_companies" ADD COLUMN "settings" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_chat_companies" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "delivery_chat_applications" ADD CONSTRAINT "delivery_chat_applications_tenant_id_delivery_chat_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."delivery_chat_tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tenants_slug_unique" ON "delivery_chat_tenants" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "tenants_slug_idx" ON "delivery_chat_tenants" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "applications_tenant_idx" ON "delivery_chat_applications" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "applications_slug_tenant_unique" ON "delivery_chat_applications" USING btree ("slug","tenant_id");--> statement-breakpoint
ALTER TABLE "delivery_chat_companies" ADD CONSTRAINT "delivery_chat_companies_tenant_id_delivery_chat_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."delivery_chat_tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "companies_tenant_idx" ON "delivery_chat_companies" USING btree ("tenant_id");