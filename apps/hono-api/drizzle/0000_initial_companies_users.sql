CREATE TABLE "delivery_chat_companies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"subdomain" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_chat_companies_subdomain_unique" UNIQUE("subdomain")
);
--> statement-breakpoint
CREATE TABLE "delivery_chat_users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"password" varchar(255) NOT NULL,
	CONSTRAINT "delivery_chat_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "delivery_chat_users_companies" (
	"user_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"role" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "delivery_chat_users_companies" ADD CONSTRAINT "delivery_chat_users_companies_user_id_delivery_chat_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."delivery_chat_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_chat_users_companies" ADD CONSTRAINT "delivery_chat_users_companies_company_id_delivery_chat_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."delivery_chat_companies"("id") ON DELETE no action ON UPDATE no action;