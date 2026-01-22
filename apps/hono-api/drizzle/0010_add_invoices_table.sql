CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'open', 'paid', 'uncollectible', 'void');--> statement-breakpoint
CREATE TABLE "delivery_chat_invoices" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'brl' NOT NULL,
	"status" "invoice_status" NOT NULL,
	"hosted_invoice_url" text,
	"period_start" timestamp,
	"period_end" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "delivery_chat_invoices" ADD CONSTRAINT "delivery_chat_invoices_organization_id_delivery_chat_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."delivery_chat_organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoices_organization_idx" ON "delivery_chat_invoices" USING btree ("organization_id");