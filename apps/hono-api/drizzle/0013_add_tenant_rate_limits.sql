CREATE TYPE "rate_limit_window" AS ENUM ('second', 'minute', 'hour');
--> statement-breakpoint
CREATE TYPE "rate_limit_event_type" AS ENUM ('EXCEEDED', 'ALERT_SENT');
--> statement-breakpoint
CREATE TABLE "delivery_chat_tenant_rate_limits" (
	"tenant_id" text PRIMARY KEY NOT NULL,
	"requests_per_second" integer,
	"requests_per_minute" integer,
	"requests_per_hour" integer,
	"alert_threshold_percent" integer DEFAULT 80 NOT NULL,
	"is_custom" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "delivery_chat_tenant_rate_limits" ADD CONSTRAINT "delivery_chat_tenant_rate_limits_tenant_id_delivery_chat_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."delivery_chat_organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "delivery_chat_rate_limit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"event_type" "rate_limit_event_type" NOT NULL,
	"window" "rate_limit_window" NOT NULL,
	"limit_value" integer NOT NULL,
	"current_count" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "delivery_chat_rate_limit_events" ADD CONSTRAINT "delivery_chat_rate_limit_events_tenant_id_delivery_chat_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."delivery_chat_organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "rate_limit_events_tenant_idx" ON "delivery_chat_rate_limit_events" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX "rate_limit_events_created_at_idx" ON "delivery_chat_rate_limit_events" USING btree ("created_at");
--> statement-breakpoint
CREATE TABLE "delivery_chat_rate_limit_alerts_sent" (
	"tenant_id" text NOT NULL,
	"window_type" "rate_limit_window" NOT NULL,
	"last_sent_at" timestamp NOT NULL,
	PRIMARY KEY("tenant_id","window_type")
);
--> statement-breakpoint
ALTER TABLE "delivery_chat_rate_limit_alerts_sent" ADD CONSTRAINT "delivery_chat_rate_limit_alerts_sent_tenant_id_delivery_chat_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."delivery_chat_organization"("id") ON DELETE cascade ON UPDATE no action;
